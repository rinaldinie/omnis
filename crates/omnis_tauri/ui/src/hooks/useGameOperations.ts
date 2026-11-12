import { useState, useCallback } from "react";
import { GameDto, ActiveGameSession, normalizeGame } from "../types";
import { api } from "../api";
import soundEffects from "../utils/soundEffects";
import { useLibraryStore, useUiStore } from "../stores";

export interface UseGameOperationsOptions {
  games?: GameDto[];
  setGames?: (games: GameDto[] | ((prev: GameDto[]) => GameDto[])) => void;
  selectedGame?: GameDto | null;
  setSelectedGame?: (game: GameDto | null | ((prev: GameDto | null) => GameDto | null)) => void;
  refreshLibrary?: () => Promise<void>;
  setStatusMessage?: (msg: string) => void;
  statusText: (key: string, params?: Record<string, any>) => string;
  setIsSyncing?: (syncing: boolean) => void;
  setIsGameRunning?: (running: boolean) => void;
  setActiveGame?: (
    updater:
      | ActiveGameSession
      | null
      | ((prev: ActiveGameSession | null) => ActiveGameSession | null)
  ) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

export function useGameOperations({
  games: propGames,
  setGames: propSetGames,
  selectedGame: propSelectedGame,
  setSelectedGame: propSetSelectedGame,
  refreshLibrary: propRefreshLibrary,
  setStatusMessage: propSetStatusMessage,
  statusText,
  setIsSyncing: propSetIsSyncing,
  setIsGameRunning: propSetIsGameRunning,
  setActiveGame: propSetActiveGame,
  t,
}: UseGameOperationsOptions) {
  const storeGames = useLibraryStore((s) => s.games);
  const storeSetGames = useLibraryStore((s) => s.setGames);
  const storeSelectedGame = useLibraryStore((s) => s.selectedGame);
  const storeSetSelectedGame = useLibraryStore((s) => s.setSelectedGame);
  const storeRefreshLibrary = useLibraryStore((s) => s.refreshLibrary);

  const storeSetStatusMessage = useUiStore((s) => s.setStatusMessage);
  const storeSetIsSyncing = useUiStore((s) => s.setIsSyncing);
  const storeSetIsGameRunning = useUiStore((s) => s.setIsGameRunning);
  const storeSetActiveGame = useUiStore((s) => s.setActiveGame);
  const showKillConfirmModal = useUiStore((s) => s.showKillConfirmModal);
  const setShowKillConfirmModal = useUiStore((s) => s.setShowKillConfirmModal);
  const gameToUninstall = useUiStore((s) => s.gameToUninstall);
  const setGameToUninstall = useUiStore((s) => s.setGameToUninstall);
  const showUninstallModal = useUiStore((s) => s.showUninstallModal);
  const setShowUninstallModal = useUiStore((s) => s.setShowUninstallModal);

  const games = propGames ?? storeGames;
  const setGames = propSetGames ?? storeSetGames;
  const selectedGame = propSelectedGame !== undefined ? propSelectedGame : storeSelectedGame;
  const setSelectedGame = propSetSelectedGame ?? storeSetSelectedGame;
  const refreshLibrary = propRefreshLibrary ?? storeRefreshLibrary;
  const setStatusMessage = propSetStatusMessage ?? storeSetStatusMessage;
  const setIsSyncing = propSetIsSyncing ?? storeSetIsSyncing;
  const setIsGameRunning = propSetIsGameRunning ?? storeSetIsGameRunning;
  const setActiveGame = propSetActiveGame ?? storeSetActiveGame;

  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isEnrichingSingle, setIsEnrichingSingle] = useState<boolean>(false);

  const handleSync = useCallback(async () => {
    try {
      setIsSyncing(true);
      setStatusMessage(statusText("library_scanning"));
      const count = await api.games.syncLibrary();
      await refreshLibrary();
      setStatusMessage(
        count !== null && count !== undefined
          ? statusText("library_scanned_count", { count })
          : statusText("library_scanned")
      );
    } catch (err: any) {
      console.warn("Sync error:", err);
      setStatusMessage(statusText("library_scan_error", { error: String(err) }));
    } finally {
      setIsSyncing(false);
    }
  }, [setIsSyncing, setStatusMessage, statusText, refreshLibrary]);

