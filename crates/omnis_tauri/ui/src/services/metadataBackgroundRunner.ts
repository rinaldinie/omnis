import { api } from "../api";
import { useLibraryStore, useUiStore, type MetadataDownloadState } from "../stores";
import type { GameDto } from "../types";
import { getErrorMessage } from "../utils/errors";

const ACHIEVEMENT_STORES = ["steam", "gog", "epic", "xbox"];

const COMPLETED_CLEAR_MS = 5000;
const ERROR_CLEAR_MS = 8000;

let isBatchCancelled = false;
let activeBatchPromise: Promise<number> | null = null;
let autoClearTimer: ReturnType<typeof setTimeout> | null = null;

function supportsStoreAchievements(library?: string | null): boolean {
  const store = (library || "").toLowerCase();
  return ACHIEVEMENT_STORES.some((s) => store.includes(s));
}

function clearAutoDismissTimer(): void {
  if (autoClearTimer !== null) {
    clearTimeout(autoClearTimer);
    autoClearTimer = null;
  }
}

export function scheduleMetadataDownloadClear(delayMs: number): void {
  clearAutoDismissTimer();
  autoClearTimer = setTimeout(() => {
    autoClearTimer = null;
    useUiStore.getState().setMetadataDownload((prev) =>
      prev && prev.status !== "running" ? null : prev
    );
  }, delayMs);
}

export function isBatchMetadataDownloadRunning(): boolean {
  const current = useUiStore.getState().metadataDownload;
  return (
    activeBatchPromise !== null ||
    (current?.status === "running" && current.mode !== "single")
  );
}

export interface StartBatchEnrichmentOptions {
  games: GameDto[];
  fetchMetadata: boolean;
  fetchHltb: boolean;
  fetchAchievements: boolean;
  preparingLabel: string;
  achievementsLabel: string;
  onComplete?: () => Promise<void> | void;
}

/**
 * Starts a non-blocking background batch enrichment job (metadata, HLTB, achievements).
 * Returns the active promise if started, or null if skipped (empty input or already running).
 */
export function startBatchEnrichment({
  games,
  fetchMetadata,
  fetchHltb,
  fetchAchievements,
  preparingLabel,
  achievementsLabel,
  onComplete,
}: StartBatchEnrichmentOptions): Promise<number> | null {
  if (games.length === 0) return null;
  if (!fetchMetadata && !fetchHltb && !fetchAchievements) return null;
  if (isBatchMetadataDownloadRunning()) return null;

  clearAutoDismissTimer();
  isBatchCancelled = false;

  const { setMetadataDownload } = useUiStore.getState();
  const totalSteps = games.length;
  setMetadataDownload({
    status: "running",
    mode: "batch",
    current: 0,
    total: totalSteps,
    title: preparingLabel,
  });

  const run = async (): Promise<number> => {
    try {
      // Step 1: Metadata & Artwork Batch Download
      if (fetchMetadata && !isBatchCancelled) {
        await api.metadata.downloadBatchMetadata(games.map((g) => g.id));
      }

      // Step 2: HowLongToBeat when metadata was skipped (metadata pipeline already includes HLTB)
      if (fetchHltb && !fetchMetadata && !isBatchCancelled) {
        for (let i = 0; i < games.length; i++) {
          if (isBatchCancelled) break;
          const game = games[i];
          setMetadataDownload({
            status: "running",
            mode: "batch",
            current: i + 1,
            total: totalSteps,
            title: `HowLongToBeat: ${game.title}`,
          });
          try {
            await api.games.refreshGameHowlongtobeat(game.id);
          } catch (e) {
            console.debug(`HLTB fetch skipped for ${game.title}:`, e);
          }
        }
      }

      // Step 3: Store Achievements (skip games already confirmed to have no trophies)
      if (fetchAchievements && !isBatchCancelled) {
        const achievementEligible = games.filter(
          (g) =>
            supportsStoreAchievements(g.library) &&
            g.achievements_sync_status !== "none"
        );
        for (let i = 0; i < achievementEligible.length; i++) {
          if (isBatchCancelled) break;
          const game = achievementEligible[i];
          setMetadataDownload({
            status: "running",
            mode: "batch",
            current: i + 1,
            total: achievementEligible.length,
            title: `${achievementsLabel}: ${game.title}`,
          });
          try {
            await api.achievements.refreshGameAchievements(game.id);
          } catch (e) {
            console.debug(`Achievements fetch skipped for ${game.title}:`, e);
          }
        }
      }

      const prev = useUiStore.getState().metadataDownload;
      if (isBatchCancelled) {
        setMetadataDownload({
          status: "cancelled",
          mode: "batch",
          current: prev?.current ?? 0,
          total: prev?.total ?? totalSteps,
          title: "",
        });
      } else {
        setMetadataDownload({
          status: "completed",
          mode: "batch",
          current: totalSteps,
          total: totalSteps,
          title: "",
        });
      }
      scheduleMetadataDownloadClear(COMPLETED_CLEAR_MS);

      await (onComplete ? onComplete() : useLibraryStore.getState().refreshLibrary());
      return totalSteps;
    } catch (err: unknown) {
      const errorMsg = getErrorMessage(err);
      setMetadataDownload((prev) => ({
        status: "error",
        mode: "batch",
        current: prev?.current ?? 0,
        total: prev?.total ?? totalSteps,
        title: "",
        error: errorMsg,
      }));
      scheduleMetadataDownloadClear(ERROR_CLEAR_MS);
      return 0;
    } finally {
      activeBatchPromise = null;
    }
  };

  activeBatchPromise = run();
  return activeBatchPromise;
}

