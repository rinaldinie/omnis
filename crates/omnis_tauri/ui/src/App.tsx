import React, { useState, useEffect, useRef } from "react";
import {
  Layers,
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
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import GameEditorModal from "./components/GameEditorModal";
import MetadataResolutionModal from "./components/MetadataResolutionModal";
import ListViewTable from "./components/ListViewTable";
import VirtualKeyboard from "./components/VirtualKeyboard";
import { SettingsModal, SettingsTab } from "./components/SettingsModal";
import { useTranslation } from "./i18n";
import soundEffects from "./utils/soundEffects";
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
import BigPictureView from "./components/views/BigPictureView";
import DetailsSplitView from "./components/views/DetailsSplitView";
import GridView from "./components/views/GridView";
import TopBar from "./components/navigation/TopBar";
import VideoBackdrop from "./components/common/VideoBackdrop";
import Sidebar from "./components/navigation/Sidebar";
import ThemeModal from "./components/modals/ThemeModal";
import PluginManagerModal from "./components/modals/PluginManagerModal";
import CustomGameModal from "./components/modals/CustomGameModal";
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
  const [statusMessage, setStatusMessage] = useState<string>("Pronto (Motore Tauri 2.0 / Big Picture)");
  const [isGameRunning, setIsGameRunning] = useState<boolean>(false);
  const [activeGame, setActiveGame] = useState<ActiveGameSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [sessionToast, setSessionToast] = useState<SessionToastInfo | null>(null);
  const [syncBanner, setSyncBanner] = useState<SyncBannerInfo | null>(null);
  const [showKillConfirmModal, setShowKillConfirmModal] = useState<boolean>(false);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const syncBannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gamesRef = useRef<GameDto[]>([]);
  gamesRef.current = games;
  const activeGameRef = useRef<ActiveGameSession | null>(null);
  activeGameRef.current = activeGame;

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

  // METADATA MODALS
  const [showEditorModal, setShowEditorModal] = useState<boolean>(false);
  const [showResolutionModal, setShowResolutionModal] = useState<boolean>(false);
  const [gameToEdit, setGameToEdit] = useState<any>(null);
  const [gameToResolve, setGameToResolve] = useState<any>(null);

  // THEME ENGINE
  const [themes, setThemes] = useState<ThemeConfig[]>(BUILTIN_THEMES);
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(BUILTIN_THEMES[0]);
  const [showThemeModal, setShowThemeModal] = useState<boolean>(false);

  // FULLSCREEN / BIG PICTURE
  const [isBigPicture, setIsBigPicture] = useState<boolean>(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(soundEffects.enabled);

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

  // TOGGLE BIG PICTURE FULLSCREEN
  const toggleBigPicture = async () => {
    const next = !isBigPicture;
    setIsBigPicture(next);
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
  } = useGamepadNavigation({
    isBigPicture,
    toggleBigPicture,
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

  const focusedGame = filteredGames[focusedIndex] || filteredGames[0] || selectedGame;

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
          if (prev && normalized.some((g) => g.id === prev.id)) {
            return prev;
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
    }
    setIsRefreshingPlugins(false);
  };

  const handleSavePipelineConfig = async () => {
    await invokeTauri("save_metadata_pipeline_config", { config: pipelineConfig });
    setStatusMessage("Priorità della pipeline salvate con successo!");
    await loadProvidersAndConfig();
  };

  const handleEnrichSingleGame = async (gameId: string) => {
    try {
      setIsEnrichingSingle(true);
      setStatusMessage("Arricchimento Diamond con SteamGridDB, OpenCritic e Steam in corso...");
      const updated = await invokeTauri<GameDto>("enrich_single_game", { gameId });
      if (updated) {
        setSelectedGame(updated);
        setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
        setStatusMessage(`'${updated.title}' arricchito con successo!`);
      }
    } catch (err: any) {
      setStatusMessage(`Errore arricchimento: ${err}`);
    } finally {
      setIsEnrichingSingle(false);
    }
  };

  const handleRunMassivePipeline = async () => {
    try {
      setIsPipelineEnriching(true);
      setPipelineProgress("Avvio scansione e arricchimento libreria con Diamond Pipeline...");
      const count = await invokeTauri<number>("download_all_metadata");
      setPipelineProgress(`Completato! ${count || 0} titoli arricchiti con la Diamond Pipeline.`);
      await refreshLibrary();
    } catch (err: any) {
      setPipelineProgress(`Errore durante l'arricchimento massivo: ${err}`);
    } finally {
      setIsPipelineEnriching(false);
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
    setIsSyncing(true);
    setStatusMessage("Sincronizzazione cataloghi store collegati avviata in background...");
    try {
      await invokeTauri("sync_store_library");
    } catch {
      await invokeTauri("sync_library");
      await refreshLibrary();
      setIsSyncing(false);
      setStatusMessage("Sincronizzazione completata! Catalogo aggiornato.");
    }
  };

  const handleDownloadAll = async () => {
    setIsDownloading(true);
    setStatusMessage("Download metadati e locandine HD in corso da Steam Store...");
    await invokeTauri("download_all_metadata");
    await refreshLibrary();
    setIsDownloading(false);
    setStatusMessage("Metadati e locandine aggiornati!");
  };

  const handleLaunch = async (gameId: string) => {
    soundEffects.playLaunch();
    const g = games.find((x) => x.id === gameId);
    if (g && !g.is_installed) {
      setStatusMessage(`Apertura installazione per "${g.title}" nel client ${g.library.toUpperCase()}...`);
    } else {
      setStatusMessage("Avvio del gioco in corso...");
    }
    await invokeTauri("launch_game", { gameId });
    if (g && !g.is_installed) {
      setStatusMessage(`Procedura di installazione avviata nel client nativo!`);
    } else {
      setStatusMessage("Gioco in esecuzione (Tracking kernel zero-CPU)");
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

  return (
    <div
      className="flex flex-col h-screen w-screen select-none overflow-hidden transition-colors duration-300"
      style={{
        backgroundColor: "var(--bg-base)",
        color: "var(--text-primary)",
        fontSize: `${uiZoom * 14}px`,
      }}
    >
      {currentTheme.custom_css && <style>{currentTheme.custom_css}</style>}

      {/* FULLSCREEN BIG PICTURE MODE */}
      {isBigPicture ? (
        <BigPictureView
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
          toggleBigPicture={toggleBigPicture}
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
            toggleBigPicture={toggleBigPicture}
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
                className="h-11 min-h-[44px] px-6 border-b flex items-center justify-between select-none shrink-0 z-10"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                }}
              >
                {/* Left: GroupBy Selector & Counter */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-[11px] font-bold" style={{ color: "var(--text-muted)" }}>
                      {t("views.group_by")}
                    </span>
                    <select
                      value={groupBy}
                      onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                      className="h-7 px-2.5 rounded-lg text-xs font-semibold border focus:outline-none cursor-pointer transition-colors"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <option value="none">{t("groups.none")}</option>
                      <option value="library">{t("groups.library")}</option>
                      <option value="is_installed">{t("groups.is_installed")}</option>
                      <option value="genre">{t("groups.genre")}</option>
                      <option value="developer">{t("groups.developer")}</option>
                      <option value="release_year">{t("groups.release_year")}</option>
                      <option value="completion_status">{t("groups.completion_status")}</option>
                    </select>
                  </div>

                  <div className="h-4 w-[1px]" style={{ backgroundColor: "var(--border-color)" }} />

                  <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                    {t("topbar.filtered_count", { count: filteredGames.length })}
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
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <Gamepad2
                      className="w-12 h-12 mb-3 opacity-30"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <h3 className="text-base font-bold text-white mb-1">Nessun gioco selezionato</h3>
                    <p className="text-xs text-slate-400 max-w-sm">
                      Seleziona un gioco dalla lista o passa alla vista a griglia per visualizzare la tua libreria.
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
                      <span className="text-sm font-bold text-white">Nessun gioco trovato</span>
                      <span className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        Prova a modificare i filtri o la query di ricerca.
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
                              {isCollapsed ? "Espandi" : "Comprimi"}
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
              <span>F11: Attiva Big Picture Mode</span>
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
            setSelectedGame((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
            setGames((prev) => prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g)));
            refreshLibrary();
            setStatusMessage(`Modifiche a '${updated.title}' salvate con successo!`);
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
            setSelectedGame((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
            setGames((prev) => prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g)));
            refreshLibrary();
            setStatusMessage(`Metadati risolti per '${updated.title}' con successo!`);
          }}
        />
      )}

      {/* BIG PICTURE VIRTUAL KEYBOARD */}
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
            onClick={() => setSyncBanner(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Chiudi notifica"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* DESKTOP SESSION END TOAST */}
      {!isBigPicture && sessionToast && (
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
    </div>
  );
}
