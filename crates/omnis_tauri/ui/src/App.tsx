import React, { useState, useEffect, useRef } from "react";
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
import { useGamepadNavigation } from "./hooks/useGamepadNavigation";
import { useAppUpdater, UpdaterContext } from "./hooks/useAppUpdater";
import FullscreenView from "./components/views/FullscreenView";
import DetailsSplitView from "./components/views/DetailsSplitView";
import GridView from "./components/views/GridView";
import TopBar from "./components/navigation/TopBar";
import VideoBackdrop from "./components/common/VideoBackdrop";
import Sidebar from "./components/navigation/Sidebar";
import ThemeModal from "./components/modals/ThemeModal";
import PluginManagerModal from "./components/modals/PluginManagerModal";
import CustomGameModal from "./components/modals/CustomGameModal";
import BatchEnrichModal from "./components/modals/BatchEnrichModal";
import { UninstallModal } from "./components/modals/UninstallModal";
import GlobalContextMenu from "./components/GlobalContextMenu";

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

export { SteamIcon, EpicIcon, GogIcon, XboxIcon, StoreIcon, StoreBadge };
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
  const [uiZoom, setUiZoom] = useState<number>(1.0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("Pronto (Motore Tauri 2.0 / Fullscreen)");
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
  const [soundEnabled, setSoundEnabled] = useState<boolean>(soundEffects.enabled);

  // DETECT --fullscreen / --bigpicture CLI ARGUMENTS FROM TAURI
  useEffect(() => {
    const checkFullscreenLaunch = async () => {
      try {
        const isFsCli = await invokeTauri<boolean>("is_fullscreen_launch");
        if (isFsCli) {
          setIsFullscreen(true);
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
    activeChips,
    totalActiveFilters,
    toggleStore,
    toggleStatus,
    toggleFlag,
    toggleGenre,
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
    gamepadConnected,
    gamepadName,
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
    filteredGames,
    selectedGame,
    showVirtualKeyboard,
    setShowVirtualKeyboard,
    setShowThemeModal,
    handleLaunch: (id) => handleLaunch(id),
    cycleFilter,
    carouselRef,
    isSuspended: isGameRunning,
  });

  const focusedGame = filteredGames.length > 0
    ? (filteredGames[focusedIndex] || filteredGames[0] || null)
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
    if (currentTheme.font_family) {
      root.style.fontFamily = currentTheme.font_family;
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
      }
    } catch (err) {
      console.error("Failed to load games or counts", err);
    }
  };
  const refreshLibrary = loadGames;

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
    setStatusMessage(`Tema '${theme.name}' attivato!`);
  };

  const handleSaveCustomTheme = async (fullTheme: ThemeConfig) => {
    await invokeTauri("save_custom_theme", { theme: fullTheme });
    await loadThemes();
    selectTheme(fullTheme);
    setStatusMessage(`Nuovo tema '${fullTheme.name}' salvato e applicato!`);
  };

  // PLUGIN MANAGEMENT STATES
  const [showPluginModal, setShowPluginModal] = useState<boolean>(false);
  const [showBatchEnrichModal, setShowBatchEnrichModal] = useState<boolean>(false);
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
    setStatusMessage(`Impostazioni per '${providerId}' salvate!`);
    await loadProvidersAndConfig();
  };

  const handleToggleProvider = async (providerId: string, enabled: boolean) => {
    await invokeTauri("toggle_provider", { providerId, enabled });
    setStatusMessage(`Provider '${providerId}' ${enabled ? "abilitato" : "disabilitato"}.`);
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
    setStatusMessage("Scansione cartella plugin su disco in corso...");
    try {
      const updated = await invokeTauri<ProviderInfo[]>("refresh_metadata_providers");
      if (updated) {
        setProviders(updated);
        const settingsMap: Record<string, Record<string, any>> = {};
        updated.forEach((p) => {
          settingsMap[p.id] = { ...(p.settings_values || {}) };
        });
        setEditingSettings(settingsMap);
        setStatusMessage(`Scansione completata: ${updated.length} plugin caricati con successo!`);
      }
    } catch (err: any) {
      setStatusMessage(`Errore scansione plugin: ${err}`);
    } finally {
      setIsRefreshingPlugins(false);
    }
  };

  const handleSavePipelineConfig = async () => {
    await invokeTauri("save_metadata_pipeline_config", { config: pipelineConfig });
    setStatusMessage("Priorità della pipeline salvate con successo!");
    await loadProvidersAndConfig();
  };

  const handleEnrichSingleGame = async (gameId: string) => {
    try {
      setIsEnrichingSingle(true);
      setStatusMessage("Scaricamento dati e copertine HD in corso...");
      const updated = await invokeTauri<GameDto>("enrich_single_game", { gameId });
      if (updated) {
        const normalized = normalizeGame(updated);
        setSelectedGame(normalized);
        setGames((prev) => prev.map((g) => (g.id === normalized.id ? normalized : g)));
        setStatusMessage(`Dati e copertine per '${normalized.title}' aggiornati con successo!`);
      }
    } catch (err: any) {
      setStatusMessage(`Errore scaricamento dati: ${err}`);
    } finally {
      setIsEnrichingSingle(false);
    }
  };

  const handleRefreshHltb = async (gameId: string) => {
    try {
      setIsEnrichingSingle(true);
      setStatusMessage("Aggiornamento dati HowLongToBeat dalla fonte...");
      const updated = await invokeTauri<GameDto>("refresh_game_howlongtobeat", { gameId });
      if (updated) {
        const normalized = normalizeGame(updated);
        setSelectedGame(normalized);
        setGames((prev) => prev.map((g) => (g.id === normalized.id ? normalized : g)));
        setStatusMessage(`Dati HowLongToBeat per '${normalized.title}' aggiornati dalla fonte!`);
      }
    } catch (err: any) {
      console.warn("Direct HLTB refresh error, falling back to full enrichment:", err);
      await handleEnrichSingleGame(gameId);
    } finally {
      setIsEnrichingSingle(false);
    }
  };

  const handleRunMassivePipeline = async () => {
    try {
      setIsPipelineEnriching(true);
      setPipelineProgress("Avvio download dati e copertine per tutta la libreria...");
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
      setPipelineProgress("Interruzione del download dati in corso...");
      await invokeTauri("cancel_metadata_download");
      setStatusMessage("Richiesta di interruzione download inviata.");
    } catch (err: any) {
      console.warn("Failed to cancel metadata download:", err);
    }
  };

  // TAURI STORE & GAME LIFECYCLE LISTENERS
  useEffect(() => {
    refreshLibrary();
    loadThemes();
    loadProvidersAndConfig();

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
              message: p.message || `Sincronizzazione in corso per ${storeName}...`,
              current: p.current,
              total: p.total,
              status: "syncing",
            });
            setStatusMessage(
              p.message || `Sincronizzazione in corso per ${storeName}... (${p.current}/${p.total})`
            );
          } else if (p.status === "completed") {
            setIsSyncing(false);
            setSyncBanner({
              storeId: p.store_id,
              storeName,
              message: p.message || `Sincronizzazione completata per ${storeName}: ${p.total} giochi!`,
              current: p.current,
              total: p.total,
              status: "completed",
            });
            setStatusMessage(
              p.message || `Sincronizzazione completata per ${storeName}: ${p.total} giochi!`
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
              message: p.message || `Errore sincronizzazione per ${storeName}`,
              current: 0,
              total: 0,
              status: "error",
            });
            setStatusMessage(p.message || `Errore sincronizzazione per ${storeName}`);
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
          setStatusMessage(`Avvio di '${event.payload.title}' in corso...`);
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
              setStatusMessage(`Gioco '${activeGameRef.current.title}' in esecuzione (PID: ${event.payload.pid})`);
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

          setStatusMessage(`Sessione terminata: ${stoppedTitle} (+${mins} minuti)`);

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
          setStatusMessage(`Scaricamento dati e copertine (${current}/${total}): ${title}`);
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
      setStatusMessage("Scansione e sincronizzazione librerie in corso (Steam, Epic, Store collegati)...");
      const count = await invokeTauri<number>("sync_library");
      await refreshLibrary();
      setStatusMessage(
        count !== null && count !== undefined
          ? `Scansione completata! ${count} giochi nel catalogo.`
          : "Scansione libreria completata con successo!"
      );
    } catch (err: any) {
      console.warn("Sync error:", err);
      setStatusMessage(`Errore durante la scansione: ${err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDownloadAll = async () => {
    setIsDownloading(true);
    setStatusMessage("Download metadati e locandine HD in corso da Steam Store...");
    try {
      await invokeTauri("download_all_metadata");
      await refreshLibrary();
      setStatusMessage("Metadati e locandine aggiornati!");
    } catch (err: any) {
      console.warn("Download metadata error:", err);
      setStatusMessage(`Errore durante il download dei metadati: ${err}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleLaunch = async (gameId: string) => {
    soundEffects.playLaunch();
    const g = games.find((x) => x.id === gameId);
    if (g && !g.is_installed) {
      setStatusMessage(`Apertura installazione per "${g.title}" nel client ${g.library.toUpperCase()}...`);
    } else {
      setStatusMessage("Avvio del gioco in corso...");
    }
    try {
      await invokeTauri("launch_game", { gameId });
      if (g && !g.is_installed) {
        setStatusMessage(`Procedura di installazione avviata nel client nativo!`);
      } else {
        setStatusMessage("Gioco in esecuzione (Tracking kernel zero-CPU)");
      }
    } catch (err: any) {
      console.error("Launch game error:", err);
      const errMsg = typeof err === "string" ? err : err?.message || "Errore durante l'avvio del gioco";
      setStatusMessage(`Errore avvio: ${errMsg}`);
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
      setStatusMessage("Terminazione graduale del processo di gioco in corso (WM_CLOSE)...");
      const killed = await invokeTauri<boolean>("kill_running_game");
      if (killed) {
        soundEffects.playSelect();
        setStatusMessage("Processo di gioco terminato con successo.");
      } else {
        setStatusMessage("Nessun processo di gioco attivo da terminare.");
      }
    } catch (err: any) {
      setStatusMessage(`Errore durante la terminazione: ${err}`);
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
      setStatusMessage("Apertura cartella di installazione in corso...");
    } catch (err: any) {
      setStatusMessage(`Errore apertura cartella: ${err?.message || err}`);
    }
  };

  const handleCreateShortcut = async (gameId: string) => {
    try {
      const path = await invokeTauri<string>("create_desktop_shortcut", { gameId });
      setStatusMessage(`Collegamento desktop creato: ${path}`);
    } catch (err: any) {
      setStatusMessage(`Errore creazione collegamento: ${err?.message || err}`);
    }
  };

  const handleVerifyFiles = async (gameId: string) => {
    try {
      await invokeTauri("verify_game_files", { gameId });
      setStatusMessage("Avvio verifica integrità file nel client nativo...");
    } catch (err: any) {
      setStatusMessage(`Errore verifica file: ${err?.message || err}`);
    }
  };

  const handleOpenUninstallModal = (game: GameDto) => {
    setGameToUninstall(game);
    setShowUninstallModal(true);
  };

  const handleConfirmUninstall = async (gameId: string) => {
    try {
      await invokeTauri("uninstall_game", { gameId });
      setStatusMessage("Procedura di disinstallazione avviata nel client nativo.");
      await refreshLibrary();
    } catch (err: any) {
      setStatusMessage(`Errore disinstallazione: ${err?.message || err}`);
    }
  };

  const handleRemoveFromLibrary = async (gameId: string) => {
    const g = games.find((x) => x.id === gameId);
    const title = g?.title || "questo gioco";
    if (!window.confirm(`Sei sicuro di voler rimuovere "${title}" dalla libreria Omnis?`)) {
      return;
    }
    try {
      await invokeTauri("remove_game_from_library", { gameId });
      setStatusMessage(`"${title}" rimosso dalla libreria`);
      await refreshLibrary();
      if (selectedGame?.id === gameId) {
        setSelectedGame(null);
      }
    } catch (err: any) {
      setStatusMessage(`Errore rimozione gioco: ${err?.message || err}`);
    }
  };

  return (
    <UpdaterContext.Provider value={updater}>
      <div
        className="flex flex-col h-screen w-screen select-none overflow-hidden transition-colors duration-300"
      style={{
        backgroundColor: "var(--bg-base)",
        color: "var(--text-primary)",
        fontSize: `${uiZoom * 14}px`,
      }}
    >
      {currentTheme.custom_css && <style>{currentTheme.custom_css}</style>}

      {/* FULLSCREEN MODE */}
      {isFullscreen ? (
        <FullscreenView
          focusedGame={focusedGame}
          filteredGames={filteredGames}
          focusedIndex={focusedIndex}
          setFocusedIndex={setFocusedIndex}
          setSelectedGame={setSelectedGame}
          counts={counts}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
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
            currentLocaleInfo={currentLocaleInfo}
            setShowThemeModal={setShowThemeModal}
            loadProvidersAndConfig={loadProvidersAndConfig}
            setShowPluginModal={setShowPluginModal}
            providers={providers}
            setShowAddCustomModal={setShowAddCustomModal}
            selectedGame={selectedGame}
            setGameToEdit={setGameToEdit}
            setShowEditorModal={setShowEditorModal}
            handleSync={handleSync}
            isSyncing={isSyncing}
            handleDownloadAll={handleDownloadAll}
            isDownloading={isDownloading}
            setShowBatchEnrichModal={setShowBatchEnrichModal}
            uiZoom={uiZoom}
            setUiZoom={setUiZoom}
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
              <div
                className="h-11 min-h-[44px] px-6 border-b flex items-center justify-between select-none shrink-0 relative z-30"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                }}
              >
                {/* Left: Smart Filter Pills & Filter Dropdown */}
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Quick Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 shrink min-w-0">
                    {[
                      { id: "all", label: t("common.all") || "Tutti" },
                      { id: "installed", label: t("sidebar.installed") || "Installati" },
                      { id: "completion:Playing", label: "In corso" },
                      { id: "completion:Completed", label: "Completati" },
                      { id: "favorites", label: t("sidebar.favorites") || "Preferiti" },
                    ].map((f) => {
                      const isActive = isFilterActive(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            if (f.id === "all") {
                              clearAllFilters();
                            } else {
                              setActiveFilter(f.id);
                            }
                          }}
                          className={`h-7 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 select-none ${
                            isActive
                              ? "bg-indigo-600 text-white shadow-xs shadow-indigo-500/25 border border-indigo-500"
                              : "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08]"
                          }`}
                        >
                          <span>{f.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Filter Dropdown Popover */}
                  <div className="relative shrink-0" ref={filterMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowFilterMenu((v) => !v)}
                      className={`h-7 px-2.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                        totalActiveFilters > 0
                          ? "bg-indigo-600/30 border-indigo-500 text-indigo-200"
                          : "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border-white/[0.08]"
                      }`}
                      title="Apri filtri avanzati"
                    >
                      <Filter className="w-3 h-3 text-indigo-400" />
                      <span>{t("common.filter")}</span>
                      {totalActiveFilters > 0 && (
                        <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {totalActiveFilters}
                        </span>
                      )}
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>

                    {showFilterMenu && (
                      <div
                        className="absolute left-0 top-full mt-1.5 w-64 rounded-xl border p-3 shadow-2xl z-50 space-y-3 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                        }}
                      >
                        {/* Store / Platform */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {t("sidebar.stores")}
                          </span>
                          <div className="grid grid-cols-2 gap-1 text-xs">
                            {[
                              { id: "steam", label: "Steam" },
                              { id: "gog", label: "GOG" },
                              { id: "epic", label: "Epic Games" },
                              { id: "xbox", label: "Xbox" },
                            ].map((store) => {
                              const isSelected = selectedStores.includes(store.id);
                              return (
                                <button
                                  key={store.id}
                                  type="button"
                                  onClick={() => toggleStore(store.id)}
                                  className={`px-2 py-1.5 rounded-md text-left font-medium transition-colors flex items-center justify-between cursor-pointer ${
                                    isSelected
                                      ? "bg-indigo-600 text-white font-semibold shadow-xs"
                                      : "bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 hover:text-white"
                                  }`}
                                >
                                  <span>{store.label}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0 ml-1" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Completion Status */}
                        <div className="space-y-1.5 pt-1 border-t border-white/[0.06]">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {t("groups.completion_status")}
                          </span>
                          <div className="grid grid-cols-2 gap-1 text-xs">
                            {[
                              { id: "Playing", label: "In corso" },
                              { id: "Completed", label: "Completati 100%" },
                              { id: "Beaten", label: "Finiti" },
                              { id: "PlanToPlay", label: "Da iniziare" },
                              { id: "Backlog", label: "Backlog" },
                              { id: "Abandoned", label: "Abbandonati" },
                            ].map((st) => {
                              const isSelected = selectedStatuses.some((s) => s.toLowerCase() === st.id.toLowerCase());
                              return (
                                <button
                                  key={st.id}
                                  type="button"
                                  onClick={() => toggleStatus(st.id)}
                                  className={`px-2 py-1.5 rounded-md text-left font-medium transition-colors flex items-center justify-between truncate cursor-pointer ${
                                    isSelected
                                      ? "bg-indigo-600 text-white font-semibold shadow-xs"
                                      : "bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 hover:text-white"
                                  }`}
                                >
                                  <span className="truncate">{st.label}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0 ml-1" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Reset Filter Button */}
                        {totalActiveFilters > 0 && (
                          <div className="pt-2 border-t border-white/[0.06]">
                            <button
                              type="button"
                              onClick={() => {
                                clearAllFilters();
                              }}
                              className="w-full py-1.5 rounded-lg text-xs font-bold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors cursor-pointer"
                            >
                              Azzera tutti i filtri ({totalActiveFilters})
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Active filter chips (cumulative) */}
                  {activeChips.map((chip) => (
                    <div
                      key={chip.id}
                      className="h-7 px-2.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 shrink-0 animate-in fade-in zoom-in-95 duration-100"
                    >
                      <span>{chip.label}</span>
                      <button
                        type="button"
                        onClick={() => removeFilterChip(chip.id)}
                        className="hover:text-white transition-colors p-0.5 rounded cursor-pointer"
                        title={`Rimuovi filtro: ${chip.label}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {totalActiveFilters > 1 && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="text-[11px] font-semibold text-rose-300 hover:text-rose-200 underline transition-colors cursor-pointer shrink-0"
                      title="Rimuovi tutti i filtri attivi"
                    >
                      Azzera tutti
                    </button>
                  )}

                  <div className="h-4 w-[1px] shrink-0" style={{ backgroundColor: "var(--border-color)" }} />

                  {/* Filtered Counter */}
                  <span className="text-[11px] font-semibold shrink-0" style={{ color: "var(--text-muted)" }}>
                    {filteredGames.length} {filteredGames.length === 1 ? "gioco" : "giochi"}
                  </span>
                </div>

                {/* Right: Zoom Slider for Grid View */}
                {viewMode === "grid" && (
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => setGridCardWidth((w) => Math.max(140, w - 20))}
                      className="p-1 hover:text-white transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      title="Riduci dimensione locandine"
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
                      className="w-28 h-1.5 rounded-lg cursor-pointer accent-indigo-500"
                      style={{ backgroundColor: "var(--bg-card)" }}
                      title={`Larghezza locandine: ${gridCardWidth}px`}
                    />
                    <button
                      onClick={() => setGridCardWidth((w) => Math.min(320, w + 20))}
                      className="p-1 hover:text-white transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      title="Aumenta dimensione locandine"
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
                />
              )}

              {/* VIEW 2: DETAILS SPLIT-PANEL VIEW */}
              {viewMode === "details" && (
                selectedGame ? (
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
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <Gamepad2
                      className="w-12 h-12 mb-3 opacity-30"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <h3 className="text-base font-bold text-white mb-1">{t("views.no_game_selected")}</h3>
                    <p className="text-xs text-slate-400 max-w-sm">
                      {t("views.select_game_hint")}
                    </p>
                  </div>
                )
              )}

              {/* VIEW 3: HIGH-PERFORMANCE SPREADSHEET LIST VIEW */}
              {viewMode === "list" && (
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {filteredGames.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center p-8">
                      <Gamepad2
                        className="w-12 h-12 mb-3 opacity-30"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <span className="text-sm font-bold text-white">{t("views.no_games_found")}</span>
                      <span className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        {t("views.no_games_found_hint")}
                      </span>
                    </div>
                  ) : groupBy === "none" ? (
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
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activeGame
                      ? "bg-emerald-400 animate-pulse shadow-emerald-400/50 shadow-sm"
                      : "bg-emerald-400 shadow-sm"
                  }`}
                />
                <span className="font-bold text-white">
                  {gamepadConnected ? gamepadName : "Tauri 2.0"}
                </span>
              </div>

              {activeGame ? (
                <div className="flex items-center gap-2 truncate">
                  <span className="text-emerald-300 font-bold flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <span className="truncate">
                      🎮 Gioco in esecuzione: <strong className="text-white">{activeGame.title}</strong> ({formatDuration(elapsedSeconds)})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleKillRunningGame}
                    className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 hover:bg-rose-500 text-white transition-colors shrink-0 shadow-sm cursor-pointer"
                    title="Termina forzatamente il gioco in esecuzione"
                  >
                    Termina
                  </button>
                </div>
              ) : isSyncing ? (
                <div className="flex items-center gap-2 truncate">
                  <span className="text-sky-300 font-bold flex items-center gap-1.5 truncate">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
                    <span className="truncate">{statusMessage || "Sincronizzazione in corso..."}</span>
                  </span>
                </div>
              ) : (
                <span className="truncate">{statusMessage}</span>
              )}
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <span>F11: Attiva Modalità Fullscreen</span>
              <span>
                Tema Attivo: <strong className="text-white">{currentTheme.name}</strong>
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
            setStatusMessage(`Modifiche a '${normalized.title}' salvate con successo!`);
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
            setStatusMessage(`Metadati risolti per '${normalized.title}' con successo!`);
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
            setStatusMessage("Download dati completato e libreria aggiornata!");
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
        placeholder="Cerca nella libreria..."
      />

      {/* CUSTOM GAME IMPORT MODAL */}
      <CustomGameModal
        isOpen={showAddCustomModal}
        onClose={() => setShowAddCustomModal(false)}
        onSuccess={(title) => {
          refreshLibrary();
          setShowAddCustomModal(false);
          setStatusMessage(`Gioco personalizzato '${title}' aggiunto con successo!`);
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
                <h3 className="font-bold text-lg text-white">Termina Gioco</h3>
                <p className="text-xs text-rose-300">Richiesta di chiusura del processo</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-6">
              Sei sicuro di voler chiudere <strong className="text-white">{activeGame?.title || "il gioco attivo"}</strong>?
              <br /><br />
              <span className="text-xs text-slate-400">
                Omnis tenterà prima una chiusura controllata (WM_CLOSE) per consentire il salvataggio dei dati, e terminerà forzatamente il processo solo se non risponde entro pochi secondi.
              </span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowKillConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-slate-200 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={confirmKillRunningGame}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2"
              >
                <Square className="w-4 h-4 fill-white" />
                Conferma e Termina
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
            title="Chiudi notifica"
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
              Sessione di Gioco Terminata
            </span>
            <h4 className="text-xs font-bold text-white truncate">{sessionToast.title}</h4>
            <p className="text-[11px] text-slate-300 font-medium">
              Tempo giocato: +{Math.max(1, Math.round(sessionToast.durationSeconds / 60))} minuti ({formatDuration(sessionToast.durationSeconds)})
            </p>
          </div>
          <button
            onClick={() => setSessionToast(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Chiudi notifica"
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
    </UpdaterContext.Provider>
  );
}
