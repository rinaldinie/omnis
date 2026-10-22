import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";

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
  external_id?: string;
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
  features?: string[];
  custom_links?: Array<{ title: string; url: string }>;
  extra_metadata?: string | null;
  genres: string[];
  developers: string[];
  publishers?: string[];
}

export interface LibraryCounts {
  total: number;
  installed: number;
  steam: number;
  gog: number;
  epic: number;
  xbox: number;
  recent: number;
  favorites: number;
  action: number;
  rpg: number;
  strategy: number;
  indie: number;
}

export type SessionState = "launching" | "running" | "stopping";

export interface ActiveGameSession {
  session_id: string;
  game_id: string;
  title: string;
  pid?: number | null;
  state: SessionState;
  started_at: string;
  process_detected_at?: string | null;
  elapsed_seconds?: number;
}

export interface ThemeConfig {
  id: string;
  apiVersion?: number;
  name: string;
  description: string;
  author: string;
  is_custom: boolean;
  tokens?: Record<string, string>;
  styles?: string[];
  layouts?: Record<string, string>;
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
  target_mode?: "all" | "desktop" | "bigpicture";
  enable_video_backdrop?: boolean;
  video_backdrop_opacity?: number;
  video_delay_ms?: number;
}

export interface ProviderInfo {
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
  plugin_type?: string | null;
}

export interface MetadataPipelineConfig {
  cover_source: string;
  background_source: string;
  score_source: string;
  details_source: string;
  preserve_existing_artwork?: boolean;
  provider_priority?: string[];
}

export function isTauriEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return isTauri() || !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__;
}

export function formatImageUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  // If Steam CDN wide banner header.jpg was stored as cover, upgrade to official 2:3 vertical library capsule
  if (src.includes("cdn.cloudflare.steamstatic.com/steam/apps/") && src.endsWith("/header.jpg")) {
    src = src.replace("/header.jpg", "/library_600x900_2x.jpg");
  }
  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:") ||
    src.startsWith("asset:")
  ) {
    return src;
  }
  try {
    if (isTauriEnvironment()) {
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

export async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.warn(`Tauri command '${cmd}' not available in preview:`, err);
  }
  return null;
}

export const FILTER_ORDER = [
  "all",
  "installed",
  "recent",
  "favorites",
  "steam",
  "gog",
  "epic",
  "xbox",
  "action",
  "rpg",
  "strategy",
  "indie",
];

export const BUILTIN_THEMES: ThemeConfig[] = [
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
    target_mode: "all",
    enable_video_backdrop: false,
  },
  {
    id: "cinema_trailer",
    apiVersion: 1,
    name: "Cinema Lounge (Trailer Videos)",
    description: "Atmosfera cinematografica con video trailer dinamici di sfondo e accenti ambra e oro",
    author: "Omnis Cinema",
    is_custom: false,
    tokens: {
      "--omnis-accent": "#f59e0b",
      "--omnis-card-radius": "14px",
      "--omnis-bg-base": "#08080a",
      "--omnis-bg-surface": "#101014",
      "--omnis-bg-card": "#18181f",
    },
    styles: ["style.css"],
    layouts: {
      library: "grid-large",
    },
    bg_base: "#08080a",
    bg_surface: "#101014",
    bg_card: "#18181f",
    text_primary: "#ffffff",
    text_muted: "#a1a1aa",
    accent_primary: "#f59e0b",
    accent_glow: "rgba(245, 158, 11, 0.45)",
    border_color: "#27272a",
    card_radius: "14px",
    font_family: "system-ui, sans-serif",
    custom_css: `
[data-omnis="game-card"] {
  border-radius: var(--omnis-card-radius, 14px);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
}
[data-omnis="game-card"]:hover {
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.35);
}
[data-omnis="game-card.cover"] {
  border-radius: var(--omnis-card-radius, 14px);
}
[data-omnis="details.hero"] {
  backdrop-filter: blur(8px);
}
[data-omnis="details.title"] {
  color: var(--omnis-accent, #f59e0b);
}
[data-omnis-slot="details.hero"] [data-omnis-widget="progress"] {
  color: var(--omnis-accent, #f59e0b);
}
    `.trim(),
    target_mode: "all",
    enable_video_backdrop: true,
    video_backdrop_opacity: 0.55,
    video_delay_ms: 1000,
  },
];

export const SAMPLE_GAMES: GameDto[] = [
  {
    id: "1091500",
    external_id: "1091500",
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
    features: ["Single-player", "Ray Tracing", "DLSS 3 / FSR", "Full controller support", "Steam Cloud", "Achievements", "HDR"],
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
    external_id: "292030",
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
    features: ["Single-player", "Ray Tracing", "Full controller support", "Cloud Saves", "Achievements", "Cross-Platform Saves"],
    custom_links: [
      { title: "Witcher Wiki", url: "https://witcher.fandom.com" },
    ],
    genres: ["GDR", "Open World", "Fantasy"],
    developers: ["CD PROJEKT RED"],
    publishers: ["CD PROJEKT RED"],
  },
  {
    id: "1145360",
    external_id: "1145360",
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
    features: ["Single-player", "Full controller support", "Steam Cloud", "Achievements", "Fast Loading"],
    custom_links: [
      { title: "Supergiant Games", url: "https://www.supergiantgames.com/games/hades/" },
    ],
    genres: ["Azione", "Indie", "Rogue-like"],
    developers: ["Supergiant Games"],
    publishers: ["Supergiant Games"],
  },
  {
    id: "620",
    external_id: "620",
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
    features: ["Single-player", "Co-op", "Online Co-op", "Split-screen", "Full controller support", "Steam Cloud", "Steam Workshop", "Achievements"],
    custom_links: [
      { title: "Steam Store", url: "https://store.steampowered.com/app/620/Portal_2/" },
    ],
    genres: ["Strategia", "Puzzle", "Fantascienza"],
    developers: ["Valve"],
    publishers: ["Valve"],
  },
  {
    id: "1423714649",
    external_id: "1423714649",
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
    features: ["Single-player", "Multi-player", "Online Co-op", "LAN Co-op", "Full controller support", "Cloud Saves", "Achievements"],
    custom_links: [
      { title: "BG3 Wiki", url: "https://bg3.wiki" },
    ],
    genres: ["GDR", "Strategia", "Turn-Based"],
    developers: ["Larian Studios"],
    publishers: ["Larian Studios"],
  },
  {
    id: "1245620",
    external_id: "1245620",
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
    features: ["Single-player", "Multi-player", "Online Co-op", "Full controller support", "Steam Cloud", "Achievements", "Anti-Cheat"],
    custom_links: [
      { title: "Fextralife Elden Ring", url: "https://eldenring.wiki.fextralife.com" },
    ],
    genres: ["Azione", "GDR", "Dark Fantasy"],
    developers: ["FromSoftware Inc."],
    publishers: ["Bandai Namco"],
  },
];

export interface Achievement {
  id: string;
  game_id: string;
  api_name: string;
  display_name: string;
  description: string | null;
  icon_unlocked_url: string;
  icon_locked_url: string | null;
  local_icon_path: string | null;
  is_unlocked: boolean;
  unlock_time: string | null;
  rarity_percentage: number | null;
  points: number | null;
  is_hidden: boolean;
}

export interface GameAchievementsSummary {
  game_id: string;
  total_count: number;
  unlocked_count: number;
  completion_percentage: number;
  total_points: number;
  earned_points: number;
  achievements: Achievement[];
}

