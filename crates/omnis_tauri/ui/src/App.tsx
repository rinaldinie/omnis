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
import OnboardingModal, { shouldShowOnboarding } from "./components/modals/OnboardingModal";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { AppToasts, SessionToastInfo, SyncBannerInfo } from "./components/common/AppToasts";
import { AppModals } from "./components/modals/AppModals";
import { usePluginManager } from "./hooks/usePluginManager";
import { useAppEvents } from "./hooks/useAppEvents";
import { useGameOperations } from "./hooks/useGameOperations";
import { useThemeEngine } from "./hooks/useThemeEngine";
import { useLibraryStore, useUiStore } from "./stores";

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
  const {
    games,
    counts,
    selectedGame,
    setSelectedGame,
    loadGames: storeLoadGames,
    refreshLibrary,
  } = useLibraryStore();

  const {
    isFullscreen,
    setIsFullscreen,
    setSoundEnabled,
    openSettings: handleOpenSettings,
    showOnboarding,
    setShowOnboarding,
    showVirtualKeyboard,
    setShowVirtualKeyboard,
    setContextMenu,
  } = useUiStore();

  // I18N
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const statusText = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      tRef.current(`app_status.${key}`, params),
    []
  );

  // ONLINE APP UPDATER
  const updater = useAppUpdater();
  const { checkForUpdates } = updater;

  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdates(true).catch((err) => {
        console.warn("Silent background update check failed:", err);
      });
    }, 4000);
    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  // LOAD GAMES
  const loadGames = useCallback(async () => {
    await storeLoadGames({
      shouldShowOnboardingCheck: shouldShowOnboarding,
      onShowOnboarding: () => setShowOnboarding(true),
    });
  }, [storeLoadGames, setShowOnboarding]);

  // THEME ENGINE HOOK
  const {
    themes,
    currentTheme,
    setShowThemeModal,
    loadThemes,
    selectTheme,
    handleSaveCustomTheme,
  } = useThemeEngine({ statusText });

  // METADATA PLUGIN & PIPELINE MANAGER HOOK
  const pluginManager = usePluginManager({
    statusText,
    t,
  });

  const {
    providers,
    loadProvidersAndConfig,
    setPipelineProgress,
  } = pluginManager;

  // GAME ACTIONS & OPERATIONS HOOK
  const gameOps = useGameOperations({
    statusText,
    t,
  });

  const {
    isEnrichingSingle,
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

  // TAURI EVENTS & BACKGROUND NOTIFICATIONS HOOK
  const {
    setIsSyncing,
    isGameRunning,
    activeGame,
    sessionToast,
    setSessionToast,
    syncBanner,
    setSyncBanner,
    achievementSync,
    syncBannerTimeoutRef,
  } = useAppEvents({
    loadGames,
    refreshLibrary,
    loadThemes,
    loadProvidersAndConfig,
    handleLaunch,
    handleOpenSettings,
    statusText,
    setPipelineProgress,
  });

  // FULLSCREEN MODE REFS & SIZING
  const carouselRef = useRef<HTMLDivElement>(null);
  const [fullscreenGridColumns, setFullscreenGridColumns] = useState<number>(0);
  const [fullscreenHasRecentRow, setFullscreenHasRecentRow] = useState<boolean>(false);
  const fullscreenNavCallbacksRef = useRef<{
    setFocusedIndex: (index: number) => void;
    setShowFullscreenDetails: (show: boolean) => void;
  }>({
    setFocusedIndex: () => {},
    setShowFullscreenDetails: () => {},
  });

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
          fullscreenNavCallbacksRef.current.setFocusedIndex(0);
          fullscreenNavCallbacksRef.current.setShowFullscreenDetails(false);
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
          fullscreenNavCallbacksRef.current.setFocusedIndex(0);
          fullscreenNavCallbacksRef.current.setShowFullscreenDetails(false);
        }
      }).then((fn) => {
        unlistenEvent = fn;
      });
    }).catch(() => {});

    return () => {
      if (unlistenEvent) unlistenEvent();
    };
  }, [setIsFullscreen]);

  // CONTEXT MENU
  const handleOpenContextMenu = useCallback((e: React.MouseEvent, game: GameDto) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 240;
    const menuHeight = 220;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
    setContextMenu({ x, y, game });
  }, [setContextMenu]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setContextMenu]);

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

  const fullscreenGames = filteredGames;

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
    await api.window.setFullscreen(next);
    if (next) {
      fullscreenNavCallbacksRef.current.setFocusedIndex(0);
      fullscreenNavCallbacksRef.current.setShowFullscreenDetails(false);
    }
  }, [isFullscreen, setIsFullscreen]);

  // SOUND TOGGLE
  const handleToggleSound = useCallback(() => {
    const next = soundEffects.toggle();
    setSoundEnabled(next);
    if (next) soundEffects.playSelect();
  }, [setSoundEnabled]);

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

  fullscreenNavCallbacksRef.current = {
    setFocusedIndex,
    setShowFullscreenDetails,
  };

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
  }, [filteredGames, selectedGame, setSelectedGame]);

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
        <ErrorBoundary
          scope="OnboardingModal"
          variant="compact"
          className="fixed bottom-4 left-4 right-4 z-[400] max-w-xl mx-auto shadow-xl"
          onReset={() => setShowOnboarding(false)}
        >
          <OnboardingModal
            onComplete={() => {
              setShowOnboarding(false);
              refreshLibrary();
            }}
            onSkip={() => setShowOnboarding(false)}
            onLibraryImported={refreshLibrary}
            onStartMetadataDownload={gameOps.handleDownloadAll}
            onOpenSettings={handleOpenSettings}
          />
        </ErrorBoundary>
      )}

      <div
        className="flex flex-col h-screen w-screen select-none overflow-hidden transition-colors duration-300"
        style={{
          backgroundColor: "var(--bg-base)",
          color: "var(--text-primary)",
        }}
      >
        {isFullscreen ? (
          <ErrorBoundary
            scope="FullscreenView"
            variant="page"
            resetKeys={[isFullscreen]}
            secondaryAction={{
              label: t("error_boundary.exit_fullscreen", { defaultValue: "Switch to desktop" }),
              onClick: () => {
                void toggleFullscreen();
              },
            }}
          >
            <FullscreenView
            focusedGame={focusedGame}
            filteredGames={fullscreenGames}
            focusedIndex={focusedIndex}
            setFocusedIndex={setFocusedIndex}
            activeFilter={activeFilter}
            setActiveFilter={selectFilter}
            cycleFilter={cycleCategory}
            gamepadConnected={gamepadConnected}
            searchQuery={searchQuery}
            handleToggleSound={handleToggleSound}
            currentTheme={currentTheme}
            loadProvidersAndConfig={loadProvidersAndConfig}
            toggleFullscreen={toggleFullscreen}
            handleMinimize={handleMinimize}
            handleClose={handleExit}
            handleLaunch={handleLaunch}
            handleSync={handleSync}
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
            sortMode={sortMode}
            onSortModeChange={(mode) => {
              setSortMode(mode);
              setFocusedIndex(0);
            }}
            onClearSearch={() => {
              setSearchQuery("");
              setFocusedIndex(0);
            }}
            t={t}
            handleKillRunningGame={handleKillRunningGame}
            homeFocusZone={homeFocusZone}
            setHomeFocusZone={setHomeFocusZone}
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            consolePage={consolePage}
            setConsolePage={setConsolePage}
            themes={themes}
            onSelectTheme={selectTheme}
          />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary
            scope="DesktopView"
            variant="page"
            resetKeys={[isFullscreen]}
          >
            <DesktopView
            currentTheme={currentTheme}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            toggleFullscreen={toggleFullscreen}
            handleToggleSound={handleToggleSound}
            loadProvidersAndConfig={loadProvidersAndConfig}
            providers={providers}
            handleSync={handleSync}
            handleMinimize={handleMinimize}
            handleToggleMaximize={handleToggleMaximize}
            handleClose={handleClose}
            handleStartDragging={handleStartDragging}
            t={t}
            formatDuration={formatDuration}
            handleKillRunningGame={handleKillRunningGame}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            isFilterActive={isFilterActive}
            gamepadConnected={gamepadConnected}
            gamepadName={gamepadName}
            handleOpenFolder={handleOpenFolder}
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
          />
          </ErrorBoundary>
        )}

        {/* GLOBAL MODALS */}
        <ErrorBoundary
          scope="AppModals"
          variant="compact"
          className="fixed bottom-4 left-4 right-4 z-[400] max-w-xl mx-auto shadow-xl"
        >
          <AppModals
            themes={themes}
            currentTheme={currentTheme}
            selectTheme={selectTheme}
            handleSaveCustomTheme={handleSaveCustomTheme}
            handleOpenFolder={handleOpenFolder}
            pluginManager={pluginManager}
            handleLaunch={handleLaunch}
            handleUpdateCompletionStatus={handleUpdateCompletionStatus}
            handleOpenInstallDir={handleOpenInstallDir}
            handleCreateShortcut={handleCreateShortcut}
            handleVerifyFiles={handleVerifyFiles}
            handleOpenUninstallModal={handleOpenUninstallModal}
            handleRemoveFromLibrary={handleRemoveFromLibrary}
            onToggleHidden={handleToggleHidden}
            onToggleFavorite={handleToggleFavorite}
            onPromoteCopy={handlePromoteCopy}
            statusText={statusText}
            filteredGames={filteredGames}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            setFocusedIndex={setFocusedIndex}
            fullscreenGamesCount={fullscreenGames.length}
            handleConfirmUninstall={handleConfirmUninstall}
            handleToggleSound={handleToggleSound}
            confirmKillRunningGame={confirmKillRunningGame}
            t={t}
          />
        </ErrorBoundary>

        {/* GLOBAL TOASTS & FLOATING NOTIFICATIONS */}
        <ErrorBoundary scope="AppToasts" variant="silent">
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
        </ErrorBoundary>
      </div>
    </ControllerTypeContext.Provider>
    </InputPromptContext.Provider>
    </UpdaterContext.Provider>
    </ActiveGameTimerProvider>
  );
}
