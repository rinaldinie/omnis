import { useState, useEffect, useMemo, useRef } from "react";
import { Sparkles, CheckCircle2, AlertCircle, Square, RefreshCw } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { GameDto, TAURI_EVENTS } from "../../types";
import { api } from "../../api";
import { getErrorMessage } from "../../utils/errors";
import { useTranslation } from "../../i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  BatchEnrichOptionsSection,
  type BatchPresetMode,
} from "./batch_enrich/BatchEnrichOptionsSection";
import { BatchEnrichGameListSection } from "./batch_enrich/BatchEnrichGameListSection";

export type { BatchPresetMode };

interface MetadataProgressPayload {
  current: number;
  total: number;
  title: string;
}

export interface BatchEnrichModalProps {
  isOpen: boolean;
  onClose: () => void;
  allGames: GameDto[];
  filteredGames: GameDto[];
  onComplete: () => Promise<void>;
}

const ACHIEVEMENT_STORES = ["steam", "gog", "epic", "xbox"];

function supportsStoreAchievements(library?: string | null): boolean {
  const store = (library || "").toLowerCase();
  return ACHIEVEMENT_STORES.some((s) => store.includes(s));
}

export default function BatchEnrichModal({
  isOpen,
  onClose,
  allGames,
  filteredGames,
  onComplete,
}: BatchEnrichModalProps) {
  const { t } = useTranslation();

  // Data Types Selection
  const [fetchMetadata, setFetchMetadata] = useState<boolean>(true);
  const [fetchHltb, setFetchHltb] = useState<boolean>(true);
  const [fetchAchievements, setFetchAchievements] = useState<boolean>(true);

  // Filter Preset & Search
  const [presetMode, setPresetMode] = useState<BatchPresetMode>("missing_artwork");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Selected Game IDs
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<MetadataProgressPayload | null>(null);
  const [resultMessage, setResultMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const isCancelledRef = useRef<boolean>(false);

  const missingArtworkGames = useMemo(
    () => allGames.filter((g) => !g.cover_image),
    [allGames]
  );
  const missingHltbGames = useMemo(
    () =>
      allGames.filter(
        (g) => !g.extra_metadata || !g.extra_metadata.includes("howlongtobeat")
      ),
    [allGames]
  );
  const missingAchievementsGames = useMemo(
    () =>
      allGames.filter(
        (g) =>
          supportsStoreAchievements(g.library) &&
          (!g.extra_metadata || !g.extra_metadata.includes("achievements"))
      ),
    [allGames]
  );

  const presetGames = useMemo((): GameDto[] => {
    switch (presetMode) {
      case "all":
        return allGames;
      case "missing_artwork":
        return missingArtworkGames;
      case "missing_hltb":
        return missingHltbGames;
      case "missing_achievements":
        return missingAchievementsGames;
      case "filtered":
        return filteredGames;
      default:
        return allGames;
    }
  }, [
    presetMode,
    allGames,
    missingArtworkGames,
    missingHltbGames,
    missingAchievementsGames,
    filteredGames,
  ]);

  const presetGamesRef = useRef(presetGames);
  presetGamesRef.current = presetGames;

  // Initial selection sync when preset changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(presetGamesRef.current.map((g) => g.id)));
    }
  }, [presetMode, isOpen]);

  const displayedGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return presetGames;
    return presetGames.filter(
      (g) =>
        (g.title || "").toLowerCase().includes(q) ||
        (g.library || "").toLowerCase().includes(q)
    );
  }, [presetGames, searchQuery]);

  // Listen to Tauri progress events during batch enrichment
  useEffect(() => {
    if (!isOpen) return;

    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await listen<MetadataProgressPayload>(
          TAURI_EVENTS.METADATA_PROGRESS,
          (event) => {
            setProgress(event.payload);
          }
        );
      } catch (err) {
        console.warn("Failed to attach metadata-progress listener:", err);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleSelectAll = () => {
    const next = new Set(selectedIds);
    const allDisplayedSelected =
      selectedIds.size === displayedGames.length && displayedGames.length > 0;
    displayedGames.forEach((g) => {
      if (allDisplayedSelected) {
        next.delete(g.id);
      } else {
        next.add(g.id);
      }
    });
    setSelectedIds(next);
  };

  const handleToggleGame = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAllTypes = () => {
    const allActive = fetchMetadata && fetchHltb && fetchAchievements;
    setFetchMetadata(!allActive);
    setFetchHltb(!allActive);
    setFetchAchievements(!allActive);
  };

  const handleStartEnrichment = async () => {
    const targetGameList = allGames.filter((g) => selectedIds.has(g.id));
    if (targetGameList.length === 0) return;
    if (!fetchMetadata && !fetchHltb && !fetchAchievements) return;

    try {
      setIsRunning(true);
      isCancelledRef.current = false;
      setResultMessage(null);
      const totalSteps = targetGameList.length;

      setProgress({
        current: 0,
        total: totalSteps,
        title: t("batch_enrich.preparing"),
      });

      // Step 1: Metadata & Artwork Batch Download
      if (fetchMetadata && !isCancelledRef.current) {
        await api.metadata.downloadBatchMetadata(targetGameList.map((g) => g.id));
      }

      // Step 2: HowLongToBeat when metadata was skipped (metadata pipeline already includes HLTB)
      if (fetchHltb && !fetchMetadata && !isCancelledRef.current) {
        for (let i = 0; i < targetGameList.length; i++) {
          if (isCancelledRef.current) break;
          const game = targetGameList[i];
          setProgress({
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

      // Step 3: Store Achievements
      if (fetchAchievements && !isCancelledRef.current) {
        const achievementEligible = targetGameList.filter((g) =>
          supportsStoreAchievements(g.library)
        );

        for (let i = 0; i < achievementEligible.length; i++) {
          if (isCancelledRef.current) break;
          const game = achievementEligible[i];
          setProgress({
            current: i + 1,
            total: achievementEligible.length,
            title: `${t("batch_enrich.type_achievements")}: ${game.title}`,
          });
          try {
            await api.achievements.refreshGameAchievements(game.id);
          } catch (e) {
            console.debug(`Achievements fetch skipped for ${game.title}:`, e);
          }
        }
      }

      if (isCancelledRef.current) {
        setResultMessage({
          type: "info",
          text: t("batch_enrich.cancel_requested"),
        });
      } else {
        setResultMessage({
          type: "success",
          text: t("batch_enrich.completed", { count: targetGameList.length }),
        });
      }

      await onComplete();
    } catch (err: unknown) {
      setResultMessage({
        type: "error",
        text: t("batch_enrich.error", { error: getErrorMessage(err) }),
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = async () => {
    isCancelledRef.current = true;
    try {
      await api.metadata.cancelMetadataDownload();
      setResultMessage({
        type: "info",
        text: t("batch_enrich.cancel_requested"),
      });
    } catch (err) {
      console.warn("Failed to cancel metadata download:", err);
    }
  };

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  const noTypesSelected = !fetchMetadata && !fetchHltb && !fetchAchievements;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isRunning) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-4xl w-full max-h-[90vh] p-0 flex flex-col rounded-3xl overflow-hidden gap-0 text-foreground"
        closeButtonDisabled={isRunning}
      >
        <DialogHeader className="flex-row items-center gap-3 px-6 py-4 border-b border-border bg-card shrink-0 space-y-0 text-left pr-14">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shrink-0"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: "0 0 15px var(--accent-glow)",
            }}
          >
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base font-bold text-foreground tracking-tight">
              {t("topbar.enrich_button")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("topbar.enrich_tooltip")}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* CONTENT SCROLL */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-5">
            <BatchEnrichOptionsSection
              fetchMetadata={fetchMetadata}
              onToggleMetadata={() => setFetchMetadata((v) => !v)}
              fetchHltb={fetchHltb}
              onToggleHltb={() => setFetchHltb((v) => !v)}
              fetchAchievements={fetchAchievements}
              onToggleAchievements={() => setFetchAchievements((v) => !v)}
              onToggleAllTypes={handleSelectAllTypes}
              presetMode={presetMode}
              onSelectPreset={setPresetMode}
              counts={{
                missingArtwork: missingArtworkGames.length,
                missingHltb: missingHltbGames.length,
                missingAchievements: missingAchievementsGames.length,
                all: allGames.length,
                filtered: filteredGames.length,
              }}
              isRunning={isRunning}
              t={t}
            />

            <BatchEnrichGameListSection
              displayedGames={displayedGames}
              selectedIds={selectedIds}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onToggleSelectAll={handleToggleSelectAll}
              onToggleGame={handleToggleGame}
              isRunning={isRunning}
              t={t}
            />

            {/* PROGRESS BAR & STATUS */}
            {isRunning && progress && (
              <div className="p-4 rounded-2xl border border-sky-500/40 bg-sky-500/10 space-y-2.5 animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-sky-300 truncate max-w-sm sm:max-w-md flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
                    <span className="truncate">{progress.title}</span>
                  </span>
                  <span className="font-bold text-white font-mono shrink-0">
                    {progress.current} / {progress.total} ({percent}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-sky-500 via-indigo-500 to-amber-400"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* RESULT FEEDBACK */}
            {resultMessage && (
              <div
                className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs ${
                  resultMessage.type === "error"
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                    : resultMessage.type === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-sky-500/40 bg-sky-500/10 text-sky-300"
                }`}
              >
                {resultMessage.type === "error" ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                )}
                <span className="font-medium">{resultMessage.text}</span>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border bg-card shrink-0">
          {isRunning ? (
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancel}
              className="px-4 py-2 h-auto font-bold shadow-md"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>{t("batch_enrich.stop")}</span>
            </Button>
          ) : (
            <>
              <Button
                type="button"
                onClick={handleStartEnrichment}
                disabled={selectedIds.size === 0 || noTypesSelected}
                className="px-5 py-2.5 h-auto font-bold shadow-lg"
                style={{ boxShadow: "0 0 15px var(--accent-glow)" }}
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {t("batch_enrich.download_selected", {
                    count: selectedIds.size,
                  })}
                </span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="px-5 py-2.5 h-auto font-bold text-muted-foreground hover:text-foreground"
              >
                {resultMessage ? t("common.close") : t("common.cancel")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
