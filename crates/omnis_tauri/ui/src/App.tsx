import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Layers,
  Filter,
  ZoomIn,
  ZoomOut,
  ChevronRight,
  ChevronDown,
  Gamepad2,
  X,
  Square,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Check,
  Sparkles,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import GameEditorModal from "./components/GameEditorModal";
import MetadataResolutionModal from "./components/MetadataResolutionModal";
import ListViewTable from "./components/ListViewTable";
import StatisticsDashboardView from "./components/views/StatisticsDashboardView";
import VirtualKeyboard from "./components/VirtualKeyboard";
import { SettingsModal, SettingsTab } from "./components/SettingsModal";
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
  ActiveGameSession,
  ViewMode,
  GroupBy,
  LibraryCounts,
  ThemeConfig,
  ProviderInfo,
  MetadataPipelineConfig,
  invokeTauri,
  formatImageUrl,
  normalizeGame,
  BUILTIN_THEMES,
  SAMPLE_GAMES,
} from "./types";
import { useWindowControls } from "./hooks/useWindowControls";
import { useLibraryFilters } from "./hooks/useLibraryFilters";
import { useGamepadNavigation, ControllerType } from "./hooks/useGamepadNavigation";
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
import ThemeModal from "./components/modals/ThemeModal";
import PluginManagerModal from "./components/modals/PluginManagerModal";
import CustomGameModal from "./components/modals/CustomGameModal";
import BatchEnrichModal from "./components/modals/BatchEnrichModal";
import PlayniteImportModal from "./components/modals/PlayniteImportModal";
import { UninstallModal } from "./components/modals/UninstallModal";
import OnboardingModal, { shouldShowOnboarding, shouldAutoScanOnStartup } from "./components/modals/OnboardingModal";
import GlobalContextMenu from "./components/GlobalContextMenu";
import FilterAndSortPopover from "./components/navigation/FilterAndSortPopover";
import GroupByPopover from "./components/navigation/GroupByPopover";
import EmptyGamesView from "./components/common/EmptyGamesView";

export interface SessionToastInfo {
  title: string;
  durationSeconds: number;
  gameId: string;
}

