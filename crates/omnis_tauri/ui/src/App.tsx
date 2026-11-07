import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { SettingsTab } from "./components/settings";
import { api } from "./api";
import { useTranslation } from "./i18n";
import soundEffects from "./utils/soundEffects";
import { openExternalUrl } from "./utils/openUrl";
import {
  SteamIcon,
  EpicIcon,
  GogIcon,
  XboxIcon,
  AmazonIcon,
  EaIcon,
  UbisoftIcon,
  BattlenetIcon,
  ItchIcon,
  StoreIcon,
  StoreBadge,
} from "./components/StoreBadge";
import {
  GameDto,
  ViewMode,
  GroupBy,
  LibraryCounts,
  ThemeConfig,
  formatImageUrl,
  normalizeGame,
  TAURI_EVENTS,
} from "./types";
import { getVisibleCategories } from "./utils/consoleCategories";
import { useWindowControls } from "./hooks/useWindowControls";
import { useLibraryFilters } from "./hooks/useLibraryFilters";
import { useGamepadNavigation, ControllerType } from "./hooks/useGamepadNavigation";
import { ActiveGameTimerProvider } from "./context/ActiveGameTimerContext";
import { useAppUpdater, UpdaterContext } from "./hooks/useAppUpdater";
import FullscreenView from "./components/views/FullscreenView";
import { DesktopView } from "./components/views/DesktopView";
import {
  ControllerTypeContext,
  InputPromptContext,
  ControllerStyleSetting,
} from "./components/fullscreen/ConsoleChrome";
import { GameSortMode, readSavedSortMode, saveSortMode, sortGames } from "./utils/sortGames";
import OnboardingModal, { shouldShowOnboarding } from "./components/modals/OnboardingModal";
import { AppToasts, SessionToastInfo, SyncBannerInfo } from "./components/common/AppToasts";
import { AppModals } from "./components/modals/AppModals";
import { usePluginManager } from "./hooks/usePluginManager";
import { useAppEvents } from "./hooks/useAppEvents";
import { useGameOperations } from "./hooks/useGameOperations";
import { useThemeEngine } from "./hooks/useThemeEngine";

export type { SessionToastInfo, SyncBannerInfo };

