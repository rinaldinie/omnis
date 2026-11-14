import { useCallback } from "react";
import { GameDto, ActiveGameSession, TranslateFn, normalizeGame } from "../types";
import { api } from "../api";
import soundEffects from "../utils/soundEffects";
import { getErrorMessage } from "../utils/errors";
import { useLibraryStore, useUiStore } from "../stores";
import {
  setSingleGameMetadataStatus,
  startAllMetadataEnrichment,
} from "../services/metadataBackgroundRunner";

export interface UseGameOperationsOptions {
  games?: GameDto[];
  setGames?: (games: GameDto[] | ((prev: GameDto[]) => GameDto[])) => void;
  selectedGame?: GameDto | null;
  setSelectedGame?: (game: GameDto | null | ((prev: GameDto | null) => GameDto | null)) => void;
  refreshLibrary?: () => Promise<void>;
  setStatusMessage?: (msg: string) => void;
  statusText: TranslateFn;
  setIsSyncing?: (syncing: boolean) => void;
  setIsGameRunning?: (running: boolean) => void;
  setActiveGame?: (
    updater:
      | ActiveGameSession
      | null
      | ((prev: ActiveGameSession | null) => ActiveGameSession | null)
  ) => void;
  t: TranslateFn;
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
  const enrichingGameIds = useUiStore((s) => s.enrichingGameIds);
  const addEnrichingGameId = useUiStore((s) => s.addEnrichingGameId);
  const removeEnrichingGameId = useUiStore((s) => s.removeEnrichingGameId);
  const metadataDownload = useUiStore((s) => s.metadataDownload);

  const games = propGames ?? storeGames;
  const setGames = propSetGames ?? storeSetGames;
  const selectedGame = propSelectedGame !== undefined ? propSelectedGame : storeSelectedGame;
  const setSelectedGame = propSetSelectedGame ?? storeSetSelectedGame;
  const refreshLibrary = propRefreshLibrary ?? storeRefreshLibrary;
  const setStatusMessage = propSetStatusMessage ?? storeSetStatusMessage;
  const setIsSyncing = propSetIsSyncing ?? storeSetIsSyncing;
  const setIsGameRunning = propSetIsGameRunning ?? storeSetIsGameRunning;
  const setActiveGame = propSetActiveGame ?? storeSetActiveGame;

