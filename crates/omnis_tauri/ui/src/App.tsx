import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Gamepad2,
  HardDrive,
  Clock,
  Star,
  Swords,
  Scroll,
  Dices,
  Sparkles,
  Download,
  RefreshCw,
  Search,
  Settings,
  Minus,
  Square,
  X,
  Play,
  Folder,
  FolderOpen,
  Layers,
  LayoutGrid,
  List,
  PanelLeft,
  TableProperties,
  CheckCircle2,
  Zap,
  ZoomIn,
  ZoomOut,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ExternalLink,
  Tv,
  Palette,
  Sliders,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  Flame,
  Info,
  Check,
  PlusCircle,
  Pencil,
  Eye,
  EyeOff,
  Key,
  ShieldCheck,
  AlertCircle,
  Puzzle,
  ArrowLeft,
  BookOpen,
  Volume2,
  VolumeX,
  Globe,
} from "lucide-react";
import GameEditorModal from "./components/GameEditorModal";
import MetadataResolutionModal from "./components/MetadataResolutionModal";
import ListViewTable from "./components/ListViewTable";
import VirtualKeyboard from "./components/VirtualKeyboard";
import { SettingsModal } from "./components/SettingsModal";
import { useTranslation } from "./i18n";
import soundEffects from "./utils/soundEffects";
import {
  SteamIcon,
  EpicIcon,
  GogIcon,
  StoreIcon,
  StoreBadge,
} from "./components/StoreBadge";
import { convertFileSrc } from "@tauri-apps/api/core";

export { SteamIcon, EpicIcon, GogIcon, StoreIcon, StoreBadge };

/**
 * Converts local file paths to zero-memory streaming asset URLs via Tauri's asset protocol
 */
export function formatImageUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:") ||
    src.startsWith("asset:")
  ) {
    return src;
  }
  try {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    ) {
      return convertFileSrc(src);
    }
  } catch {
    // fallback
  }
  return src;
}

export const normalizeGame = (g: GameDto): GameDto => ({
  ...g,
  cover_image: formatImageUrl(g.cover_image),
  background_image: formatImageUrl(g.background_image),
  icon_image: formatImageUrl(g.icon_image || g.cover_image),
});

// ============================================================================
// CORE VIEW AND GROUPBY TYPES
// ============================================================================
export type ViewMode = "grid" | "details" | "list";

export type GroupBy =
  | "none"
  | "library"
  | "is_installed"
  | "genre"
  | "developer"
  | "release_year"
  | "completion_status";

export interface GameDto {
  id: string;
  title: string;
  library: string;
  is_installed: boolean;
  playtime_seconds: number;
  playtime_formatted: string;
  critic_score: number | null;
  release_date: string | null;
  description: string | null;
  cover_image: string | null;
  background_image: string | null;
  icon_image?: string | null;
  series?: string | null;
  completion_status?: string | null;
  user_notes?: string | null;
  custom_links?: Array<{ title: string; url: string }>;
  genres: string[];
  developers: string[];
  publishers?: string[];
}

interface LibraryCounts {
  total: number;
  installed: number;
  steam: number;
  gog: number;
  epic: number;
  recent: number;
  favorites: number;
  action: number;
  rpg: number;
  strategy: number;
  indie: number;
}

interface ThemeConfig {
  id: string;
  name: string;
  description: string;
  author: string;
  is_custom: boolean;
  bg_base: string;
  bg_surface: string;
  bg_card: string;
  text_primary: string;
  text_muted: string;
  accent_primary: string;
  accent_glow: string;
  border_color: string;
  card_radius: string;
  font_family: string;
  custom_css?: string | null;
}

interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  author: string;
  website?: string | null;
  key_help_url?: string | null;
  requires_api_key: boolean;
  supported_fields: string[];
  is_enabled: boolean;
  is_builtin?: boolean;
  version?: string | null;
  plugin_path?: string | null;
  settings_schema?: {
    plugin_id: string;
    title: string;
    groups: Array<{
      id: string;
      title: string;
      fields: Array<{
        key: string;
        label: string;
        description?: string;
        required: boolean;
        type: string;
        placeholder?: string;
        options?: string[];
        default?: any;
        field_type?: any;
      }>;
    }>;
  } | null;
  settings_values: Record<string, any>;
  has_configured_key: boolean;
}

interface MetadataPipelineConfig {
  cover_source: string;
  background_source: string;
  score_source: string;
  details_source: string;
}

const BUILTIN_THEMES: ThemeConfig[] = [
  {
    id: "cyberpunk",
    name: "Cyberpunk Neon (Default)",
    description: "Tema scuro moderno ad alto contrasto con bagliore indaco e viola neon",
    author: "Omnis Team",
    is_custom: false,
    bg_base: "#090c14",
    bg_surface: "#0e1320",
    bg_card: "#141a2c",
    text_primary: "#f8fafc",
    text_muted: "#94a3b8",
    accent_primary: "#6366f1",
    accent_glow: "rgba(99, 102, 241, 0.4)",
    border_color: "#1e293b",
    card_radius: "12px",
    font_family: "system-ui, -apple-system, sans-serif",
    custom_css: null,
  },
  {
    id: "steam_deck",
    name: "Steam Deck OLED",
    description: "Nero assoluto al 100% per schermi OLED con accenti ciano e blu elettrico Valve",
    author: "Valve Inspired",
    is_custom: false,
    bg_base: "#000000",
    bg_surface: "#0d121c",
    bg_card: "#131b28",
    text_primary: "#ffffff",
    text_muted: "#8a9aa8",
    accent_primary: "#1a9fff",
    accent_glow: "rgba(26, 159, 255, 0.45)",
    border_color: "#1e2738",
    card_radius: "8px",
    font_family: "system-ui, sans-serif",
    custom_css: null,
  },
  {
    id: "playnite_dark",
    name: "Playnite Classic Dark",
    description: "La celebre palette originale di Playnite con ardesia calda e arancione radiante",
    author: "Josef Nemec Inspired",
    is_custom: false,
    bg_base: "#181a1f",
    bg_surface: "#21252b",
    bg_card: "#282c34",
    text_primary: "#ffffff",
    text_muted: "#abb2bf",
    accent_primary: "#ea7300",
    accent_glow: "rgba(234, 115, 0, 0.45)",
    border_color: "#353b47",
    card_radius: "6px",
    font_family: "Segoe UI, system-ui, sans-serif",
    custom_css: null,
  },
  {
    id: "epic_dark",
    name: "Epic Games Launcher V2",
    description: "Minimalismo grafite ad alta leggibilità con contrasti netti e accenti blu Epic",
    author: "Epic Games Inspired",
    is_custom: false,
    bg_base: "#121212",
    bg_surface: "#1a1a1a",
    bg_card: "#242424",
    text_primary: "#f5f5f5",
    text_muted: "#aaaaaa",
    accent_primary: "#0078f2",
    accent_glow: "rgba(0, 120, 242, 0.4)",
    border_color: "#2e2e2e",
    card_radius: "10px",
    font_family: "system-ui, sans-serif",
    custom_css: null,
  },
  {
    id: "synthwave",
    name: "Retro Synthwave 80s",
    description: "Atmosfera arcade retrò anni '80 con orizzonte viola profondo e magenta fluorescente",
    author: "RetroWave",
    is_custom: false,
    bg_base: "#130026",
    bg_surface: "#20003b",
    bg_card: "#300054",
    text_primary: "#ffffff",
    text_muted: "#d896ff",
    accent_primary: "#ff007f",
    accent_glow: "rgba(255, 0, 127, 0.55)",
    border_color: "#58008a",
    card_radius: "14px",
    font_family: "system-ui, sans-serif",
    custom_css: null,
  },
  {
    id: "nordic_frost",
    name: "Nordic Polar Frost",
    description: "Palette artica fredda e pulita in stile Nord con blu ghiaccio e contrasti riposanti",
    author: "Nord Theme",
    is_custom: false,
    bg_base: "#242933",
    bg_surface: "#2e3440",
    bg_card: "#3b4252",
    text_primary: "#eceff4",
    text_muted: "#d8dee9",
    accent_primary: "#88c0d0",
    accent_glow: "rgba(136, 192, 208, 0.45)",
    border_color: "#4c566a",
    card_radius: "10px",
    font_family: "system-ui, sans-serif",
    custom_css: null,
  },
];

const SAMPLE_GAMES: GameDto[] = [
  {
    id: "1091500",
    title: "Cyberpunk 2077",
    library: "steam",
    is_installed: true,
    playtime_seconds: 148500,
    playtime_formatted: "41h 15m",
    critic_score: 86,
    release_date: "10 Dic 2020",
    description: "Cyberpunk 2077 è un gioco di ruolo e azione a mondo aperto ambientato nella megalopoli di Night City.",
    cover_image: null,
    background_image: null,
    series: "Cyberpunk",
    completion_status: "Playing",
    user_notes: "Build attuale: Netrunner con Cyberdeck Militech e Smart Sniper. Missione in sospeso: Phantom Liberty.",
    custom_links: [
      { title: "Wiki Ufficiale", url: "https://cyberpunk.fandom.com" },
      { title: "Nexus Mods", url: "https://www.nexusmods.com/cyberpunk2077" },
    ],
    genres: ["Azione", "GDR", "Open World"],
    developers: ["CD PROJEKT RED"],
    publishers: ["CD PROJEKT RED"],
  },
  {
    id: "292030",
    title: "The Witcher 3: Wild Hunt",
    library: "steam",
    is_installed: true,
    playtime_seconds: 288000,
    playtime_formatted: "80h 00m",
    critic_score: 93,
    release_date: "18 Mag 2015",
    description: "Mentre la guerra infuria nei Regni Settentrionali, affronti il contratto più importante della tua vita: trovare la ragazza della profezia.",
    cover_image: null,
    background_image: null,
    series: "The Witcher",
    completion_status: "Completed",
    user_notes: "Completato al 100% inclusi Hearts of Stone e Blood and Wine a difficoltà Marcia della Morte.",
    custom_links: [
      { title: "Witcher Wiki", url: "https://witcher.fandom.com" },
    ],
    genres: ["GDR", "Open World", "Fantasy"],
    developers: ["CD PROJEKT RED"],
    publishers: ["CD PROJEKT RED"],
  },
  {
    id: "1145360",
    title: "Hades",
    library: "steam",
    is_installed: false,
    playtime_seconds: 93600,
    playtime_formatted: "26h 00m",
    critic_score: 93,
    release_date: "17 Set 2020",
    description: "Sfida il dio dei morti in questo rogue-like dungeoncrawler sviluppato dai creatori di Bastion e Transistor.",
    cover_image: null,
    background_image: null,
    series: "Hades",
    completion_status: "Beaten",
    user_notes: "Fuga completata con lo Scudo del Caos e i dardi di Artemide.",
    custom_links: [
      { title: "Supergiant Games", url: "https://www.supergiantgames.com/games/hades/" },
    ],
    genres: ["Azione", "Indie", "Rogue-like"],
    developers: ["Supergiant Games"],
    publishers: ["Supergiant Games"],
  },
  {
    id: "620",
    title: "Portal 2",
    library: "steam",
    is_installed: true,
    playtime_seconds: 39600,
    playtime_formatted: "11h 00m",
    critic_score: 95,
    release_date: "19 Apr 2011",
    description: "Portal 2 offre innovativi rompicapo fisici, narrazione satirica ed eccezionale cooperativa a due giocatori.",
    cover_image: null,
    background_image: null,
    series: "Portal",
    completion_status: "Completed",
    user_notes: "Completata campagna single player e coop in cooperativa.",
    custom_links: [
      { title: "Steam Store", url: "https://store.steampowered.com/app/620/Portal_2/" },
    ],
    genres: ["Strategia", "Puzzle", "Fantascienza"],
    developers: ["Valve"],
    publishers: ["Valve"],
  },
  {
    id: "1423714649",
    title: "Baldur's Gate 3",
    library: "gog",
    is_installed: false,
    playtime_seconds: 432000,
    playtime_formatted: "120h 00m",
    critic_score: 96,
    release_date: "3 Ago 2023",
    description: "Raduna il tuo gruppo e torna nei Forgotten Realms in una storia di amicizia, tradimento, sacrificio e sopravvivenza.",
    cover_image: null,
    background_image: null,
    series: "Baldur's Gate",
    completion_status: "Playing",
    user_notes: "Campagna Paladino Giuramento degli Antichi in Atto 3 (Bassa Città).",
    custom_links: [
      { title: "BG3 Wiki", url: "https://bg3.wiki" },
    ],
    genres: ["GDR", "Strategia", "Turn-Based"],
    developers: ["Larian Studios"],
    publishers: ["Larian Studios"],
  },
  {
    id: "1245620",
    title: "Elden Ring",
    library: "steam",
    is_installed: false,
    playtime_seconds: 252000,
    playtime_formatted: "70h 00m",
    critic_score: 96,
    release_date: "25 Feb 2022",
    description: "Alzati, Senzaluce, e lasciati guidare dalla grazia per brandire il potere dell'Anello ancestrale.",
    cover_image: null,
    background_image: null,
    series: "Soulsborne",
    completion_status: "Beaten",
    user_notes: "Sconfitto Radagon e la Belva Ancestrale. Finale Era delle Stelle.",
    custom_links: [
      { title: "Fextralife Elden Ring", url: "https://eldenring.wiki.fextralife.com" },
    ],
    genres: ["Azione", "GDR", "Dark Fantasy"],
    developers: ["FromSoftware Inc."],
    publishers: ["Bandai Namco"],
  },
];

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<T>(cmd, args);
    }
  } catch (err) {
    console.warn(`Tauri command '${cmd}' not available in preview:`, err);
  }
  return null;
}

const FILTER_ORDER = ["all", "installed", "recent", "favorites", "steam", "gog", "epic", "action", "rpg", "strategy", "indie"];