export interface SyncBannerInfo {
  storeId: string;
  storeName: string;
  message: string;
  current: number;
  total: number;
  status: "syncing" | "completed" | "error";
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
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
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isGameRunning, setIsGameRunning] = useState<boolean>(false);
  const [activeGame, setActiveGame] = useState<ActiveGameSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [sessionToast, setSessionToast] = useState<SessionToastInfo | null>(null);
  const [syncBanner, setSyncBanner] = useState<SyncBannerInfo | null>(null);
  const [showKillConfirmModal, setShowKillConfirmModal] = useState<boolean>(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gamesRef = useRef<GameDto[]>([]);
  gamesRef.current = games;
  const activeGameRef = useRef<ActiveGameSession | null>(null);
  activeGameRef.current = activeGame;

  // ONBOARDING WIZARD – shown only on first launch (empty library + never completed)
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);

  // ONLINE APP UPDATER
  const updater = useAppUpdater();

  // Check for updates silently on startup after 4-second delay
  useEffect(() => {
    const timer = setTimeout(() => {
      updater.checkForUpdates(true).catch((err) => {
        console.warn("Silent background update check failed:", err);
      });
    }, 4000);
    return () => clearTimeout(timer);
  }, [updater.checkForUpdates]);

  // Live timer for active game session (counts from process detection, Requirement A6)
  useEffect(() => {
    if (!activeGame) {
      setElapsedSeconds(0);
      return;
    }
    const calcElapsed = () => {
      const timeRef = activeGame.process_detected_at || activeGame.started_at;
      const started = new Date(timeRef).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - started) / 1000));
      setElapsedSeconds(diff);
    };
    calcElapsed();
    const interval = setInterval(calcElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeGame?.started_at, activeGame?.process_detected_at]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
    };
  }, []);

  // I18N
  const { t, currentLocaleInfo } = useTranslation();
  // Status-bar text; reads the latest translator so long-lived event listeners follow language changes
  const tRef = useRef(t);
  tRef.current = t;
  const statusText = (key: string, params?: Record<string, string | number>) =>
    tRef.current(`app_status.${key}`, params);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("general");

  const handleOpenSettings = (tab: SettingsTab = "general") => {
    setSettingsInitialTab(tab);
    setShowSettingsModal(true);
  };

  useEffect(() => {
    const handleOpenSettingsEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab?: SettingsTab }>;
      handleOpenSettings(customEvent.detail?.tab || "general");
    };
    window.addEventListener("omnis:open-settings", handleOpenSettingsEvent);
    return () => {
      window.removeEventListener("omnis:open-settings", handleOpenSettingsEvent);
    };
  }, []);

  // Global handler for external web links to open in the OS browser
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

  // METADATA MODALS
  const [showEditorModal, setShowEditorModal] = useState<boolean>(false);
  const [showResolutionModal, setShowResolutionModal] = useState<boolean>(false);
  const [gameToEdit, setGameToEdit] = useState<any>(null);
  const [gameToResolve, setGameToResolve] = useState<any>(null);

  // THEME ENGINE
  const [themes, setThemes] = useState<ThemeConfig[]>(BUILTIN_THEMES);
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(BUILTIN_THEMES[0]);
  const [showThemeModal, setShowThemeModal] = useState<boolean>(false);

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
  // Columns of the fullscreen grid view (0 = single shelf row), reported by FullscreenView
  const [fullscreenGridColumns, setFullscreenGridColumns] = useState<number>(0);
  // Whether the fullscreen home shows the "continue playing" row, reported by FullscreenView
  const [fullscreenHasRecentRow, setFullscreenHasRecentRow] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(soundEffects.enabled);

  // DETECT --fullscreen / --bigpicture CLI ARGUMENTS FROM TAURI & SINGLE-INSTANCE
  useEffect(() => {
    const checkFullscreenLaunch = async () => {
      try {
        const isFsCli = await invokeTauri<boolean>("is_fullscreen_launch");
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
          await invokeTauri("window_set_fullscreen", { fullscreen: true });
        }
      } catch (err) {
        console.warn("Error detecting fullscreen CLI argument:", err);
      }
    };
    checkFullscreenLaunch();

    // Listen for single-instance or backend fullscreen trigger events (e.g. from Moonlight / Sunshine)
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

  // CUSTOM GAME MODAL
  const [showAddCustomModal, setShowAddCustomModal] = useState<boolean>(false);

  // CONTEXT MENU
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    game: GameDto;
  } | null>(null);

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
    cycleFilter,
    filteredGames,
    groupedGames,
    detailsFilteredGames,
  } = useLibraryFilters(games);

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) =>
      g.genres.forEach((genre) => {
        const t = genre.trim();
        if (t) set.add(t);
      })
    );
    return Array.from(set).sort((a, b) => (filterCounts.genres[b] || 0) - (filterCounts.genres[a] || 0));
  }, [games, filterCounts.genres]);

  const availableFeatures = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) => {
      if (g.features) {
        g.features.forEach((feat) => {
          const t = feat.trim();
          if (t) set.add(t);
        });
      }
    });
    return Array.from(set).sort((a, b) => (filterCounts.features[b] || 0) - (filterCounts.features[a] || 0));
  }, [games, filterCounts.features]);

  // Fullscreen sort order; the sorted list drives gamepad navigation, launch and the fullscreen view
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
  const toggleFullscreen = async () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setFullscreen(next);
    } catch {
      // Dev or test environment fallback
    }
    await invokeTauri("window_set_fullscreen", { fullscreen: next });
    if (next) {
      setFocusedIndex(0);
      setShowFullscreenDetails(false);
    }
  };

  // SOUND TOGGLE
  const handleToggleSound = () => {
    const next = soundEffects.toggle();
    setSoundEnabled(next);
    if (next) soundEffects.playSelect();
  };

  // GAMEPAD NAVIGATION HOOK
  const {
    activeDevice,
    setActiveDevice,
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
    cycleFilter,
    isSuspended: isGameRunning,
    fullscreenGridColumns: isFullscreen ? fullscreenGridColumns : 0,
    hasRecentRow: isFullscreen && fullscreenHasRecentRow,
  });

  // Controller style setting (auto / xbox / playstation / nintendo / keyboard)
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

  const setControllerStyleSetting = (style: ControllerStyleSetting) => {
    setControllerStyleSettingState(style);
    try {
      localStorage.setItem("omnis_controller_style", style);
    } catch {
      // Dev or test environment fallback
    }
  };

  const effectiveFamily: ControllerType =
    controllerStyleSetting !== "auto" && controllerStyleSetting !== "keyboard"
      ? (controllerStyleSetting as ControllerType)
      : gamepadType;

  const focusedGame = fullscreenGames.length > 0
    ? (fullscreenGames[focusedIndex] || fullscreenGames[0] || null)
    : null;

  // CONTEXT MENU HANDLERS
  const handleOpenContextMenu = (e: React.MouseEvent, game: GameDto) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 240;
    const menuHeight = 220;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
    setContextMenu({ x, y, game });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

    // Inject custom CSS stylesheet from theme (style.css / custom_css)
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

  // LOAD GAMES & THEMES
  const loadGames = async () => {
    try {
      const loadedGames = await invokeTauri<GameDto[]>("get_games");
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
      const loadedCounts = await invokeTauri<LibraryCounts>("get_counts");
      if (loadedCounts) {
        setCounts(loadedCounts);
        // Show onboarding wizard on first launch when library is empty
        if (loadedCounts.total === 0 && shouldShowOnboarding()) {
          setShowOnboarding(true);
        }
      }
    } catch (err) {
      console.error("Failed to load games or counts", err);
    }
  };
  const refreshLibrary = loadGames;

  useEffect(() => {
    if (filteredGames.length > 0) {
      if (!selectedGame || !filteredGames.some((g) => g.id === selectedGame.id)) {
        setSelectedGame(filteredGames[0]);
      }
    }
  }, [filteredGames]);

  const loadThemes = async () => {
    const loadedThemes = await invokeTauri<ThemeConfig[]>("get_themes");
    if (loadedThemes && loadedThemes.length > 0) {
      setThemes(loadedThemes);
      const savedThemeId = localStorage.getItem("omnis_selected_theme_id");
      if (savedThemeId) {
        const found = loadedThemes.find((t) => t.id === savedThemeId);
        if (found) {
          setCurrentTheme(found);
          return;
        }
      }
      setCurrentTheme(loadedThemes[0]);
    }
  };

  const selectTheme = (theme: ThemeConfig) => {
    setCurrentTheme(theme);
    localStorage.setItem("omnis_selected_theme_id", theme.id);
    setStatusMessage(statusText("theme_activated", { name: theme.name }));
  };

  const handleSaveCustomTheme = async (fullTheme: ThemeConfig) => {
    await invokeTauri("save_custom_theme", { theme: fullTheme });
    await loadThemes();
    selectTheme(fullTheme);
    setStatusMessage(statusText("theme_saved", { name: fullTheme.name }));
  };

  // PLUGIN MANAGEMENT STATES
  const [showPluginModal, setShowPluginModal] = useState<boolean>(false);
  const [showBatchEnrichModal, setShowBatchEnrichModal] = useState<boolean>(false);
  const [isPlayniteImportOpen, setIsPlayniteImportOpen] = useState<boolean>(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [pipelineConfig, setPipelineConfig] = useState<MetadataPipelineConfig>({
    cover_source: "steamgriddb",
    background_source: "steamgriddb",
    score_source: "opencritic",
    details_source: "steam",
    preserve_existing_artwork: true,
  });
  const [editingSettings, setEditingSettings] = useState<Record<string, Record<string, any>>>({});
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<
    Record<string, { loading: boolean; success?: boolean; message?: string }>
  >({});
  const [isEnrichingSingle, setIsEnrichingSingle] = useState<boolean>(false);
  const [isPipelineEnriching, setIsPipelineEnriching] = useState<boolean>(false);
  const [pipelineProgress, setPipelineProgress] = useState<string | null>(null);
  const [isRefreshingPlugins, setIsRefreshingPlugins] = useState<boolean>(false);

  const loadProvidersAndConfig = async () => {
    const provs = await invokeTauri<ProviderInfo[]>("get_metadata_providers");
    if (provs) {
      setProviders(provs);
      const settingsMap: Record<string, Record<string, any>> = {};
      provs.forEach((p) => {
        settingsMap[p.id] = { ...(p.settings_values || {}) };
      });
      setEditingSettings(settingsMap);
    }
    const pipe = await invokeTauri<MetadataPipelineConfig>("get_metadata_pipeline_config");
    if (pipe) {
      setPipelineConfig(pipe);
    }
  };

  const handleSaveProviderSettings = async (providerId: string) => {
    const s = editingSettings[providerId] || {};
    await invokeTauri("save_provider_settings", { providerId, settings: s });
    setStatusMessage(statusText("provider_saved", { provider: providerId }));
    await loadProvidersAndConfig();
  };

  const handleToggleProvider = async (providerId: string, enabled: boolean) => {
    await invokeTauri("toggle_provider", { providerId, enabled });
    setStatusMessage(statusText(enabled ? "provider_enabled" : "provider_disabled", { provider: providerId }));
    await loadProvidersAndConfig();
  };

  const handleTestConnection = async (providerId: string) => {
    const s = editingSettings[providerId] || {};
    await invokeTauri("save_provider_settings", { providerId, settings: s });

    setTestStatus((prev) => ({ ...prev, [providerId]: { loading: true } }));
    try {
      const res = await invokeTauri<string>("test_provider_connection", { providerId });
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: { loading: false, success: true, message: res || "Connessione riuscita" },
      }));
    } catch (err: any) {
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: { loading: false, success: false, message: String(err) },
      }));
    }
    await loadProvidersAndConfig();
  };

  const handleRefreshPlugins = async () => {
    setIsRefreshingPlugins(true);
    setStatusMessage(statusText("plugins_scanning"));
    try {
      const updated = await invokeTauri<ProviderInfo[]>("refresh_metadata_providers");
      if (updated) {
        setProviders(updated);
        const settingsMap: Record<string, Record<string, any>> = {};
        updated.forEach((p) => {
          settingsMap[p.id] = { ...(p.settings_values || {}) };
        });
        setEditingSettings(settingsMap);
        setStatusMessage(statusText("plugins_scanned", { count: updated.length }));
      }
    } catch (err: any) {
      setStatusMessage(statusText("plugins_scan_error", { error: String(err) }));
    } finally {
      setIsRefreshingPlugins(false);
    }
  };

  const handleSavePipelineConfig = async () => {
    await invokeTauri("save_metadata_pipeline_config", { config: pipelineConfig });
    setStatusMessage(statusText("pipeline_saved"));
    await loadProvidersAndConfig();
  };

  const handleEnrichSingleGame = async (gameId: string) => {
    try {
      setIsEnrichingSingle(true);
      setStatusMessage(statusText("metadata_downloading_game"));
      const updated = await invokeTauri<GameDto>("enrich_single_game", { gameId });
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
  };

  const handleRefreshHltb = async (gameId: string) => {
    try {
      setIsEnrichingSingle(true);
      setStatusMessage(statusText("hltb_refreshing"));
      const updated = await invokeTauri<GameDto>("refresh_game_howlongtobeat", { gameId });
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
  };

  const handleUpdateCompletionStatus = async (game: GameDto, newStatus: string) => {
    try {
      const updated = await invokeTauri<GameDto>("update_game_completion_status", {
        gameId: game.id,
        status: newStatus,
      });
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
  };

  const handleRunMassivePipeline = async () => {
    try {
      setIsPipelineEnriching(true);
      setPipelineProgress(t("app_misc.pipeline_starting"));
      const count = await invokeTauri<number>("download_all_metadata");
      setPipelineProgress(`Completato! ${count || 0} titoli aggiornati.`);
      await refreshLibrary();
    } catch (err: any) {
      setPipelineProgress(`Errore durante il download: ${err}`);
    } finally {
      setIsPipelineEnriching(false);
    }
  };

  const handleCancelPipeline = async () => {
    try {
      setPipelineProgress(t("app_misc.pipeline_stopping"));
      await invokeTauri("cancel_metadata_download");
      setStatusMessage(statusText("download_cancel_requested"));
    } catch (err: any) {
      console.warn("Failed to cancel metadata download:", err);
    }
  };

  // TAURI STORE & GAME LIFECYCLE LISTENERS
  useEffect(() => {
    refreshLibrary();
    loadThemes();
    loadProvidersAndConfig();

    // Auto-scan on startup: silently sync library if user opted in and library is not empty
    if (shouldAutoScanOnStartup() && !shouldShowOnboarding()) {
      invokeTauri("sync_library")
        .then(() => refreshLibrary())
        .catch((err) => {
          console.warn("Auto-scan on startup failed:", err);
        });
    }

    // Check if a game is already running on mount
    (async () => {
      try {
        const running = await invokeTauri<ActiveGameSession | null>("get_running_game");
        if (running) {
          setIsGameRunning(true);
          setActiveGame(running);
          soundEffects.setMuted(true);
        }
      } catch (err) {
        console.warn("Failed checking running game on mount:", err);
      }
    })();

    let isMounted = true;
    let unlistenSync: (() => void) | null = null;
    let unlistenLib: (() => void) | null = null;
    let unlistenGameStarted: (() => void) | null = null;
    let unlistenGameStatus: (() => void) | null = null;
    let unlistenGameStopped: (() => void) | null = null;
    let unlistenMetaProgress: (() => void) | null = null;
    let unlistenTrayLaunch: (() => void) | null = null;
    let unlistenTraySettings: (() => void) | null = null;

    // Sync minimize to tray setting to backend
    const savedTray = localStorage.getItem("omnis_minimize_to_tray");
    const enabledTray = savedTray !== null ? JSON.parse(savedTray) : true;
    invokeTauri("set_minimize_to_tray", { enabled: enabledTray }).catch(console.warn);

    (async () => {
      try {
        if (!isMounted) return;

        const hSync = await listen<{
          store_id: string;
          current: number;
          total: number;
          status: string;
          message?: string;
        }>("store-sync-progress", (event) => {
          const p = event.payload;
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
        if (!isMounted) { hSync(); } else { unlistenSync = hSync; }

        const hLib = await listen("library-updated", () => {
          loadGames();
        });
        if (!isMounted) { hLib(); } else { unlistenLib = hLib; }

        const hStarted = await listen<{
          session_id: string;
          game_id: string;
          title: string;
          state?: string;
          started_at: string;
        }>("game-started", (event) => {
          setIsGameRunning(true);
          setActiveGame({
            session_id: event.payload.session_id,
            game_id: event.payload.game_id,
            title: event.payload.title,
            state: (event.payload.state as any) || "launching",
            started_at: event.payload.started_at,
            process_detected_at: null,
          });
          soundEffects.suspendAudio();
          setStatusMessage(statusText("game_launching", { title: event.payload.title }));
        });
        if (!isMounted) { hStarted(); } else { unlistenGameStarted = hStarted; }

        const hStatus = await listen<{
          session_id: string;
          game_id: string;
          state: string;
          pid?: number;
        }>("game-status-changed", (event) => {
          if (activeGameRef.current && activeGameRef.current.session_id === event.payload.session_id) {
            const newState = event.payload.state as any;
            setActiveGame((prev) => prev ? {
              ...prev,
              state: newState,
              pid: event.payload.pid ?? prev.pid,
              process_detected_at: newState === "running" ? (prev.process_detected_at || new Date().toISOString()) : prev.process_detected_at,
            } : null);
            if (newState === "running") {
              setStatusMessage(statusText("game_running_pid", { title: activeGameRef.current.title, pid: event.payload.pid ?? "?" }));
            }
          }
        });
        if (!isMounted) { hStatus(); } else { unlistenGameStatus = hStatus; }

        const hStopped = await listen<{
          session_id?: string;
          game_id: string;
          duration_seconds: number;
        }>("game-stopped", (event) => {
          // Ignore events from stale sessions (Requirement B3)
          if (
            event.payload.session_id &&
            activeGameRef.current &&
            activeGameRef.current.session_id !== event.payload.session_id
          ) {
            return;
          }

          setIsGameRunning(false);
          setActiveGame(null);
          soundEffects.resumeAudio();

          const stoppedGameId = event.payload.game_id;
          const durationSec = event.payload.duration_seconds;

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
          }, 6000);

          loadGames();
        });
        if (!isMounted) { hStopped(); } else { unlistenGameStopped = hStopped; }

        const hMetaProgress = await listen<{
          current: number;
          total: number;
          title: string;
        }>("metadata-progress", (event) => {
          const { current, total, title } = event.payload;
          setPipelineProgress(`Download dati (${current}/${total}): "${title}"...`);
          setStatusMessage(statusText("metadata_batch_progress", { current, total, title }));
        });
        if (!isMounted) { hMetaProgress(); } else { unlistenMetaProgress = hMetaProgress; }

        const hTrayLaunch = await listen<string>("tray-launch-game", (event) => {
          if (event.payload) {
            handleLaunch(event.payload);
          }
        });
        if (!isMounted) { hTrayLaunch(); } else { unlistenTrayLaunch = hTrayLaunch; }

        const hTraySettings = await listen("tray-open-settings", () => {
          handleOpenSettings("general");
        });
        if (!isMounted) { hTraySettings(); } else { unlistenTraySettings = hTraySettings; }
      } catch (e) {
        console.warn("Failed to register store sync listener in App:", e);
      }
    })();

    const handleFocus = () => {
      loadGames();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", handleFocus);
      if (unlistenSync) unlistenSync();
      if (unlistenLib) unlistenLib();
      if (unlistenGameStarted) unlistenGameStarted();
      if (unlistenGameStatus) unlistenGameStatus();
      if (unlistenGameStopped) unlistenGameStopped();
      if (unlistenMetaProgress) unlistenMetaProgress();
      if (unlistenTrayLaunch) unlistenTrayLaunch();
      if (unlistenTraySettings) unlistenTraySettings();
    };
  }, []);

  const handleStartDragging = async (e: React.MouseEvent) => {
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
    invokeTauri("window_start_dragging");
  };

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      setStatusMessage(statusText("library_scanning"));
      const count = await invokeTauri<number>("sync_library");
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
  };

  const handleDownloadAll = async () => {
    setIsDownloading(true);
    setStatusMessage(statusText("metadata_downloading"));
    try {
      await invokeTauri("download_all_metadata");
      await refreshLibrary();
      setStatusMessage(statusText("metadata_updated"));
    } catch (err: any) {
      console.warn("Download metadata error:", err);
      setStatusMessage(statusText("metadata_error", { error: String(err) }));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleLaunch = async (gameId: string) => {
    soundEffects.playLaunch();
    const g = games.find((x) => x.id === gameId);
    if (g && !g.is_installed) {
      setStatusMessage(statusText("install_opening", { title: g.title, store: g.library.toUpperCase() }));
    } else {
      setStatusMessage(statusText("game_starting"));
    }
    try {
      await invokeTauri("launch_game", { gameId });
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
  };

  const handleKillRunningGame = () => {
    setShowKillConfirmModal(true);
  };

  const confirmKillRunningGame = async () => {
    setShowKillConfirmModal(false);
    try {
      setStatusMessage(statusText("game_stopping"));
      const killed = await invokeTauri<boolean>("kill_running_game");
      if (killed) {
        soundEffects.playSelect();
        setStatusMessage(statusText("game_stopped"));
      } else {
        setStatusMessage(statusText("no_game_running"));
      }
    } catch (err: any) {
      setStatusMessage(statusText("stop_error", { error: String(err) }));
    }
  };

  const handleOpenFolder = (folderType: string) => {
    invokeTauri("open_folder", { folderType });
  };

  // GAME MANAGEMENT
  const [gameToUninstall, setGameToUninstall] = useState<GameDto | null>(null);
  const [showUninstallModal, setShowUninstallModal] = useState<boolean>(false);

  const handleOpenInstallDir = async (gameId: string) => {
    try {
      await invokeTauri("open_game_install_dir", { gameId });
      setStatusMessage(statusText("folder_opening"));
    } catch (err: any) {
      setStatusMessage(statusText("folder_error", { error: String(err?.message || err) }));
    }
  };

  const handleCreateShortcut = async (gameId: string) => {
    try {
      const path = await invokeTauri<string>("create_desktop_shortcut", { gameId });
      setStatusMessage(statusText("shortcut_created", { path: String(path) }));
    } catch (err: any) {
      setStatusMessage(statusText("shortcut_error", { error: String(err?.message || err) }));
    }
  };

  const handleVerifyFiles = async (gameId: string) => {
    try {
      await invokeTauri("verify_game_files", { gameId });
      setStatusMessage(statusText("verify_started"));
    } catch (err: any) {
      setStatusMessage(statusText("verify_error", { error: String(err?.message || err) }));
    }
  };

  const handleOpenUninstallModal = (game: GameDto) => {
    setGameToUninstall(game);
    setShowUninstallModal(true);
  };

  const handleConfirmUninstall = async (gameId: string) => {
    try {
      await invokeTauri("uninstall_game", { gameId });
      setStatusMessage(statusText("uninstall_started"));
      await refreshLibrary();
    } catch (err: any) {
      setStatusMessage(statusText("uninstall_error", { error: String(err?.message || err) }));
    }
  };

  const handleRemoveFromLibrary = async (gameId: string) => {
    const g = games.find((x) => x.id === gameId);
    const title = g?.title || t("app_misc.this_game");
    if (!window.confirm(t("app_misc.confirm_remove", { title }))) {
      return;
    }
    try {
      await invokeTauri("remove_game_from_library", { gameId });
      setStatusMessage(statusText("game_removed", { title }));
      await refreshLibrary();
      if (selectedGame?.id === gameId) {
        setSelectedGame(null);
      }
    } catch (err: any) {
      setStatusMessage(statusText("remove_error", { error: String(err?.message || err) }));
    }
  };

  return (
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
      {/* ONBOARDING WIZARD – rendered outside the main layout to cover everything */}
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
          setActiveFilter={setActiveFilter}
          cycleFilter={cycleFilter}
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
          elapsedSeconds={elapsedSeconds}
          formatDuration={formatDuration}
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
            elapsedSeconds={elapsedSeconds}
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
              {/* Cinema Lounge Dynamic Video Trailer Backdrop in Desktop Views */}
              {currentTheme.enable_video_backdrop && viewMode !== "details" && (
                <VideoBackdrop
                  game={selectedGame}
                  theme={currentTheme}
                  blurLevel="ambient"
                  className="opacity-40"
                  isPaused={isGameRunning}
                />
              )}
              {/* CONTEXTUAL TOOLBAR (GROUPBY, ZOOM SLIDER, COUNTER) */}
              {viewMode !== "stats" && (
                <div
                  className="h-11 min-h-[44px] px-6 border-b flex items-center justify-between select-none shrink-0 relative z-30"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                }}
              >
                {/* Left: Filter & Sort Popover and Active Filter Chips */}
                <div className="flex-1 min-w-0 flex items-center gap-2.5 mr-4">
                  {/* Filter & Sort Popover (Epic Games style) */}
                  <div className="relative shrink-0" ref={filterMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowFilterMenu((v) => !v)}
                      className={`h-7 px-2.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                        totalActiveFilters > 0
                          ? "bg-sky-600/30 border-sky-500 text-sky-200"
                          : "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border-white/[0.08]"
                      }`}
                      title={t("filter_modal.title") || "Filtra e ordina"}
                    >
                      <Filter className="w-3.5 h-3.5 text-sky-400" />
                      <span>{t("filter_modal.title") || "Filtra e ordina"}</span>
                      {totalActiveFilters > 0 && (
                        <span className="w-4 h-4 rounded-full bg-sky-500 text-slate-950 text-[10px] font-black flex items-center justify-center">
                          {totalActiveFilters}
                        </span>
                      )}
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>

                    <FilterAndSortPopover
                      isOpen={showFilterMenu}
                      onClose={() => setShowFilterMenu(false)}
                      sortMode={sortMode}
                      onSortChange={setSortMode}
                      selectedFlags={selectedFlags}
                      onToggleFlag={toggleFlag}
                      selectedStatuses={selectedStatuses}
                      onToggleStatus={toggleStatus}
                      selectedStores={selectedStores}
                      onToggleStore={toggleStore}
                      selectedGenres={selectedGenres}
                      onToggleGenre={toggleGenre}
                      selectedFeatures={selectedFeatures}
                      onToggleFeature={toggleFeature}
                      onClearAll={clearAllFilters}
                      totalActiveFilters={totalActiveFilters}
                      filterCounts={filterCounts}
                      availableGenres={availableGenres}
                      availableFeatures={availableFeatures}
                    />
                  </div>

                  {/* Active filter chips (horizontally scrollable, cannot push or collide with counter/controls) */}
                  {activeChips.length > 0 && (
                    <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                      {activeChips.map((chip) => (
                        <div
                          key={chip.id}
                          className="h-7 px-2.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-medium flex items-center gap-1.5 shrink-0 animate-in fade-in zoom-in-95 duration-100"
                        >
                          <span className="max-w-[140px] truncate">{chip.label}</span>
                          <button
                            type="button"
                            onClick={() => removeFilterChip(chip.id)}
                            className="hover:text-white transition-colors p-0.5 rounded cursor-pointer"
                            title={t("filter_chips.remove", { label: chip.label })}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}

                      {totalActiveFilters > 1 && (
                        <button
                          type="button"
                          onClick={clearAllFilters}
                          className="text-[11px] font-semibold text-rose-300 hover:text-rose-200 underline transition-colors cursor-pointer shrink-0 ml-1 whitespace-nowrap"
                          title={t("app_misc.clear_filters")}
                        >
                          {t("app_misc.clear_all")}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: Counter, GroupBy & Zoom Controls */}
                <div className="flex items-center gap-3.5 shrink-0">
                  {/* Game Counter ("la somma") - strictly pinned on right side so it never collides */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium shrink-0">
                    {totalActiveFilters > 0 || searchQuery.trim().length > 0 ? (
                      <>
                        <span className="font-semibold text-sky-400">{filteredGames.length}</span>
                        <span className="text-slate-500 font-normal">/ {games.length} {t("sidebar.all_games")?.toLowerCase() || "giochi"}</span>
                      </>
                    ) : (
                      <span>
                        {t(filteredGames.length === 1 ? "app_status.games_count_one" : "app_status.games_count_other", { count: filteredGames.length })}
                      </span>
                    )}
                  </div>

                  <div className="h-4 w-[1px] bg-white/[0.08] shrink-0" />

                  {/* Group By Popover (matching FilterAndSortPopover design) */}
                  <div className="relative shrink-0" ref={groupByMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowGroupByMenu((v) => !v)}
                      className={`h-7 px-2.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                        groupBy !== "none"
                          ? "bg-sky-600/30 border-sky-500 text-sky-200"
                          : "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border-white/[0.08]"
                      }`}
                      title={t("groups.group_by") || "Raggruppa per"}
                    >
                      <Layers className="w-3.5 h-3.5 text-sky-400" />
                      <span>
                        {t("views.group_by")}:{" "}
                        <strong className={groupBy !== "none" ? "text-white font-bold" : "text-slate-400 font-medium"}>
                          {currentGroupLabel}
                        </strong>
                      </span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>

                    <GroupByPopover
                      isOpen={showGroupByMenu}
                      onClose={() => setShowGroupByMenu(false)}
                      groupBy={groupBy}
                      onSelectGroup={(mode) => setGroupBy(mode)}
                    />
                  </div>

                  {/* Zoom Slider for Grid View */}
                  {viewMode === "grid" && (
                    <div className="flex items-center gap-2 pl-2 border-l border-white/[0.08]">
                      <button
                        onClick={() => setGridCardWidth((w) => Math.max(140, w - 20))}
                        className="p-1 hover:text-white transition-colors"
                        style={{ color: "var(--text-muted)" }}
                        title={t("tooltips.poster_smaller")}
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="range"
                        min="140"
                        max="320"
                        step="10"
                        value={gridCardWidth}
                        onChange={(e) => setGridCardWidth(Number(e.target.value))}
                        className="w-24 h-1.5 rounded-lg cursor-pointer accent-indigo-500"
                        style={{ backgroundColor: "var(--bg-card)" }}
                        title={t("tooltips.poster_width", { width: gridCardWidth })}
                      />
                      <button
                        onClick={() => setGridCardWidth((w) => Math.min(320, w + 20))}
                        className="p-1 hover:text-white transition-colors"
                        style={{ color: "var(--text-muted)" }}
                        title={t("tooltips.poster_larger")}
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className="text-[10px] font-mono w-10 text-right"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {gridCardWidth}px
                      </span>
                    </div>
                  )}
                </div>
              </div>
              )}

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
                  elapsedSeconds={elapsedSeconds}
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
                    elapsedSeconds={elapsedSeconds}
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

              {/* VIEW 3: HIGH-PERFORMANCE SPREADSHEET LIST VIEW */}
              {viewMode === "list" && (
                filteredGames.length === 0 ? (
                  <EmptyGamesView
                    onClearFilters={clearAllFilters}
                    hasActiveFilters={totalActiveFilters > 0 || searchQuery.trim() !== ""}
                  />
                ) : (
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {groupBy === "none" ? (
                      <ListViewTable
                      games={filteredGames}
                      selectedGameId={selectedGame?.id || null}
                      onSelectGame={setSelectedGame}
                      onOpenDetails={(game) => {
                        setSelectedGame(game);
                        setViewMode("details");
                      }}
                      onLaunchGame={handleLaunch}
                      onEditGame={(game) => {
                        setGameToEdit(game);
                        setShowEditorModal(true);
                      }}
                      onContextMenu={(e, g) => handleOpenContextMenu(e, g as unknown as GameDto)}
                    />
                  ) : (
                    Object.entries(groupedGames).map(([groupName, groupGames]) => {
                      const isCollapsed = !!collapsedGroups[groupName];

                      return (
                        <div key={groupName} className="space-y-3">
                          <button
                            onClick={() => toggleGroup(groupName)}
                            className="w-full flex items-center justify-between py-2 px-3.5 rounded-xl border transition-all text-left group"
                            style={{
                              backgroundColor: "var(--bg-card)",
                              borderColor: "var(--border-color)",
                            }}
                          >
                            <div className="flex items-center gap-2.5">
                              {isCollapsed ? (
                                <ChevronRight className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                              )}
                              <span className="text-xs font-black uppercase tracking-wider text-white">
                                {groupName}
                              </span>
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold"
                                style={{
                                  backgroundColor: "var(--accent-glow)",
                                  color: "var(--accent-primary)",
                                }}
                              >
                                {groupGames.length}
                              </span>
                            </div>
                            <span
                              className="text-[10px] font-medium"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {isCollapsed ? t("views.expand") : t("views.collapse")}
                            </span>
                          </button>
                          {!isCollapsed && (
                            <ListViewTable
                              games={groupGames}
                              selectedGameId={selectedGame?.id || null}
                              onSelectGame={setSelectedGame}
                              onOpenDetails={(game) => {
                                setSelectedGame(game);
                                setViewMode("details");
                              }}
                              onLaunchGame={handleLaunch}
                              onEditGame={(game) => {
                                setGameToEdit(game);
                                setShowEditorModal(true);
                              }}
                              onContextMenu={(e, g) =>
                                handleOpenContextMenu(e, g as unknown as GameDto)
                              }
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )
            )}

            {/* VIEW 4: STATISTICS & ANALYTICS DASHBOARD VIEW */}
            {viewMode === "stats" && (
              <StatisticsDashboardView />
            )}
            </main>
          </div>

          {/* FOOTER STATUS BAR */}
          <footer
            className="h-7 min-h-[28px] max-h-[28px] border-t px-4 flex items-center justify-between text-[11px] font-medium select-none z-10 transition-colors duration-300"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
              color: "var(--text-muted)",
            }}
          >
            <div className="flex items-center gap-3 truncate">
              {gamepadConnected && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      activeGame
                        ? "bg-emerald-400 animate-pulse shadow-emerald-400/50 shadow-sm"
                        : "bg-emerald-400 shadow-sm"
                    }`}
                  />
                  <span className="font-bold text-white">
                    {gamepadName || t("console_ui.controller_connected")}
                  </span>
                </div>
              )}

              {activeGame ? (
                <div className="flex items-center gap-2 truncate">
                  <span className="text-emerald-300 font-bold flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <span className="truncate">
                      🎮 {t("app_misc.now_playing")} <strong className="text-white">{activeGame.title}</strong> ({formatDuration(elapsedSeconds)})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleKillRunningGame}
                    className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 hover:bg-rose-500 text-white transition-colors shrink-0 shadow-sm cursor-pointer"
                    title={t("app_misc.kill_title")}
                  >
                    {t("app_misc.kill_short")}
                  </button>
                </div>
              ) : isSyncing ? (
                <div className="flex items-center gap-2 truncate">
                  <span className="text-sky-300 font-bold flex items-center gap-1.5 truncate">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
                    <span className="truncate">{statusMessage || t("store_accounts.syncing")}</span>
                  </span>
                </div>
              ) : (
                <span className="truncate">{statusMessage || t("app_status.ready")}</span>
              )}
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <span>{t("app_misc.fullscreen_hint")}</span>
              <span>
                {t("app_misc.active_theme")} <strong className="text-white">{currentTheme.name}</strong>
              </span>
            </div>
          </footer>
        </div>
      )}

      {/* THEME MANAGER MODAL */}
      <ThemeModal
        isOpen={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        themes={themes}
        currentTheme={currentTheme}
        onSelectTheme={selectTheme}
        onSaveCustomTheme={handleSaveCustomTheme}
        onOpenThemesFolder={() => handleOpenFolder("themes")}
      />

      {/* METADATA PLUGIN & PIPELINE MODAL */}
      <PluginManagerModal
        isOpen={showPluginModal}
        onClose={() => setShowPluginModal(false)}
        providers={providers}
        pipelineConfig={pipelineConfig}
        setPipelineConfig={setPipelineConfig}
        editingSettings={editingSettings}
        setEditingSettings={setEditingSettings}
        showApiKey={showApiKey}
        setShowApiKey={setShowApiKey}
        testStatus={testStatus}
        isRefreshingPlugins={isRefreshingPlugins}
        handleRefreshPlugins={handleRefreshPlugins}
        handleOpenFolder={handleOpenFolder}
        handleToggleProvider={handleToggleProvider}
        handleTestConnection={handleTestConnection}
        handleSaveProviderSettings={handleSaveProviderSettings}
        handleSavePipelineConfig={handleSavePipelineConfig}
        gamesCount={games.length}
        gamesWithCoverCount={games.filter((g) => g.cover_image).length}
        gamesWithScoreCount={games.filter((g) => g.critic_score).length}
        pipelineProgress={pipelineProgress}
        isPipelineEnriching={isPipelineEnriching}
        handleRunMassivePipeline={handleRunMassivePipeline}
        handleCancelPipeline={handleCancelPipeline}
        onPluginInstalled={() => loadProvidersAndConfig()}
      />

      {/* GLOBAL RIGHT-CLICK CONTEXT MENU */}
      <GlobalContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onLaunch={handleLaunch}
        onEdit={(game) => {
          setGameToEdit(game);
          setShowEditorModal(true);
        }}
        onResolve={(game) => {
          setGameToResolve(game);
          setShowResolutionModal(true);
        }}
        onShowDetails={(game) => {
          setSelectedGame(game);
          setViewMode("details");
        }}
        onUpdateCompletionStatus={handleUpdateCompletionStatus}
        onOpenFolder={(game) => handleOpenInstallDir(game.id)}
        onCreateShortcut={(game) => handleCreateShortcut(game.id)}
        onVerifyFiles={(game) => handleVerifyFiles(game.id)}
        onUninstall={handleOpenUninstallModal}
        onRemoveFromLibrary={(game) => handleRemoveFromLibrary(game.id)}
      />

      {/* METADATA EDITOR MODAL */}
      {(gameToEdit || selectedGame) && (
        <GameEditorModal
          isOpen={showEditorModal}
          onClose={() => {
            setShowEditorModal(false);
            setGameToEdit(null);
          }}
          game={gameToEdit || selectedGame!}
          onSave={(updated) => {
            const normalized = normalizeGame(updated);
            setSelectedGame((prev) => (prev && prev.id === normalized.id ? { ...prev, ...normalized } : prev));
            setGames((prev) => prev.map((g) => (g.id === normalized.id ? { ...g, ...normalized } : g)));
            refreshLibrary();
            setStatusMessage(statusText("edits_saved", { title: normalized.title }));
          }}
        />
      )}

      {/* METADATA RESOLUTION MODAL */}
      {(gameToResolve || selectedGame) && (
        <MetadataResolutionModal
          isOpen={showResolutionModal}
          onClose={() => {
            setShowResolutionModal(false);
            setGameToResolve(null);
          }}
          game={gameToResolve || selectedGame!}
          onApply={(updated) => {
            const normalized = normalizeGame(updated);
            setSelectedGame((prev) => (prev && prev.id === normalized.id ? { ...prev, ...normalized } : prev));
            setGames((prev) => prev.map((g) => (g.id === normalized.id ? { ...g, ...normalized } : g)));
            refreshLibrary();
            setStatusMessage(statusText("metadata_resolved", { title: normalized.title }));
          }}
        />
      )}

      {/* BATCH ENRICH MODAL */}
      {showBatchEnrichModal && (
        <BatchEnrichModal
          isOpen={showBatchEnrichModal}
          onClose={() => setShowBatchEnrichModal(false)}
          allGames={games}
          filteredGames={filteredGames}
          onComplete={async () => {
            await refreshLibrary();
            setStatusMessage(statusText("batch_done"));
          }}
        />
      )}

      {/* FULLSCREEN VIRTUAL KEYBOARD */}
      <VirtualKeyboard
        isOpen={showVirtualKeyboard}
        value={searchQuery}
        onChange={(val) => {
          setSearchQuery(val);
          setFocusedIndex(0);
        }}
        onSubmit={() => {
          setShowVirtualKeyboard(false);
        }}
        onClose={() => {
          setShowVirtualKeyboard(false);
        }}
        placeholder={t("console_ui.search_library")}
        resultCount={fullscreenGames.length}
      />

      {/* CUSTOM GAME IMPORT MODAL */}
      <CustomGameModal
        isOpen={showAddCustomModal}
        onClose={() => setShowAddCustomModal(false)}
        onSuccess={(title) => {
          refreshLibrary();
          setShowAddCustomModal(false);
          setStatusMessage(statusText("custom_game_added", { title }));
        }}
      />

      {/* UNINSTALL CONFIRMATION MODAL */}
      <UninstallModal
        isOpen={showUninstallModal}
        game={gameToUninstall}
        onClose={() => {
          setShowUninstallModal(false);
          setGameToUninstall(null);
        }}
        onConfirmUninstall={handleConfirmUninstall}
      />

      {/* SETTINGS & OPTIONS MODAL */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenThemes={() => setShowThemeModal(true)}
        currentThemeName={currentTheme.name}
        initialTab={settingsInitialTab}
        onSyncComplete={refreshLibrary}
        onOpenPlayniteImport={() => setIsPlayniteImportOpen(true)}
      />

      {/* PLAYNITE BACKUP IMPORT MODAL */}
      <PlayniteImportModal
        isOpen={isPlayniteImportOpen}
        onClose={() => setIsPlayniteImportOpen(false)}
        onSuccess={() => {
          refreshLibrary();
        }}
      />

      {/* KILL RUNNING GAME CONFIRMATION MODAL */}
      {showKillConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-rose-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl shadow-rose-950/40 text-left">
            <div className="flex items-center gap-3 text-rose-400 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">{t("app_misc.kill_dialog_title")}</h3>
                <p className="text-xs text-rose-300">{t("app_misc.kill_dialog_subtitle")}</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-6">
              {t("app_misc.kill_question", { title: activeGame?.title || t("app_misc.active_game") })}
              <br /><br />
              <span className="text-xs text-slate-400">
                {t("app_misc.kill_desc")}
              </span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={confirmKillRunningGame}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-white" />
                {t("app_misc.kill_confirm")}
              </button>
              <button
                onClick={() => setShowKillConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLOUD STORE SYNC TOAST / FLOATING NOTIFICATION */}
      {syncBanner && (
        <div
          className="fixed top-14 right-6 z-50 flex items-center gap-3.5 p-3.5 rounded-2xl text-white shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-4 duration-300 max-w-md border"
          style={{
            backgroundColor:
              syncBanner.status === "error"
                ? "rgba(225, 29, 72, 0.95)"
                : syncBanner.status === "completed"
                ? "rgba(16, 185, 129, 0.95)"
                : "rgba(15, 23, 42, 0.92)",
            borderColor:
              syncBanner.status === "error"
                ? "rgba(255, 150, 150, 0.4)"
                : syncBanner.status === "completed"
                ? "rgba(52, 211, 153, 0.5)"
                : "rgba(99, 102, 241, 0.4)",
            boxShadow:
              syncBanner.status === "completed"
                ? "0 10px 30px -5px rgba(16, 185, 129, 0.4)"
                : "0 10px 30px -5px rgba(0, 0, 0, 0.6)",
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor:
                syncBanner.status === "error"
                  ? "rgba(255, 255, 255, 0.2)"
                  : syncBanner.status === "completed"
                  ? "rgba(255, 255, 255, 0.2)"
                  : "rgba(99, 102, 241, 0.2)",
              borderColor: "rgba(255, 255, 255, 0.25)",
            }}
          >
            {syncBanner.status === "syncing" ? (
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
            ) : syncBanner.status === "completed" ? (
              <CheckCircle2 className="w-5 h-5 text-white" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                {syncBanner.storeName}
              </span>
              {syncBanner.status === "syncing" && syncBanner.total > 0 && (
                <span className="text-[10px] font-mono opacity-80">
                  {syncBanner.current}/{syncBanner.total}
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-white truncate mt-0.5">
              {syncBanner.message}
            </p>
          </div>
          <button
            onClick={() => {
              if (syncBannerTimeoutRef.current) clearTimeout(syncBannerTimeoutRef.current);
              setSyncBanner(null);
              setIsSyncing(false);
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title={t("app_misc.close_notification")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* DESKTOP SESSION END TOAST */}
      {!isFullscreen && sessionToast && (
        <div className="fixed bottom-10 right-6 z-50 flex items-center gap-3.5 p-4 rounded-2xl bg-slate-900/95 border border-emerald-500/50 text-white shadow-2xl shadow-emerald-950/50 backdrop-blur-xl animate-in slide-in-from-bottom-5 duration-300 max-w-md">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <Gamepad2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
              {t("app_misc.session_ended")}
            </span>
            <h4 className="text-xs font-bold text-white truncate">{sessionToast.title}</h4>
            <p className="text-[11px] text-slate-300 font-medium">
              {t("app_misc.played_time", { minutes: Math.max(1, Math.round(sessionToast.durationSeconds / 60)), duration: formatDuration(sessionToast.durationSeconds) })}
            </p>
          </div>
          <button
            onClick={() => setSessionToast(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title={t("app_misc.close_notification")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* UPDATE NOTIFICATION TOAST */}
      {updater.status === "available" && (
        <div
          onClick={() => handleOpenSettings("general")}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 p-4 rounded-2xl bg-slate-900/95 border border-sky-500/50 text-white shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 cursor-pointer hover:border-sky-400 transition-all"
        >
          <Sparkles className="w-5 h-5 text-sky-400 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-white">
              {t("general_settings.updater_available")} {updater.availableVersion ? `(v${updater.availableVersion})` : ""}
            </h4>
            <p className="text-[11px] text-slate-400">{t("topbar.options")}</p>
          </div>
        </div>
      )}
    </div>
    </ControllerTypeContext.Provider>
    </InputPromptContext.Provider>
    </UpdaterContext.Provider>
  );
}