  const isDownloading =
    metadataDownload?.status === "running" && metadataDownload.mode !== "single";
  const isEnrichingSingle = enrichingGameIds.length > 0;

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
    } catch (err: unknown) {
      console.warn("Sync error:", err);
      setStatusMessage(statusText("library_scan_error", { error: getErrorMessage(err) }));
    } finally {
      setIsSyncing(false);
    }
  }, [setIsSyncing, setStatusMessage, statusText, refreshLibrary]);

  const handleDownloadAll = useCallback(async () => {
    try {
      const task = startAllMetadataEnrichment({
        preparingLabel: statusText("metadata_downloading"),
        onComplete: refreshLibrary,
      });
      if (task) {
        await task;
      }
    } catch (err: unknown) {
      console.warn("Download metadata error:", err);
      setStatusMessage(statusText("metadata_error", { error: getErrorMessage(err) }));
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
    } catch (err: unknown) {
      console.error("Launch game error:", err);
      const errMsg = getErrorMessage(err, t("app_misc.launch_error_default"));
      setStatusMessage(statusText("launch_error", { error: errMsg }));
      setIsGameRunning(false);
      setActiveGame(null);
    }
  }, [games, statusText, setStatusMessage, t, setIsGameRunning, setActiveGame]);

  const handleKillRunningGame = useCallback(() => {
    setShowKillConfirmModal(true);
  }, [setShowKillConfirmModal]);

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
    } catch (err: unknown) {
      setStatusMessage(statusText("stop_error", { error: getErrorMessage(err) }));
    }
  }, [setShowKillConfirmModal, setStatusMessage, statusText]);

  const handleOpenFolder = useCallback((folderType: string) => {
    api.window.openFolder(folderType);
  }, []);

  const handleOpenInstallDir = useCallback(async (gameId: string) => {
    try {
      await api.games.openGameInstallDir(gameId);
      setStatusMessage(statusText("folder_opening"));
    } catch (err: unknown) {
      setStatusMessage(statusText("folder_error", { error: getErrorMessage(err) }));
    }
  }, [setStatusMessage, statusText]);

  const handleCreateShortcut = useCallback(async (gameId: string) => {
    try {
      const path = await api.games.createDesktopShortcut(gameId);
      setStatusMessage(statusText("shortcut_created", { path: String(path) }));
    } catch (err: unknown) {
      setStatusMessage(statusText("shortcut_error", { error: getErrorMessage(err) }));
    }
  }, [setStatusMessage, statusText]);

  const handleVerifyFiles = useCallback(async (gameId: string) => {
    try {
      await api.games.verifyGameFiles(gameId);
      setStatusMessage(statusText("verify_started"));
    } catch (err: unknown) {
      setStatusMessage(statusText("verify_error", { error: getErrorMessage(err) }));
    }
  }, [setStatusMessage, statusText]);

  const handleOpenUninstallModal = useCallback((game: GameDto) => {
    setGameToUninstall(game);
    setShowUninstallModal(true);
  }, [setGameToUninstall, setShowUninstallModal]);

  const handleConfirmUninstall = useCallback(async (gameId: string) => {
    try {
      await api.games.uninstallGame(gameId);
      setStatusMessage(statusText("uninstall_started"));
      await refreshLibrary();
    } catch (err: unknown) {
      setStatusMessage(statusText("uninstall_error", { error: getErrorMessage(err) }));
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
    } catch (err: unknown) {
      setStatusMessage(statusText("remove_error", { error: getErrorMessage(err) }));
    }
  }, [games, t, statusText, setStatusMessage, refreshLibrary, selectedGame, setSelectedGame]);

  const handleEnrichSingleGame = useCallback(async (gameId: string) => {
    const targetTitle = games.find((g) => g.id === gameId)?.title || "";
    try {
      addEnrichingGameId(gameId);
      setSingleGameMetadataStatus({
        status: "running",
        mode: "single",
        current: 0,
        total: 0,
        title: targetTitle,
      });
      const updated = await api.games.enrichSingleGame(gameId);
      if (updated) {
        const normalized = normalizeGame(updated);
        setSelectedGame((prev) => (prev && prev.id === normalized.id ? normalized : prev));
        setGames((prev) => prev.map((g) => (g.id === normalized.id ? normalized : g)));
        setSingleGameMetadataStatus({
          status: "completed",
          mode: "single",
          current: 1,
          total: 1,
          title: normalized.title,
        });
      }
    } catch (err: unknown) {
      const errorMsg = getErrorMessage(err);
      setSingleGameMetadataStatus({
        status: "error",
        mode: "single",
        current: 0,
        total: 0,
        title: targetTitle,
        error: errorMsg,
      });
    } finally {
      removeEnrichingGameId(gameId);
    }
  }, [games, addEnrichingGameId, removeEnrichingGameId, setSelectedGame, setGames]);

  const handleRefreshHltb = useCallback(async (gameId: string) => {
    const targetTitle = games.find((g) => g.id === gameId)?.title || "";
    try {
      addEnrichingGameId(gameId);
      setSingleGameMetadataStatus({
        status: "running",
        mode: "single",
        current: 0,
        total: 0,
        title: targetTitle,
      });
      const updated = await api.games.refreshGameHowlongtobeat(gameId);
      if (updated) {
        const normalized = normalizeGame(updated);
        setSelectedGame((prev) => (prev && prev.id === normalized.id ? normalized : prev));
        setGames((prev) => prev.map((g) => (g.id === normalized.id ? normalized : g)));
        setSingleGameMetadataStatus({
          status: "completed",
          mode: "single",
          current: 1,
          total: 1,
          title: normalized.title,
        });
      }
    } catch (err: unknown) {
      console.warn("Direct HLTB refresh error, falling back to full enrichment:", err);
      await handleEnrichSingleGame(gameId);
    } finally {
      removeEnrichingGameId(gameId);
    }
  }, [games, addEnrichingGameId, removeEnrichingGameId, setSelectedGame, setGames, handleEnrichSingleGame]);

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
    } catch (err: unknown) {
      console.error("Failed to update completion status:", err);
    }
  }, [setSelectedGame, setGames, refreshLibrary, setStatusMessage, statusText]);

  const handleToggleHidden = useCallback(
    async (game: GameDto) => {
      try {
        await api.games.setGameHidden(game.id, !game.is_hidden);
        await refreshLibrary();
        setStatusMessage(statusText("game_updated"));
      } catch (err: unknown) {
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
      } catch (err: unknown) {
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
      } catch (err: unknown) {
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