export default function App() {
  const [games, setGames] = useState<GameDto[]>(SAMPLE_GAMES);
  const [counts, setCounts] = useState<LibraryCounts>({
    total: 6,
    installed: 3,
    steam: 5,
    gog: 1,
    epic: 0,
    recent: 6,
    favorites: 4,
    action: 3,
    rpg: 4,
    strategy: 2,
    indie: 1,
  });

  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [gridCardWidth, setGridCardWidth] = useState<number>(180);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [detailsSidebarOpen, setDetailsSidebarOpen] = useState<boolean>(true);
  const [detailsSearchQuery, setDetailsSearchQuery] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedGame, setSelectedGame] = useState<GameDto>(SAMPLE_GAMES[0]);
  const [uiZoom, setUiZoom] = useState<number>(1.0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("Pronto (Motore Tauri 2.0 / Big Picture)");

  // I18N TRANSLATION HOOK
  const { t, locale, currentLocaleInfo } = useTranslation();
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // METADATA EDITOR & RESOLUTION MODALS STATES
  const [showEditorModal, setShowEditorModal] = useState<boolean>(false);
  const [showResolutionModal, setShowResolutionModal] = useState<boolean>(false);
  const [gameToEdit, setGameToEdit] = useState<any>(null);
  const [gameToResolve, setGameToResolve] = useState<any>(null);

  // THEME ENGINE STATES
  const [themes, setThemes] = useState<ThemeConfig[]>(BUILTIN_THEMES);
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(BUILTIN_THEMES[0]);
  const [showThemeModal, setShowThemeModal] = useState<boolean>(false);
  const [themeModalTab, setThemeModalTab] = useState<"list" | "create">("list");
  const [newThemeDraft, setNewThemeDraft] = useState<Partial<ThemeConfig>>({
    id: "mio_tema_custom",
    name: "Mio Nuovo Tema",
    description: "Tema personalizzato con colori custom",
    author: "Utente",
    bg_base: "#0c0d14",
    bg_surface: "#141724",
    bg_card: "#1e2235",
    text_primary: "#ffffff",
    text_muted: "#94a3b8",
    accent_primary: "#10b981",
    accent_glow: "rgba(16, 185, 129, 0.4)",
    border_color: "#2d344d",
    card_radius: "12px",
    font_family: "system-ui, sans-serif",
  });

  // FULLSCREEN / BIG PICTURE STATES
  const [isBigPicture, setIsBigPicture] = useState<boolean>(false);
  const [gamepadConnected, setGamepadConnected] = useState<boolean>(false);
  const [gamepadName, setGamepadName] = useState<string>("Nessun Controller");
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [showFullscreenDetails, setShowFullscreenDetails] = useState<boolean>(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(soundEffects.enabled);

  const handleToggleSound = () => {
    const next = soundEffects.toggle();
    setSoundEnabled(next);
    if (next) soundEffects.playSelect();
  };

  // CONTEXT MENU STATE
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    game: GameDto;
  } | null>(null);

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
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Apply theme variables dynamically to the document root
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
    document.body.style.backgroundColor = currentTheme.bg_base;
    document.body.style.color = currentTheme.text_primary;
  }, [currentTheme]);

  // Load library & themes from backend
  const refreshLibrary = async () => {
    const loadedGames = await invokeTauri<GameDto[]>("get_games");
    if (loadedGames && loadedGames.length > 0) {
      setGames(loadedGames.map(normalizeGame));
      const loadedCounts = await invokeTauri<LibraryCounts>("get_counts");
      if (loadedCounts) setCounts(loadedCounts);
    }
  };

  // CUSTOM GAME MODAL STATE
  const [showAddCustomModal, setShowAddCustomModal] = useState<boolean>(false);
  const [customTitle, setCustomTitle] = useState<string>("");
  const [customExePath, setCustomExePath] = useState<string>("");
  const [customCoverPath, setCustomCoverPath] = useState<string>("");
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);

  const handlePickCustomExe = async () => {
    try {
      const path = await invokeTauri<string>("pick_executable_file");
      if (path) {
        setCustomExePath(path);
        if (!customTitle.trim()) {
          const sep = path.includes("\\") ? "\\" : "/";
          const filename = path.split(sep).pop() || "";
          const formatted = filename
            .replace(/\.(exe|bat|cmd|lnk)$/i, "")
            .replace(/[_-]/g, " ")
            .trim();
          setCustomTitle(formatted);
        }
      }
    } catch (e) {
      console.error("Failed to pick executable:", e);
    }
  };

  const handlePickCustomFolder = async () => {
    try {
      const dir = await invokeTauri<string>("pick_directory");
      if (dir) {
        const exes = await invokeTauri<string[]>("find_executables_in_folder", { folderPath: dir });
        if (exes && exes.length > 0) {
          setCustomExePath(exes[0]);
        } else {
          setCustomExePath(dir);
        }
        if (!customTitle.trim()) {
          const sep = dir.includes("\\") ? "\\" : "/";
          const folderName = dir.split(sep).filter(Boolean).pop() || "";
          setCustomTitle(folderName.replace(/[_-]/g, " ").trim());
        }
      }
    } catch (e) {
      console.error("Failed to pick directory:", e);
    }
  };

  const handlePickCustomCover = async () => {
    try {
      const path = await invokeTauri<string>("pick_image_file");
      if (path) {
        setCustomCoverPath(path);
      }
    } catch (e) {
      console.error("Failed to pick cover:", e);
    }
  };

  const handleAddCustomGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customExePath.trim()) return;
    setIsAddingCustom(true);
    try {
      await invokeTauri("add_custom_game", {
        payload: {
          title: customTitle.trim(),
          executable_path: customExePath.trim(),
          arguments: [],
          working_dir: null,
          cover_image_path: customCoverPath.trim() || null,
        },
      });
      await refreshLibrary();
      setShowAddCustomModal(false);
      setCustomTitle("");
      setCustomExePath("");
      setCustomCoverPath("");
      setStatusMessage(`Gioco personalizzato '${customTitle}' aggiunto con successo!`);
    } catch (err) {
      console.error("Errore aggiunta custom game:", err);
    } finally {
      setIsAddingCustom(false);
    }
  };

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

  useEffect(() => {
    refreshLibrary();
    loadThemes();
    loadProvidersAndConfig();
  }, []);

  // DIAMOND METADATA PLUGIN & PIPELINE STATES
  const [showPluginModal, setShowPluginModal] = useState<boolean>(false);
  const [pluginModalTab, setPluginModalTab] = useState<"providers" | "pipeline" | "enrich">("providers");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [pipelineConfig, setPipelineConfig] = useState<MetadataPipelineConfig>({
    cover_source: "steamgriddb",
    background_source: "steamgriddb",
    score_source: "opencritic",
    details_source: "steam",
  });
  const [editingSettings, setEditingSettings] = useState<Record<string, Record<string, any>>>({});
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<Record<string, { loading: boolean; success?: boolean; message?: string }>>({});
  const [isEnrichingSingle, setIsEnrichingSingle] = useState<boolean>(false);
  const [isPipelineEnriching, setIsPipelineEnriching] = useState<boolean>(false);
  const [pipelineProgress, setPipelineProgress] = useState<string | null>(null);

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

  const [isRefreshingPlugins, setIsRefreshingPlugins] = useState<boolean>(false);

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


  const selectTheme = (theme: ThemeConfig) => {
    setCurrentTheme(theme);
    localStorage.setItem("omnis_selected_theme_id", theme.id);
    setStatusMessage(`Tema '${theme.name}' attivato!`);
  };

  const handleSaveCustomTheme = async () => {
    if (!newThemeDraft.name || !newThemeDraft.id) return;
    const fullTheme: ThemeConfig = {
      id: newThemeDraft.id.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
      name: newThemeDraft.name || "Tema Personalizzato",
      description: newThemeDraft.description || "Creato dall'editor integrato",
      author: newThemeDraft.author || "Utente",
      is_custom: true,
      bg_base: newThemeDraft.bg_base || "#0b0e14",
      bg_surface: newThemeDraft.bg_surface || "#131822",
      bg_card: newThemeDraft.bg_card || "#1a2130",
      text_primary: newThemeDraft.text_primary || "#ffffff",
      text_muted: newThemeDraft.text_muted || "#94a3b8",
      accent_primary: newThemeDraft.accent_primary || "#6366f1",
      accent_glow: newThemeDraft.accent_glow || "rgba(99, 102, 241, 0.4)",
      border_color: newThemeDraft.border_color || "#242e42",
      card_radius: newThemeDraft.card_radius || "12px",
      font_family: newThemeDraft.font_family || "system-ui, sans-serif",
      custom_css: newThemeDraft.custom_css || null,
    };

    await invokeTauri("save_custom_theme", { theme: fullTheme });
    await loadThemes();
    selectTheme(fullTheme);
    setThemeModalTab("list");
    setStatusMessage(`Nuovo tema '${fullTheme.name}' salvato e applicato!`);
  };

  // Filtered games calculation
  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      if (activeFilter === "installed" && !g.is_installed) return false;
      if (activeFilter === "recent" && g.playtime_seconds === 0) return false;
      if (activeFilter === "favorites" && (g.critic_score || 0) < 90) return false;
      if (activeFilter === "steam" && g.library.toLowerCase() !== "steam") return false;
      if (activeFilter === "gog" && g.library.toLowerCase() !== "gog") return false;
      if (activeFilter === "epic" && g.library.toLowerCase() !== "epic") return false;
      if (activeFilter === "action" && !g.genres.some((x) => x.toLowerCase().includes("azione") || x.toLowerCase().includes("action"))) return false;
      if (activeFilter === "rpg" && !g.genres.some((x) => x.toLowerCase().includes("gdr") || x.toLowerCase().includes("rpg"))) return false;
      if (activeFilter === "strategy" && !g.genres.some((x) => x.toLowerCase().includes("strategia") || x.toLowerCase().includes("puzzle"))) return false;
      if (activeFilter === "indie" && !g.genres.some((x) => x.toLowerCase().includes("indie"))) return false;

      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        return g.title.toLowerCase().includes(query) || g.developers.some((d) => d.toLowerCase().includes(query));
      }
      return true;
    });
  }, [games, activeFilter, searchQuery]);

  // Dynamic Grouping Calculation
  const groupedGames = useMemo<Record<string, GameDto[]>>(() => {
    if (groupBy === "none") {
      return { "Tutti i Giochi": filteredGames };
    }

    const groups: Record<string, GameDto[]> = {};

    filteredGames.forEach((game) => {
      let key = "Altro";
      switch (groupBy) {
        case "library":
          key = game.library ? game.library.toUpperCase() : "ALTRO";
          break;
        case "is_installed":
          key = game.is_installed ? "Installati" : "Disponibili per il download";
          break;
        case "genre":
          key = game.genres && game.genres.length > 0 ? game.genres[0] : "Senza Genere";
          break;
        case "developer":
          key = game.developers && game.developers.length > 0 ? game.developers[0] : "Sconosciuto";
          break;
        case "release_year": {
          if (game.release_date) {
            const match = game.release_date.match(/\b(19\d\d|20\d\d)\b/);
            key = match ? match[1] : "Data Sconosciuta";
          } else {
            key = "Data Sconosciuta";
          }
          break;
        }
        case "completion_status": {
          const statusMap: Record<string, string> = {
            NotPlayed: "Non giocato",
            Playing: "In corso",
            Beaten: "Finito",
            Completed: "Completato 100%",
            Abandoned: "Abbandonato",
            Backlog: "Backlog",
            PlanToPlay: "Da iniziare",
          };
          key = statusMap[game.completion_status || "NotPlayed"] || game.completion_status || "Non giocato";
          break;
        }
        default:
          key = "Tutti i Giochi";
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(game);
    });

    return groups;
  }, [filteredGames, groupBy]);

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const detailsFilteredGames = useMemo(() => {
    if (!detailsSearchQuery.trim()) return filteredGames;
    const q = detailsSearchQuery.toLowerCase();
    return filteredGames.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.library.toLowerCase().includes(q) ||
        (g.series && g.series.toLowerCase().includes(q))
    );
  }, [filteredGames, detailsSearchQuery]);

  const focusedGame = filteredGames[focusedIndex] || filteredGames[0] || selectedGame;

  // Toggle Big Picture Fullscreen
  const toggleBigPicture = async () => {
    const next = !isBigPicture;
    setIsBigPicture(next);
    await invokeTauri("window_set_fullscreen", { fullscreen: next });
    if (next) {
      setFocusedIndex(0);
      setShowFullscreenDetails(false);
    }
  };

  const cycleFilter = (direction: number) => {
    const currentIndex = FILTER_ORDER.indexOf(activeFilter);
    const nextIndex = (currentIndex + direction + FILTER_ORDER.length) % FILTER_ORDER.length;
    setActiveFilter(FILTER_ORDER[nextIndex]);
    setFocusedIndex(0);
  };

  // Gamepad Polling Loop
  useEffect(() => {
    let animId: number;
    let lastButtonTime = 0;

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let activeGamepad: Gamepad | null = null;
      for (const gp of gamepads) {
        if (gp && gp.connected) {
          activeGamepad = gp;
          break;
        }
      }

      if (activeGamepad) {
        if (!gamepadConnected) {
          setGamepadConnected(true);
          setGamepadName(activeGamepad.id.split("(")[0].trim() || "Controller Connesso");
        }

        // When virtual keyboard is open, delegate gamepad controls exclusively to it
        if (showVirtualKeyboard) {
          animId = requestAnimationFrame(pollGamepad);
          return;
        }

        const now = Date.now();
        if (now - lastButtonTime > 190) {
          const b = activeGamepad.buttons;
          const a = activeGamepad.axes;

          const isLeft = b[14]?.pressed || (a[0] && a[0] < -0.45);
          const isRight = b[15]?.pressed || (a[0] && a[0] > 0.45);
          const isUp = b[12]?.pressed || (a[1] && a[1] < -0.45);
          const isDown = b[13]?.pressed || (a[1] && a[1] > 0.45);

          const btnA = b[0]?.pressed;
          const btnB = b[1]?.pressed;
          const btnX = b[2]?.pressed;
          const btnY = b[3]?.pressed;
          const btnLB = b[4]?.pressed;
          const btnRB = b[5]?.pressed;
          const btnSelect = b[8]?.pressed;
          const btnStart = b[9]?.pressed;

          if (isBigPicture) {
            if (isLeft) {
              setFocusedIndex((prev) => {
                const next = Math.max(0, prev - 1);
                if (next !== prev) soundEffects.playNav();
                return next;
              });
              lastButtonTime = now;
            } else if (isRight) {
              setFocusedIndex((prev) => {
                const next = Math.min(filteredGames.length - 1, prev + 1);
                if (next !== prev) soundEffects.playNav();
                return next;
              });
              lastButtonTime = now;
            }

            if (btnA) {
              const current = filteredGames[focusedIndex] || selectedGame;
              if (current) handleLaunch(current.id);
              lastButtonTime = now + 400;
            } else if (btnB) {
              soundEffects.playSelect();
              if (showFullscreenDetails) {
                setShowFullscreenDetails(false);
              } else {
                toggleBigPicture();
              }
              lastButtonTime = now + 250;
            } else if (btnX) {
              soundEffects.playSelect();
              setShowFullscreenDetails((prev) => !prev);
              lastButtonTime = now + 250;
            } else if (btnY) {
              soundEffects.playSelect();
              setShowVirtualKeyboard(true);
              lastButtonTime = now + 250;
            } else if (btnLB) {
              soundEffects.playNav();
              cycleFilter(-1);
              lastButtonTime = now + 200;
            } else if (btnRB) {
              soundEffects.playNav();
              cycleFilter(1);
              lastButtonTime = now + 200;
            } else if (btnSelect || btnStart) {
              soundEffects.playSelect();
              toggleBigPicture();
              lastButtonTime = now + 400;
            }
          } else {
            if (btnStart || b[16]?.pressed) {
              soundEffects.playSelect();
              toggleBigPicture();
              lastButtonTime = now + 400;
            }
          }
        }
      } else {
        if (gamepadConnected) {
          setGamepadConnected(false);
          setGamepadName("Nessun Controller");
        }
      }

      animId = requestAnimationFrame(pollGamepad);
    };

    animId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animId);
  }, [isBigPicture, filteredGames, focusedIndex, showFullscreenDetails, gamepadConnected, selectedGame, showVirtualKeyboard]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delegate key events if Virtual Keyboard modal is open
      if (showVirtualKeyboard) return;

      if (e.key === "F11") {
        e.preventDefault();
        toggleBigPicture();
        return;
      }

      if (isBigPicture) {
        if (e.key === "ArrowLeft") {
          setFocusedIndex((prev) => {
            const next = Math.max(0, prev - 1);
            if (next !== prev) soundEffects.playNav();
            return next;
          });
        } else if (e.key === "ArrowRight") {
          setFocusedIndex((prev) => {
            const next = Math.min(filteredGames.length - 1, prev + 1);
            if (next !== prev) soundEffects.playNav();
            return next;
          });
        } else if (e.key === "Enter") {
          soundEffects.playSelect();
          if (showFullscreenDetails) {
            const current = filteredGames[focusedIndex] || selectedGame;
            if (current) handleLaunch(current.id);
          } else {
            setShowFullscreenDetails(true);
          }
        } else if (e.key === "Escape") {
          soundEffects.playSelect();
          if (showFullscreenDetails) setShowFullscreenDetails(false);
          else toggleBigPicture();
        } else if (e.key.toLowerCase() === "x") {
          soundEffects.playSelect();
          setShowFullscreenDetails((prev) => !prev);
        } else if (e.key.toLowerCase() === "t") {
          soundEffects.playSelect();
          setShowThemeModal(true);
        } else if (e.key.toLowerCase() === "y" || e.key.toLowerCase() === "s" || e.key === "/") {
          e.preventDefault();
          soundEffects.playSelect();
          setShowVirtualKeyboard(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBigPicture, filteredGames, focusedIndex, showFullscreenDetails, selectedGame, showVirtualKeyboard]);

  // Auto-scroll focused card into view in carousel
  useEffect(() => {
    if (isBigPicture && carouselRef.current) {
      const activeCard = carouselRef.current.children[focusedIndex] as HTMLElement;
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [focusedIndex, isBigPicture]);

  const handleMinimize = () => invokeTauri("window_minimize");
  const handleToggleMaximize = () => invokeTauri("window_toggle_maximize");
  const handleClose = () => invokeTauri("window_close");

  const handleStartDragging = async (e: React.MouseEvent) => {
    // Only primary mouse button (left-click)
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Don't drag if clicking interactive elements
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
    setStatusMessage("Sincronizzazione Playnite con Steam & Epic Games in corso...");
    await invokeTauri("sync_library");
    await refreshLibrary();
    setIsSyncing(false);
    setStatusMessage("Sincronizzazione completata! Catalogo aggiornato.");
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
    setStatusMessage("Avvio del gioco in corso...");
    await invokeTauri("launch_game", { gameId });
    setStatusMessage("Gioco in esecuzione (Tracking kernel zero-CPU)");
  };

  const handleOpenFolder = (folderType: string) => {
    invokeTauri("open_folder", { folderType });
  };

  const installedRatio = counts.total > 0 ? (counts.installed / counts.total) * 100 : 0;

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

      {/* =========================================================================
          MODALITA 1: FULLSCREEN BIG PICTURE 10-FOOT UI
      ========================================================================= */}
      {isBigPicture ? (
        <div
          className="relative flex flex-col h-screen w-screen overflow-hidden transition-colors duration-500"
          style={{ backgroundColor: "var(--bg-base)" }}
        >
          {/* Ambient Cinema Backdrop */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            {focusedGame?.background_image ? (
              <img
                src={focusedGame.background_image}
                alt="Backdrop"
                className="w-full h-full object-cover opacity-25 filter blur-2xl scale-110 transition-all duration-700"
              />
            ) : focusedGame?.cover_image ? (
              <img
                src={focusedGame.cover_image}
                alt="Backdrop"
                className="w-full h-full object-cover opacity-20 filter blur-3xl scale-125 transition-all duration-700"
              />
            ) : (
              <div
                className="w-full h-full opacity-20"
                style={{
                  background: `radial-gradient(circle at 50% 30%, var(--accent-primary), transparent 70%)`,
                }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to top, var(--bg-base) 0%, transparent 80%)`,
              }}
            />
          </div>

          {/* 10-FOOT TOP BAR */}
          <header
            onMouseDown={handleStartDragging}
            onDoubleClick={handleToggleMaximize}
            data-tauri-drag-region
            className="relative z-20 flex items-center justify-between px-10 py-5 border-b cursor-default select-none"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  boxShadow: `0 0 20px var(--accent-glow)`,
                }}
              >
                <Tv className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-lg tracking-wider text-white">OMNIS BIG PICTURE</span>
                <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                  Modalità Fullscreen & Controller TV
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Gamepad Connection Badge */}
              <div
                className={`flex items-center gap-2.5 px-4 py-2 rounded-full border text-xs font-bold transition-all ${
                  gamepadConnected
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                    : "border-slate-700/40 text-slate-400"
                }`}
                style={{ backgroundColor: !gamepadConnected ? "var(--bg-card)" : undefined }}
              >
                <Gamepad2 className={`w-4 h-4 ${gamepadConnected ? "animate-pulse" : ""}`} />
                <span>{gamepadConnected ? gamepadName : "Controller pronto (Gamepad API)"}</span>
              </div>

              {/* Virtual Keyboard / Search Shortcut */}
              <button
                onClick={() => {
                  soundEffects.playSelect();
                  setShowVirtualKeyboard(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold text-white transition-all shadow-md group hover:border-white/40"
                style={{
                  backgroundColor: searchQuery ? "var(--accent-primary)" : "var(--bg-card)",
                  borderColor: searchQuery ? "var(--accent-primary)" : "var(--border-color)",
                  boxShadow: searchQuery ? `0 0 15px var(--accent-glow)` : undefined,
                }}
                title="Apri Tastiera Virtuale / Cerca nella Libreria (Y)"
              >
                <Search className="w-4 h-4" />
                <span>{searchQuery ? `Ricerca: "${searchQuery}"` : "Cerca"}</span>
                <span className="w-5 h-5 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-[10px] font-black text-amber-300">
                  Y
                </span>
              </button>

              {/* Sound Effects Toggle Button */}
              <button
                onClick={handleToggleSound}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold text-white transition-all shadow-md hover:bg-white/10"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: soundEnabled ? "var(--text-primary)" : "var(--text-muted)",
                }}
                title={soundEnabled ? "Effetti sonori UI attivi (Clicca per silenziare)" : "Effetti sonori UI mutati (Clicca per attivare)"}
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                )}
                <span>{soundEnabled ? "Audio ON" : "Audio OFF"}</span>
              </button>

              {/* Theme Shortcut */}
              <button
                onClick={() => {
                  soundEffects.playSelect();
                  setShowThemeModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold text-white transition-all shadow-md"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <Palette className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
                <span>Tema: {currentTheme.name}</span>
              </button>

              {/* Plugin Shortcut */}
              <button
                onClick={() => {
                  loadProvidersAndConfig();
                  setShowPluginModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold text-white transition-all shadow-md"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <Puzzle className="w-4 h-4 text-indigo-400" />
                <span>Plugin Metadati</span>
              </button>


              {/* Exit Fullscreen */}
              <button
                type="button"
                onClick={toggleBigPicture}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-lg shrink-0"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  boxShadow: `0 0 15px var(--accent-glow)`,
                }}
              >
                <Minimize2 className="w-4 h-4" />
                <span>{t('big_picture.exit_hint')}</span>
              </button>

              {/* Big Picture Window Controls */}
              <div
                className="flex items-center gap-1 shrink-0 ml-2 pl-2 border-l border-white/10 z-50"
                data-no-drag="true"
              >
                <button
                  type="button"
                  onClick={handleMinimize}
                  className="w-8 h-8 rounded-lg hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-all cursor-pointer text-slate-400 hover:text-white"
                  title="Riduci a icona"
                  data-no-drag="true"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-8 h-8 rounded-lg hover:bg-rose-600 hover:text-white active:bg-rose-700 flex items-center justify-center transition-all cursor-pointer text-slate-400"
                  title="Chiudi applicazione"
                  data-no-drag="true"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </header>

          {/* CATEGORY SELECTOR PILLS (LB / RB SWITCHABLE) */}
          <div className="relative z-20 flex items-center justify-center gap-2 px-10 my-4">
            <span
              className="text-[11px] font-black tracking-widest px-2 py-1 rounded border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: "var(--text-muted)",
              }}
            >
              LB
            </span>
            <div className="flex items-center gap-2 overflow-x-auto py-1">
              {[
                { id: "all", label: "Tutti i Giochi", count: counts.total },
                { id: "installed", label: "Installati", count: counts.installed },
                { id: "recent", label: "Giocati di Recente", count: counts.recent },
                { id: "favorites", label: "Preferiti (90+)", count: counts.favorites },
                { id: "steam", label: "Steam", count: counts.steam },
                { id: "epic", label: "Epic Games", count: counts.epic },
                { id: "gog", label: "GOG Galaxy", count: counts.gog },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    soundEffects.playNav();
                    setActiveFilter(f.id);
                    setFocusedIndex(0);
                  }}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-extrabold transition-all border"
                  style={{
                    backgroundColor: activeFilter === f.id ? "var(--accent-primary)" : "var(--bg-card)",
                    borderColor: activeFilter === f.id ? "var(--accent-primary)" : "var(--border-color)",
                    color: activeFilter === f.id ? "#ffffff" : "var(--text-muted)",
                    boxShadow: activeFilter === f.id ? `0 0 15px var(--accent-glow)` : undefined,
                  }}
                >
                  {(f.id === "steam" || f.id === "epic" || f.id === "gog") && (
                    <StoreIcon library={f.id} className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{f.label}</span>
                  <span className="opacity-70 font-mono text-[11px]">({f.count})</span>
                </button>
              ))}
            </div>
            <span
              className="text-[11px] font-black tracking-widest px-2 py-1 rounded border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: "var(--text-muted)",
              }}
            >
              RB
            </span>
          </div>

          {/* MAIN HERO STAGE */}
          <div className="relative z-10 flex-1 flex flex-col justify-end px-16 pb-8">
            <div className="max-w-3xl mb-8 space-y-4">
              <div className="flex items-center gap-3">
                {focusedGame && (
                  <StoreBadge library={focusedGame.library} showName={true} className="py-1 px-3 text-xs" />
                )}
                {focusedGame?.is_installed && (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    INSTALLATO
                  </span>
                )}
                {focusedGame?.critic_score && (
                  <span className="px-3 py-1 rounded-md text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    ★ {focusedGame.critic_score} METACRITIC
                  </span>
                )}
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Tempo di gioco: <strong className="text-white">{focusedGame?.playtime_formatted}</strong>
                </span>
              </div>

              <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-md">
                {focusedGame?.title}
              </h1>

              <p
                className="text-sm line-clamp-2 leading-relaxed max-w-2xl font-normal drop-shadow"
                style={{ color: "var(--text-muted)" }}
              >
                {focusedGame?.description || "Nessuna descrizione disponibile per questo titolo."}
              </p>

              {/* ACTION BUTTONS WITH CONTROLLER HINTS */}
              <div className="flex items-center gap-4 pt-2">
                <button
                  onClick={() => focusedGame && handleLaunch(focusedGame.id)}
                  className="flex items-center gap-3 px-8 py-4 rounded-2xl text-base font-black text-white transition-all hover:brightness-110 active:opacity-90 shadow-2xl"
                  style={{
                    backgroundColor: "var(--accent-primary)",
                    boxShadow: `0 0 30px var(--accent-glow)`,
                  }}
                >
                  <Play className="w-5 h-5 fill-white" />
                  <span>{t('big_picture.play_action')}</span>
                  <span className="w-6 h-6 rounded-full bg-black/30 flex items-center justify-center text-[11px] font-black border border-white/20">
                    A
                  </span>
                </button>

                <button
                  onClick={() => {
                    soundEffects.playSelect();
                    setShowFullscreenDetails(true);
                  }}
                  className="flex items-center gap-2.5 px-6 py-4 rounded-2xl text-white text-sm font-bold border transition-all hover:bg-white/10 active:opacity-90 backdrop-blur-md"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <Info className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
                  <span>{t('big_picture.details_action')}</span>
                  <span className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center text-[10px] font-black border border-white/20">
                    X
                  </span>
                </button>

                <button
                  onClick={() => {
                    soundEffects.playSelect();
                    handleSync();
                  }}
                  className="flex items-center gap-2.5 px-6 py-4 rounded-2xl text-white text-sm font-bold border transition-all backdrop-blur-md"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-white" : ""}`} />
                  <span>{t('common.refresh')}</span>
                </button>
              </div>
            </div>

            {/* HORIZONTAL CAROUSEL SHELF */}
            <div className="w-full">
              <div
                className="flex items-center justify-between mb-3 text-xs font-bold"
                style={{ color: "var(--text-muted)" }}
              >
                <span>{t('big_picture.catalog_title', { count: filteredGames.length })}</span>
                <span>{t('big_picture.nav_hint')}</span>
              </div>

              <div
                ref={carouselRef}
                className="flex items-center gap-6 overflow-x-auto pb-4 pt-2 px-2 scrollbar-none scroll-smooth"
              >
                {filteredGames.map((game, idx) => {
                  const isFocused = idx === focusedIndex;
                  return (
                    <div
                      key={game.id}
                      onClick={() => {
                        soundEffects.playSelect();
                        setFocusedIndex(idx);
                        setSelectedGame(game);
                        if (isFocused) {
                          setShowFullscreenDetails(true);
                        }
                      }}
                      onDoubleClick={() => {
                        soundEffects.playSelect();
                        setShowFullscreenDetails(true);
                      }}
                      className={`relative flex-shrink-0 w-44 aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform ${
                        isFocused
                          ? "scale-110 z-20 shadow-2xl ring-4"
                          : "scale-95 opacity-60 hover:opacity-90 hover:scale-100"
                      }`}
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: isFocused ? "var(--accent-primary)" : "var(--border-color)",
                        boxShadow: isFocused ? `0 0 30px var(--accent-glow)` : undefined,
                      }}
                    >
                      {game.cover_image ? (
                        <img
                          src={game.cover_image}
                          alt={game.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex flex-col justify-between p-4"
                          style={{ backgroundColor: "var(--bg-card)" }}
                        >
                          <StoreBadge library={game.library} showName={true} />
                          <span className="font-black text-sm text-white line-clamp-3 leading-snug">
                            {game.title}
                          </span>
                          <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                            {game.playtime_formatted}
                          </span>
                        </div>
                      )}

                      <div className="absolute top-2.5 right-2.5">
                        <StoreBadge library={game.library} />
                      </div>

                      {isFocused && (
                        <div
                          className="absolute bottom-2.5 left-2.5 right-2.5 px-3 py-1 rounded-lg bg-black/80 backdrop-blur-md text-center text-xs font-black text-white border border-white/20 truncate"
                        >
                          {game.title}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* BOTTOM CONTROLLER LEGEND */}
          <footer
            className="relative z-20 h-14 backdrop-blur-xl border-t flex items-center justify-between px-10 text-xs font-bold"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black shadow">
                  A
                </span>
                <span>Avvia Gioco</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-black shadow">
                  B
                </span>
                <span>Indietro / Chiudi</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-black shadow">
                  X
                </span>
                <span>Scheda Dettagli</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-black shadow">
                  Y
                </span>
                <span>Temi Grafici</span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-black border"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  LB / RB
                </span>
                <span>Cambia Categoria</span>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-black border"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  SELECT / F11
                </span>
                <span>Torna al Desktop</span>
              </div>
            </div>
          </footer>

          {/* FULLSCREEN GAME DETAILS DRAWER */}
          {showFullscreenDetails && focusedGame && (
            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-2xl flex items-center justify-center p-12">
              <div
                className="relative max-w-4xl w-full rounded-3xl border p-8 space-y-6 shadow-2xl"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className="w-24 aspect-[2/3] rounded-xl overflow-hidden shadow-lg border border-white/10">
                      {focusedGame.cover_image ? (
                        <img src={focusedGame.cover_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center font-bold text-white"
                          style={{ backgroundColor: "var(--accent-primary)" }}
                        >
                          {focusedGame.title.slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <div>
                      <h2 className="text-3xl font-black text-white">{focusedGame.title}</h2>
                      <p className="text-sm mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
                        Sviluppato da: <span className="text-white font-bold">{focusedGame.developers.join(", ") || "N/A"}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <StoreBadge library={focusedGame.library} showName={true} />
                        {focusedGame.genres.map((g) => (
                          <span
                            key={g}
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                            style={{
                              backgroundColor: "var(--bg-card)",
                              borderColor: "var(--border-color)",
                              color: "var(--text-primary)",
                            }}
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowFullscreenDetails(false)}
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-black tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                    Sinossi & Descrizione
                  </span>
                  <p className="text-sm leading-relaxed max-h-48 overflow-y-auto pr-2" style={{ color: "var(--text-primary)" }}>
                    {focusedGame.description || "Nessuna descrizione disponibile."}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div
                    className="p-4 rounded-xl border"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                      Data di Rilascio
                    </span>
                    <p className="text-base font-black text-white mt-1">{focusedGame.release_date || "N/A"}</p>
                  </div>
                  <div
                    className="p-4 rounded-xl border"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                      Metacritic Score
                    </span>
                    <p className="text-base font-black text-amber-400 mt-1">{focusedGame.critic_score || "N/A"} / 100</p>
                  </div>
                  <div
                    className="p-4 rounded-xl border"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                      Tempo Registrato
                    </span>
                    <p className="text-base font-black text-emerald-400 mt-1">{focusedGame.playtime_formatted}</p>
                  </div>
                </div>

                <div
                  className="flex justify-end gap-4 pt-4 border-t"
                  style={{ borderColor: "var(--border-color)" }}
                >
                  <button
                    onClick={() => {
                      soundEffects.playSelect();
                      setShowFullscreenDetails(false);
                    }}
                    className="px-6 py-3 rounded-xl text-xs font-bold border"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Chiudi (B)
                  </button>
                  <button
                    onClick={() => {
                      handleLaunch(focusedGame.id);
                      setShowFullscreenDetails(false);
                    }}
                    className="flex items-center gap-2 px-8 py-3 rounded-xl text-white text-xs font-black shadow-lg"
                    style={{
                      backgroundColor: "var(--accent-primary)",
                      boxShadow: `0 0 20px var(--accent-glow)`,
                    }}
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>AVVIA GIOCO (A)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* =========================================================================
            MODALITA 2: DESKTOP LAUNCHER MODE
        ========================================================================= */
        <div className="flex flex-col h-screen w-screen overflow-hidden">
          {/* TOP NAVIGATION & TITLEBAR */}
          <header
            onMouseDown={handleStartDragging}
            onDoubleClick={handleToggleMaximize}
            data-tauri-drag-region
            className="h-14 min-h-[56px] max-h-[56px] border-b flex items-center justify-between px-4 z-40 transition-colors duration-300 cursor-default select-none"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
            }}
          >
            {/* Left: Brand Logo & Segmented Switcher */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-all shrink-0"
                  style={{
                    backgroundColor: "var(--accent-primary)",
                    boxShadow: `0 0 15px var(--accent-glow)`,
                  }}
                >
                  <Zap className="w-4 h-4 text-white fill-white" />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="font-semibold text-sm tracking-wider text-white">OMNIS</span>
                  <span
                    className="font-extrabold text-[8px] tracking-widest uppercase"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    {currentTheme.name.split(" ")[0]} EDITION
                  </span>
                </div>
              </div>

              <div className="h-5 w-[1px]" style={{ backgroundColor: "var(--border-color)" }} />

              {/* Segmented View Switcher */}
              <div
                className="p-1 rounded-lg border flex items-center gap-1 shrink-0"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all"
                  style={{
                    backgroundColor: viewMode === "grid" ? "var(--accent-primary)" : "transparent",
                    color: viewMode === "grid" ? "#ffffff" : "var(--text-muted)",
                  }}
                  title={t('views.grid')}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{t('views.grid')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("details")}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all"
                  style={{
                    backgroundColor: viewMode === "details" ? "var(--accent-primary)" : "transparent",
                    color: viewMode === "details" ? "#ffffff" : "var(--text-muted)",
                  }}
                  title={t('views.details')}
                >
                  <PanelLeft className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{t('views.details')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all"
                  style={{
                    backgroundColor: viewMode === "list" ? "var(--accent-primary)" : "transparent",
                    color: viewMode === "list" ? "#ffffff" : "var(--text-muted)",
                  }}
                  title={t('views.list')}
                >
                  <TableProperties className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{t('views.list')}</span>
                </button>
              </div>
            </div>

            {/* Center: Search Bar */}
            <div className="flex-1 min-w-[100px] max-w-xs mx-2">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 absolute left-3 pointer-events-none" style={{ color: "var(--text-muted)" }} />
                <input
                  type="text"
                  placeholder={t('topbar.search_placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-9 pr-8 rounded-lg text-xs focus:outline-none transition-all border"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Right: Actions Bar */}
            <div className="flex items-center gap-1.5 shrink min-w-0">
              <button
                type="button"
                onClick={toggleBigPicture}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-extrabold text-white transition-all shadow-md hover:brightness-110 active:opacity-90 shrink-0"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  boxShadow: `0 0 15px var(--accent-glow)`,
                }}
                title="Avvia Modalità Fullscreen Big Picture (F11)"
              >
                <Tv className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{t('topbar.big_picture')}</span>
              </button>

              {/* Sound Effects Toggle */}
              <button
                type="button"
                onClick={handleToggleSound}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm hover:bg-white/10 active:opacity-90 shrink-0"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: soundEnabled ? "var(--text-primary)" : "var(--text-muted)",
                }}
                title={soundEnabled ? "Audio ON (Click to mute)" : "Audio OFF (Click to unmute)"}
              >
                {soundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="hidden 2xl:inline">{soundEnabled ? t('topbar.audio_on') : t('topbar.audio_off')}</span>
              </button>

              {/* Settings & Options (Language / Sound / Themes) */}
              <button
                type="button"
                onClick={() => {
                  soundEffects.playSelect();
                  setShowSettingsModal(true);
                }}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-90 shadow-sm shrink-0"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                title={t('topbar.options')}
              >
                <span className="text-sm leading-none">{currentLocaleInfo.flag}</span>
                <Settings className="w-3.5 h-3.5" style={{ color: "var(--accent-primary)" }} />
                <span className="hidden xl:inline">{t('topbar.options')}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowThemeModal(true)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-90 shrink-0"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                title="Gestione e Personalizzazione Temi"
              >
                <Palette className="w-3.5 h-3.5" style={{ color: "var(--accent-primary)" }} />
                <span className="hidden 2xl:inline">{t('topbar.themes')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  loadProvidersAndConfig();
                  setShowPluginModal(true);
                }}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-90 shadow-sm shrink-0"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                title="Centro Plugin & Fonti Metadati (SteamGridDB, OpenCritic, Steam)"
              >
                <Puzzle className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden 2xl:inline">{t('topbar.plugins')}</span>
                {providers.filter((p) => p.has_configured_key || !p.requires_api_key).length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowAddCustomModal(true)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 hover:border-slate-400 active:opacity-90 shadow-sm shrink-0"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                title="Aggiungi Gioco o Eseguibile Personalizzato (.exe)"
              >
                <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline">{t('topbar.add_game')}</span>
              </button>

              {selectedGame && (
                <button
                  type="button"
                  onClick={() => {
                    setGameToEdit(selectedGame);
                    setShowEditorModal(true);
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 hover:border-slate-400 active:opacity-90 shadow-sm shrink-0"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                  title={`Modifica manualmente le informazioni di '${selectedGame.title}'`}
                >
                  <Pencil className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden lg:inline">{t('topbar.edit_info')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing}
                className="p-1.5 rounded-lg border transition-all shrink-0"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                title="Sincronizza Librerie Esterne (Steam / Epic Games)"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-white" : ""}`} />
              </button>

              <button
                type="button"
                onClick={handleDownloadAll}
                disabled={isDownloading}
                className="p-1.5 rounded-lg border transition-all shrink-0"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                title="Scarica Metadati e Cover HD"
              >
                <Download className={`w-4 h-4 ${isDownloading ? "animate-bounce text-white" : ""}`} />
              </button>

              {/* Optional UI Zoom Controls (Visible on large displays) */}
              <div
                className="hidden 2xl:flex items-center gap-1 p-0.5 rounded-lg border shrink-0"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setUiZoom((z) => Math.max(0.7, z - 0.1))}
                  className="p-1 hover:text-white"
                  style={{ color: "var(--text-muted)" }}
                  title="Riduci Zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono px-1" style={{ color: "var(--text-primary)" }}>
                  {Math.round(uiZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setUiZoom((z) => Math.min(1.5, z + 0.1))}
                  className="p-1 hover:text-white"
                  style={{ color: "var(--text-muted)" }}
                  title="Aumenta Zoom"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Window Controls (ALWAYS pinned far-right, never shrink, always top z-index) */}
            <div
              className="flex items-center gap-1 shrink-0 ml-2 pl-2 border-l z-50"
              style={{ borderColor: "var(--border-color)" }}
              data-no-drag="true"
            >
              <button
                type="button"
                onClick={handleMinimize}
                className="w-8 h-8 rounded-md hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-all cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                title="Riduci a icona"
                data-no-drag="true"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleToggleMaximize}
                className="w-8 h-8 rounded-md hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-all cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                title="Ingrandisci / Ripristina finestra"
                data-no-drag="true"
              >
                <Square className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="w-8 h-8 rounded-md hover:bg-rose-600 hover:text-white active:bg-rose-700 flex items-center justify-center transition-all cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                title="Chiudi applicazione"
                data-no-drag="true"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </header>

          {/* MAIN BODY */}
          <div className="flex-1 flex overflow-hidden">
            {/* SIDEBAR NAVIGATION */}
            <aside
              className="w-64 min-w-[256px] max-w-[256px] border-r flex flex-col justify-between p-3 select-none transition-colors duration-300"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="flex flex-col gap-4 overflow-y-auto pr-1">
                {/* Profile card */}
                <div
                  className="p-3 rounded-xl border flex items-center gap-3 shadow-sm"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-black text-xs shadow-md"
                    style={{ backgroundColor: "var(--accent-primary)" }}
                  >
                    PG
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white leading-tight">Player One</span>
                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      {gamepadConnected ? gamepadName : "Pronto"}
                    </span>
                  </div>
                </div>

                {/* Section: Catalogo Giochi */}
                <div className="flex flex-col gap-1">
                  <span
                    className="text-[10px] font-black tracking-widest uppercase px-2 mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Catalogo Giochi
                  </span>
                  {[
                    { id: "all", label: "Tutti i Giochi", count: counts.total, icon: Gamepad2 },
                    { id: "installed", label: "Installati", count: counts.installed, icon: CheckCircle2 },
                    { id: "recent", label: "Giocati di Recente", count: counts.recent, icon: Clock },
                    { id: "favorites", label: "Preferiti (90+)", count: counts.favorites, icon: Star },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isActive = activeFilter === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveFilter(item.id)}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all"
                        style={{
                          backgroundColor: isActive ? "var(--accent-primary)" : "transparent",
                          color: isActive ? "#ffffff" : "var(--text-muted)",
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </div>
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: "var(--bg-card)" }}
                        >
                          {item.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Section: Store Collegati */}
                <div className="flex flex-col gap-1">
                  <span
                    className="text-[10px] font-black tracking-widest uppercase px-2 mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Store Collegati
                  </span>
                  {[
                    { id: "steam", label: "Steam", count: counts.steam },
                    { id: "epic", label: "Epic Games", count: counts.epic },
                    { id: "gog", label: "GOG Galaxy", count: counts.gog },
                  ].map((store) => {
                    const isActive = activeFilter === store.id;
                    return (
                      <button
                        key={store.id}
                        onClick={() => setActiveFilter(store.id)}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all"
                        style={{
                          backgroundColor: isActive ? "var(--accent-primary)" : "transparent",
                          color: isActive ? "#ffffff" : "var(--text-muted)",
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <StoreIcon library={store.id} className="w-4 h-4 shrink-0" />
                          <span>{store.label}</span>
                        </div>
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: "var(--bg-card)" }}
                        >
                          {store.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Section: Generi */}
                <div className="flex flex-col gap-1">
                  <span
                    className="text-[10px] font-black tracking-widest uppercase px-2 mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Generi
                  </span>
                  {[
                    { id: "action", label: "Azione", count: counts.action, icon: Swords },
                    { id: "rpg", label: "GDR / RPG", count: counts.rpg, icon: Scroll },
                    { id: "strategy", label: "Strategia", count: counts.strategy, icon: Dices },
                    { id: "indie", label: "Indie", count: counts.indie, icon: Sparkles },
                  ].map((genre) => {
                    const Icon = genre.icon;
                    const isActive = activeFilter === genre.id;
                    return (
                      <button
                        key={genre.id}
                        onClick={() => setActiveFilter(genre.id)}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all"
                        style={{
                          backgroundColor: isActive ? "var(--accent-primary)" : "transparent",
                          color: isActive ? "#ffffff" : "var(--text-muted)",
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4" />
                          <span>{genre.label}</span>
                        </div>
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: "var(--bg-card)" }}
                        >
                          {genre.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sidebar Footer */}
              <div
                className="pt-3 border-t flex flex-col gap-2.5"
                style={{ borderColor: "var(--border-color)" }}
              >
                <div className="flex flex-col gap-1 px-1">
                  <div className="flex justify-between text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
                    <span>Installati</span>
                    <span>
                      {counts.installed} / {counts.total} ({Math.round(installedRatio)}%)
                    </span>
                  </div>
                  <div
                    className="h-1.5 w-full rounded-full overflow-hidden"
                    style={{ backgroundColor: "var(--bg-card)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${installedRatio}%`,
                        backgroundColor: "var(--accent-primary)",
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1 pt-1">
                  <button
                    onClick={() => handleOpenFolder("db")}
                    className="p-1.5 rounded-lg text-[10px] font-bold flex flex-col items-center gap-1 border transition-all"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-muted)",
                    }}
                    title="Apri cartella Database"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>DB</span>
                  </button>
                  <button
                    onClick={() => handleOpenFolder("covers")}
                    className="p-1.5 rounded-lg text-[10px] font-bold flex flex-col items-center gap-1 border transition-all"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-muted)",
                    }}
                    title="Apri cartella Locandine"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Cover</span>
                  </button>
                  <button
                    onClick={() => handleOpenFolder("themes")}
                    className="p-1.5 rounded-lg text-[10px] font-bold flex flex-col items-center gap-1 border transition-all"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-muted)",
                    }}
                    title="Apri cartella Temi JSON"
                  >
                    <Palette className="w-3.5 h-3.5" />
                    <span>Temi</span>
                  </button>
                  <button
                    onClick={() => handleOpenFolder("plugins")}
                    className="p-1.5 rounded-lg text-[10px] font-bold flex flex-col items-center gap-1 border transition-all"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-muted)",
                    }}
                    title="Apri cartella Plugin"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Plug</span>
                  </button>
                </div>
              </div>
            </aside>

            {/* MAIN CATALOG VIEW */}
            <main
              className="flex-1 flex flex-col overflow-hidden transition-colors duration-300"
              style={{ backgroundColor: "var(--bg-base)" }}
            >
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
                      {t('views.group_by')}
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
                      <option value="none">{t('groups.none')}</option>
                      <option value="library">{t('groups.library')}</option>
                      <option value="is_installed">{t('groups.is_installed')}</option>
                      <option value="genre">{t('groups.genre')}</option>
                      <option value="developer">{t('groups.developer')}</option>
                      <option value="release_year">{t('groups.release_year')}</option>
                      <option value="completion_status">{t('groups.completion_status')}</option>
                    </select>
                  </div>

                  <div className="h-4 w-[1px]" style={{ backgroundColor: "var(--border-color)" }} />

                  <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                    {t('topbar.filtered_count', { count: filteredGames.length })}
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

              {/* VIEW 1: POSTER GRID VIEW WITH DYNAMIC GROUPING & ZOOM */}
              {viewMode === "grid" && (
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {filteredGames.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center p-8">
                      <Gamepad2 className="w-12 h-12 mb-3 opacity-30" style={{ color: "var(--text-muted)" }} />
                      <span className="text-sm font-bold text-white">Nessun gioco trovato</span>
                      <span className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        Prova a modificare i filtri o la query di ricerca.
                      </span>
                    </div>
                  ) : (
                    Object.entries(groupedGames).map(([groupName, groupGames]) => {
                      const isCollapsed = !!collapsedGroups[groupName];
                      const isGrouped = groupBy !== "none";

                      return (
                        <div key={groupName} className="space-y-3">
                          {isGrouped && (
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
                          )}

                          {!isCollapsed && (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: `repeat(auto-fill, minmax(${gridCardWidth}px, 1fr))`,
                                gap: "1.25rem",
                              }}
                            >
                              {groupGames.map((game) => (
                                <div
                                  key={game.id}
                                  onClick={() => {
                                    setSelectedGame(game);
                                    setViewMode("details");
                                  }}
                                  onContextMenu={(e) => handleOpenContextMenu(e, game)}
                                  className={`group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform hover:-translate-y-1 shadow-lg border ${
                                    selectedGame.id === game.id ? "ring-2" : ""
                                  }`}
                                  style={{
                                    backgroundColor: "var(--bg-card)",
                                    borderColor:
                                      selectedGame.id === game.id
                                        ? "var(--accent-primary)"
                                        : "var(--border-color)",
                                    boxShadow:
                                      selectedGame.id === game.id
                                        ? `0 0 20px var(--accent-glow)`
                                        : undefined,
                                  }}
                                >
                                  <div className="aspect-[2/3] w-full relative overflow-hidden bg-black/40">
                                    {game.cover_image ? (
                                      <img
                                        src={game.cover_image}
                                        alt={game.title}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                                        <span
                                          className="w-12 h-12 rounded-xl font-black text-lg flex items-center justify-center mb-1.5 shadow-inner"
                                          style={{
                                            backgroundColor: "var(--accent-glow)",
                                            color: "var(--accent-primary)",
                                          }}
                                        >
                                          {game.title.slice(0, 2).toUpperCase()}
                                        </span>
                                        <span className="text-[11px] font-bold text-white line-clamp-2 leading-tight">
                                          {game.title}
                                        </span>
                                      </div>
                                    )}

                                    {/* Top Left: Store Badge & Status */}
                                    <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10 pointer-events-none">
                                      <StoreBadge library={game.library} />
                                      {game.is_installed && (
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-md shadow-emerald-400/50" />
                                      )}
                                    </div>

                                    {/* Top Right: Score Badge */}
                                    {game.critic_score && (
                                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[9px] font-black text-amber-300 border border-white/10 z-10 shadow-sm pointer-events-none">
                                        ★ {game.critic_score}
                                      </div>
                                    )}

                                    {/* Transparent Minimalist Hover Action Dock */}
                                    <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3 p-2 transition-all duration-300 backdrop-blur-[1.5px]">
                                      {game.is_installed && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleLaunch(game.id);
                                          }}
                                          className="w-9 h-9 rounded-full bg-emerald-500/30 hover:bg-emerald-500/60 text-white border border-emerald-400/40 backdrop-blur-md shadow-xl flex items-center justify-center transition-all hover:brightness-125 active:opacity-80"
                                          title="Avvia Gioco"
                                        >
                                          <Play className="w-4 h-4 fill-white" />
                                        </button>
                                      )}

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedGame(game);
                                          setViewMode("details");
                                        }}
                                        className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/40 text-white border border-white/30 backdrop-blur-md shadow-xl flex items-center justify-center transition-all hover:brightness-125 active:opacity-80"
                                        title="Mostra Dettagli"
                                      >
                                        <Info className="w-4 h-4" />
                                      </button>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setGameToEdit(game);
                                          setShowEditorModal(true);
                                        }}
                                        className="w-9 h-9 rounded-full bg-indigo-500/25 hover:bg-indigo-500/50 text-indigo-200 hover:text-white border border-indigo-400/40 backdrop-blur-md shadow-xl flex items-center justify-center transition-all hover:brightness-125 active:opacity-80"
                                        title="Modifica Informazioni (Manuale)"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Bottom Info Bar */}
                                  <div className="p-2.5 flex flex-col gap-0.5">
                                    <span className="font-bold text-xs text-white truncate leading-snug" title={game.title}>
                                      {game.title}
                                    </span>
                                    <div
                                      className="flex items-center justify-between text-[10px]"
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      <span className="truncate">{game.playtime_formatted}</span>
                                      <span className="truncate max-w-[70px] text-right">
                                        {game.genres[0] || "Gioco"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* VIEW 2: DETAILS VIEW (SPLIT-PANEL: MASTER LIST + EXPANDED HERO DETAILS) */}
              {viewMode === "details" && selectedGame && (
                <div className="flex-1 flex overflow-hidden">
                  {/* Left Column: Titles Quick List (300px collapsible master panel) */}
                  <div
                    className={`border-r flex flex-col transition-all duration-300 select-none ${
                      detailsSidebarOpen ? "w-80 min-w-[300px] max-w-[320px]" : "w-11 min-w-[44px] max-w-[44px]"
                    }`}
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    {/* Master list header with search & collapse button */}
                    <div
                      className="p-2.5 border-b flex items-center justify-between gap-2"
                      style={{ borderColor: "var(--border-color)" }}
                    >
                      {detailsSidebarOpen ? (
                        <>
                          <div className="relative flex-1 flex items-center">
                            <Search
                              className="w-3.5 h-3.5 absolute left-2.5 pointer-events-none"
                              style={{ color: "var(--text-muted)" }}
                            />
                            <input
                              type="text"
                              placeholder="Filtra titoli..."
                              value={detailsSearchQuery}
                              onChange={(e) => setDetailsSearchQuery(e.target.value)}
                              className="w-full h-7 pl-8 pr-7 rounded-lg text-xs focus:outline-none border"
                              style={{
                                backgroundColor: "var(--bg-card)",
                                borderColor: "var(--border-color)",
                                color: "var(--text-primary)",
                              }}
                            />
                            {detailsSearchQuery && (
                              <button
                                onClick={() => setDetailsSearchQuery("")}
                                className="absolute right-2 text-slate-400 hover:text-white"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => setDetailsSidebarOpen(false)}
                            className="p-1.5 rounded-lg border hover:text-white transition-colors"
                            style={{
                              backgroundColor: "var(--bg-card)",
                              borderColor: "var(--border-color)",
                              color: "var(--text-muted)",
                            }}
                            title="Collassa elenco laterale"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDetailsSidebarOpen(true)}
                          className="w-full py-1.5 flex items-center justify-center rounded-lg border hover:text-white transition-colors"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-color)",
                            color: "var(--text-muted)",
                          }}
                          title="Espandi elenco laterale"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Master list of games */}
                    {detailsSidebarOpen && (
                      <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: "var(--border-color)" }}>
                        {detailsFilteredGames.map((game) => {
                          const isSelected = selectedGame.id === game.id;
                          const thumb = game.icon_image || game.cover_image;

                          return (
                            <div
                              key={game.id}
                              onClick={() => setSelectedGame(game)}
                              onContextMenu={(e) => handleOpenContextMenu(e, game)}
                              className={`p-2.5 flex items-center gap-3 cursor-pointer transition-all ${
                                isSelected ? "border-l-4" : "hover:bg-white/[0.04]"
                              }`}
                              style={{
                                backgroundColor: isSelected ? "var(--bg-card)" : "transparent",
                                borderLeftColor: isSelected ? "var(--accent-primary)" : "transparent",
                              }}
                            >
                              <div
                                className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center border shrink-0 shadow-sm"
                                style={{
                                  backgroundColor: "var(--bg-surface)",
                                  borderColor: "var(--border-color)",
                                }}
                              >
                                {thumb ? (
                                  <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                  <div
                                    className="w-full h-full flex items-center justify-center text-[10px] font-black"
                                    style={{
                                      backgroundColor: "var(--accent-glow)",
                                      color: "var(--accent-primary)",
                                    }}
                                  >
                                    {game.title.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <span
                                  className={`text-xs font-bold truncate block ${
                                    isSelected ? "text-white" : "text-slate-300"
                                  }`}
                                  title={game.title}
                                >
                                  {game.title}
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <StoreBadge library={game.library} className="py-0 px-1 text-[9px]" />
                                  {game.is_installed && (
                                    <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                      Installato
                                    </span>
                                  )}
                                  <span className="text-[10px] font-mono ml-auto" style={{ color: "var(--text-muted)" }}>
                                    {game.playtime_formatted}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Expanded Hero Details Panel */}
                  <div className="flex-1 flex flex-col overflow-y-auto">
                    {/* Top Bar with Back Button & Breadcrumbs */}
                    <div
                      className="px-8 py-3 border-b flex items-center justify-between shrink-0 z-20"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-color)",
                      }}
                    >
                      <button
                        onClick={() => setViewMode("grid")}
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-black transition-all hover:bg-white/10 hover:border-slate-400 active:opacity-90 shadow-sm"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <ArrowLeft className="w-3.5 h-3.5" style={{ color: "var(--accent-primary)" }} />
                        <span>{t('game_details.back_to_grid')}</span>
                      </button>

                      <div
                        className="flex items-center gap-2 text-xs font-semibold"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <span>Libreria</span>
                        <span>/</span>
                        <StoreBadge library={selectedGame.library} showName={true} />
                        <span>/</span>
                        <span className="text-white font-bold">{selectedGame.title}</span>
                      </div>
                    </div>

                    {/* Hero Background Full-Width with Ambient Gradient */}
                    <div className="relative h-88 min-h-[340px] w-full overflow-hidden flex items-end p-8">
                      {selectedGame.background_image ? (
                        <img
                          src={selectedGame.background_image}
                          alt="Hero"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : selectedGame.cover_image ? (
                        <img
                          src={selectedGame.cover_image}
                          alt="Hero"
                          className="absolute inset-0 w-full h-full object-cover filter blur-md scale-110 opacity-40"
                        />
                      ) : (
                        <div
                          className="absolute inset-0 opacity-40"
                          style={{
                            background: `linear-gradient(135deg, var(--accent-primary), var(--bg-base))`,
                          }}
                        />
                      )}
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(to top, var(--bg-base) 0%, rgba(9, 12, 20, 0.6) 60%, transparent 100%)`,
                        }}
                      />

                      <div className="relative z-10 flex items-end gap-6 w-full">
                        {/* 3D Boxart Cover with Border & Shadow */}
                        <div className="w-40 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 flex-shrink-0 bg-black/60">
                          {selectedGame.cover_image ? (
                            <img
                              src={selectedGame.cover_image}
                              alt=""
                              className="w-full h-full object-cover shadow-inner"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex flex-col items-center justify-center font-black text-2xl text-white"
                              style={{ backgroundColor: "var(--bg-card)" }}
                            >
                              <span>{selectedGame.title.slice(0, 2).toUpperCase()}</span>
                            </div>
                          )}
                        </div>

                        {/* Title, Badges & Hero Actions */}
                        <div className="space-y-3.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StoreBadge
                              library={selectedGame.library}
                              showName={true}
                              className="py-1 px-3 text-xs"
                            />
                            {selectedGame.is_installed ? (
                              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                INSTALLATO
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded text-[10px] font-medium bg-slate-800/60 text-slate-400 border border-slate-700/60">
                                DISPONIBILE
                              </span>
                            )}
                            {selectedGame.critic_score && (
                              <span className="px-2.5 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
                                ★ {selectedGame.critic_score}
                              </span>
                            )}
                            {selectedGame.series && (
                              <span
                                className="px-2.5 py-0.5 rounded text-[10px] font-bold border"
                                style={{
                                  backgroundColor: "var(--bg-card)",
                                  borderColor: "var(--border-color)",
                                  color: "var(--text-primary)",
                                }}
                              >
                                Serie: {selectedGame.series}
                              </span>
                            )}
                          </div>

                          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-md">
                            {selectedGame.title}
                          </h1>

                          {/* Action Buttons Bar */}
                          <div className="flex flex-wrap items-center gap-3 pt-2">
                            <button
                              onClick={() => handleLaunch(selectedGame.id)}
                              className="flex items-center gap-2.5 px-6 py-3 rounded-xl font-black text-xs text-white shadow-xl transition-all hover:brightness-110 active:opacity-90"
                              style={{
                                backgroundColor: "var(--accent-primary)",
                                boxShadow: `0 0 25px var(--accent-glow)`,
                              }}
                            >
                              <Play className="w-4 h-4 fill-white" />
                              <span>{selectedGame.is_installed ? t('game_details.play_now') : t('game_details.install_now')}</span>
                            </button>

                            <button
                              onClick={() => handleEnrichSingleGame(selectedGame.id)}
                              disabled={isEnrichingSingle}
                              className="flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold text-white transition-all backdrop-blur-md hover:bg-white/15 hover:border-slate-400 active:opacity-90"
                              style={{
                                backgroundColor: "var(--bg-card)",
                                borderColor: "var(--border-color)",
                              }}
                              title="Arricchisci con Diamond Pipeline (SteamGridDB + OpenCritic + Steam)"
                            >
                              <Sparkles
                                className={`w-3.5 h-3.5 ${
                                  isEnrichingSingle ? "animate-spin text-amber-400" : "text-amber-400"
                                }`}
                              />
                              <span>
                                {isEnrichingSingle ? t('game_details.enriching') : t('game_details.enrich_pipeline')}
                              </span>
                            </button>

                            <button
                              onClick={() => {
                                setGameToEdit(selectedGame);
                                setShowEditorModal(true);
                              }}
                              className="flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold text-white transition-all backdrop-blur-md hover:bg-white/15 hover:border-indigo-400 active:opacity-90 shadow-md"
                              style={{
                                backgroundColor: "var(--bg-card)",
                                borderColor: "var(--accent-primary)",
                              }}
                              title="Modifica manualmente tutti i metadati, immagini, percorsi e azioni di avvio"
                            >
                              <Pencil className="w-4 h-4 text-indigo-400" />
                              <span>{t('game_details.edit_manual')}</span>
                            </button>

                            <button
                              onClick={() => {
                                setGameToResolve(selectedGame);
                                setShowResolutionModal(true);
                              }}
                              className="flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold text-white transition-all backdrop-blur-md hover:bg-white/15 hover:border-slate-400 active:opacity-90"
                              style={{
                                backgroundColor: "var(--bg-card)",
                                borderColor: "var(--border-color)",
                              }}
                              title="Cerca e risolvi metadati da Steam, SteamGridDB o OpenCritic"
                            >
                              <Search className="w-3.5 h-3.5 text-sky-400" />
                              <span>{t('game_details.identify_metadata')}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Information Cards & Metadata Tabs */}
                    <div className="p-8 space-y-6">
                      {/* Card 1: Synopsis & Description */}
                      <div
                        className="p-6 rounded-2xl border space-y-3 shadow-md"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border-color)",
                        }}
                      >
                        <span
                          className="text-xs font-black tracking-widest uppercase flex items-center gap-2"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{t('game_details.description')}</span>
                        </span>
                        <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                          {selectedGame.description || t('game_details.no_description')}
                        </p>
                      </div>

                      {/* Card 2: Technical Parameters Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div
                          className="p-4 rounded-xl border space-y-1 shadow-sm"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-color)",
                          }}
                        >
                          <span
                            className="text-[10px] font-bold uppercase"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {t('game_details.series')}
                          </span>
                          <p className="text-xs font-black text-white truncate">
                            {selectedGame.series || "N/A"}
                          </p>
                        </div>

                        <div
                          className="p-4 rounded-xl border space-y-1 shadow-sm"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-color)",
                          }}
                        >
                          <span
                            className="text-[10px] font-bold uppercase"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {t('game_details.developers')}
                          </span>
                          <p className="text-xs font-black text-white truncate">
                            {selectedGame.developers.join(", ") || "N/A"}
                          </p>
                        </div>

                        <div
                          className="p-4 rounded-xl border space-y-1 shadow-sm"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-color)",
                          }}
                        >
                          <span
                            className="text-[10px] font-bold uppercase"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {t('game_details.genres')}
                          </span>
                          <p className="text-xs font-black text-white truncate">
                            {selectedGame.genres.join(", ") || "N/A"}
                          </p>
                        </div>

                        <div
                          className="p-4 rounded-xl border space-y-1 shadow-sm"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-color)",
                          }}
                        >
                          <span
                            className="text-[10px] font-bold uppercase"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {t('game_details.release_date')}
                          </span>
                          <p className="text-xs font-black text-white truncate">
                            {selectedGame.release_date || "N/A"}
                          </p>
                        </div>

                        <div
                          className="p-4 rounded-xl border space-y-1 shadow-sm"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-color)",
                          }}
                        >
                          <span
                            className="text-[10px] font-bold uppercase"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {t('game_details.playtime')}
                          </span>
                          <p className="text-xs font-black text-emerald-400 truncate">
                            {selectedGame.playtime_formatted}
                          </p>
                        </div>

                        <div
                          className="p-4 rounded-xl border space-y-1 shadow-sm"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-color)",
                          }}
                        >
                          <span
                            className="text-[10px] font-bold uppercase"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {t('groups.completion_status')}
                          </span>
                          <p className="text-xs font-black text-indigo-400 truncate">
                            {selectedGame.completion_status || t('game_details.not_played')}
                          </p>
                        </div>

                        <div
                          className="p-4 rounded-xl border space-y-1 shadow-sm"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-color)",
                          }}
                        >
                          <span
                            className="text-[10px] font-bold uppercase"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {t('game_details.critic_score')}
                          </span>
                          <p className="text-xs font-black text-amber-400 truncate">
                            {selectedGame.critic_score ? `★ ${selectedGame.critic_score}` : "N/A"}
                          </p>
                        </div>

                        <div
                          className="p-4 rounded-xl border space-y-1 shadow-sm"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-color)",
                          }}
                        >
                          <span
                            className="text-[10px] font-bold uppercase"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {t('game_details.publishers')}
                          </span>
                          <p className="text-xs font-black text-white truncate">
                            {(selectedGame.publishers && selectedGame.publishers.join(", ")) || "N/A"}
                          </p>
                        </div>
                      </div>

                      {/* Card 3: Player Notes */}
                      <div
                        className="p-6 rounded-2xl border space-y-3 shadow-md"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border-color)",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="text-xs font-black tracking-widest uppercase flex items-center gap-2"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{t('game_details.player_notes')}</span>
                          </span>
                          <button
                            onClick={() => {
                              setGameToEdit(selectedGame);
                              setShowEditorModal(true);
                            }}
                            className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                          >
                            {t('common.edit')}
                          </button>
                        </div>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap text-slate-300">
                          {selectedGame.user_notes ||
                            "Nessuna nota personale per questo gioco. Clicca su Modifica Scheda per aggiungere appunti, strategie o guide."}
                        </p>
                      </div>

                      {/* Card 4: Custom Links */}
                      {selectedGame.custom_links && selectedGame.custom_links.length > 0 && (
                        <div
                          className="p-6 rounded-2xl border space-y-3 shadow-md"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-color)",
                          }}
                        >
                          <span
                            className="text-xs font-black tracking-widest uppercase flex items-center gap-2"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{t('game_details.custom_links')}</span>
                          </span>
                          <div className="flex flex-wrap gap-2.5 pt-1">
                            {selectedGame.custom_links.map((lnk, idx) => (
                              <a
                                key={idx}
                                href={lnk.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold text-white transition-all hover:bg-white/15 hover:border-indigo-400 active:opacity-90 shadow-sm"
                                style={{
                                  backgroundColor: "var(--bg-surface)",
                                  borderColor: "var(--border-color)",
                                }}
                              >
                                <span>{lnk.title}</span>
                                <ExternalLink className="w-3 h-3 text-indigo-400" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW 3: HIGH-PERFORMANCE SPREADSHEET LIST VIEW */}
              {viewMode === "list" && (
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {filteredGames.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center p-8">
                      <Gamepad2 className="w-12 h-12 mb-3 opacity-30" style={{ color: "var(--text-muted)" }} />
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
                        <div
                          key={groupName}
                          className="rounded-xl border overflow-hidden shadow-md"
                          style={{ borderColor: "var(--border-color)" }}
                        >
                          <button
                            onClick={() => toggleGroup(groupName)}
                            className="w-full flex items-center justify-between py-2.5 px-4 transition-all text-left group"
                            style={{
                              backgroundColor: "var(--bg-surface)",
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
                              onContextMenu={(e, g) => handleOpenContextMenu(e, g as unknown as GameDto)}
                              isGroupedChild={true}
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

          {/* DESKTOP STATUS BAR */}
          <footer
            className="h-7 min-h-[28px] max-h-[28px] border-t flex items-center justify-between px-4 text-[10px] font-semibold"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
              color: "var(--text-muted)",
            }}
          >
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {statusMessage}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <span>F11: Attiva Big Picture Mode</span>
              <span>Tema Attivo: <strong className="text-white">{currentTheme.name}</strong></span>
            </div>
          </footer>
        </div>
      )}

      {/* =========================================================================
          THEME MANAGER MODAL (DISTINCT TABS: SELECT vs CREATE)
      ========================================================================= */}
      {showThemeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div
            className="relative max-w-2xl w-full rounded-3xl border p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
            }}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: "var(--border-color)" }}>
              <div className="flex items-center gap-3">
                <Palette className="w-5 h-5" style={{ color: "var(--accent-primary)" }} />
                <h3 className="text-lg font-black text-white">Gestione Temi & Personalizzazione</h3>
              </div>
              <button
                onClick={() => setShowThemeModal(false)}
                className="w-8 h-8 rounded-full border flex items-center justify-center font-bold"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-muted)",
                }}
              >
                ✕
              </button>
            </div>

            {/* TAB SELECTOR: TEMI DISPONIBILI vs CREA TEMA */}
            <div
              className="flex p-1 rounded-xl border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <button
                onClick={() => setThemeModalTab("list")}
                className="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center"
                style={{
                  backgroundColor: themeModalTab === "list" ? "var(--accent-primary)" : "transparent",
                  color: themeModalTab === "list" ? "#ffffff" : "var(--text-muted)",
                }}
              >
                Temi Disponibili ({themes.length})
              </button>
              <button
                onClick={() => {
                  setThemeModalTab("create");
                  // Initialize draft with currently selected theme colors
                  setNewThemeDraft({
                    id: "custom_" + Date.now(),
                    name: "Tema Personalizzato",
                    description: "Tema creato con colori custom",
                    author: "Utente",
                    bg_base: currentTheme.bg_base,
                    bg_surface: currentTheme.bg_surface,
                    bg_card: currentTheme.bg_card,
                    text_primary: currentTheme.text_primary,
                    text_muted: currentTheme.text_muted,
                    accent_primary: currentTheme.accent_primary,
                    accent_glow: currentTheme.accent_glow,
                    border_color: currentTheme.border_color,
                    card_radius: currentTheme.card_radius,
                    font_family: currentTheme.font_family,
                  });
                }}
                className="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: themeModalTab === "create" ? "var(--accent-primary)" : "transparent",
                  color: themeModalTab === "create" ? "#ffffff" : "var(--text-muted)",
                }}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Crea Nuovo Tema</span>
              </button>
            </div>

            {/* TAB 1: LISTA TEMI DISPONIBILI */}
            {themeModalTab === "list" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                    Scegli un tema da applicare all'istante
                  </span>
                  <button
                    onClick={() => handleOpenFolder("themes")}
                    className="flex items-center gap-1.5 text-xs font-bold"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Apri Cartella Temi JSON</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  {themes.map((t) => {
                    const isCurrent = currentTheme.id === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => selectTheme(t)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-3 shadow-md ${
                          isCurrent ? "ring-2" : "hover:border-slate-500"
                        }`}
                        style={{
                          backgroundColor: t.bg_card,
                          borderColor: isCurrent ? t.accent_primary : "var(--border-color)",
                          boxShadow: isCurrent ? `0 0 20px ${t.accent_glow}` : undefined,
                        }}
                      >
                        <div>
                          <div className="flex justify-between items-center">
                            <span className="font-extrabold text-sm text-white">{t.name}</span>
                            {isCurrent ? (
                              <span
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black text-white"
                                style={{ backgroundColor: t.accent_primary }}
                              >
                                <Check className="w-3 h-3" />
                                ATTIVO
                              </span>
                            ) : t.is_custom ? (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-indigo-500/20 text-indigo-300">
                                CUSTOM
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[11px] mt-1.5 line-clamp-2 leading-relaxed" style={{ color: t.text_muted }}>
                            {t.description}
                          </p>
                        </div>

                        {/* Swatches preview bar */}
                        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: t.border_color }}>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                              style={{ backgroundColor: t.bg_base }}
                              title="Colore Sfondo Base"
                            />
                            <span
                              className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                              style={{ backgroundColor: t.bg_surface }}
                              title="Colore Superficie"
                            />
                            <span
                              className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                              style={{ backgroundColor: t.accent_primary }}
                              title="Colore Accento Primario"
                            />
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              selectTheme(t);
                            }}
                            className="px-3 py-1 rounded-lg text-xs font-bold text-white transition-all shadow"
                            style={{
                              backgroundColor: isCurrent ? "rgba(255,255,255,0.15)" : t.accent_primary,
                            }}
                          >
                            {isCurrent ? "In Uso" : "Attiva"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: CREA NUOVO TEMA */}
            {themeModalTab === "create" && (
              <div
                className="p-5 rounded-2xl border space-y-4"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div className="space-y-1">
                  <span className="text-xs font-black tracking-widest uppercase text-white">
                    Editor Tema Personalizzato (Power User)
                  </span>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    I temi creati vengono salvati come file JSON standard in %LOCALAPPDATA%\OmnisGameLibrary\themes.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                      Nome del Tema
                    </label>
                    <input
                      type="text"
                      value={newThemeDraft.name || ""}
                      onChange={(e) => setNewThemeDraft({ ...newThemeDraft, name: e.target.value })}
                      className="w-full mt-1 p-2 rounded-lg border text-white font-bold"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-color)",
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                      Identificativo ID univoco
                    </label>
                    <input
                      type="text"
                      value={newThemeDraft.id || ""}
                      onChange={(e) => setNewThemeDraft({ ...newThemeDraft, id: e.target.value })}
                      className="w-full mt-1 p-2 rounded-lg border font-mono text-white"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-color)",
                      }}
                    />
                  </div>
                </div>

                {/* Color Pickers */}
                <div className="grid grid-cols-3 gap-3 text-xs pt-2">
                  <div
                    className="p-3 rounded-xl border flex flex-col gap-2"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <label className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                      Sfondo Base
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={newThemeDraft.bg_base || "#090c14"}
                        onChange={(e) => setNewThemeDraft({ ...newThemeDraft, bg_base: e.target.value })}
                        className="w-8 h-8 rounded border-none cursor-pointer"
                      />
                      <span className="font-mono text-[11px] text-white font-bold">{newThemeDraft.bg_base}</span>
                    </div>
                  </div>

                  <div
                    className="p-3 rounded-xl border flex flex-col gap-2"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <label className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                      Superficie Menu
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={newThemeDraft.bg_surface || "#0e1320"}
                        onChange={(e) => setNewThemeDraft({ ...newThemeDraft, bg_surface: e.target.value })}
                        className="w-8 h-8 rounded border-none cursor-pointer"
                      />
                      <span className="font-mono text-[11px] text-white font-bold">{newThemeDraft.bg_surface}</span>
                    </div>
                  </div>

                  <div
                    className="p-3 rounded-xl border flex flex-col gap-2"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <label className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                      Accento Primario
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={newThemeDraft.accent_primary || "#6366f1"}
                        onChange={(e) =>
                          setNewThemeDraft({
                            ...newThemeDraft,
                            accent_primary: e.target.value,
                            accent_glow: `${e.target.value}66`,
                          })
                        }
                        className="w-8 h-8 rounded border-none cursor-pointer"
                      />
                      <span className="font-mono text-[11px] text-white font-bold">{newThemeDraft.accent_primary}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    onClick={() => setThemeModalTab("list")}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold border"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-muted)",
                    }}
                  >
                    Annulla
                  </button>
                  <button
                    onClick={handleSaveCustomTheme}
                    className="px-6 py-2.5 rounded-xl font-black text-xs text-white shadow-lg transition-all"
                    style={{ backgroundColor: "var(--accent-primary)" }}
                  >
                    Crea, Salva & Applica Tema
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          METADATA PLUGIN & PIPELINE MODAL
      ========================================================================= */}
      {showPluginModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
          <div
            className="relative max-w-3xl w-full rounded-3xl border p-6 space-y-6 shadow-2xl max-h-[92vh] flex flex-col"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
            }}
          >
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b shrink-0" style={{ borderColor: "var(--border-color)" }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-lg"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <Puzzle className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    <span>Centro Plugin & Fonti Metadati</span>
                  </h3>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Gestisci fonti multiple, configura API Key personali e personalizza la cascata di fallback
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefreshPlugins}
                  disabled={isRefreshingPlugins}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                    color: isRefreshingPlugins ? "var(--accent-primary)" : "var(--text-muted)",
                  }}
                  title="Esegui scansione della cartella per scoprire nuovi plugin esterni"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingPlugins ? "animate-spin text-cyan-400" : ""}`} />
                  <span className="hidden sm:inline">Ricarica Plugin</span>
                </button>
                <button
                  onClick={() => handleOpenFolder("plugins")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-muted)",
                  }}
                  title="Apri Cartella Plugins in Esplora Risorse"
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cartella Plugins</span>
                </button>
                <button
                  onClick={() => setShowPluginModal(false)}
                  className="w-8 h-8 rounded-full border flex items-center justify-center font-bold"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-muted)",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* TAB SELECTOR: PROVIDERS vs PIPELINE vs ENRICH */}
            <div
              className="flex p-1 rounded-xl border shrink-0"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <button
                onClick={() => setPluginModalTab("providers")}
                className="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-2"
                style={{
                  backgroundColor: pluginModalTab === "providers" ? "var(--accent-primary)" : "transparent",
                  color: pluginModalTab === "providers" ? "#ffffff" : "var(--text-muted)",
                }}
              >
                <Puzzle className="w-3.5 h-3.5" />
                <span>Fonti & Provider ({providers.length})</span>
              </button>
              <button
                onClick={() => setPluginModalTab("pipeline")}
                className="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-2"
                style={{
                  backgroundColor: pluginModalTab === "pipeline" ? "var(--accent-primary)" : "transparent",
                  color: pluginModalTab === "pipeline" ? "#ffffff" : "var(--text-muted)",
                }}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Priorità Pipeline</span>
              </button>
              <button
                onClick={() => setPluginModalTab("enrich")}
                className="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-2"
                style={{
                  backgroundColor: pluginModalTab === "enrich" ? "var(--accent-primary)" : "transparent",
                  color: pluginModalTab === "enrich" ? "#ffffff" : "var(--text-muted)",
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Arricchimento Massivo</span>
              </button>
            </div>

            {/* MODAL CONTENT AREA (SCROLLABLE) */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* TAB 1: PROVIDER LIST & CONFIG */}
              {pluginModalTab === "providers" && (
                <div className="space-y-4">
                  {providers.map((prov) => {
                    const settings = editingSettings[prov.id] || {};
                    const isEyeOpen = showApiKey[prov.id] || false;
                    const testInfo = testStatus[prov.id];

                    return (
                      <div
                        key={prov.id}
                        className="p-5 rounded-2xl border space-y-4 transition-all"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border-color)",
                        }}
                      >
                        {/* Provider Header */}
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-md shrink-0"
                              style={{
                                backgroundColor:
                                  prov.is_builtin === false
                                    ? "#8b5cf6"
                                    : prov.id === "steamgriddb"
                                    ? "#00aaff"
                                    : prov.id === "opencritic"
                                    ? "#ff5900"
                                    : "#10b981",
                              }}
                            >
                              {prov.is_builtin === false
                                ? "EXT"
                                : prov.id === "steamgriddb"
                                ? "SG"
                                : prov.id === "opencritic"
                                ? "OC"
                                : "ST"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-black text-white">{prov.name}</h4>

                                {/* Built-in vs External Badge */}
                                {prov.is_builtin !== false ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm">
                                    Integrato (Core)
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/25 text-purple-300 border border-purple-500/40 shadow-sm">
                                    <Folder className="w-3 h-3 text-purple-400" />
                                    <span>Plugin Esterno {prov.version ? `v${prov.version}` : ""}</span>
                                  </span>
                                )}

                                {prov.requires_api_key ? (
                                  prov.has_configured_key ? (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Autenticato</span>
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                      <Key className="w-3 h-3" />
                                      <span>Richiede API Key</span>
                                    </span>
                                  )
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                    Zero-Config
                                  </span>
                                )}
                              </div>

                              <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                                {prov.description}
                              </p>

                              {prov.plugin_path && (
                                <div className="flex items-center gap-1.5 text-[10px] font-mono text-purple-300/80 mt-1.5 truncate">
                                  <Folder className="w-3 h-3 text-purple-400 shrink-0" />
                                  <span className="truncate" title={prov.plugin_path}>
                                    Percorso: {prov.plugin_path}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Enable/Disable Toggle */}
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleToggleProvider(prov.id, !prov.is_enabled)}
                              className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                                prov.is_enabled
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                  : "bg-slate-700/20 text-slate-400 border-slate-700/40"
                              }`}
                            >
                              {prov.is_enabled ? "Abilitato" : "Disabilitato"}
                            </button>
                          </div>
                        </div>

                        {/* Capabilities Chips */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                            Campi forniti:
                          </span>
                          {prov.supported_fields.map((f) => (
                            <span
                              key={f}
                              className="px-2 py-0.5 rounded-md text-[10px] font-medium border"
                              style={{
                                backgroundColor: "var(--bg-surface)",
                                borderColor: "var(--border-color)",
                                color: "var(--text-primary)",
                              }}
                            >
                              {f}
                            </span>
                          ))}
                        </div>

                        {/* Provider Settings (if any) */}
                        {prov.settings_schema && (
                          <div
                            className="p-3.5 rounded-xl border space-y-3"
                            style={{
                              backgroundColor: "var(--bg-surface)",
                              borderColor: "var(--border-color)",
                            }}
                          >
                            {prov.settings_schema.groups.map((group) => (
                              <div key={group.id} className="space-y-2">
                                {group.fields.map((field) => (
                                  <div key={field.key} className="space-y-1">
                                    <div className="flex justify-between items-center">
                                      <label className="text-[11px] font-bold text-white flex items-center gap-1.5">
                                        <Key className="w-3 h-3 text-indigo-400" />
                                        <span>{field.label}</span>
                                      </label>
                                      {prov.key_help_url && (
                                        <a
                                          href={prov.key_help_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-[10px] font-bold flex items-center gap-1 hover:underline"
                                          style={{ color: "var(--accent-primary)" }}
                                        >
                                          <span>Ottieni API Key gratuita</span>
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      )}
                                    </div>

                                    <div className="relative flex items-center">
                                      <input
                                        type={field.field_type?.type === "SecretString" && !isEyeOpen ? "password" : "text"}
                                        placeholder={field.field_type?.placeholder || "Inserisci valore..."}
                                        value={settings[field.key] || ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setEditingSettings((prev) => ({
                                            ...prev,
                                            [prov.id]: {
                                              ...(prev[prov.id] || {}),
                                              [field.key]: val,
                                            },
                                          }));
                                        }}
                                        className="w-full h-8 px-3 pr-9 rounded-lg text-xs border font-mono focus:outline-none"
                                        style={{
                                          backgroundColor: "var(--bg-card)",
                                          borderColor: "var(--border-color)",
                                          color: "var(--text-primary)",
                                        }}
                                      />
                                      {field.field_type?.type === "SecretString" && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setShowApiKey((prev) => ({ ...prev, [prov.id]: !prev[prov.id] }))
                                          }
                                          className="absolute right-2.5 text-slate-400 hover:text-white"
                                        >
                                          {isEyeOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                      )}
                                    </div>
                                    {field.description && (
                                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                        {field.description}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ))}

                            {/* Actions: Save Settings & Test Connection */}
                            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--border-color)" }}>
                              <div className="flex-1 mr-3">
                                {testInfo?.loading && (
                                  <div className="flex items-center gap-2 text-xs text-indigo-400 animate-pulse">
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Verifica connessione con le API in corso...</span>
                                  </div>
                                )}
                                {!testInfo?.loading && testInfo?.message && (
                                  <div
                                    className={`flex items-center gap-1.5 text-xs font-medium ${
                                      testInfo.success ? "text-emerald-400" : "text-rose-400"
                                    }`}
                                  >
                                    {testInfo.success ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    ) : (
                                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    )}
                                    <span className="truncate">{testInfo.message}</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => handleTestConnection(prov.id)}
                                  disabled={testInfo?.loading}
                                  className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5"
                                  style={{
                                    backgroundColor: "var(--bg-card)",
                                    borderColor: "var(--border-color)",
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Test Connessione</span>
                                </button>
                                <button
                                  onClick={() => handleSaveProviderSettings(prov.id)}
                                  className="px-4 py-1.5 rounded-lg text-xs font-black text-white shadow-md transition-all"
                                  style={{ backgroundColor: "var(--accent-primary)" }}
                                >
                                  Salva
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TAB 2: PIPELINE PRIORITY MATRIX */}
              {pluginModalTab === "pipeline" && (
                <div className="space-y-5">
                  <div
                    className="p-4 rounded-2xl border space-y-2"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Come funziona la Diamond Pipeline</span>
                    </h4>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      A differenza dei vecchi launcher che si affidano a una sola fonte rigida, la Diamond Pipeline
                      interroga contemporaneamente o a cascata più servizi: assegna la locandina verticale più bella
                      da SteamGridDB, recupera il voto certificato della critica globale da OpenCritic e popola la sinossi
                      e i generi ufficiali tramite Steam Store.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Cover Art Priority */}
                    <div
                      className="p-4 rounded-xl border space-y-2"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                      }}
                    >
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Fonte Copertine Verticali (600x900)</span>
                      </label>
                      <select
                        value={pipelineConfig.cover_source}
                        onChange={(e) =>
                          setPipelineConfig({ ...pipelineConfig, cover_source: e.target.value })
                        }
                        className="w-full h-9 px-3 rounded-lg text-xs border font-medium focus:outline-none"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <option value="steamgriddb">SteamGridDB (Consigliato - Artwork 600x900 HD)</option>
                        <option value="steam">Steam Store CDN (Ufficiale)</option>
                      </select>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        Se SteamGridDB non restituisce risultati o non ha una chiave valida, verrà usato Steam Store.
                      </p>
                    </div>

                    {/* Hero Background Priority */}
                    <div
                      className="p-4 rounded-xl border space-y-2"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                      }}
                    >
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5 text-purple-400" />
                        <span>Fonte Sfondi Hero Panoramici (4K)</span>
                      </label>
                      <select
                        value={pipelineConfig.background_source}
                        onChange={(e) =>
                          setPipelineConfig({ ...pipelineConfig, background_source: e.target.value })
                        }
                        className="w-full h-9 px-3 rounded-lg text-xs border font-medium focus:outline-none"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <option value="steamgriddb">SteamGridDB (Consigliato - Hero 1920x1080 / 4K)</option>
                        <option value="steam">Steam Store CDN (Ufficiale)</option>
                      </select>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        Utilizzato come sfondo panoramico immersivo nel Game Drawer e in modalità Big Picture.
                      </p>
                    </div>

                    {/* Critic Score Priority */}
                    <div
                      className="p-4 rounded-xl border space-y-2"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                      }}
                    >
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 text-amber-400" />
                        <span>Fonte Punteggi della Critica</span>
                      </label>
                      <select
                        value={pipelineConfig.score_source}
                        onChange={(e) =>
                          setPipelineConfig({ ...pipelineConfig, score_source: e.target.value })
                        }
                        className="w-full h-9 px-3 rounded-lg text-xs border font-medium focus:outline-none"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <option value="opencritic">OpenCritic (Consigliato - Top Critic Score)</option>
                        <option value="steam">Steam Metacritic (Punteggio Metacritic di Steam)</option>
                        {providers
                          .filter((p) => p.is_builtin === false && p.supported_fields.includes("critic_score"))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (Plugin Esterno)
                            </option>
                          ))}
                      </select>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        Se OpenCritic non ha ancora recensioni per il gioco, interroga Steam Metacritic.
                      </p>
                    </div>

                    {/* Descriptions and Details Priority */}
                    <div
                      className="p-4 rounded-xl border space-y-2"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                      }}
                    >
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Scroll className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Fonte Sinossi, Generi & Sviluppatori</span>
                      </label>
                      <select
                        value={pipelineConfig.details_source}
                        onChange={(e) =>
                          setPipelineConfig({ ...pipelineConfig, details_source: e.target.value })
                        }
                        className="w-full h-9 px-3 rounded-lg text-xs border font-medium focus:outline-none"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <option value="steam">Steam Store Engine (Localizzato in Italiano)</option>
                      </select>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        Include tag, categorie, sviluppatori e data di rilascio ufficiale.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-3">
                    <button
                      onClick={handleSavePipelineConfig}
                      className="px-6 py-2.5 rounded-xl font-black text-xs text-white shadow-lg transition-all"
                      style={{ backgroundColor: "var(--accent-primary)" }}
                    >
                      Salva Configurazione Pipeline
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: MASSIVE ENRICHMENT */}
              {pluginModalTab === "enrich" && (
                <div className="space-y-5">
                  <div
                    className="p-5 rounded-2xl border space-y-3"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white"
                        style={{ backgroundColor: "var(--accent-primary)" }}
                      >
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white">Sincronizzazione Massiva con la Pipeline</h4>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Arricchisci tutti i {games.length} giochi della libreria applicando le priorità definite
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-2">
                      <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Totale Giochi</span>
                        <p className="text-lg font-black text-white mt-0.5">{games.length}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Cover Presenti</span>
                        <p className="text-lg font-black text-emerald-400 mt-0.5">
                          {games.filter((g) => g.cover_image).length}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Voti Critica</span>
                        <p className="text-lg font-black text-amber-400 mt-0.5">
                          {games.filter((g) => g.critic_score).length}
                        </p>
                      </div>
                    </div>

                    {pipelineProgress && (
                      <div
                        className="p-3 rounded-xl border text-xs font-medium"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                          color: "var(--accent-primary)",
                        }}
                      >
                        {pipelineProgress}
                      </div>
                    )}

                    <div className="pt-2">
                      <button
                        onClick={handleRunMassivePipeline}
                        disabled={isPipelineEnriching}
                        className="w-full py-3 rounded-xl font-black text-xs text-white shadow-lg transition-all flex items-center justify-center gap-2 hover:brightness-110 active:opacity-90"
                        style={{
                          backgroundColor: "var(--accent-primary)",
                          boxShadow: `0 0 20px var(--accent-glow)`,
                        }}
                      >
                        <Sparkles className={`w-4 h-4 ${isPipelineEnriching ? "animate-spin text-amber-300" : ""}`} />
                        <span>
                          {isPipelineEnriching ? "Arricchimento Massivo in Corso..." : "Avvia Arricchimento di Tutta la Libreria"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL RIGHT-CLICK CONTEXT MENU */}
      {contextMenu && (
        <>
          {/* Transparent Backdrop to dismiss context menu safely on any click outside */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            className="fixed z-[9999] py-1.5 w-60 rounded-xl border shadow-2xl backdrop-blur-xl select-none text-xs"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
              boxShadow: "0 12px 36px rgba(0,0,0,0.8)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3.5 py-2 border-b mb-1" style={{ borderColor: "var(--border-color)" }}>
              <span className="font-extrabold text-white truncate block text-xs">
                {contextMenu.game.title}
              </span>
              <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                {contextMenu.game.library.toUpperCase()} • {contextMenu.game.is_installed ? "Installato" : "Disponibile"}
              </span>
            </div>

            {contextMenu.game.is_installed && (
              <button
                onClick={() => {
                  handleLaunch(contextMenu.game.id);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-bold text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-emerald-400" />
                <span>Avvia Gioco</span>
              </button>
            )}

            <button
              onClick={() => {
                setGameToEdit(contextMenu.game);
                setShowEditorModal(true);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-bold text-indigo-300 hover:bg-indigo-500/10 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5 text-indigo-400" />
              <span>Modifica Informazioni (Manuale)...</span>
            </button>

            <button
              onClick={() => {
                setGameToResolve(contextMenu.game);
                setShowResolutionModal(true);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-bold text-sky-300 hover:bg-sky-500/10 transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-sky-400" />
              <span>Identifica Metadati (Automatico)...</span>
            </button>

            <button
              onClick={() => {
                setSelectedGame(contextMenu.game);
                setViewMode("details");
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-medium text-white/90 hover:bg-white/5 transition-colors"
            >
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span>Vedi Dettagli Completi</span>
            </button>
          </div>
        </>
      )}

      {/* METADATA EDITOR MODAL */}
      <GameEditorModal
        isOpen={showEditorModal}
        onClose={() => {
          setShowEditorModal(false);
          setGameToEdit(null);
        }}
        game={gameToEdit || selectedGame}
        onSave={(updated) => {
          setSelectedGame((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
          setGames((prev) => prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g)));
          refreshLibrary();
          setStatusMessage(`Scheda di '${updated.title}' aggiornata con successo!`);
        }}
      />

      {/* METADATA RESOLUTION MODAL */}
      <MetadataResolutionModal
        isOpen={showResolutionModal}
        onClose={() => {
          setShowResolutionModal(false);
          setGameToResolve(null);
        }}
        game={gameToResolve || selectedGame}
        onApply={(updated) => {
          setSelectedGame((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
          setGames((prev) => prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g)));
          refreshLibrary();
          setStatusMessage(`Metadati risolti per '${updated.title}' con successo!`);
        }}
      />
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
      {showAddCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full max-w-md rounded-2xl border shadow-2xl p-6"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            <div
              className="flex items-center justify-between pb-4 border-b"
              style={{ borderColor: "var(--border-color)" }}
            >
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-semibold tracking-wide">
                  Aggiungi Gioco (.exe o Cartella)
                </h3>
              </div>
              <button
                onClick={() => setShowAddCustomModal(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomGame} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  Titolo Gioco *
                </label>
                <input
                  type="text"
                  required
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Es. Dark Souls Remastered"
                  className="w-full px-3 py-2 rounded-xl border bg-black/30 text-sm font-normal focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  style={{ borderColor: "var(--border-color)" }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  Eseguibile o Cartella Gioco *
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    required
                    value={customExePath}
                    onChange={(e) => setCustomExePath(e.target.value)}
                    placeholder="C:\Games\MyGame\game.exe o cartella"
                    className="flex-1 px-3 py-2 rounded-xl border bg-black/30 text-xs font-mono font-normal focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    style={{ borderColor: "var(--border-color)" }}
                  />
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handlePickCustomExe}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors"
                      style={{ borderColor: "var(--border-color)" }}
                      title="Sfoglia file eseguibile (.exe)..."
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Sfoglia .exe</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePickCustomFolder}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors"
                      style={{ borderColor: "var(--border-color)" }}
                      title="Sfoglia cartella di installazione del gioco..."
                    >
                      <Folder className="w-3.5 h-3.5 text-sky-400" />
                      <span>Cartella</span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  Percorso Locandina (Opzionale)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customCoverPath}
                    onChange={(e) => setCustomCoverPath(e.target.value)}
                    placeholder="C:\Images\cover.jpg oppure https://..."
                    className="flex-1 px-3 py-2 rounded-xl border bg-black/30 text-xs font-mono font-normal focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    style={{ borderColor: "var(--border-color)" }}
                  />
                  <button
                    type="button"
                    onClick={handlePickCustomCover}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors shrink-0"
                    style={{ borderColor: "var(--border-color)" }}
                    title="Sfoglia immagine copertina..."
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sfoglia...</span>
                  </button>
                </div>
              </div>

              <div
                className="flex justify-end gap-2 pt-4 border-t"
                style={{ borderColor: "var(--border-color)" }}
              >
                <button
                  type="button"
                  onClick={() => setShowAddCustomModal(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors"
                  style={{ borderColor: "var(--border-color)" }}
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isAddingCustom}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white shadow-lg transition-all hover:brightness-110 active:opacity-90"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>
                    {isAddingCustom ? "Importazione..." : "Aggiungi al Catalogo"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SETTINGS & OPTIONS MODAL */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenThemes={() => setShowThemeModal(true)}
        currentThemeName={currentTheme.name}
      />
    </div>
  );
}