  const handleDownloadAll = useCallback(async () => {
    setIsDownloading(true);
    setStatusMessage(statusText("metadata_downloading"));
    try {
      await api.metadata.downloadAllMetadata();
      await refreshLibrary();
      setStatusMessage(statusText("metadata_updated"));
    } catch (err: any) {
      console.warn("Download metadata error:", err);
      setStatusMessage(statusText("metadata_error", { error: String(err) }));
    } finally {
      setIsDownloading(false);
    }
  }, [setStatusMessage, statusText, refreshLibrary]);

  const handleLaunch = useCallback(async (gameId: string) => {
    soundEffects.playLaunch();
    const g = games.find((x) => x.id === gameId);
    if (g && !g.is_installed) {
      setStatusMessage(statusText("install_opening", { title: g.title, store: g.library.toUpperCase() }));
    } else {
      setStatusMessage(statusText("game_starting"));
    }
    try {
      await api.games.launchGame(gameId);
      if (g && !g.is_installed) {
        setStatusMessage(statusText("install_started"));
      } else {
        setStatusMessage(statusText("game_running"));
      }
    } catch (err: any) {
      console.error("Launch game error:", err);
      const errMsg = typeof err === "string" ? err : err?.message || t("app_misc.launch_error_default");
      setStatusMessage(statusText("launch_error", { error: String(errMsg) }));
      setIsGameRunning(false);
      setActiveGame(null);
    }
  }, [games, statusText, setStatusMessage, t, setIsGameRunning, setActiveGame]);

  const handleKillRunningGame = useCallback(() => {
    setShowKillConfirmModal(true);
  }, []);

  const confirmKillRunningGame = useCallback(async () => {
    setShowKillConfirmModal(false);
    try {
      setStatusMessage(statusText("game_stopping"));
      const killed = await api.games.killRunningGame();
      if (killed) {
        soundEffects.playSelect();
        setStatusMessage(statusText("game_stopped"));
      } else {
        setStatusMessage(statusText("no_game_running"));
      }
    } catch (err: any) {
      setStatusMessage(statusText("stop_error", { error: String(err) }));
    }
  }, [setStatusMessage, statusText]);

  const handleOpenFolder = useCallback((folderType: string) => {
    api.window.openFolder(folderType);
  }, []);

  const handleOpenInstallDir = useCallback(async (gameId: string) => {
    try {
      await api.games.openGameInstallDir(gameId);
      setStatusMessage(statusText("folder_opening"));
    } catch (err: any) {
      setStatusMessage(statusText("folder_error", { error: String(err?.message || err) }));
    }
  }, [setStatusMessage, statusText]);

  const handleCreateShortcut = useCallback(async (gameId: string) => {
    try {
      const path = await api.games.createDesktopShortcut(gameId);
      setStatusMessage(statusText("shortcut_created", { path: String(path) }));
    } catch (err: any) {
      setStatusMessage(statusText("shortcut_error", { error: String(err?.message || err) }));
    }
  }, [setStatusMessage, statusText]);

  const handleVerifyFiles = useCallback(async (gameId: string) => {
    try {
      await api.games.verifyGameFiles(gameId);
      setStatusMessage(statusText("verify_started"));
    } catch (err: any) {
      setStatusMessage(statusText("verify_error", { error: String(err?.message || err) }));
    }
  }, [setStatusMessage, statusText]);

  const handleOpenUninstallModal = useCallback((game: GameDto) => {
    setGameToUninstall(game);
    setShowUninstallModal(true);
  }, []);

  const handleConfirmUninstall = useCallback(async (gameId: string) => {
    try {
      await api.games.uninstallGame(gameId);
      setStatusMessage(statusText("uninstall_started"));
      await refreshLibrary();
    } catch (err: any) {
      setStatusMessage(statusText("uninstall_error", { error: String(err?.message || err) }));
    }
  }, [setStatusMessage, statusText, refreshLibrary]);

  const handleRemoveFromLibrary = useCallback(async (gameId: string) => {
    const g = games.find((x) => x.id === gameId);
    const title = g?.title || t("app_misc.this_game");
    if (!window.confirm(t("app_misc.confirm_remove", { title }))) {
      return;
    }
    try {
      await api.games.removeGameFromLibrary(gameId);
      setStatusMessage(statusText("game_removed", { title }));
      await refreshLibrary();
      if (selectedGame?.id === gameId) {
        setSelectedGame(null);
      }
    } catch (err: any) {
      setStatusMessage(statusText("remove_error", { error: String(err?.message || err) }));
    }
  }, [games, t, statusText, setStatusMessage, refreshLibrary, selectedGame, setSelectedGame]);

