import { useEffect, useRef } from "react";
import { ActiveGameSession, AchievementSyncProgress, GameDto, TAURI_EVENTS } from "../types";
import { api } from "../api";
import { listenTauri } from "../api/client";
import soundEffects from "../utils/soundEffects";
import { shouldAutoScanOnStartup, shouldShowOnboarding } from "../components/modals/OnboardingModal";
import { loadOnboardingState } from "../components/modals/onboardingState";
import { loadAchievementsConfig, saveAchievementsConfig } from "../components/achievements";
import { useLibraryStore, useUiStore } from "../stores";

/** How long the session-ended toast stays on screen */
export const SESSION_TOAST_MS = 6000;

export interface UseAppEventsOptions {
  loadGames: () => Promise<void>;
  refreshLibrary?: () => Promise<void>;
  loadThemes: () => Promise<void>;
  loadProvidersAndConfig: () => Promise<void>;
  handleLaunch: (gameId: string) => void;
  handleOpenSettings?: (tab?: any) => void;
  statusText: (key: string, params?: Record<string, any>) => string;
  setPipelineProgress: (progress: string | null) => void;
  gamesRef?: React.MutableRefObject<GameDto[]>;
}

export function useAppEvents({
  loadGames,
  refreshLibrary: propRefreshLibrary,
  loadThemes,
  loadProvidersAndConfig,
  handleLaunch,
  handleOpenSettings: propHandleOpenSettings,
  statusText,
  setPipelineProgress,
  gamesRef,
}: UseAppEventsOptions) {
  const storeRefreshLibrary = useLibraryStore((s) => s.refreshLibrary);
  const refreshLibrary = propRefreshLibrary ?? storeRefreshLibrary;

  const isSyncing = useUiStore((s) => s.isSyncing);
  const setIsSyncing = useUiStore((s) => s.setIsSyncing);
  const statusMessage = useUiStore((s) => s.statusMessage);
  const setStatusMessage = useUiStore((s) => s.setStatusMessage);
  const isGameRunning = useUiStore((s) => s.isGameRunning);
  const setIsGameRunning = useUiStore((s) => s.setIsGameRunning);
  const activeGame = useUiStore((s) => s.activeGame);
  const setActiveGame = useUiStore((s) => s.setActiveGame);
  const sessionToast = useUiStore((s) => s.sessionToast);
  const setSessionToast = useUiStore((s) => s.setSessionToast);
  const syncBanner = useUiStore((s) => s.syncBanner);
  const setSyncBanner = useUiStore((s) => s.setSyncBanner);
  const achievementSync = useUiStore((s) => s.achievementSync);
  const setAchievementSync = useUiStore((s) => s.setAchievementSync);
  const storeOpenSettings = useUiStore((s) => s.openSettings);
  const handleOpenSettings = propHandleOpenSettings ?? storeOpenSettings;

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const achievementSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeGameRef = useRef<ActiveGameSession | null>(null);
  activeGameRef.current = activeGame;
  const handleLaunchCallbackRef = useRef(handleLaunch);
  handleLaunchCallbackRef.current = handleLaunch;
  const latestRef = useRef({
    loadGames,
    refreshLibrary,
    loadThemes,
    loadProvidersAndConfig,
    handleOpenSettings,
    statusText,
    setPipelineProgress,
    gamesRef,
    setIsSyncing,
    setStatusMessage,
    setIsGameRunning,
    setActiveGame,
    setSessionToast,
    setSyncBanner,
    setAchievementSync,
  });
  latestRef.current = {
    loadGames,
    refreshLibrary,
    loadThemes,
    loadProvidersAndConfig,
    handleOpenSettings,
    statusText,
    setPipelineProgress,
    gamesRef,
    setIsSyncing,
    setStatusMessage,
    setIsGameRunning,
    setActiveGame,
    setSessionToast,
    setSyncBanner,
    setAchievementSync,
  };

  useEffect(() => {
    // The first-run state comes from the backend: load it before the library so an empty
    // library in a fresh data folder opens the wizard
    loadOnboardingState().finally(() => {
      // loadGames (not refreshLibrary) also opens the wizard when the library is empty
      latestRef.current.loadGames();

      // Auto-scan on startup: silently sync library if user opted in and the wizard is done
      if (shouldAutoScanOnStartup() && !shouldShowOnboarding()) {
        api.games.syncLibrary()
          .then(() => latestRef.current.refreshLibrary())
          .catch((err) => {
            console.warn("Auto-scan on startup failed:", err);
          });
      }
    });
    latestRef.current.loadThemes();
    latestRef.current.loadProvidersAndConfig();

    // Check if a game is already running on mount
    (async () => {
      try {
        const running = await api.games.getRunningGame();
        if (running) {
          latestRef.current.setIsGameRunning(true);
          latestRef.current.setActiveGame(running);
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
            latestRef.current.setIsSyncing(true);
            if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
            // Safety timeout: auto-dismiss and reset isSyncing if a background sync hangs for > 45s
            syncBannerTimeoutRef.current = setTimeout(() => {
              latestRef.current.setIsSyncing(false);
              latestRef.current.setSyncBanner(null);
            }, 45000);
            latestRef.current.setSyncBanner({
              storeId: p.store_id,
              storeName,
              message: p.message || latestRef.current.statusText("store_syncing", { store: storeName }),
              current: p.current,
              total: p.total,
              status: "syncing",
            });
            latestRef.current.setStatusMessage(
              p.message || latestRef.current.statusText("store_syncing_progress", { store: storeName, current: p.current, total: p.total })
            );
          } else if (p.status === "completed") {
            latestRef.current.setIsSyncing(false);
            latestRef.current.setSyncBanner({
              storeId: p.store_id,
              storeName,
              message: p.message || latestRef.current.statusText("store_sync_done", { store: storeName, total: p.total }),
              current: p.current,
              total: p.total,
              status: "completed",
            });
            latestRef.current.setStatusMessage(
              p.message || latestRef.current.statusText("store_sync_done", { store: storeName, total: p.total })
            );
            latestRef.current.loadGames();
            if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
            syncBannerTimeoutRef.current = setTimeout(() => {
              latestRef.current.setSyncBanner(null);
            }, 6000);
          } else if (p.status === "error") {
            latestRef.current.setIsSyncing(false);
            latestRef.current.setSyncBanner({
              storeId: p.store_id,
              storeName,
              message: p.message || latestRef.current.statusText("store_sync_error", { store: storeName }),
              current: 0,
              total: 0,
              status: "error",
            });
            latestRef.current.setStatusMessage(p.message || latestRef.current.statusText("store_sync_error", { store: storeName }));
            if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
            syncBannerTimeoutRef.current = setTimeout(() => {
              latestRef.current.setSyncBanner(null);
            }, 8000);
          }
        });
        if (uSync) unlistenFns.push(uSync);

        const uLib = await listenTauri(TAURI_EVENTS.LIBRARY_UPDATED, () => {
          latestRef.current.loadGames();
        });
        if (uLib) unlistenFns.push(uLib);

        const uStarted = await listenTauri<{
          session_id: string;
          game_id: string;
          title: string;
          state?: string;
          started_at: string;
        }>(TAURI_EVENTS.GAME_STARTED, (payload) => {
          latestRef.current.setIsGameRunning(true);
          latestRef.current.setActiveGame({
            session_id: payload.session_id,
            game_id: payload.game_id,
            title: payload.title,
            state: (payload.state as any) || "launching",
            started_at: payload.started_at,
            process_detected_at: null,
          });
          soundEffects.suspendAudio();
          latestRef.current.setStatusMessage(latestRef.current.statusText("game_launching", { title: payload.title }));
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
            latestRef.current.setActiveGame((prev) => prev ? {
              ...prev,
              state: newState,
              pid: payload.pid ?? prev.pid,
              process_detected_at: newState === "running" ? (prev.process_detected_at || new Date().toISOString()) : prev.process_detected_at,
            } : null);
            if (newState === "running") {
              latestRef.current.setStatusMessage(latestRef.current.statusText("game_running_pid", { title: activeGameRef.current.title, pid: payload.pid ?? "?" }));
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

          latestRef.current.setIsGameRunning(false);
          latestRef.current.setActiveGame(null);
          soundEffects.resumeAudio();

          const stoppedGameId = payload.game_id;
          const durationSec = payload.duration_seconds;

          const currentGames = latestRef.current.gamesRef?.current ?? useLibraryStore.getState().games;
          const found = currentGames.find((g) => g.id === stoppedGameId);
          const stoppedTitle = found?.title || activeGameRef.current?.title || "Gioco";
          const mins = Math.max(1, Math.round(durationSec / 60));

          latestRef.current.setStatusMessage(latestRef.current.statusText("session_ended", { title: stoppedTitle, minutes: mins }));

          if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
          }
          latestRef.current.setSessionToast({
            title: stoppedTitle,
            durationSeconds: durationSec,
            gameId: stoppedGameId,
          });
          toastTimeoutRef.current = setTimeout(() => {
            latestRef.current.setSessionToast(null);
          }, SESSION_TOAST_MS);

          latestRef.current.loadGames();
        });
        if (uStopped) unlistenFns.push(uStopped);

        const uMeta = await listenTauri<{
          current: number;
          total: number;
          title: string;
        }>(TAURI_EVENTS.METADATA_PROGRESS, (payload) => {
          const { current, total, title } = payload;
          latestRef.current.setPipelineProgress(`Download dati (${current}/${total}): "${title}"...`);
          latestRef.current.setStatusMessage(latestRef.current.statusText("metadata_batch_progress", { current, total, title }));
        });
        if (uMeta) unlistenFns.push(uMeta);

        const uTrayLaunch = await listenTauri<string>(TAURI_EVENTS.TRAY_LAUNCH_GAME, (payload) => {
          if (payload) {
            handleLaunchCallbackRef.current(payload);
          }
        });
        if (uTrayLaunch) unlistenFns.push(uTrayLaunch);

        const uTraySettings = await listenTauri(TAURI_EVENTS.TRAY_OPEN_SETTINGS, () => {
          latestRef.current.handleOpenSettings("general");
        });
        if (uTraySettings) unlistenFns.push(uTraySettings);

        const uAch = await listenTauri<AchievementSyncProgress>(TAURI_EVENTS.ACHIEVEMENT_SYNC_PROGRESS, (payload) => {
          const p = payload;
          if (achievementSyncTimeoutRef.current) {
            clearTimeout(achievementSyncTimeoutRef.current);
            achievementSyncTimeoutRef.current = null;
          }
          if (p.status === "syncing") {
            latestRef.current.setAchievementSync((prev) =>
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
            latestRef.current.setAchievementSync(p);
            achievementSyncTimeoutRef.current = setTimeout(() => latestRef.current.setAchievementSync(null), 4000);
          } else {
            latestRef.current.setAchievementSync(null);
          }
        });
        if (uAch) unlistenFns.push(uAch);
      } catch (e) {
        console.warn("Failed to register app listeners:", e);
      }
    })();

    const handleFocus = () => {
      latestRef.current.loadGames();
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
