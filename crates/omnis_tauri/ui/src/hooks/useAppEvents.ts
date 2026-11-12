import { useState, useEffect, useRef } from "react";
import { ActiveGameSession, AchievementSyncProgress, GameDto, TAURI_EVENTS } from "../types";
import { api } from "../api";
import { listenTauri } from "../api/client";
import soundEffects from "../utils/soundEffects";
import { shouldAutoScanOnStartup, shouldShowOnboarding } from "../components/modals/OnboardingModal";
import { loadOnboardingState } from "../components/modals/onboardingState";
import { loadAchievementsConfig, saveAchievementsConfig } from "../components/achievements";
import { SessionToastInfo, SyncBannerInfo } from "../components/common/AppToasts";

/** How long the session-ended toast stays on screen */
export const SESSION_TOAST_MS = 6000;

export interface UseAppEventsOptions {
  loadGames: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  loadThemes: () => Promise<void>;
  loadProvidersAndConfig: () => Promise<void>;
  handleLaunch: (gameId: string) => void;
  handleOpenSettings: (tab?: any) => void;
  statusText: (key: string, params?: Record<string, any>) => string;
  setPipelineProgress: (progress: string | null) => void;
  gamesRef: React.MutableRefObject<GameDto[]>;
}

export function useAppEvents({
  loadGames,
  refreshLibrary,
  loadThemes,
  loadProvidersAndConfig,
  handleLaunch,
  handleOpenSettings,
  statusText,
  setPipelineProgress,
  gamesRef,
}: UseAppEventsOptions) {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isGameRunning, setIsGameRunning] = useState<boolean>(false);
  const [activeGame, setActiveGame] = useState<ActiveGameSession | null>(null);
  const [sessionToast, setSessionToast] = useState<SessionToastInfo | null>(null);
  const [syncBanner, setSyncBanner] = useState<SyncBannerInfo | null>(null);
  const [achievementSync, setAchievementSync] = useState<AchievementSyncProgress | null>(null);

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const achievementSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeGameRef = useRef<ActiveGameSession | null>(null);
  activeGameRef.current = activeGame;

  useEffect(() => {
    // The first-run state comes from the backend: load it before the library so an empty
    // library in a fresh data folder opens the wizard
    loadOnboardingState().finally(() => {
      // loadGames (not refreshLibrary) also opens the wizard when the library is empty
      loadGames();

      // Auto-scan on startup: silently sync library if user opted in and the wizard is done
      if (shouldAutoScanOnStartup() && !shouldShowOnboarding()) {
        api.games.syncLibrary()
          .then(() => refreshLibrary())
          .catch((err) => {
            console.warn("Auto-scan on startup failed:", err);
          });
      }
    });
    loadThemes();
    loadProvidersAndConfig();

    // Check if a game is already running on mount
    (async () => {
      try {
        const running = await api.games.getRunningGame();
        if (running) {
          setIsGameRunning(true);
          setActiveGame(running);
          soundEffects.setMuted(true);
        }
      } catch (err) {
        console.warn("Failed checking running game on mount:", err);
      }
    })();

    // Synchronize backend achievement exit-sync setting on startup
    try {
      const cfg = loadAchievementsConfig();
      api.games.setSyncAchievementsOnGameExit(cfg.syncOnGameExit).catch((err) => {
        console.warn("Failed to set achievement sync on game exit:", err);
      });
    } catch (e) {
      console.warn("Failed to synchronize achievements config on mount:", e);
    }

    // Align achievements with the stores in the background once the UI has settled after startup
    const achStartupTimer = setTimeout(() => {
      const cfg = loadAchievementsConfig();
      const interval = cfg.startupSyncInterval ?? "3";
      if (interval === "never") return;

      if (interval !== "always") {
        const days = parseInt(interval, 10);
        if (!isNaN(days) && days > 0 && cfg.lastLibrarySyncTimestamp) {
          const thresholdMs = days * 24 * 60 * 60 * 1000;
          if (Date.now() - cfg.lastLibrarySyncTimestamp < thresholdMs) {
            return;
          }
        }
      }

      api.games.startLibraryAchievementSync().catch((err) => {
        console.warn("Background achievement sync could not start:", err);
      });
    }, 8000);

    let isMounted = true;
    const unlistenFns: Array<() => void> = [];

    // Sync minimize to tray setting to backend
    const savedTray = localStorage.getItem("omnis_minimize_to_tray");
    const enabledTray = savedTray !== null ? JSON.parse(savedTray) : true;
    api.window.setMinimizeToTray(enabledTray).catch(console.warn);

    (async () => {
      try {
        if (!isMounted) return;

        const uSync = await listenTauri<{
          store_id: string;
          current: number;
          total: number;
          status: string;
          message?: string;
        }>(TAURI_EVENTS.STORE_SYNC_PROGRESS, (p) => {
          const storeName =
            p.store_id === "gog"
              ? "GOG Galaxy"
              : p.store_id === "xbox"
              ? "Xbox Game Pass"
              : p.store_id === "steam"
              ? "Steam"
              : p.store_id === "epic"
              ? "Epic Games"
              : p.store_id.toUpperCase();

          if (p.status === "syncing") {
            setIsSyncing(true);
            if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
            // Safety timeout: auto-dismiss and reset isSyncing if a background sync hangs for > 45s
            syncBannerTimeoutRef.current = setTimeout(() => {
              setIsSyncing(false);
              setSyncBanner(null);
            }, 45000);
            setSyncBanner({
              storeId: p.store_id,
              storeName,
              message: p.message || statusText("store_syncing", { store: storeName }),
              current: p.current,
              total: p.total,
              status: "syncing",
            });
            setStatusMessage(
              p.message || statusText("store_syncing_progress", { store: storeName, current: p.current, total: p.total })
            );
          } else if (p.status === "completed") {
            setIsSyncing(false);
            setSyncBanner({
              storeId: p.store_id,
              storeName,
              message: p.message || statusText("store_sync_done", { store: storeName, total: p.total }),
              current: p.current,
              total: p.total,
              status: "completed",
            });
            setStatusMessage(
              p.message || statusText("store_sync_done", { store: storeName, total: p.total })
            );
            loadGames();
            if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
            syncBannerTimeoutRef.current = setTimeout(() => {
              setSyncBanner(null);
            }, 6000);
          } else if (p.status === "error") {
            setIsSyncing(false);
            setSyncBanner({
              storeId: p.store_id,
              storeName,
              message: p.message || statusText("store_sync_error", { store: storeName }),
              current: 0,
              total: 0,
              status: "error",
            });
            setStatusMessage(p.message || statusText("store_sync_error", { store: storeName }));
            if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
            syncBannerTimeoutRef.current = setTimeout(() => {
              setSyncBanner(null);
            }, 8000);
          }
        });
        if (uSync) unlistenFns.push(uSync);

        const uLib = await listenTauri(TAURI_EVENTS.LIBRARY_UPDATED, () => {
          loadGames();
        });
        if (uLib) unlistenFns.push(uLib);

        const uStarted = await listenTauri<{
          session_id: string;
          game_id: string;
          title: string;
          state?: string;
          started_at: string;
        }>(TAURI_EVENTS.GAME_STARTED, (payload) => {
          setIsGameRunning(true);
          setActiveGame({
            session_id: payload.session_id,
            game_id: payload.game_id,
            title: payload.title,
            state: (payload.state as any) || "launching",
            started_at: payload.started_at,
            process_detected_at: null,
          });
          soundEffects.suspendAudio();
          setStatusMessage(statusText("game_launching", { title: payload.title }));
        });
        if (uStarted) unlistenFns.push(uStarted);

        const uStatus = await listenTauri<{
          session_id: string;
          game_id: string;
          state: string;
          pid?: number;
        }>(TAURI_EVENTS.GAME_STATUS_CHANGED, (payload) => {
          if (activeGameRef.current && activeGameRef.current.session_id === payload.session_id) {
            const newState = payload.state as any;
            setActiveGame((prev) => prev ? {
              ...prev,
              state: newState,
              pid: payload.pid ?? prev.pid,
              process_detected_at: newState === "running" ? (prev.process_detected_at || new Date().toISOString()) : prev.process_detected_at,
            } : null);
            if (newState === "running") {
              setStatusMessage(statusText("game_running_pid", { title: activeGameRef.current.title, pid: payload.pid ?? "?" }));
            }
          }
        });
        if (uStatus) unlistenFns.push(uStatus);

        const uStopped = await listenTauri<{
          session_id?: string;
          game_id: string;
          duration_seconds: number;
        }>(TAURI_EVENTS.GAME_STOPPED, (payload) => {
          if (
            payload.session_id &&
            activeGameRef.current &&
            activeGameRef.current.session_id !== payload.session_id
          ) {
            return;
          }

          setIsGameRunning(false);
          setActiveGame(null);
          soundEffects.resumeAudio();

          const stoppedGameId = payload.game_id;
          const durationSec = payload.duration_seconds;

          const found = gamesRef.current.find((g) => g.id === stoppedGameId);
          const stoppedTitle = found?.title || activeGameRef.current?.title || "Gioco";
          const mins = Math.max(1, Math.round(durationSec / 60));

          setStatusMessage(statusText("session_ended", { title: stoppedTitle, minutes: mins }));

          if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
          }
          setSessionToast({
            title: stoppedTitle,
            durationSeconds: durationSec,
            gameId: stoppedGameId,
          });
          toastTimeoutRef.current = setTimeout(() => {
            setSessionToast(null);
          }, SESSION_TOAST_MS);

          loadGames();
        });
        if (uStopped) unlistenFns.push(uStopped);

        const uMeta = await listenTauri<{
          current: number;
          total: number;
          title: string;
        }>(TAURI_EVENTS.METADATA_PROGRESS, (payload) => {
          const { current, total, title } = payload;
          setPipelineProgress(`Download dati (${current}/${total}): "${title}"...`);
          setStatusMessage(statusText("metadata_batch_progress", { current, total, title }));
        });
        if (uMeta) unlistenFns.push(uMeta);

        const uTrayLaunch = await listenTauri<string>(TAURI_EVENTS.TRAY_LAUNCH_GAME, (payload) => {
          if (payload) {
            handleLaunch(payload);
          }
        });
        if (uTrayLaunch) unlistenFns.push(uTrayLaunch);

        const uTraySettings = await listenTauri(TAURI_EVENTS.TRAY_OPEN_SETTINGS, () => {
          handleOpenSettings("general");
        });
        if (uTraySettings) unlistenFns.push(uTraySettings);

        const uAch = await listenTauri<AchievementSyncProgress>(TAURI_EVENTS.ACHIEVEMENT_SYNC_PROGRESS, (payload) => {
          const p = payload;
          if (achievementSyncTimeoutRef.current) {
            clearTimeout(achievementSyncTimeoutRef.current);
            achievementSyncTimeoutRef.current = null;
          }
          if (p.status === "syncing") {
            setAchievementSync((prev) =>
              p.scope === "game" && prev?.scope === "library" && prev.status === "syncing" ? prev : p
            );
            return;
          }
          if (p.status === "completed" && p.scope === "library") {
            const cfg = loadAchievementsConfig();
            cfg.lastLibrarySyncTimestamp = Date.now();
            saveAchievementsConfig(cfg);
          }
          if (p.failed > 0) {
            console.warn(`Background achievement sync (${p.scope}): ${p.failed} of ${p.total} games failed`);
          }
          if (p.updated > 0) {
            setAchievementSync(p);
            achievementSyncTimeoutRef.current = setTimeout(() => setAchievementSync(null), 4000);
          } else {
            setAchievementSync(null);
          }
        });
        if (uAch) unlistenFns.push(uAch);
      } catch (e) {
        console.warn("Failed to register app listeners:", e);
      }
    })();

    const handleFocus = () => {
      loadGames();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      isMounted = false;
      clearTimeout(achStartupTimer);
      window.removeEventListener("focus", handleFocus);
      unlistenFns.forEach((fn) => fn());
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
      if (achievementSyncTimeoutRef.current) clearTimeout(achievementSyncTimeoutRef.current);
    };
  }, []);

  return {
    isSyncing,
    setIsSyncing,
    statusMessage,
    setStatusMessage,
    isGameRunning,
    setIsGameRunning,
    activeGame,
    setActiveGame,
    sessionToast,
    setSessionToast,
    syncBanner,
    setSyncBanner,
    achievementSync,
    setAchievementSync,
    syncBannerTimeoutRef,
    toastTimeoutRef,
  };
}