  const handleEnrichSingleGame = useCallback(async (gameId: string) => {
    try {
      setIsEnrichingSingle(true);
      setStatusMessage(statusText("metadata_downloading_game"));
      const updated = await api.games.enrichSingleGame(gameId);
      if (updated) {
        const normalized = normalizeGame(updated);
        setSelectedGame(normalized);
        setGames((prev) => prev.map((g) => (g.id === normalized.id ? normalized : g)));
        setStatusMessage(statusText("metadata_updated_game", { title: normalized.title }));
      }
    } catch (err: any) {
      setStatusMessage(statusText("metadata_download_error", { error: String(err) }));
    } finally {
      setIsEnrichingSingle(false);
    }
  }, [setStatusMessage, statusText, setSelectedGame, setGames]);

  const handleRefreshHltb = useCallback(async (gameId: string) => {
    try {
      setIsEnrichingSingle(true);
      setStatusMessage(statusText("hltb_refreshing"));
      const updated = await api.games.refreshGameHowlongtobeat(gameId);
      if (updated) {
        const normalized = normalizeGame(updated);
        setSelectedGame(normalized);
        setGames((prev) => prev.map((g) => (g.id === normalized.id ? normalized : g)));
        setStatusMessage(statusText("hltb_updated", { title: normalized.title }));
      }
    } catch (err: any) {
      console.warn("Direct HLTB refresh error, falling back to full enrichment:", err);
      await handleEnrichSingleGame(gameId);
    } finally {
      setIsEnrichingSingle(false);
    }
  }, [setStatusMessage, statusText, setSelectedGame, setGames, handleEnrichSingleGame]);

  const handleUpdateCompletionStatus = useCallback(async (game: GameDto, newStatus: string) => {
    try {
      const updated = await api.games.updateGameCompletionStatus(game.id, newStatus);
      if (updated) {
        const normalized = normalizeGame(updated);
        setSelectedGame((prev) => (prev && prev.id === normalized.id ? { ...prev, ...normalized } : prev));
        setGames((prev) => prev.map((g) => (g.id === normalized.id ? { ...g, ...normalized } : g)));
        refreshLibrary();
        setStatusMessage(statusText("edits_saved", { title: normalized.title }));
      }
    } catch (err: any) {
      console.error("Failed to update completion status:", err);
    }
  }, [setSelectedGame, setGames, refreshLibrary, setStatusMessage, statusText]);

  const handleToggleHidden = useCallback(
    async (game: GameDto) => {
      try {
        await api.games.setGameHidden(game.id, !game.is_hidden);
        await refreshLibrary();
        setStatusMessage(statusText("game_updated"));
      } catch (err: any) {
        console.error("Toggle hidden error:", err);
      }
    },
    [refreshLibrary, setStatusMessage, statusText]
  );

  const handleToggleFavorite = useCallback(
    async (game: GameDto) => {
      try {
        const updated = await api.games.setGameFavorite(game.id, !game.is_favorite);
        setGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, is_favorite: updated.is_favorite } : g)));
        if (selectedGame && selectedGame.id === game.id) {
          setSelectedGame((prev) => (prev ? { ...prev, is_favorite: updated.is_favorite } : null));
        }
        await refreshLibrary();
        setStatusMessage(statusText("game_updated"));
      } catch (err: any) {
        console.error("Toggle favorite error:", err);
      }
    },
    [refreshLibrary, selectedGame, setGames, setSelectedGame, setStatusMessage, statusText]
  );

  const handlePromoteCopy = useCallback(
    async (copyId: string) => {
      try {
        await api.games.promoteDuplicateCopy(copyId);
        await refreshLibrary();
        setStatusMessage(statusText("game_updated"));
      } catch (err: any) {
        console.error("Promote duplicate copy error:", err);
      }
    },
    [refreshLibrary, setStatusMessage, statusText]
  );

  return {
    isDownloading,
    isEnrichingSingle,
    showKillConfirmModal,
    setShowKillConfirmModal,
    gameToUninstall,
    setGameToUninstall,
    showUninstallModal,
    setShowUninstallModal,
    handleSync,
    handleDownloadAll,
    handleLaunch,
    handleKillRunningGame,
    confirmKillRunningGame,
    handleOpenFolder,
    handleOpenInstallDir,
    handleCreateShortcut,
    handleVerifyFiles,
    handleOpenUninstallModal,
    handleConfirmUninstall,
    handleRemoveFromLibrary,
    handleEnrichSingleGame,
    handleRefreshHltb,
    handleUpdateCompletionStatus,
    handleToggleHidden,
    handleToggleFavorite,
    handlePromoteCopy,
  };
}