function formatDuration(s: number): string {
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export {
  SteamIcon,
  EpicIcon,
  GogIcon,
  XboxIcon,
  AmazonIcon,
  EaIcon,
  UbisoftIcon,
  BattlenetIcon,
  ItchIcon,
  StoreIcon,
  StoreBadge,
};
export { formatImageUrl, normalizeGame };
export type { ViewMode, GroupBy, GameDto };

export default function App() {
  const [games, setGames] = useState<GameDto[]>([]);
  const [counts, setCounts] = useState<LibraryCounts>({
    total: 0,
    installed: 0,
    steam: 0,
    gog: 0,
    epic: 0,
    xbox: 0,
    recent: 0,
    favorites: 0,
    action: 0,
    rpg: 0,
    strategy: 0,
    indie: 0,
  });

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedGame, setSelectedGame] = useState<GameDto | null>(null);

  // I18N
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const statusText = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      tRef.current(`app_status.${key}`, params),
    []
  );

  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("general");

  const handleOpenSettings = useCallback((tab: SettingsTab = "general") => {
    setSettingsInitialTab(tab);
    setShowSettingsModal(true);
  }, []);

  // ONBOARDING WIZARD
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);

  // ONLINE APP UPDATER
  const updater = useAppUpdater();

  useEffect(() => {
    const timer = setTimeout(() => {
      updater.checkForUpdates(true).catch((err) => {
        console.warn("Silent background update check failed:", err);
      });
    }, 4000);
    return () => clearTimeout(timer);
  }, [updater.checkForUpdates]);

  // LOAD GAMES
  const loadGames = useCallback(async () => {
    try {
      const loadedGames = await api.games.getGames();
      if (loadedGames) {
        const normalized = loadedGames.map(normalizeGame);
        setGames(normalized);
        setSelectedGame((prev) => {
          if (prev) {
            const current = normalized.find((g) => g.id === prev.id);
            if (current) {
              if (current.is_hidden && current.other_copies && current.other_copies.length > 0) {
                const primary = normalized.find(
                  (g) =>
                    !g.is_hidden &&
                    (g.duplicate_group_id === current.duplicate_group_id ||
                      current.other_copies?.some((c) => c.id === g.id))
                );
                if (primary) return primary;
              }
              return current;
            }
          }
          return normalized.length > 0 ? normalized[0] : null;
        });
      }
      const loadedCounts = await api.games.getCounts();
      if (loadedCounts) {
        setCounts(loadedCounts);
        if (loadedCounts.total === 0 && shouldShowOnboarding()) {
          setShowOnboarding(true);
        }
      }
    } catch (err) {
      console.error("Failed to load games or counts", err);
    }
  }, []);
  const refreshLibrary = loadGames;

  // REFS & DEFERRED INTEGRATION
  const gamesRef = useRef<GameDto[]>([]);
  gamesRef.current = games;

  const pluginManagerRef = useRef<any>(null);
  const handleLaunchRef = useRef<((id: string) => void) | null>(null);

  // TAURI EVENTS & BACKGROUND NOTIFICATIONS HOOK
  const {
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
  } = useAppEvents({
    loadGames,
    refreshLibrary,
    loadThemes: async () => {
      await themeEngineRef.current?.loadThemes();
    },
    loadProvidersAndConfig: async () => {
      await pluginManagerRef.current?.loadProvidersAndConfig();
    },
    handleLaunch: (id: string) => {
      handleLaunchRef.current?.(id);
    },
    handleOpenSettings,
    statusText,
    setPipelineProgress: (p) => {
      pluginManagerRef.current?.setPipelineProgress(p);
    },
    gamesRef,
  });

  // THEME ENGINE HOOK
  const themeEngine = useThemeEngine({ setStatusMessage, statusText });
  const themeEngineRef = useRef(themeEngine);
  themeEngineRef.current = themeEngine;

  const {
    themes,
    currentTheme,
    showThemeModal,
    setShowThemeModal,
    selectTheme,
    handleSaveCustomTheme,
  } = themeEngine;

  // METADATA PLUGIN & PIPELINE MANAGER HOOK
  const pluginManager = usePluginManager({
    setStatusMessage,
    statusText,
    refreshLibrary,
    t,
  });
  pluginManagerRef.current = pluginManager;

  const {
    providers,
    showPluginModal,
    setShowPluginModal,
    showBatchEnrichModal,
    setShowBatchEnrichModal,
    isPlayniteImportOpen,
    setIsPlayniteImportOpen,
    loadProvidersAndConfig,
  } = pluginManager;

  // GAME ACTIONS & OPERATIONS HOOK
  const gameOps = useGameOperations({
    games,
    setGames,
    selectedGame,
    setSelectedGame,
    refreshLibrary,
    setStatusMessage,
    statusText,
    setIsSyncing,
    setIsGameRunning,
    setActiveGame,
    t,
  });

  const {
    isEnrichingSingle,
    showKillConfirmModal,
    setShowKillConfirmModal,
    gameToUninstall,
    setGameToUninstall,
    showUninstallModal,
    setShowUninstallModal,
    handleSync,
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
  } = gameOps;

  handleLaunchRef.current = handleLaunch;

  // METADATA & CUSTOM GAME MODALS
  const [showEditorModal, setShowEditorModal] = useState<boolean>(false);
  const [showResolutionModal, setShowResolutionModal] = useState<boolean>(false);
  const [gameToEdit, setGameToEdit] = useState<GameDto | null>(null);
  const [gameToResolve, setGameToResolve] = useState<GameDto | null>(null);
  const [showAddCustomModal, setShowAddCustomModal] = useState<boolean>(false);

  // FULLSCREEN MODE
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      return (
        p.get("fullscreen") === "true" ||
        p.has("fullscreen") ||
        window.location.hash.includes("fullscreen")
      );
    }
    return false;
  });
  const carouselRef = useRef<HTMLDivElement>(null);
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState<boolean>(false);
  const [fullscreenGridColumns, setFullscreenGridColumns] = useState<number>(0);
  const [fullscreenHasRecentRow, setFullscreenHasRecentRow] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(soundEffects.enabled);

  // DETECT --fullscreen / --bigpicture CLI ARGUMENTS FROM TAURI & SINGLE-INSTANCE
  useEffect(() => {
    const checkFullscreenLaunch = async () => {
      try {
        const isFsCli = await api.window.isFullscreenLaunch();
        let isWindowFs = false;
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          isWindowFs = await getCurrentWindow().isFullscreen();
        } catch {
          // Dev fallback
        }

        if (isFsCli || isWindowFs) {
          setIsFullscreen(true);
          setFocusedIndex(0);
          setShowFullscreenDetails(false);
          try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().setFullscreen(true);
          } catch {
            // Dev fallback
          }
          await api.window.setFullscreen(true);
        }
      } catch (err) {
        console.warn("Error detecting fullscreen CLI argument:", err);
      }
    };
    checkFullscreenLaunch();

    let unlistenEvent: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<boolean>(TAURI_EVENTS.APP_SET_FULLSCREEN, async (event) => {
        const shouldBeFs = event.payload ?? true;
        setIsFullscreen(shouldBeFs);
        if (shouldBeFs) {
          setFocusedIndex(0);
          setShowFullscreenDetails(false);
        }
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().setFullscreen(shouldBeFs);
        } catch {
          // fallback
        }
      }).then((fn) => {
        unlistenEvent = fn;
      });
    }).catch(() => {});

    return () => {
      if (unlistenEvent) unlistenEvent();
    };
  }, []);

  // CONTEXT MENU
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    game: GameDto;
  } | null>(null);

  const handleOpenContextMenu = useCallback((e: React.MouseEvent, game: GameDto) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 240;
    const menuHeight = 220;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
    setContextMenu({ x, y, game });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // FILTERS & GROUPING HOOK
  const {
    activeFilter,
    setActiveFilter,
    selectedStores,
    selectedStatuses,
    selectedFlags,
    selectedGenres,
    selectedFeatures,
    sortMode,
    setSortMode,
    filterCounts,
    activeChips,
    totalActiveFilters,
    toggleStore,
    toggleStatus,
    toggleFlag,
    toggleGenre,
    toggleFeature,
    clearAllFilters,
    removeFilterChip,
    isFilterActive,
    groupBy,
    setGroupBy,
    searchQuery,
    setSearchQuery,
    detailsSearchQuery,
    setDetailsSearchQuery,
    collapsedGroups,
    toggleGroup,
    selectFilter,
    cycleFilter,
    filteredGames,
    groupedGames,
    detailsFilteredGames,
  } = useLibraryFilters(games);

  const visibleCategories = useMemo(() => getVisibleCategories(counts, activeFilter), [counts, activeFilter]);
  const cycleCategory = useCallback((direction: number, onCycle?: (nextFilter: string) => void) =>
    cycleFilter(direction, onCycle, visibleCategories), [cycleFilter, visibleCategories]);

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) =>
      g.genres.forEach((genre) => {
        const tr = genre.trim();
        if (tr) set.add(tr);
      })
    );
    return Array.from(set).sort((a, b) => (filterCounts.genres[b] || 0) - (filterCounts.genres[a] || 0));
  }, [games, filterCounts.genres]);

  const availableFeatures = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) => {
      if (g.features) {
        g.features.forEach((feat) => {
          const tr = feat.trim();
          if (tr) set.add(tr);
        });
      }
    });
    return Array.from(set).sort((a, b) => (filterCounts.features[b] || 0) - (filterCounts.features[a] || 0));
  }, [games, filterCounts.features]);

  const [fullscreenSort, setFullscreenSort] = useState<GameSortMode>(readSavedSortMode);
  const fullscreenGames = useMemo(
    () => (isFullscreen ? sortGames(filteredGames, fullscreenSort) : filteredGames),
    [isFullscreen, filteredGames, fullscreenSort]
  );

  // WINDOW CONTROLS HOOK
  const { handleMinimize, handleToggleMaximize, handleClose, handleExit } = useWindowControls();

  const currentGroupLabel = useMemo(() => {
    switch (groupBy) {
      case "completion_status":
        return t("groups.completion_status") || "Stato completamento";
      case "library":
        return t("groups.library") || "Store / Piattaforma";
      case "is_installed":
        return t("groups.is_installed") || "Installati";
      case "genre":
        return t("groups.genre") || "Genere";
      case "developer":
        return t("groups.developer") || "Sviluppatore";
      case "release_year":
        return t("groups.release_year") || "Anno di rilascio";
      default:
        return t("groups.none") || "Nessuno";
    }
  }, [groupBy, t]);

  // TOGGLE FULLSCREEN MODE
  const toggleFullscreen = useCallback(async () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setFullscreen(next);
    } catch {
      // Dev fallback
    }
    await api.window.setFullscreen(next);
    if (next) {
      setFocusedIndex(0);
      setShowFullscreenDetails(false);
    }
  }, [isFullscreen]);

  // SOUND TOGGLE
  const handleToggleSound = useCallback(() => {
    const next = soundEffects.toggle();
    setSoundEnabled(next);
    if (next) soundEffects.playSelect();
  }, []);

  // GAMEPAD NAVIGATION HOOK
  const {
    activeDevice,
    gamepadConnected,
    gamepadName,
    gamepadType,
    focusedIndex,
    setFocusedIndex,
    showFullscreenDetails,
    setShowFullscreenDetails,
    homeFocusZone,
    setHomeFocusZone,
    isMenuOpen,
    setIsMenuOpen,
    consolePage,
    setConsolePage,
  } = useGamepadNavigation({
    isFullscreen,
    toggleFullscreen,
    filteredGames: fullscreenGames,
    selectedGame,
    showVirtualKeyboard,
    setShowVirtualKeyboard,
    setShowThemeModal,
    handleLaunch: (id) => handleLaunch(id),
    cycleFilter: cycleCategory,
    isSuspended: isGameRunning,
    fullscreenGridColumns: isFullscreen ? fullscreenGridColumns : 0,
    hasRecentRow: isFullscreen && fullscreenHasRecentRow,
  });

  // Controller style setting
  const [controllerStyleSetting, setControllerStyleSettingState] = useState<ControllerStyleSetting>(() => {
    try {
      const saved = localStorage.getItem("omnis_controller_style");
      if (saved && ["auto", "xbox", "playstation", "nintendo", "keyboard"].includes(saved)) {
        return saved as ControllerStyleSetting;
      }
    } catch {
      // Dev fallback
    }
    return "auto";
  });

  const setControllerStyleSetting = useCallback((style: ControllerStyleSetting) => {
    setControllerStyleSettingState(style);
    try {
      localStorage.setItem("omnis_controller_style", style);
    } catch {
      // Dev fallback
    }
  }, []);

  const effectiveFamily: ControllerType =
    controllerStyleSetting !== "auto" && controllerStyleSetting !== "keyboard"
      ? (controllerStyleSetting as ControllerType)
      : gamepadType;

  const focusedGame = fullscreenGames.length > 0
    ? (fullscreenGames[focusedIndex] || fullscreenGames[0] || null)
    : null;

  useEffect(() => {
    if (filteredGames.length > 0) {
      if (!selectedGame || !filteredGames.some((g) => g.id === selectedGame.id)) {
        setSelectedGame(filteredGames[0]);
      }
    }
  }, [filteredGames, selectedGame]);

  useEffect(() => {
    const handleOpenSettingsEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab?: SettingsTab }>;
      handleOpenSettings(customEvent.detail?.tab || "general");
    };
    window.addEventListener("omnis:open-settings", handleOpenSettingsEvent);
    return () => {
      window.removeEventListener("omnis:open-settings", handleOpenSettingsEvent);
    };
  }, [handleOpenSettings]);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest?.("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
        e.preventDefault();
        e.stopPropagation();
        openExternalUrl(href);
      }
    };
    window.addEventListener("click", handleGlobalClick, true);
    return () => {
      window.removeEventListener("click", handleGlobalClick, true);
    };
  }, []);

  const handleStartDragging = useCallback(async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, a, textarea, [data-no-drag]")) {
      return;
    }
    try {
      if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().startDragging();
        return;
      }
    } catch {
      // fallback
    }
    api.window.startDragging();
  }, []);

  return (
    <ActiveGameTimerProvider activeGame={activeGame}>
    <UpdaterContext.Provider value={updater}>
    <InputPromptContext.Provider
      value={{
        activeDevice,
        controllerType: gamepadType,
        effectiveFamily,
        styleSetting: controllerStyleSetting,
        setStyleSetting: setControllerStyleSetting,
      }}
    >
    <ControllerTypeContext.Provider value={effectiveFamily}>
      {/* ONBOARDING WIZARD */}
      {showOnboarding && (
        <OnboardingModal
          onComplete={() => {
            setShowOnboarding(false);
            refreshLibrary();
          }}
          onSkip={() => setShowOnboarding(false)}
        />
      )}

      <div
        className="flex flex-col h-screen w-screen select-none overflow-hidden transition-colors duration-300"
        style={{
          backgroundColor: "var(--bg-base)",
          color: "var(--text-primary)",
        }}
      >
        {isFullscreen ? (
          <FullscreenView
            focusedGame={focusedGame}
            filteredGames={fullscreenGames}
            allGames={games}
            focusedIndex={focusedIndex}
            setFocusedIndex={setFocusedIndex}
            setSelectedGame={setSelectedGame}
            counts={counts}
            activeFilter={activeFilter}
            setActiveFilter={selectFilter}
            cycleFilter={cycleCategory}
            gamepadConnected={gamepadConnected}
            gamepadName={gamepadName}
            searchQuery={searchQuery}
            setShowVirtualKeyboard={setShowVirtualKeyboard}
            soundEnabled={soundEnabled}
            handleToggleSound={handleToggleSound}
            currentTheme={currentTheme}
            setShowThemeModal={setShowThemeModal}
            loadProvidersAndConfig={loadProvidersAndConfig}
            setShowPluginModal={setShowPluginModal}
            toggleFullscreen={toggleFullscreen}
            handleMinimize={handleMinimize}
            handleClose={handleExit}
            handleToggleMaximize={handleToggleMaximize}
            handleStartDragging={handleStartDragging}
            handleLaunch={handleLaunch}
            handleSync={handleSync}
            isSyncing={isSyncing}
            showFullscreenDetails={showFullscreenDetails}
            setShowFullscreenDetails={setShowFullscreenDetails}
            carouselRef={carouselRef}
            onGridColumnsChange={setFullscreenGridColumns}
            onRecentRowChange={setFullscreenHasRecentRow}
            onGameAction={(action, gameId) => {
              if (action === "folder") handleOpenInstallDir(gameId);
              else if (action === "verify") handleVerifyFiles(gameId);
              else if (action === "shortcut") handleCreateShortcut(gameId);
              else if (action === "uninstall") handleConfirmUninstall(gameId);
            }}
            sortMode={fullscreenSort}
            onSortModeChange={(mode) => {
              setFullscreenSort(mode);
              saveSortMode(mode);
              setFocusedIndex(0);
            }}
            onClearSearch={() => {
              setSearchQuery("");
              setFocusedIndex(0);
            }}
            t={t}
            isGameRunning={isGameRunning}
            activeGame={activeGame}
            handleKillRunningGame={handleKillRunningGame}
            sessionToast={sessionToast}
            onDismissToast={() => setSessionToast(null)}
            homeFocusZone={homeFocusZone}
            setHomeFocusZone={setHomeFocusZone}
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            consolePage={consolePage}
            setConsolePage={setConsolePage}
            themes={themes}
            onSelectTheme={selectTheme}
            handleToggleHidden={handleToggleHidden}
            handleToggleFavorite={handleToggleFavorite}
            handlePromoteCopy={handlePromoteCopy}
          />
        ) : (
          <DesktopView
            currentTheme={currentTheme}
            viewMode={viewMode}
            setViewMode={setViewMode}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            toggleFullscreen={toggleFullscreen}
            handleToggleSound={handleToggleSound}
            soundEnabled={soundEnabled}
            setShowSettingsModal={setShowSettingsModal}
            setShowThemeModal={setShowThemeModal}
            loadProvidersAndConfig={loadProvidersAndConfig}
            setShowPluginModal={setShowPluginModal}
            providers={providers}
            setShowAddCustomModal={setShowAddCustomModal}
            setShowBatchEnrichModal={setShowBatchEnrichModal}
            onOpenPlayniteImport={() => setIsPlayniteImportOpen(true)}
            handleSync={handleSync}
            isSyncing={isSyncing}
            handleMinimize={handleMinimize}
            handleToggleMaximize={handleToggleMaximize}
            handleClose={handleClose}
            handleStartDragging={handleStartDragging}
            t={t}
            activeGame={activeGame}
            formatDuration={formatDuration}
            handleKillRunningGame={handleKillRunningGame}
            counts={counts}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            isFilterActive={isFilterActive}
            gamepadConnected={gamepadConnected}
            gamepadName={gamepadName}
            handleOpenFolder={handleOpenFolder}
            handleOpenSettings={handleOpenSettings}
            isGameRunning={isGameRunning}
            selectedGame={selectedGame}
            setSelectedGame={setSelectedGame}
            sortMode={sortMode}
            setSortMode={setSortMode}
            selectedFlags={selectedFlags}
            toggleFlag={toggleFlag}
            selectedStatuses={selectedStatuses}
            toggleStatus={toggleStatus}
            selectedStores={selectedStores}
            toggleStore={toggleStore}
            selectedGenres={selectedGenres}
            toggleGenre={toggleGenre}
            selectedFeatures={selectedFeatures}
            toggleFeature={toggleFeature}
            clearAllFilters={clearAllFilters}
            totalActiveFilters={totalActiveFilters}
            filterCounts={filterCounts}
            availableGenres={availableGenres}
            availableFeatures={availableFeatures}
            activeChips={activeChips}
            removeFilterChip={removeFilterChip}
            filteredGames={filteredGames}
            groupedGames={groupedGames}
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            collapsedGroups={collapsedGroups}
            toggleGroup={toggleGroup}
            currentGroupLabel={currentGroupLabel}
            detailsSearchQuery={detailsSearchQuery}
            setDetailsSearchQuery={setDetailsSearchQuery}
            detailsFilteredGames={detailsFilteredGames}
            handleOpenContextMenu={handleOpenContextMenu}
            handleLaunch={handleLaunch}
            setGameToEdit={setGameToEdit}
            setShowEditorModal={setShowEditorModal}
            setGameToResolve={setGameToResolve}
            setShowResolutionModal={setShowResolutionModal}
            handleEnrichSingleGame={handleEnrichSingleGame}
            handleRefreshHltb={handleRefreshHltb}
            isEnrichingSingle={isEnrichingSingle}
            handleOpenInstallDir={handleOpenInstallDir}
            handleCreateShortcut={handleCreateShortcut}
            handleVerifyFiles={handleVerifyFiles}
            handleOpenUninstallModal={handleOpenUninstallModal}
            handleRemoveFromLibrary={handleRemoveFromLibrary}
            handleToggleHidden={handleToggleHidden}
            handleToggleFavorite={handleToggleFavorite}
            handlePromoteCopy={handlePromoteCopy}
            statusMessage={statusMessage}
            achievementSync={achievementSync}
            totalGamesCount={games.length}
          />
        )}

        {/* GLOBAL MODALS */}
        <AppModals
          showThemeModal={showThemeModal}
          setShowThemeModal={setShowThemeModal}
          themes={themes}
          currentTheme={currentTheme}
          selectTheme={selectTheme}
          handleSaveCustomTheme={handleSaveCustomTheme}
          handleOpenFolder={handleOpenFolder}

          showPluginModal={showPluginModal}
          setShowPluginModal={setShowPluginModal}
          pluginManager={pluginManager}
          games={games}
          refreshLibrary={refreshLibrary}

          contextMenu={contextMenu}
          setContextMenu={setContextMenu}
          handleLaunch={handleLaunch}
          setGameToEdit={setGameToEdit}
          setShowEditorModal={setShowEditorModal}
          setGameToResolve={setGameToResolve}
          setShowResolutionModal={setShowResolutionModal}
          setSelectedGame={setSelectedGame}
          setViewMode={setViewMode}
          handleUpdateCompletionStatus={handleUpdateCompletionStatus}
          handleOpenInstallDir={handleOpenInstallDir}
          handleCreateShortcut={handleCreateShortcut}
          handleVerifyFiles={handleVerifyFiles}
          handleOpenUninstallModal={handleOpenUninstallModal}
          handleRemoveFromLibrary={handleRemoveFromLibrary}
          onToggleHidden={handleToggleHidden}
          onToggleFavorite={handleToggleFavorite}
          onPromoteCopy={handlePromoteCopy}

          showEditorModal={showEditorModal}
          gameToEdit={gameToEdit}
          selectedGame={selectedGame}
          setGames={setGames}
          setStatusMessage={setStatusMessage}
          statusText={statusText}

          showResolutionModal={showResolutionModal}
          gameToResolve={gameToResolve}

          showBatchEnrichModal={showBatchEnrichModal}
          setShowBatchEnrichModal={setShowBatchEnrichModal}
          filteredGames={filteredGames}

          showVirtualKeyboard={showVirtualKeyboard}
          setShowVirtualKeyboard={setShowVirtualKeyboard}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          setFocusedIndex={setFocusedIndex}
          fullscreenGamesCount={fullscreenGames.length}

          showAddCustomModal={showAddCustomModal}
          setShowAddCustomModal={setShowAddCustomModal}

          showUninstallModal={showUninstallModal}
          setShowUninstallModal={setShowUninstallModal}
          gameToUninstall={gameToUninstall}
          setGameToUninstall={setGameToUninstall}
          handleConfirmUninstall={handleConfirmUninstall}

          showSettingsModal={showSettingsModal}
          setShowSettingsModal={setShowSettingsModal}
          soundEnabled={soundEnabled}
          handleToggleSound={handleToggleSound}
          settingsInitialTab={settingsInitialTab}

          isPlayniteImportOpen={isPlayniteImportOpen}
          setIsPlayniteImportOpen={setIsPlayniteImportOpen}

          showKillConfirmModal={showKillConfirmModal}
          setShowKillConfirmModal={setShowKillConfirmModal}
          activeGame={activeGame}
          confirmKillRunningGame={confirmKillRunningGame}

          t={t}
        />

        {/* GLOBAL TOASTS & FLOATING NOTIFICATIONS */}
        <AppToasts
          isFullscreen={isFullscreen}
          achievementSync={achievementSync}
          syncBanner={syncBanner}
          onDismissSyncBanner={() => {
            if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
            setSyncBanner(null);
            setIsSyncing(false);
          }}
          sessionToast={sessionToast}
          onDismissSessionToast={() => setSessionToast(null)}
          formatDuration={formatDuration}
          updater={updater}
          onOpenSettings={handleOpenSettings}
          t={t}
        />
      </div>
    </ControllerTypeContext.Provider>
    </InputPromptContext.Provider>
    </UpdaterContext.Provider>
    </ActiveGameTimerProvider>
  );
}