export interface StartAllMetadataOptions {
  preparingLabel: string;
  onComplete?: () => Promise<void> | void;
}

/**
 * Starts a non-blocking full-library metadata download in the background.
 */
export function startAllMetadataEnrichment({
  preparingLabel,
  onComplete,
}: StartAllMetadataOptions): Promise<number> | null {
  if (isBatchMetadataDownloadRunning()) return null;

  clearAutoDismissTimer();
  isBatchCancelled = false;

  const { setMetadataDownload } = useUiStore.getState();
  setMetadataDownload({
    status: "running",
    mode: "all",
    current: 0,
    total: 0,
    title: preparingLabel,
  });

  const run = async (): Promise<number> => {
    try {
      const updated = (await api.metadata.downloadAllMetadata()) || 0;
      const prev = useUiStore.getState().metadataDownload;

      if (isBatchCancelled) {
        setMetadataDownload({
          status: "cancelled",
          mode: "all",
          current: prev?.current ?? 0,
          total: prev?.total ?? updated,
          title: "",
        });
      } else {
        setMetadataDownload({
          status: "completed",
          mode: "all",
          current: prev?.total || updated,
          total: prev?.total || updated,
          title: "",
        });
      }
      scheduleMetadataDownloadClear(COMPLETED_CLEAR_MS);

      await (onComplete ? onComplete() : useLibraryStore.getState().refreshLibrary());
      return updated;
    } catch (err: unknown) {
      const errorMsg = getErrorMessage(err);
      setMetadataDownload((prev) => ({
        status: "error",
        mode: "all",
        current: prev?.current ?? 0,
        total: prev?.total ?? 0,
        title: "",
        error: errorMsg,
      }));
      scheduleMetadataDownloadClear(ERROR_CLEAR_MS);
      throw err;
    } finally {
      activeBatchPromise = null;
    }
  };

  activeBatchPromise = run();
  return activeBatchPromise;
}

/**
 * Requests cancellation of an active background batch/all metadata download.
 */
export async function cancelBackgroundMetadataDownload(): Promise<void> {
  isBatchCancelled = true;
  try {
    await api.metadata.cancelMetadataDownload();
  } catch (err) {
    console.warn("Failed to cancel metadata download:", err);
  }
}

/**
 * Updates the shared status indicator for single-game enrichment only when no batch job is active.
 */
export function setSingleGameMetadataStatus(next: MetadataDownloadState | null): void {
  const { setMetadataDownload } = useUiStore.getState();
  setMetadataDownload((prev) => {
    if (prev && prev.status === "running" && prev.mode !== "single") {
      return prev;
    }
    return next;
  });
  if (next && next.status !== "running") {
    scheduleMetadataDownloadClear(
      next.status === "error" ? ERROR_CLEAR_MS : COMPLETED_CLEAR_MS
    );
  } else if (next?.status === "running") {
    clearAutoDismissTimer();
  }
}

/** Test helper to reset module-level runner state between unit tests. */
export function resetMetadataDownloadRunner(): void {
  clearAutoDismissTimer();
  isBatchCancelled = false;
  activeBatchPromise = null;
}
