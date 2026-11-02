import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ListViewTable from "./components/ListViewTable";
import StatisticsDashboardView from "./components/views/StatisticsDashboardView";
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
  AchievementSyncProgress,
  ActiveGameSession,
  ViewMode,
  GroupBy,
  LibraryCounts,
  ThemeConfig,
  ProviderInfo,
  MetadataPipelineConfig,
  formatImageUrl,
  normalizeGame,
  BUILTIN_THEMES,
} from "./types";
import { getVisibleCategories } from "./utils/consoleCategories";
import { useWindowControls } from "./hooks/useWindowControls";
import { useLibraryFilters } from "./hooks/useLibraryFilters";
import { useGamepadNavigation, ControllerType } from "./hooks/useGamepadNavigation";
import { ActiveGameTimerProvider } from "./context/ActiveGameTimerContext";
import { useAppUpdater, UpdaterContext } from "./hooks/useAppUpdater";
import FullscreenView from "./components/views/FullscreenView";
import {
  ControllerTypeContext,
  InputPromptContext,
  ControllerStyleSetting,
} from "./components/fullscreen/ConsoleChrome";
import { GameSortMode, readSavedSortMode, saveSortMode, sortGames } from "./utils/sortGames";
import DetailsSplitView from "./components/views/DetailsSplitView";
import GridView from "./components/views/GridView";
import TopBar from "./components/navigation/TopBar";
import VideoBackdrop from "./components/common/VideoBackdrop";
import Sidebar from "./components/navigation/Sidebar";
import OnboardingModal, { shouldShowOnboarding } from "./components/modals/OnboardingModal";
import EmptyGamesView from "./components/common/EmptyGamesView";
import { StatusBar } from "./components/navigation/StatusBar";
import { AppToasts, SessionToastInfo, SyncBannerInfo } from "./components/common/AppToasts";
import { AppModals } from "./components/modals/AppModals";
import { CatalogToolbar } from "./components/navigation/CatalogToolbar";
import { usePluginManager } from "./hooks/usePluginManager";
import { useAppEvents } from "./hooks/useAppEvents";
import { useGameOperations } from "./hooks/useGameOperations";

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
  const [gridCardWidth, setGridCardWidth] = useState<number>(180);
  const [detailsSidebarOpen, setDetailsSidebarOpen] = useState<boolean>(true);
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

  // ONBOARDING WIZARD – shown only on first launch (empty library + never completed)
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

  // LOAD GAMES & THEMES
  const loadGames = useCallback(async () => {
    try {
      const loadedGames = await api.games.getGames();
      if (loadedGames) {
        const normalized = loadedGames.map(normalizeGame);
        setGames(normalized);
        setSelectedGame((prev) => {
          if (prev) {
            const current = normalized.find((g) => g.id === prev.id);
            if (current) return current;
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

  // THEME ENGINE
  const [themes, setThemes] = useState<ThemeConfig[]>(BUILTIN_THEMES);
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(BUILTIN_THEMES[0]);
  const [showThemeModal, setShowThemeModal] = useState<boolean>(false);

  const loadThemes = useCallback(async () => {
    try {
      const loadedThemes = await api.themes.getThemes();
      if (loadedThemes && loadedThemes.length > 0) {
        setThemes(loadedThemes);
        const savedThemeId = localStorage.getItem("omnis_selected_theme_id");
        if (savedThemeId) {
          const found = loadedThemes.find((th) => th.id === savedThemeId);
          if (found) {
            setCurrentTheme(found);
            return;
          }
        }
        setCurrentTheme(loadedThemes[0]);
      }
    } catch (err) {
      console.warn("Failed loading themes:", err);
    }
  }, []);

  const selectTheme = useCallback((theme: ThemeConfig) => {
    setCurrentTheme(theme);
    localStorage.setItem("omnis_selected_theme_id", theme.id);
    setStatusMessage(statusText("theme_activated", { name: theme.name }));
  }, [statusText]);

  const handleSaveCustomTheme = useCallback(async (fullTheme: ThemeConfig) => {
    await api.themes.saveCustomTheme(fullTheme);
    await loadThemes();
    selectTheme(fullTheme);
    setStatusMessage(statusText("theme_saved", { name: fullTheme.name }));
  }, [loadThemes, selectTheme, statusText]);

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
    loadThemes,
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
          // Dev or fallback
        }

        if (isFsCli || isWindowFs) {
          setIsFullscreen(true);
          setFocusedIndex(0);
          setShowFullscreenDetails(false);
          try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().setFullscreen(true);
          } catch {
            // Dev or fallback
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
      listen<boolean>("app-set-fullscreen", async (event) => {
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
  const { handleMinimize, handleToggleMaximize, handleClose } = useWindowControls();

  // SMART FILTER BAR MENU
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    if (showFilterMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showFilterMenu]);

  // GROUP BY POPOVER MENU
  const [showGroupByMenu, setShowGroupByMenu] = useState(false);
  const groupByMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (groupByMenuRef.current && !groupByMenuRef.current.contains(e.target as Node)) {
        setShowGroupByMenu(false);
      }
    };
    if (showGroupByMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showGroupByMenu]);

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
      // Dev or test fallback
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
      // Dev or test environment fallback
    }
    return "auto";
  });

  const setControllerStyleSetting = useCallback((style: ControllerStyleSetting) => {
    setControllerStyleSettingState(style);
    try {
      localStorage.setItem("omnis_controller_style", style);
    } catch {
      // Dev or test environment fallback
    }
  }, []);

  const effectiveFamily: ControllerType =
    controllerStyleSetting !== "auto" && controllerStyleSetting !== "keyboard"
      ? (controllerStyleSetting as ControllerType)
      : gamepadType;

  const focusedGame = fullscreenGames.length > 0
    ? (fullscreenGames[focusedIndex] || fullscreenGames[0] || null)
    : null;

  // APPLY THEME TO CSS VARIABLES
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--bg-base", currentTheme.bg_base);
    root.style.setProperty("--bg-surface", currentTheme.bg_surface);
    root.style.setProperty("--bg-card", currentTheme.bg_card);
    root.style.setProperty("--text-primary", currentTheme.text_primary);
    root.style.setProperty("--text-muted", currentTheme.text_muted);
    root.style.setProperty("--accent-primary", currentTheme.accent_primary);
    root.style.setProperty("--accent-glow", currentTheme.accent_glow);
    root.style.setProperty("--border-color", currentTheme.border_color);
    root.style.setProperty("--card-radius", currentTheme.card_radius);
    const epicFontStack = '"Brutal", "Brutal Type", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    if (currentTheme.font_family && !currentTheme.font_family.startsWith("system-ui")) {
      root.style.fontFamily = currentTheme.font_family;
    } else {
      root.style.fontFamily = epicFontStack;
    }
    if (currentTheme.tokens && typeof currentTheme.tokens === "object") {
      Object.entries(currentTheme.tokens).forEach(([tokenKey, tokenValue]) => {
        if (tokenKey.startsWith("--")) {
          root.style.setProperty(tokenKey, tokenValue);
        }
      });
    }
    document.body.style.backgroundColor = currentTheme.bg_base;
    document.body.style.color = currentTheme.text_primary;

    let styleTag = document.getElementById("omnis-custom-theme-css") as HTMLStyleElement | null;
    if (currentTheme.custom_css && currentTheme.custom_css.trim()) {
      if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = "omnis-custom-theme-css";
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = currentTheme.custom_css;
    } else if (styleTag) {
      styleTag.textContent = "";
    }
  }, [currentTheme]);

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
        {/* FULLSCREEN MODE */}
        {isFullscreen ? (
          <FullscreenView
            focusedGame={focusedGame}
            filteredGames={fullscreenGames}
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
            handleClose={handleClose}
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
            themes={themes}
            onSelectTheme={selectTheme}
          />
        ) : (
          /* DESKTOP LAUNCHER MODE */
          <div className="flex flex-col h-screen w-screen overflow-hidden">
            {/* TOP NAVIGATION & TITLEBAR */}
            <TopBar
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
            />

            {/* MAIN BODY */}
            <div className="flex-1 flex overflow-hidden">
              {/* SIDEBAR NAVIGATION */}
              <Sidebar
                counts={counts}
                activeFilter={activeFilter}
                setActiveFilter={setActiveFilter}
                isFilterActive={isFilterActive}
                gamepadConnected={gamepadConnected}
                gamepadName={gamepadName}
                handleOpenFolder={handleOpenFolder}
                onOpenStoreAccounts={() => handleOpenSettings("accounts")}
                viewMode={viewMode}
                setViewMode={setViewMode}
              />

              {/* MAIN CATALOG VIEW */}
              <main
                className="flex-1 flex flex-col overflow-hidden transition-colors duration-300 relative"
                style={{ backgroundColor: "var(--bg-base)" }}
              >
                {/* Cinema Lounge Dynamic Video Trailer Backdrop */}
                {currentTheme.enable_video_backdrop && viewMode !== "details" && (
                  <VideoBackdrop
                    game={selectedGame}
                    theme={currentTheme}
                    blurLevel="ambient"
                    className="opacity-40"
                    isPaused={isGameRunning}
                  />
                )}

                {/* CONTEXTUAL TOOLBAR */}
                <CatalogToolbar
                  viewMode={viewMode}
                  showFilterMenu={showFilterMenu}
                  setShowFilterMenu={setShowFilterMenu}
                  filterMenuRef={filterMenuRef}
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
                  searchQuery={searchQuery}
                  filteredGamesCount={filteredGames.length}
                  totalGamesCount={games.length}
                  showGroupByMenu={showGroupByMenu}
                  setShowGroupByMenu={setShowGroupByMenu}
                  groupByMenuRef={groupByMenuRef}
                  groupBy={groupBy}
                  setGroupBy={setGroupBy}
                  currentGroupLabel={currentGroupLabel}
                  gridCardWidth={gridCardWidth}
                  setGridCardWidth={setGridCardWidth}
                  t={t}
                />

                {/* VIEW 1: POSTER GRID VIEW */}
                {viewMode === "grid" && (
                  <GridView
                    filteredGames={filteredGames}
                    groupedGames={groupedGames}
                    groupBy={groupBy}
                    collapsedGroups={collapsedGroups}
                    toggleGroup={toggleGroup}
                    gridCardWidth={gridCardWidth}
                    selectedGame={selectedGame}
                    setSelectedGame={setSelectedGame}
                    setViewMode={setViewMode}
                    handleOpenContextMenu={handleOpenContextMenu}
                    handleLaunch={handleLaunch}
                    setGameToEdit={setGameToEdit}
                    setShowEditorModal={setShowEditorModal}
                    activeGame={activeGame}
                    formatDuration={formatDuration}
                    handleKillRunningGame={handleKillRunningGame}
                    activeFilter={activeFilter}
                    searchQuery={searchQuery}
                    onClearFilters={clearAllFilters}
                    hasActiveFilters={totalActiveFilters > 0 || searchQuery.trim() !== ""}
                  />
                )}

                {/* VIEW 2: DETAILS SPLIT-PANEL VIEW */}
                {viewMode === "details" && (
                  filteredGames.length === 0 ? (
                    <EmptyGamesView
                      onClearFilters={clearAllFilters}
                      hasActiveFilters={totalActiveFilters > 0 || searchQuery.trim() !== ""}
                    />
                  ) : selectedGame ? (
                    <DetailsSplitView
                      currentTheme={currentTheme}
                      selectedGame={selectedGame}
                      setSelectedGame={setSelectedGame}
                      detailsSidebarOpen={detailsSidebarOpen}
                      setDetailsSidebarOpen={setDetailsSidebarOpen}
                      detailsSearchQuery={detailsSearchQuery}
                      setDetailsSearchQuery={setDetailsSearchQuery}
                      detailsFilteredGames={detailsFilteredGames}
                      setViewMode={setViewMode}
                      handleOpenContextMenu={handleOpenContextMenu}
                      handleLaunch={handleLaunch}
                      handleEnrichSingleGame={handleEnrichSingleGame}
                      handleRefreshHltb={handleRefreshHltb}
                      isEnrichingSingle={isEnrichingSingle}
                      setGameToEdit={setGameToEdit}
                      setShowEditorModal={setShowEditorModal}
                      setGameToResolve={setGameToResolve}
                      setShowResolutionModal={setShowResolutionModal}
                      t={t}
                      isGameRunning={isGameRunning}
                      activeGame={activeGame}
                      formatDuration={formatDuration}
                      handleKillRunningGame={handleKillRunningGame}
                      activeFilter={activeFilter}
                      setActiveFilter={setActiveFilter}
                      isFilterActive={isFilterActive}
                      handleOpenInstallDir={handleOpenInstallDir}
                      handleCreateShortcut={handleCreateShortcut}
                      handleVerifyFiles={handleVerifyFiles}
                      handleOpenUninstallModal={handleOpenUninstallModal}
                      handleRemoveFromLibrary={handleRemoveFromLibrary}
                    />
                  ) : (
                    <EmptyGamesView
                      onClearFilters={clearAllFilters}
                      hasActiveFilters={totalActiveFilters > 0 || searchQuery.trim() !== ""}
                    />
                  )
                )}

                {/* VIEW 3: COMPACT DATA TABLE VIEW */}
                {viewMode === "list" && (
                  <ListViewTable
                    games={filteredGames}
                    selectedGameId={selectedGame?.id || null}
                    onSelectGame={(g) => setSelectedGame(g)}
                    onOpenDetails={(g) => {
                      setSelectedGame(g);
                      setViewMode("details");
                    }}
                    onLaunchGame={handleLaunch}
                    onEditGame={(g) => {
                      setGameToEdit(g);
                      setShowEditorModal(true);
                    }}
                    onContextMenu={handleOpenContextMenu}
                  />
                )}

                {/* VIEW 4: DETAILED STATS DASHBOARD */}
                {viewMode === "stats" && (
                  <StatisticsDashboardView
                    onSelectGame={(gameId) => {
                      const target = games.find((g) => g.id === gameId);
                      if (target) {
                        setSelectedGame(target);
                        setViewMode("details");
                      }
                    }}
                  />
                )}
              </main>
            </div>

            {/* FOOTER STATUS BAR */}
            <StatusBar
              gamepadConnected={gamepadConnected}
              gamepadName={gamepadName}
              activeGame={activeGame}
              formatDuration={formatDuration}
              handleKillRunningGame={handleKillRunningGame}
              isSyncing={isSyncing}
              statusMessage={statusMessage}
              achievementSync={achievementSync}
              currentThemeName={currentTheme.name}
              t={t}
            />
          </div>
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
