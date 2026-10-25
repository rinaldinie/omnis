import React from "react";
import {
  Search,
  Volume2,
  VolumeX,
  Palette,
  Puzzle,
  Monitor,
  Power,
  RefreshCw,
  Sparkles,
  Type,
  Gamepad2,
  Menu,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Play,
  LayoutGrid,
  GalleryHorizontal,
  Shuffle,
  ArrowDownWideNarrow,
  Film,
  Languages,
  SearchX,
  Minimize2,
  CloudDownload,
  FolderOpen,
  ShieldCheck,
  Link2,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ActiveGameSession,
  FILTER_ORDER,
  GameDto,
  LibraryCounts,
  ThemeConfig,
  formatImageUrl,
} from "../../types";
import { StoreIcon } from "../StoreBadge";
import soundEffects from "../../utils/soundEffects";
import { VideoBackdrop } from "../common/VideoBackdrop";
import { Slot } from "../common/Slot";
import { GameAchievementsGallery } from "../achievements";
import { useTranslation } from "../../i18n/i18nContext";
import { SUPPORTED_LOCALES } from "../../i18n/types";
import { GAME_SORT_MODES, GameSortMode } from "../../utils/sortGames";
import { useUpdater } from "../../hooks/useAppUpdater";
import { useUiScale } from "../../hooks/useUiScale";
import type { HomeFocusZone } from "../../hooks/useGamepadNavigation";
import { ControllerLegend, Glyph, LegendEntry, useClock } from "../fullscreen/ConsoleChrome";

interface FullscreenViewProps {
  focusedGame: GameDto | null;
  filteredGames: GameDto[];
  focusedIndex: number;
  setFocusedIndex: (idx: number) => void;
  setSelectedGame: (game: GameDto) => void;
  counts: LibraryCounts;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  gamepadConnected: boolean;
  gamepadName: string;
  searchQuery: string;
  setShowVirtualKeyboard: (show: boolean) => void;
  soundEnabled: boolean;
  handleToggleSound: () => void;
  currentTheme: ThemeConfig;
  setShowThemeModal: (show: boolean) => void;
  loadProvidersAndConfig: () => void;
  setShowPluginModal: (show: boolean) => void;
  toggleFullscreen: () => void;
  handleMinimize: () => void;
  handleClose: () => void;
  handleToggleMaximize: () => void;
  handleStartDragging: (e: React.MouseEvent) => void;
  handleLaunch: (gameId: string) => void;
  handleSync: () => void;
  isSyncing: boolean;
  showFullscreenDetails: boolean;
  setShowFullscreenDetails: React.Dispatch<React.SetStateAction<boolean>>;
  carouselRef: React.RefObject<HTMLDivElement>;
  /** Reports the grid column count (0 in shelf view) so gamepad navigation can move by rows */
  onGridColumnsChange?: (columns: number) => void;
  sortMode?: GameSortMode;
  onSortModeChange?: (mode: GameSortMode) => void;
  onClearSearch?: () => void;
  /** Reports whether the "continue playing" row is shown, so gamepad navigation can reach it */
  onRecentRowChange?: (visible: boolean) => void;
  onGameAction?: (action: GameAction, gameId: string) => void;
  t: (key: string, params?: Record<string, any>) => string;
  isGameRunning?: boolean;
  activeGame?: ActiveGameSession | null;
  elapsedSeconds?: number;
  formatDuration?: (seconds: number) => string;
  handleKillRunningGame?: () => void;
  sessionToast?: {
    title: string;
    durationSeconds: number;
    gameId: string;
  } | null;
  onDismissToast?: () => void;
  homeFocusZone?: HomeFocusZone;
  setHomeFocusZone?: (zone: HomeFocusZone) => void;
  isMenuOpen?: boolean;
  setIsMenuOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  themes?: ThemeConfig[];
  onSelectTheme?: (theme: ThemeConfig) => void;
}

// Shelf geometry in rem, so the whole shelf follows the interface scale
const CARD_W_REM = 12;
const CARD_FOCUSED_W_REM = 32;
const CARD_H_REM = 18;
const CARD_GAP_REM = 1.25;
const GRID_CARD_W_REM = 10.5;
const GRID_GAP_REM = 1.25;
const RECENT_CARD_W_REM = 13;
const RECENT_ROW_SIZE = 6;
// The row is hidden when the window is too short (in rem, so it follows the interface scale)
const RECENT_ROW_MIN_VIEWPORT_REM = 54;

export type GameAction = "folder" | "verify" | "shortcut" | "uninstall";
type HeroButton = "launch" | GameAction | "back";
type ConfirmKind = "exit" | "desktop" | "uninstall";

const HERO_ACTIONS: Record<GameAction, { icon: LucideIcon; labelKey: string; danger?: boolean }> = {
  folder: { icon: FolderOpen, labelKey: "console_ui.action_folder" },
  verify: { icon: ShieldCheck, labelKey: "console_ui.action_verify" },
  shortcut: { icon: Link2, labelKey: "console_ui.action_shortcut" },
  uninstall: { icon: Trash2, labelKey: "console_ui.action_uninstall", danger: true },
};

type LibraryLayout = "shelf" | "grid";
const LAYOUT_STORAGE_KEY = "omnis_fullscreen_layout";
const TRAILERS_STORAGE_KEY = "omnis_fullscreen_trailers";

const MENU_SECTION_LABEL_KEYS: Record<string, string> = {
  library: "console_ui.section_library",
  display: "console_ui.section_display",
  system: "console_ui.system",
};

function readSavedLayout(): LibraryLayout {
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY) === "grid" ? "grid" : "shelf";
  } catch {
    return "shelf";
  }
}

const STORE_LABELS: Record<string, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  xbox: "Xbox",
};

const FILTER_LABEL_KEYS: Record<string, string> = {
  all: "sidebar.all_games",
  installed: "sidebar.installed",
  recent: "sidebar.recent",
  favorites: "sidebar.favorites",
  action: "sidebar.genre_action",
  rpg: "sidebar.genre_rpg",
  strategy: "sidebar.genre_strategy",
  indie: "sidebar.genre_indie",
};

// Filters always shown as tabs, even when empty
const PINNED_FILTERS = ["all", "installed", "recent", "favorites"];

function resolveImage(src: string | null | undefined): string | null {
  if (!src) return null;
  // Remote art is used as-is so landscape headers are not swapped for portrait capsules
  if (/^(https?:|data:|asset:)/.test(src)) return src;
  return formatImageUrl(src);
}

/** Image that walks a list of candidate sources on error, then falls back to a title block. */
const ArtImage = React.memo(function ArtImage({
  sources,
  title,
  library,
  showFallbackTitle = true,
}: {
  sources: Array<string | null | undefined>;
  title: string;
  library: string;
  /** Off when the caller already overlays the title */
  showFallbackTitle?: boolean;
}) {
  const sourcesKey = sources.join("|");
  const candidates = React.useMemo(() => {
    const out: string[] = [];
    for (const src of sources) {
      const url = resolveImage(src);
      if (!url || out.includes(url)) continue;
      out.push(url);
      if (url.includes("library_600x900_2x.jpg")) {
        const header = url.replace("library_600x900_2x.jpg", "header.jpg");
        if (!out.includes(header)) out.push(header);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey]);

  const [index, setIndex] = React.useState(0);
  React.useEffect(() => setIndex(0), [candidates]);

  if (index >= candidates.length) {
    return (
      <div
        className="w-full h-full flex flex-col justify-between p-4"
        style={{ background: "linear-gradient(160deg, var(--bg-card), var(--bg-surface))" }}
      >
        <StoreIcon library={library} className="w-5 h-5 text-white/70" />
        {showFallbackTitle && (
          <span className="text-lg font-semibold text-white leading-snug line-clamp-4 break-words">{title}</span>
        )}
      </div>
    );
  }

  return (
    <img
      key={candidates[index]}
      src={candidates[index]}
      alt={title}
      className="w-full h-full object-cover [transform:translateZ(0)]"
      loading="lazy"
      draggable={false}
      onError={() => setIndex((i) => i + 1)}
    />
  );
});

interface ShelfCardProps {
  game: GameDto;
  isFocused: boolean;
  isRunning: boolean;
  /** False while focus is elsewhere (menu button, recent row): the card stays wide but loses its ring */
  hasFocusRing?: boolean;
  liveLabel?: string;
}

const ShelfCard = React.memo(function ShelfCard({ game, isFocused, isRunning, hasFocusRing = true, liveLabel = "Live" }: ShelfCardProps) {
  const widthRem = isFocused ? CARD_FOCUSED_W_REM : CARD_W_REM;
  return (
    <div
      className="relative shrink-0 rounded-md overflow-hidden transition-[width,box-shadow,opacity] duration-200 ease-out"
      style={{
        width: `${widthRem}rem`,
        height: `${CARD_H_REM}rem`,
        backgroundColor: "var(--bg-card)",
        opacity: isFocused ? 1 : 0.85,
        boxShadow:
          isFocused && hasFocusRing
            ? "0 0 0 0.2rem rgba(255, 255, 255, 0.92), 0 1.5rem 3rem -1rem rgba(0, 0, 0, 0.85)"
            : "0 1rem 2rem -1.25rem rgba(0, 0, 0, 0.8)",
        contentVisibility: "auto",
        containIntrinsicSize: `${widthRem}rem ${CARD_H_REM}rem`,
      }}
    >
      <ArtImage
        sources={isFocused ? [game.background_image, game.cover_image] : [game.cover_image, game.background_image]}
        title={game.title}
        library={game.library}
      />

      {isRunning && (
        <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          {liveLabel}
        </span>
      )}

      {isFocused && (
        <span className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-black/65 flex items-center justify-center">
          <StoreIcon library={game.library} className="w-4 h-4 text-white" />
        </span>
      )}
    </div>
  );
});

const RecentCard = React.memo(function RecentCard({ game, isFocused }: { game: GameDto; isFocused: boolean }) {
  return (
    <div
      className="relative shrink-0 rounded-md overflow-hidden transition-[transform,box-shadow,opacity] duration-150 ease-out"
      style={{
        width: `${RECENT_CARD_W_REM}rem`,
        height: `${(RECENT_CARD_W_REM * 9) / 16}rem`,
        backgroundColor: "var(--bg-card)",
        opacity: isFocused ? 1 : 0.8,
        transform: isFocused ? "scale(1.05)" : "none",
        boxShadow: isFocused
          ? "0 0 0 0.2rem rgba(255, 255, 255, 0.92), 0 1rem 2rem -0.75rem rgba(0, 0, 0, 0.85)"
          : "0 0.75rem 1.5rem -1rem rgba(0, 0, 0, 0.8)",
      }}
    >
      <ArtImage
        sources={[game.background_image, game.cover_image]}
        title={game.title}
        library={game.library}
        showFallbackTitle={false}
      />
      <div className="absolute inset-x-0 bottom-0 px-3 pt-6 pb-2 bg-gradient-to-t from-black/85 to-transparent">
        <span className="block text-sm font-semibold text-white truncate">{game.title}</span>
      </div>
    </div>
  );
});

const GridCard = React.memo(function GridCard({ game, isFocused, isRunning }: ShelfCardProps) {
  return (
    <div
      className="relative rounded-md overflow-hidden transition-[transform,box-shadow,opacity] duration-150 ease-out"
      style={{
        // 2:3 cover box via padding: aspect-ratio items collapse grid row tracks
        paddingTop: "150%",
        backgroundColor: "var(--bg-card)",
        opacity: isFocused ? 1 : 0.8,
        transform: isFocused ? "scale(1.05)" : "none",
        zIndex: isFocused ? 10 : undefined,
        boxShadow: isFocused
          ? "0 0 0 0.2rem rgba(255, 255, 255, 0.92), 0 1.25rem 2.5rem -0.75rem rgba(0, 0, 0, 0.85)"
          : "0 0.75rem 1.5rem -1rem rgba(0, 0, 0, 0.8)",
      }}
    >
      <div className="absolute inset-0">
        <ArtImage sources={[game.cover_image, game.background_image]} title={game.title} library={game.library} />
      </div>
      {isRunning && (
        <span className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse ring-2 ring-black/50" />
      )}
    </div>
  );
});

interface ConsoleMenuItem {
  id: string;
  icon: LucideIcon;
  label: string;
  value?: string;
  spinning?: boolean;
  tone?: "default" | "accent" | "danger";
  section: "update" | "library" | "display" | "system";
  onActivate: () => void;
  onAdjust?: (delta: 1 | -1) => void;
}

export default function FullscreenView({
  focusedGame,
  filteredGames,
  focusedIndex,
  setFocusedIndex,
  counts,
  activeFilter,
  gamepadConnected,
  searchQuery,
  setShowVirtualKeyboard,
  soundEnabled,
  handleToggleSound,
  currentTheme,
  loadProvidersAndConfig,
  toggleFullscreen,
  handleMinimize,
  handleClose,
  handleLaunch,
  handleSync,
  isSyncing,
  showFullscreenDetails,
  setShowFullscreenDetails,
  carouselRef,
  onGridColumnsChange,
  sortMode = "default",
  onSortModeChange,
  onClearSearch,
  onRecentRowChange,
  onGameAction,
  t,
  isGameRunning = false,
  activeGame,
  elapsedSeconds,
  formatDuration,
  handleKillRunningGame,
  sessionToast,
  onDismissToast,
  homeFocusZone = "carousel",
  setHomeFocusZone,
  isMenuOpen = false,
  setIsMenuOpen,
  themes = [],
  onSelectTheme,
}: FullscreenViewProps) {
  const { locale, setLocale } = useTranslation();
  const updater = useUpdater();
  const clock = useClock(locale);
  const { scale, stepScale, resetScale } = useUiScale(true);
  const isFocusedGameRunning = activeGame?.game_id === focusedGame?.id;
  const duration = (seconds: number) => (formatDuration ? formatDuration(seconds) : `${seconds}s`);

  // ---------------------------------------------------------------------------
  // Interface scale: Ctrl + / Ctrl - / Ctrl 0, plus a transient indicator
  // ---------------------------------------------------------------------------
  const [scaleHintVisible, setScaleHintVisible] = React.useState(false);
  const isFirstScaleRender = React.useRef(true);

  React.useEffect(() => {
    if (isFirstScaleRender.current) {
      isFirstScaleRender.current = false;
      return;
    }
    setScaleHintVisible(true);
    const id = window.setTimeout(() => setScaleHintVisible(false), 1200);
    return () => window.clearTimeout(id);
  }, [scale]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        if (stepScale(1)) soundEffects.playNav();
      } else if (e.key === "-") {
        e.preventDefault();
        if (stepScale(-1)) soundEffects.playNav();
      } else if (e.key === "0") {
        e.preventDefault();
        resetScale();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stepScale, resetScale]);

  // ---------------------------------------------------------------------------
  // Shelf: keep the focused card aligned with the section heading
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Library layout: single shelf row or grid (menu, R3 or "G" to switch)
  // ---------------------------------------------------------------------------
  const [layout, setLayout] = React.useState<LibraryLayout>(readSavedLayout);
  const hasGames = filteredGames.length > 0;

  const toggleLayout = React.useCallback(() => {
    setLayout((prev) => {
      const next = prev === "grid" ? "shelf" : "grid";
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, next);
      } catch {
        // Not persisted, still applied for this session
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    const handleToggle = () => {
      soundEffects.playSelect();
      toggleLayout();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "g" && !e.ctrlKey && !e.altKey && !isMenuOpen && !showFullscreenDetails) {
        handleToggle();
      }
    };
    window.addEventListener("omnis:toggle-layout", handleToggle);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("omnis:toggle-layout", handleToggle);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleLayout, isMenuOpen, showFullscreenDetails]);

  const gridRef = React.useRef<HTMLDivElement>(null);
  const [gridColumns, setGridColumns] = React.useState(0);

  // Fit as many fixed-width columns as the grid can hold
  React.useLayoutEffect(() => {
    const grid = gridRef.current;
    if (layout !== "grid" || !grid) {
      setGridColumns(0);
      return;
    }
    const measure = () => {
      const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const style = getComputedStyle(grid);
      const inner = grid.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const gap = GRID_GAP_REM * remPx;
      setGridColumns(Math.max(1, Math.floor((inner + gap) / (GRID_CARD_W_REM * remPx + gap))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [layout, scale, hasGames]);

  React.useEffect(() => {
    onGridColumnsChange?.(gridColumns);
  }, [gridColumns, onGridColumnsChange]);

  React.useEffect(() => () => onGridColumnsChange?.(0), [onGridColumnsChange]);

  // Grid: keep the focused cover in view
  React.useEffect(() => {
    if (layout !== "grid") return;
    const card = gridRef.current?.children[focusedIndex] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [layout, focusedIndex, gridColumns]);

  // ---------------------------------------------------------------------------
  // "Continue playing" row: shelf view, all games, no search, enough height
  // ---------------------------------------------------------------------------
  const recentGames = React.useMemo(() => {
    if (layout !== "shelf" || activeFilter !== "all" || searchQuery) return [];
    const lastPlayed = (g: GameDto) => (g.last_activity ? Date.parse(g.last_activity) || 0 : 0);
    return filteredGames
      .filter((g) => lastPlayed(g) > 0)
      .sort((a, b) => lastPlayed(b) - lastPlayed(a))
      .slice(0, RECENT_ROW_SIZE);
  }, [layout, activeFilter, searchQuery, filteredGames]);

  const [viewportRem, setViewportRem] = React.useState(() => window.innerHeight / 16);
  React.useEffect(() => {
    const measure = () =>
      setViewportRem(window.innerHeight / (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [scale]);

  const showRecentRow = recentGames.length > 0 && viewportRem >= RECENT_ROW_MIN_VIEWPORT_REM;

  React.useEffect(() => {
    onRecentRowChange?.(showRecentRow);
  }, [showRecentRow, onRecentRowChange]);

  React.useEffect(() => () => onRecentRowChange?.(false), [onRecentRowChange]);

  // Leave the row when it disappears (filter, search, layout or window size change)
  React.useEffect(() => {
    if (homeFocusZone === "recent" && !showRecentRow) setHomeFocusZone?.("carousel");
  }, [homeFocusZone, showRecentRow, setHomeFocusZone]);

  const [recentIndex, setRecentIndex] = React.useState(0);
  const safeRecentIndex = Math.min(recentIndex, Math.max(0, recentGames.length - 1));
  const recentGame = showRecentRow && homeFocusZone === "recent" ? recentGames[safeRecentIndex] : null;
  // The game the home screen describes: the recent card when that row is focused, else the shelf focus
  const infoGame = recentGame ?? focusedGame;

  React.useEffect(() => {
    if (!showRecentRow) return;

    const handleRecentNav = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: "left" | "right" }>).detail?.direction;
      const next = Math.max(0, Math.min(recentGames.length - 1, safeRecentIndex + (dir === "right" ? 1 : -1)));
      if (next !== safeRecentIndex) {
        soundEffects.playNav();
        setRecentIndex(next);
      }
    };

    const handleRecentAction = (e: Event) => {
      const action = (e as CustomEvent<{ action: "launch" | "details" }>).detail?.action;
      const game = recentGames[safeRecentIndex];
      if (!game) return;
      soundEffects.playSelect();
      if (action === "launch") {
        handleLaunch(game.id);
        return;
      }
      // The details page follows the shelf focus, so move it onto this game first
      const idx = filteredGames.findIndex((g) => g.id === game.id);
      if (idx === -1) return;
      setFocusedIndex(idx);
      setHomeFocusZone?.("carousel");
      setShowFullscreenDetails(true);
    };

    window.addEventListener("omnis:recent-nav", handleRecentNav);
    window.addEventListener("omnis:recent-action", handleRecentAction);
    return () => {
      window.removeEventListener("omnis:recent-nav", handleRecentNav);
      window.removeEventListener("omnis:recent-action", handleRecentAction);
    };
  }, [
    showRecentRow,
    recentGames,
    safeRecentIndex,
    filteredGames,
    handleLaunch,
    setFocusedIndex,
    setHomeFocusZone,
    setShowFullscreenDetails,
  ]);

  React.useEffect(() => {
    const shelf = carouselRef.current;
    if (layout !== "shelf" || !shelf) return;
    // Every card before the focused one is collapsed, so its offset depends only on the index
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const pitch = (CARD_W_REM + CARD_GAP_REM) * remPx;
    shelf.scrollTo({ left: Math.max(0, focusedIndex * pitch), behavior: "smooth" });
  }, [layout, focusedIndex, scale, filteredGames.length, carouselRef]);

  // ---------------------------------------------------------------------------
  // Category tabs (same order LB / RB cycles through)
  // ---------------------------------------------------------------------------
  const filterLabel = (id: string) =>
    STORE_LABELS[id] ?? (FILTER_LABEL_KEYS[id] ? t(FILTER_LABEL_KEYS[id]) : id);
  const filterCount = (id: string) =>
    (counts as unknown as Record<string, number>)[id === "all" ? "total" : id] ?? 0;
  const visibleFilters = FILTER_ORDER.filter(
    (id) => PINNED_FILTERS.includes(id) || id === activeFilter || filterCount(id) > 0
  );

  const tabRefs = React.useRef<Record<string, HTMLSpanElement | null>>({});
  React.useEffect(() => {
    tabRefs.current[activeFilter]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeFilter]);

  // ---------------------------------------------------------------------------
  // Game details page
  // ---------------------------------------------------------------------------
  // Transient confirmation toast (game actions)
  const [notice, setNotice] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(id);
  }, [notice]);

  // Confirmation dialog for exit, desktop mode and uninstall; Cancel is focused by default
  const [confirm, setConfirm] = React.useState<{ kind: ConfirmKind; game?: GameDto } | null>(null);
  const [confirmFocus, setConfirmFocus] = React.useState<"cancel" | "confirm">("cancel");
  const openConfirm = (kind: ConfirmKind, game?: GameDto) => {
    setConfirm({ kind, game });
    setConfirmFocus("cancel");
  };

  // Lock game for details view so navigation inside details never switches games underneath
  const [detailGame, setDetailGame] = React.useState<GameDto | null>(null);

  React.useEffect(() => {
    if (showFullscreenDetails && focusedGame) {
      setDetailGame(focusedGame);
    } else if (!showFullscreenDetails || !focusedGame) {
      setDetailGame(null);
    }
  }, [showFullscreenDetails, focusedGame]);

  // If there are no games matching the filter, automatically close fullscreen details
  React.useEffect(() => {
    if (filteredGames.length === 0 && showFullscreenDetails) {
      setShowFullscreenDetails(false);
    }
  }, [filteredGames.length, showFullscreenDetails, setShowFullscreenDetails]);

  const activeDetailGame = filteredGames.length > 0 ? detailGame || focusedGame : null;

  const [detailsFocusedSection, setDetailsFocusedSection] = React.useState<"hero" | "achievements">("hero");
  const [heroFocusedButton, setHeroFocusedButton] = React.useState<HeroButton>("launch");
  const detailInstalled = !!activeDetailGame?.is_installed;
  const hasGameActions = !!onGameAction;
  const heroButtons = React.useMemo<HeroButton[]>(
    () => [
      "launch",
      ...(hasGameActions && detailInstalled ? (["folder", "verify"] as const) : []),
      ...(hasGameActions ? (["shortcut"] as const) : []),
      ...(hasGameActions && detailInstalled ? (["uninstall"] as const) : []),
      "back",
    ],
    [hasGameActions, detailInstalled]
  );
  const [achievementsFocusedIndex, setAchievementsFocusedIndex] = React.useState<number>(-1);
  const [totalAchievements, setTotalAchievements] = React.useState<number>(0);
  const detailsScrollRef = React.useRef<HTMLDivElement>(null);

  // Reset focus when details page opens
  React.useEffect(() => {
    if (showFullscreenDetails) {
      setDetailsFocusedSection("hero");
      setHeroFocusedButton("launch");
      setAchievementsFocusedIndex(-1);
      detailsScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [showFullscreenDetails]);

  // Handle D-pad / stick / arrow navigation inside Details page
  React.useEffect(() => {
    if (!showFullscreenDetails) return;

    const handleDetailsNav = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: "up" | "down" | "left" | "right" }>).detail?.direction;
      if (!dir || confirm) return;

      if (dir === "down") {
        if (detailsFocusedSection === "hero") {
          setDetailsFocusedSection("achievements");
          setAchievementsFocusedIndex(0);
          soundEffects.playNav();
          detailsScrollRef.current?.scrollBy({ top: 380, behavior: "smooth" });
        } else {
          detailsScrollRef.current?.scrollBy({ top: 220, behavior: "smooth" });
        }
      } else if (dir === "up") {
        if (detailsFocusedSection === "achievements") {
          setDetailsFocusedSection("hero");
          setAchievementsFocusedIndex(-1);
          soundEffects.playNav();
          detailsScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          detailsScrollRef.current?.scrollBy({ top: -220, behavior: "smooth" });
        }
      } else if (dir === "left" || dir === "right") {
        if (detailsFocusedSection === "hero") {
          setHeroFocusedButton((prev) => {
            const current = Math.max(0, heroButtons.indexOf(prev));
            const nextIdx = Math.max(0, Math.min(heroButtons.length - 1, current + (dir === "right" ? 1 : -1)));
            if (heroButtons[nextIdx] !== prev) soundEffects.playNav();
            return heroButtons[nextIdx];
          });
        } else if (dir === "left" && totalAchievements > 0) {
          setAchievementsFocusedIndex((prev) => (prev <= 0 ? totalAchievements - 1 : prev - 1));
          soundEffects.playNav();
        } else if (totalAchievements > 0) {
          setAchievementsFocusedIndex((prev) => (prev < 0 ? 0 : (prev + 1) % totalAchievements));
          soundEffects.playNav();
        }
      }
    };

    window.addEventListener("omnis:details-nav", handleDetailsNav);
    return () => window.removeEventListener("omnis:details-nav", handleDetailsNav);
  }, [showFullscreenDetails, detailsFocusedSection, totalAchievements, heroButtons, confirm]);

  // Handle Button A / Enter inside Details page
  React.useEffect(() => {
    if (!showFullscreenDetails) return;

    const handleActionA = () => {
      if (confirm) return;
      soundEffects.playSelect();
      if (detailsFocusedSection !== "hero" || !activeDetailGame) return;
      if (heroFocusedButton === "back") {
        setShowFullscreenDetails(false);
      } else if (heroFocusedButton === "launch") {
        if (isFocusedGameRunning && handleKillRunningGame) {
          handleKillRunningGame();
        } else {
          handleLaunch(activeDetailGame.id);
        }
        setShowFullscreenDetails(false);
      } else if (heroFocusedButton === "uninstall") {
        openConfirm("uninstall", activeDetailGame);
      } else if (onGameAction) {
        onGameAction(heroFocusedButton, activeDetailGame.id);
        setNotice(t(`console_ui.notice_${heroFocusedButton}`));
      }
    };

    window.addEventListener("omnis:details-action-a", handleActionA);
    return () => window.removeEventListener("omnis:details-action-a", handleActionA);
  }, [
    showFullscreenDetails,
    detailsFocusedSection,
    heroFocusedButton,
    isFocusedGameRunning,
    activeDetailGame,
    handleKillRunningGame,
    handleLaunch,
    setShowFullscreenDetails,
    confirm,
    onGameAction,
    t,
  ]);

  // Shortcut key listener: "k" or "Delete" terminates running focused game
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key.toLowerCase() === "k" || e.key === "Delete") && isFocusedGameRunning && handleKillRunningGame) {
        e.preventDefault();
        handleKillRunningGame();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFocusedGameRunning, handleKillRunningGame]);

  // ---------------------------------------------------------------------------
  // Side menu
  // ---------------------------------------------------------------------------
  const hasUpdate =
    updater?.status === "available" || updater?.status === "downloading" || updater?.status === "readyToInstall";

  const cycleTheme = React.useCallback(
    (delta: 1 | -1) => {
      if (themes.length === 0 || !onSelectTheme) return;
      const current = themes.findIndex((th) => th.id === currentTheme.id);
      onSelectTheme(themes[(current + delta + themes.length) % themes.length]);
    },
    [themes, onSelectTheme, currentTheme.id]
  );

  // Background trailers: follows the theme until toggled from the menu
  const [trailersPref, setTrailersPref] = React.useState<boolean | null>(() => {
    try {
      const saved = localStorage.getItem(TRAILERS_STORAGE_KEY);
      return saved === null ? null : saved === "on";
    } catch {
      return null;
    }
  });
  const trailersEnabled = trailersPref ?? !!currentTheme.enable_video_backdrop;
  const backdropTheme = React.useMemo(
    () => ({ ...currentTheme, enable_video_backdrop: trailersEnabled }),
    [currentTheme, trailersEnabled]
  );

  const toggleTrailers = () => {
    const next = !trailersEnabled;
    setTrailersPref(next);
    try {
      localStorage.setItem(TRAILERS_STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Not persisted, still applied for this session
    }
  };

  const cycleSort = (delta: 1 | -1) => {
    if (!onSortModeChange) return;
    const current = GAME_SORT_MODES.indexOf(sortMode);
    onSortModeChange(GAME_SORT_MODES[(current + delta + GAME_SORT_MODES.length) % GAME_SORT_MODES.length]);
  };

  const cycleLocale = (delta: 1 | -1) => {
    const current = SUPPORTED_LOCALES.findIndex((l) => l.code === locale);
    setLocale(SUPPORTED_LOCALES[(current + delta + SUPPORTED_LOCALES.length) % SUPPORTED_LOCALES.length].code);
  };

  const pickRandomGame = () => {
    const total = filteredGames.length;
    if (total === 0) return;
    let idx = Math.floor(Math.random() * total);
    if (total > 1 && idx === focusedIndex) idx = (idx + 1) % total;
    setFocusedIndex(idx);
    setHomeFocusZone?.("carousel");
    setIsMenuOpen?.(false);
  };

  const updateCheckValue =
    updater?.status === "checking"
      ? t("console_ui.update_checking")
      : updater?.status === "upToDate"
      ? t("console_ui.update_latest")
      : updater?.status === "error"
      ? t("console_ui.update_error")
      : undefined;

  const menuItems: ConsoleMenuItem[] = [];

  if (hasUpdate && updater) {
    menuItems.push({
      id: "updater",
      icon: Sparkles,
      spinning: updater.status === "downloading",
      tone: "accent",
      section: "update",
      label:
        updater.status === "readyToInstall"
          ? t("general_settings.updater_ready_to_install")
          : updater.status === "downloading"
          ? t("general_settings.updater_downloading")
          : t("general_settings.updater_available"),
      value:
        updater.status === "downloading"
          ? `${updater.progress?.percentage ?? 0}%`
          : updater.availableVersion
          ? `v${updater.availableVersion}`
          : undefined,
      onActivate: () => {
        if (updater.status === "available") updater.downloadAndInstall();
        else if (updater.status === "readyToInstall") updater.relaunch();
      },
    });
  }

  // Library
  menuItems.push({
    id: "search",
    icon: Search,
    section: "library",
    label: t("console_ui.search_library"),
    value: searchQuery ? `“${searchQuery}”` : undefined,
    onActivate: () => {
      setIsMenuOpen?.(false);
      setShowVirtualKeyboard(true);
    },
  });
  if (searchQuery && onClearSearch) {
    menuItems.push({
      id: "clear-search",
      icon: SearchX,
      section: "library",
      label: t("console_ui.clear_search"),
      onActivate: () => {
        onClearSearch();
        setIsMenuOpen?.(false);
      },
    });
  }
  menuItems.push({
    id: "layout",
    icon: layout === "grid" ? LayoutGrid : GalleryHorizontal,
    section: "library",
    label: t("console_ui.library_view"),
    value: layout === "grid" ? t("console_ui.view_grid") : t("console_ui.view_shelf"),
    onActivate: toggleLayout,
    onAdjust: () => toggleLayout(),
  });
  if (onSortModeChange) {
    menuItems.push({
      id: "sort",
      icon: ArrowDownWideNarrow,
      section: "library",
      label: t("console_ui.sort_by"),
      value: t(`console_ui.sort_${sortMode}`),
      onActivate: () => cycleSort(1),
      onAdjust: cycleSort,
    });
  }
  if (filteredGames.length > 1) {
    menuItems.push({
      id: "random",
      icon: Shuffle,
      section: "library",
      label: t("console_ui.random_game"),
      onActivate: pickRandomGame,
    });
  }
  menuItems.push(
    {
      id: "sync",
      icon: RefreshCw,
      spinning: isSyncing,
      section: "library",
      label: t("console_ui.sync_library"),
      value: isSyncing ? t("console_ui.syncing") : undefined,
      onActivate: handleSync,
    },
    {
      id: "plugins",
      icon: Puzzle,
      section: "library",
      label: t("console_ui.plugins"),
      onActivate: loadProvidersAndConfig,
    }
  );

  // Display
  menuItems.push(
    {
      id: "scale",
      icon: Type,
      section: "display",
      label: t("console_ui.ui_scale"),
      value: `${Math.round(scale * 100)}%`,
      onActivate: () => stepScale(1, true),
      onAdjust: (delta) => stepScale(delta),
    },
    {
      id: "theme",
      icon: Palette,
      section: "display",
      label: t("console_ui.theme"),
      value: currentTheme.name,
      onActivate: () => cycleTheme(1),
      onAdjust: cycleTheme,
    },
    {
      id: "trailers",
      icon: Film,
      section: "display",
      label: t("console_ui.trailers"),
      value: trailersEnabled ? t("common.enabled") : t("common.disabled"),
      onActivate: toggleTrailers,
      onAdjust: () => toggleTrailers(),
    },
    {
      id: "language",
      icon: Languages,
      section: "display",
      label: t("console_ui.language"),
      value: SUPPORTED_LOCALES.find((l) => l.code === locale)?.nativeName,
      onActivate: () => cycleLocale(1),
      onAdjust: cycleLocale,
    },
    {
      id: "sound",
      icon: soundEnabled ? Volume2 : VolumeX,
      section: "display",
      label: t("console_ui.sound"),
      value: soundEnabled ? t("common.enabled") : t("common.disabled"),
      onActivate: handleToggleSound,
      onAdjust: () => handleToggleSound(),
    }
  );

  // System
  if (updater && !hasUpdate) {
    menuItems.push({
      id: "check-updates",
      icon: CloudDownload,
      spinning: updater.status === "checking",
      section: "system",
      label: t("console_ui.check_updates"),
      value: updateCheckValue,
      onActivate: () => {
        if (updater.status !== "checking") updater.checkForUpdates();
      },
    });
  }
  menuItems.push(
    {
      id: "minimize",
      icon: Minimize2,
      section: "system",
      label: t("console_ui.minimize"),
      onActivate: () => {
        setIsMenuOpen?.(false);
        handleMinimize();
      },
    },
    {
      id: "desktop",
      icon: Monitor,
      section: "system",
      label: t("console_ui.desktop_mode"),
      onActivate: () => openConfirm("desktop"),
    },
    {
      id: "exit",
      icon: Power,
      tone: "danger",
      section: "system",
      label: t("console_ui.exit"),
      onActivate: () => openConfirm("exit"),
    }
  );

  const [menuFocusedIndex, setMenuFocusedIndex] = React.useState<number>(0);
  const safeMenuIndex = Math.min(menuFocusedIndex, menuItems.length - 1);
  const focusedMenuItem = menuItems[safeMenuIndex];

  // Reset menu focus whenever the menu opens
  React.useEffect(() => {
    if (isMenuOpen) setMenuFocusedIndex(0);
  }, [isMenuOpen]);

  const menuItemRefs = React.useRef<Record<string, HTMLLIElement | null>>({});
  const focusedMenuItemId = focusedMenuItem?.id;
  React.useEffect(() => {
    if (!isMenuOpen || !focusedMenuItemId) return;
    menuItemRefs.current[focusedMenuItemId]?.scrollIntoView({ block: "nearest" });
  }, [isMenuOpen, focusedMenuItemId]);

  // D-pad / arrows and Button A / Enter inside the menu
  React.useEffect(() => {
    if (!isMenuOpen) return;

    const handleMenuNav = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: "up" | "down" | "left" | "right" }>).detail?.direction;
      if (!dir || confirm) return;
      const count = menuItems.length;

      if (dir === "down") {
        setMenuFocusedIndex((prev) => (Math.min(prev, count - 1) + 1) % count);
        soundEffects.playNav();
      } else if (dir === "up") {
        setMenuFocusedIndex((prev) => (Math.min(prev, count - 1) <= 0 ? count - 1 : Math.min(prev, count - 1) - 1));
        soundEffects.playNav();
      } else if (focusedMenuItem?.onAdjust) {
        // Sound toggle gives its own audible feedback
        if (focusedMenuItem.id !== "sound") soundEffects.playNav();
        focusedMenuItem.onAdjust(dir === "right" ? 1 : -1);
      }
    };

    const handleMenuActionA = () => {
      if (!focusedMenuItem || confirm) return;
      soundEffects.playSelect();
      focusedMenuItem.onActivate();
    };

    window.addEventListener("omnis:menu-nav", handleMenuNav);
    window.addEventListener("omnis:menu-action-a", handleMenuActionA);
    return () => {
      window.removeEventListener("omnis:menu-nav", handleMenuNav);
      window.removeEventListener("omnis:menu-action-a", handleMenuActionA);
    };
  }, [isMenuOpen, menuItems, focusedMenuItem, confirm]);

  // Confirmation dialog input: any direction toggles the buttons, A confirms, Back cancels
  React.useEffect(() => {
    if (!confirm) return;

    const handleNav = () => {
      soundEffects.playNav();
      setConfirmFocus((f) => (f === "cancel" ? "confirm" : "cancel"));
    };

    const handleAction = () => {
      soundEffects.playSelect();
      setConfirm(null);
      if (confirmFocus !== "confirm") return;
      if (confirm.kind === "exit") {
        setIsMenuOpen?.(false);
        handleClose();
      } else if (confirm.kind === "desktop") {
        setIsMenuOpen?.(false);
        toggleFullscreen();
      } else if (confirm.game && onGameAction) {
        onGameAction("uninstall", confirm.game.id);
        setNotice(t("console_ui.notice_uninstall"));
      }
    };

    const handleBack = (e: Event) => {
      e.preventDefault();
      soundEffects.playSelect();
      setConfirm(null);
    };

    const events: Array<[string, EventListener]> = [
      ["omnis:menu-nav", handleNav],
      ["omnis:details-nav", handleNav],
      ["omnis:menu-action-a", handleAction],
      ["omnis:details-action-a", handleAction],
      ["omnis:menu-back", handleBack],
      ["omnis:details-back", handleBack],
    ];
    events.forEach(([name, fn]) => window.addEventListener(name, fn));
    return () => events.forEach(([name, fn]) => window.removeEventListener(name, fn));
  }, [confirm, confirmFocus, setIsMenuOpen, handleClose, toggleFullscreen, onGameAction, t]);

  // ---------------------------------------------------------------------------
  // Controller legend for the current context
  // ---------------------------------------------------------------------------
  const legendLeft: LegendEntry[] = [{ kind: "menu", label: t("console_ui.menu") }];
  let legendRight: LegendEntry[];

  const isInfoGameRunning = !!infoGame && activeGame?.game_id === infoGame.id;

  if (confirm) {
    legendRight = [
      { kind: "a", label: t("console_ui.select") },
      { kind: "b", label: t("common.cancel") },
    ];
  } else if (isMenuOpen) {
    legendRight = [
      ...(focusedMenuItem?.onAdjust ? [{ kind: "key" as const, glyphLabel: "◄ ►", label: t("console_ui.adjust") }] : []),
      { kind: "a", label: t("console_ui.select") },
      { kind: "b", label: t("console_ui.back") },
    ];
  } else if (showFullscreenDetails && activeDetailGame) {
    legendRight =
      detailsFocusedSection === "hero"
        ? [
            { kind: "key", glyphLabel: "▼", label: t("achievements.title") },
            {
              kind: "a",
              label:
                heroFocusedButton === "back"
                  ? t("console_ui.back")
                  : heroFocusedButton !== "launch"
                  ? t(HERO_ACTIONS[heroFocusedButton].labelKey)
                  : isFocusedGameRunning
                  ? t("console_ui.stop")
                  : activeDetailGame.is_installed
                  ? t("console_ui.play")
                  : t("console_ui.install"),
            },
            { kind: "b", label: t("console_ui.back") },
          ]
        : [
            { kind: "key", glyphLabel: "◄ ►", label: t("achievements.title") },
            { kind: "key", glyphLabel: "▲", label: t("console_ui.play") },
            { kind: "b", label: t("console_ui.back") },
          ];
  } else if (homeFocusZone === "topbar") {
    legendRight = [
      { kind: "a", label: t("console_ui.menu") },
      { kind: "b", label: t("console_ui.back") },
    ];
  } else {
    legendRight = [
      { kind: "bumpers", label: t("console_ui.category") },
      { kind: "r3", label: layout === "grid" ? t("console_ui.view_shelf") : t("console_ui.view_grid") },
      { kind: "y", label: t("console_ui.search") },
      ...(filteredGames.length > 0
        ? ([
            { kind: "x", label: t("console_ui.details") },
            isInfoGameRunning
              ? { kind: "key", glyphLabel: "K", label: t("console_ui.stop"), tone: "danger" }
              : { kind: "a", label: infoGame?.is_installed ? t("console_ui.play") : t("console_ui.install") },
          ] as LegendEntry[])
        : []),
    ];
  }

  const playtimeLabel = (game: GameDto) =>
    game.playtime_seconds > 0 ? game.playtime_formatted : t("console_ui.never_played");

  const renderMetaLine = (game: GameDto) => (
    <div className="flex items-center gap-4 h-6 mt-1.5 overflow-hidden whitespace-nowrap text-sm font-semibold uppercase tracking-wider text-white/65">
      {activeGame?.game_id === game.id ? (
        <span className="flex items-center gap-2 text-emerald-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          {t("status.running")} · {duration(elapsedSeconds || 0)}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <Play className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
          {t("game_details.playtime")}: {playtimeLabel(game)}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <StoreIcon library={game.library} className="w-3.5 h-3.5" />
        {STORE_LABELS[game.library] ?? game.library}
      </span>
      {game.is_installed && (
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t("sidebar.installed")}
        </span>
      )}
      {game.critic_score && <span className="text-amber-300">★ {game.critic_score}</span>}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main
      data-omnis="fullscreen"
      className="relative flex flex-col h-screen w-screen overflow-hidden cursor-none pointer-events-none select-none"
      style={{ backgroundColor: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      {/* Ambient backdrop of the focused game */}
      <VideoBackdrop game={infoGame} theme={backdropTheme} blurLevel="none" isPaused={isGameRunning} />
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.1) 22%, rgba(0, 0, 0, 0.35) 55%, rgba(0, 0, 0, 0.7) 100%)",
        }}
      />
      {layout === "grid" && hasGames && (
        <div className="absolute inset-0 z-0 pointer-events-none" style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }} />
      )}

      {/* TOP BAR: menu, category tabs, status */}
      <header className="relative z-20 flex items-center gap-6 px-10 pt-6 pb-2 shrink-0">
        <div
          className="flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-semibold uppercase tracking-wider transition-colors duration-150"
          style={
            homeFocusZone === "topbar" || isMenuOpen
              ? { backgroundColor: "#ffffff", color: "#0b0f19" }
              : { backgroundColor: "rgba(255, 255, 255, 0.08)", color: "rgba(255, 255, 255, 0.85)" }
          }
        >
          <Menu className="w-4 h-4" />
          <span>{t("console_ui.menu")}</span>
        </div>

        <nav className="flex-1 min-w-0 flex items-center justify-center gap-3">
          <Glyph kind="lb" />
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
            {visibleFilters.map((id) => {
              const isActive = id === activeFilter;
              return (
                <span
                  key={id}
                  ref={(el) => {
                    tabRefs.current[id] = el;
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold uppercase tracking-wider transition-colors duration-150"
                  style={
                    isActive
                      ? { backgroundColor: "rgba(255, 255, 255, 0.16)", color: "#ffffff" }
                      : { color: "rgba(255, 255, 255, 0.55)" }
                  }
                >
                  {STORE_LABELS[id] && <StoreIcon library={id} className="w-3.5 h-3.5" />}
                  {filterLabel(id)}
                  {isActive && <span className="text-xs font-medium opacity-60">{filterCount(id)}</span>}
                </span>
              );
            })}
          </div>
          <Glyph kind="rb" />
        </nav>

        <div className="flex items-center gap-5 text-white/90 shrink-0">
          {activeGame && (
            <span
              className={`flex items-center gap-2 text-sm font-medium ${
                activeGame.state === "stopping" ? "text-rose-300" : activeGame.state === "launching" ? "text-amber-300" : "text-emerald-300"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
              <span className="max-w-[14rem] truncate">{activeGame.title}</span>
              {activeGame.state === "running" && <span className="text-white/60">{duration(elapsedSeconds || 0)}</span>}
            </span>
          )}
          {hasUpdate && <Sparkles className="w-5 h-5 text-sky-300" />}
          {searchQuery && (
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Search className="w-4 h-4" />
              <span className="max-w-[10rem] truncate">{searchQuery}</span>
            </span>
          )}
          <Gamepad2 className={`w-5 h-5 ${gamepadConnected ? "text-white" : "text-white/35"}`} />
          <span className="text-xl font-medium tabular-nums">{clock}</span>
        </div>
      </header>

      {/* HOME CONTENT */}
      {filteredGames.length === 0 ? (
        <section className="relative z-10 flex-1 flex flex-col items-center justify-center gap-4 px-16 text-center omnis-fade-in">
          <Search className="w-12 h-12 text-white/40" />
          <h2 className="text-3xl font-semibold text-white">{t("console_ui.empty_title")}</h2>
          <p className="text-base max-w-xl" style={{ color: "var(--text-muted)" }}>
            {searchQuery
              ? t("console_ui.empty_search", { query: searchQuery })
              : t("console_ui.empty_category")}
          </p>
          <div className="flex items-center gap-8 pt-4 text-sm font-semibold uppercase tracking-wider text-white">
            <span className="flex items-center gap-2.5">
              <Glyph kind="y" />
              {t("console_ui.search")}
            </span>
            <span className="flex items-center gap-2.5">
              <Glyph kind="bumpers" />
              {t("console_ui.category")}
            </span>
          </div>
        </section>
      ) : layout === "shelf" ? (
        <section className="relative z-10 flex-1 min-h-0 flex flex-col justify-end pb-8">
          {showRecentRow && (
            <div className="px-10 mb-8">
              <h3
                className={`mb-3 text-sm font-semibold uppercase tracking-widest transition-colors ${
                  homeFocusZone === "recent" ? "text-white" : "text-white/55"
                }`}
              >
                {t("console_ui.continue_playing")}
              </h3>
              <div className="flex gap-4 py-1">
                {recentGames.map((game, idx) => (
                  <RecentCard
                    key={game.id}
                    game={game}
                    isFocused={homeFocusZone === "recent" && idx === safeRecentIndex}
                  />
                ))}
              </div>
            </div>
          )}

          <h2 className="px-10 mb-4 text-3xl font-semibold text-white tracking-tight drop-shadow">
            {filterLabel(activeFilter)}
            <span className="ml-3 text-lg font-normal text-white/50">{filteredGames.length}</span>
            {sortMode !== "default" && (
              <span className="ml-4 text-sm font-semibold uppercase tracking-wider text-white/45">
                {t(`console_ui.sort_${sortMode}`)}
              </span>
            )}
          </h2>

          {/* Shelf: cards must stay direct children of the ref */}
          <div
            ref={carouselRef}
            className="flex items-center overflow-x-auto no-scrollbar px-10 py-3"
            style={{ gap: `${CARD_GAP_REM}rem` }}
          >
            {filteredGames.map((game, idx) => (
              <ShelfCard
                key={game.id}
                game={game}
                isFocused={idx === focusedIndex}
                isRunning={activeGame?.game_id === game.id}
                hasFocusRing={homeFocusZone === "carousel"}
                liveLabel={t("console_ui.live")}
              />
            ))}
          </div>

          {infoGame && (
            <div data-omnis="fullscreen.hero" className="px-10 mt-5 max-w-4xl">
              {/* Keyed so the text re-animates on focus change; fixed line heights keep the shelf from shifting */}
              <div key={infoGame.id} className="omnis-rise-in">
                <h1 data-omnis="fullscreen.title" className="h-8 text-2xl leading-8 font-semibold text-white truncate drop-shadow">
                  {infoGame.title}
                </h1>
                {renderMetaLine(infoGame)}
                <p className="mt-3 h-[3.25rem] text-base leading-relaxed line-clamp-2 max-w-3xl text-white/70">
                  {infoGame.description}
                </p>
              </div>
              <Slot name="fullscreen.hero" gameId={infoGame.id} />
            </div>
          )}
        </section>
      ) : (
        <section className="relative z-10 flex-1 min-h-0 flex flex-col">
          <h2 className="px-10 pt-4 text-3xl font-semibold text-white tracking-tight drop-shadow">
            {filterLabel(activeFilter)}
            <span className="ml-3 text-lg font-normal text-white/50">{filteredGames.length}</span>
            {sortMode !== "default" && (
              <span className="ml-4 text-sm font-semibold uppercase tracking-wider text-white/45">
                {t(`console_ui.sort_${sortMode}`)}
              </span>
            )}
          </h2>

          {/* Grid: covers must stay direct children of the ref */}
          <div
            ref={gridRef}
            className="flex-1 min-h-0 overflow-y-auto no-scrollbar grid content-start px-10 py-5"
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, gridColumns)}, minmax(0, 1fr))`,
              gap: `${GRID_GAP_REM}rem`,
              scrollPaddingBlock: "1.5rem",
            }}
          >
            {filteredGames.map((game, idx) => (
              <GridCard
                key={game.id}
                game={game}
                isFocused={idx === focusedIndex}
                isRunning={activeGame?.game_id === game.id}
              />
            ))}
          </div>

          {focusedGame && (
            <div data-omnis="fullscreen.hero" className="px-10 pt-2 pb-5 shrink-0">
              <div key={focusedGame.id} className="omnis-rise-in">
                <h1 data-omnis="fullscreen.title" className="h-8 text-2xl leading-8 font-semibold text-white truncate drop-shadow">
                  {focusedGame.title}
                </h1>
                {renderMetaLine(focusedGame)}
              </div>
              <Slot name="fullscreen.hero" gameId={focusedGame.id} />
            </div>
          )}
        </section>
      )}

      {/* GAME DETAILS PAGE */}
      {showFullscreenDetails && activeDetailGame && (
        <div className="fixed inset-0 z-40 flex flex-col omnis-fade-in" style={{ backgroundColor: "var(--bg-base)" }}>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-x-0 top-0 h-[75vh]">
              <ArtImage
                sources={[activeDetailGame.background_image, activeDetailGame.cover_image]}
                title={activeDetailGame.title}
                library={activeDetailGame.library}
              />
            </div>
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0.35) 35%, var(--bg-base) 75%), linear-gradient(to right, rgba(0, 0, 0, 0.6) 0%, transparent 60%)",
              }}
            />
          </div>

          <div ref={detailsScrollRef} className="relative z-10 flex-1 overflow-y-auto no-scrollbar pb-24">
            {/* Hero */}
            <section className="min-h-[62vh] flex flex-col justify-end px-16 pb-10 gap-5">
              <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wider text-white/70">
                <StoreIcon library={activeDetailGame.library} className="w-4 h-4" />
                <span>{STORE_LABELS[activeDetailGame.library] ?? activeDetailGame.library}</span>
                {activeDetailGame.genres.length > 0 && <span>· {activeDetailGame.genres.slice(0, 3).join(" · ")}</span>}
              </div>

              <div>
                <h1 className="text-6xl font-bold text-white tracking-tight leading-tight drop-shadow-lg max-w-5xl">
                  {activeDetailGame.title}
                </h1>
                {activeDetailGame.developers.length > 0 && (
                  <p className="mt-2 text-lg text-white/70">
                    {activeDetailGame.developers.join(", ")}
                    {activeDetailGame.publishers && activeDetailGame.publishers.length > 0 && (
                      <span className="text-white/45"> · {activeDetailGame.publishers.join(", ")}</span>
                    )}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                {(() => {
                  const isFocused = detailsFocusedSection === "hero" && heroFocusedButton === "launch";
                  const isStop = isFocusedGameRunning && !!handleKillRunningGame;
                  return (
                    <div
                      className="flex items-center gap-3 px-10 py-4 rounded-md text-lg font-semibold uppercase tracking-wider transition-all duration-150"
                      style={{
                        backgroundColor: isStop ? "#e11d48" : "var(--accent-primary)",
                        color: "#ffffff",
                        boxShadow: isFocused ? "0 0 0 0.2rem #ffffff, 0 0 2.5rem var(--accent-glow)" : "none",
                        transform: isFocused ? "scale(1.04)" : "none",
                        opacity: isFocused ? 1 : 0.75,
                      }}
                    >
                      {isStop ? (
                        <>
                          <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                          {activeGame?.state === "launching" ? t("fullscreen.cancel_launch") : t("console_ui.stop")}
                          <span className="text-sm font-medium opacity-80">{duration(elapsedSeconds || 0)}</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-5 h-5 fill-white" />
                          {activeDetailGame.is_installed ? t("console_ui.play") : t("console_ui.install")}
                        </>
                      )}
                    </div>
                  );
                })()}

                {heroButtons.map((button) => {
                  if (button === "launch" || button === "back") return null;
                  const action = HERO_ACTIONS[button];
                  const Icon = action.icon;
                  const isFocused = detailsFocusedSection === "hero" && heroFocusedButton === button;
                  return (
                    <div
                      key={button}
                      className="flex items-center gap-2.5 px-5 py-4 rounded-md text-base font-semibold transition-all duration-150"
                      style={
                        isFocused
                          ? {
                              backgroundColor: action.danger ? "#e11d48" : "#ffffff",
                              color: action.danger ? "#ffffff" : "#0b0f19",
                              transform: "scale(1.04)",
                            }
                          : { backgroundColor: "rgba(255, 255, 255, 0.1)", color: "rgba(255, 255, 255, 0.85)" }
                      }
                    >
                      <Icon className="w-5 h-5" />
                      {t(action.labelKey)}
                    </div>
                  );
                })}

                <div
                  className="px-8 py-4 rounded-md text-lg font-semibold uppercase tracking-wider transition-all duration-150"
                  style={
                    detailsFocusedSection === "hero" && heroFocusedButton === "back"
                      ? { backgroundColor: "#ffffff", color: "#0b0f19", transform: "scale(1.04)" }
                      : { backgroundColor: "rgba(255, 255, 255, 0.1)", color: "rgba(255, 255, 255, 0.85)" }
                  }
                >
                  {t("console_ui.back")}
                </div>
              </div>

              <dl className="flex items-start gap-12 pt-2">
                {[
                  { label: t("game_details.playtime"), value: playtimeLabel(activeDetailGame) },
                  { label: t("game_details.release_date"), value: activeDetailGame.release_date },
                  {
                    label: "Metacritic",
                    value: activeDetailGame.critic_score ? `★ ${activeDetailGame.critic_score}` : null,
                  },
                ]
                  .filter((stat) => stat.value)
                  .map((stat) => (
                    <div key={stat.label}>
                      <dt className="text-xs font-semibold uppercase tracking-widest text-white/50">{stat.label}</dt>
                      <dd className="mt-1 text-xl font-medium text-white">{stat.value}</dd>
                    </div>
                  ))}
              </dl>
            </section>

            {/* About */}
            <section className="px-16 pb-10 max-w-5xl">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-white/50 mb-3">
                {t("console_ui.about")}
              </h3>
              <p className="text-lg leading-relaxed whitespace-pre-line text-white/85">
                {activeDetailGame.description || t("fullscreen.no_desc")}
              </p>
            </section>

            {/* Achievements */}
            <section
              className="mx-16 p-6 rounded-lg transition-shadow duration-200"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                boxShadow: detailsFocusedSection === "achievements" ? "0 0 0 0.15rem rgba(255, 255, 255, 0.6)" : "none",
              }}
            >
              <GameAchievementsGallery
                key={activeDetailGame.id}
                game={activeDetailGame}
                isFullscreen={true}
                focusedIndex={achievementsFocusedIndex}
                onFocusIndexChange={setAchievementsFocusedIndex}
                onTotalAchievementsChange={setTotalAchievements}
              />
            </section>
          </div>
        </div>
      )}

      {/* SIDE MENU */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/55 omnis-fade-in" />
          <aside
            className="relative h-full w-[26rem] max-w-[85vw] flex flex-col pt-8 pb-24 shadow-2xl omnis-slide-in-left"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <div className="flex items-baseline justify-between px-8 pb-6">
              <span className="text-2xl font-bold tracking-tight text-white">
                Omnis
                {updater?.currentVersion && (
                  <span className="ml-2 text-sm font-medium text-white/40">v{updater.currentVersion}</span>
                )}
              </span>
              <span className="text-lg font-medium tabular-nums text-white/60">{clock}</span>
            </div>

            <ul className="flex-1 overflow-y-auto no-scrollbar px-4">
              {menuItems.map((item, idx) => {
                const isFocused = idx === safeMenuIndex;
                const Icon = item.icon;
                const sectionLabelKey =
                  menuItems[idx - 1]?.section !== item.section ? MENU_SECTION_LABEL_KEYS[item.section] : undefined;
                const focusedStyle =
                  item.tone === "danger"
                    ? { backgroundColor: "#e11d48", color: "#ffffff" }
                    : { backgroundColor: "#ffffff", color: "#0b0f19" };
                return (
                  <React.Fragment key={item.id}>
                    {sectionLabelKey && (
                      <li
                        className={`px-4 pb-2 text-xs font-semibold uppercase tracking-widest text-white/40 ${idx > 0 ? "pt-6" : ""}`}
                      >
                        {t(sectionLabelKey)}
                      </li>
                    )}
                    <li
                      ref={(el) => {
                        menuItemRefs.current[item.id] = el;
                      }}
                      className="flex items-center gap-4 px-4 py-3 rounded-md transition-colors duration-100"
                      style={
                        isFocused
                          ? focusedStyle
                          : { color: item.tone === "accent" ? "#7dd3fc" : "rgba(255, 255, 255, 0.85)" }
                      }
                    >
                      <Icon className={`w-5 h-5 shrink-0 ${item.spinning ? "animate-spin" : ""}`} />
                      <span className="flex-1 min-w-0 truncate text-base font-medium">{item.label}</span>
                      {item.value && (
                        <span className={`flex items-center gap-1 text-sm shrink-0 ${isFocused ? "opacity-80" : "opacity-55"}`}>
                          {isFocused && item.onAdjust && <ChevronLeft className="w-4 h-4" />}
                          <span className="max-w-[9rem] truncate">{item.value}</span>
                          {isFocused && item.onAdjust && <ChevronRight className="w-4 h-4" />}
                        </span>
                      )}
                    </li>
                  </React.Fragment>
                );
              })}
            </ul>
          </aside>
        </div>
      )}

      {/* CONFIRMATION DIALOG */}
      {confirm && (
        <div className="fixed inset-0 z-[45] flex items-center justify-center bg-black/60 omnis-fade-in">
          <div
            className="w-[30rem] max-w-[90vw] rounded-xl p-8 flex flex-col gap-6 shadow-2xl omnis-rise-in"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <div>
              <h2 className="text-2xl font-semibold text-white">
                {confirm.kind === "exit"
                  ? t("console_ui.confirm_exit")
                  : confirm.kind === "desktop"
                  ? t("console_ui.confirm_desktop")
                  : t("console_ui.confirm_uninstall", { title: confirm.game?.title ?? "" })}
              </h2>
              {confirm.kind === "uninstall" && (
                <p className="mt-2 text-base text-white/65">{t("console_ui.confirm_uninstall_desc")}</p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              {(["cancel", "confirm"] as const).map((button) => {
                const isFocused = confirmFocus === button;
                const isDanger = button === "confirm" && confirm.kind !== "desktop";
                return (
                  <div
                    key={button}
                    className="px-6 py-3 rounded-md text-base font-semibold uppercase tracking-wider transition-all duration-150"
                    style={
                      isFocused
                        ? {
                            backgroundColor: isDanger ? "#e11d48" : "#ffffff",
                            color: isDanger ? "#ffffff" : "#0b0f19",
                            transform: "scale(1.04)",
                          }
                        : { backgroundColor: "rgba(255, 255, 255, 0.1)", color: "rgba(255, 255, 255, 0.85)" }
                    }
                  >
                    {button === "cancel"
                      ? t("common.cancel")
                      : confirm.kind === "exit"
                      ? t("console_ui.exit")
                      : confirm.kind === "desktop"
                      ? t("console_ui.desktop_mode")
                      : t("console_ui.action_uninstall")}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ACTION NOTICE */}
      {notice && (
        <div
          className="fixed top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-lg shadow-2xl omnis-rise-in"
          style={{ backgroundColor: "var(--bg-surface)", borderLeft: "0.25rem solid #38bdf8" }}
        >
          <CheckCircle2 className="w-5 h-5 text-sky-300 shrink-0" />
          <span className="text-base font-medium text-white">{notice}</span>
        </div>
      )}

      {/* SESSION ENDED TOAST */}
      {sessionToast && (
        <div
          className="fixed top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 pl-5 pr-3 py-3 rounded-lg shadow-2xl omnis-rise-in max-w-xl"
          style={{ backgroundColor: "var(--bg-surface)", borderLeft: "0.25rem solid #34d399" }}
        >
          <Gamepad2 className="w-7 h-7 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
              {t("fullscreen.session_ended")}
            </p>
            <p className="text-lg font-semibold text-white truncate">{sessionToast.title}</p>
            <p className="text-sm text-white/65">
              {t("fullscreen.played_time")} {duration(sessionToast.durationSeconds)}
            </p>
          </div>
          {onDismissToast && (
            <button
              type="button"
              onClick={onDismissToast}
              className="ml-2 w-8 h-8 rounded-full flex items-center justify-center text-white/60"
              title={t("common.close")}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* UPDATE PROGRESS */}
      {updater && (updater.status === "downloading" || updater.status === "readyToInstall") && (
        <div
          className="fixed bottom-20 right-10 z-50 w-80 flex flex-col gap-3 p-4 rounded-lg shadow-2xl omnis-rise-in"
          style={{ backgroundColor: "var(--bg-surface)" }}
        >
          <div className="flex items-center gap-3">
            <Sparkles className={`w-5 h-5 text-sky-300 shrink-0 ${updater.status === "downloading" ? "animate-spin" : ""}`} />
            <span className="text-sm font-semibold text-white">
              {updater.status === "readyToInstall"
                ? t("general_settings.updater_ready_to_install")
                : `${t("general_settings.updater_downloading")} ${updater.progress?.percentage ?? 0}%`}
            </span>
          </div>
          {updater.status === "downloading" && (
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-300"
                style={{ width: `${updater.progress?.percentage ?? 0}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* INTERFACE SCALE INDICATOR */}
      {scaleHintVisible && (
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-lg shadow-2xl omnis-fade-in"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
        >
          <Type className="w-6 h-6 text-white/70" />
          <span className="text-sm font-semibold uppercase tracking-wider text-white/70">{t("console_ui.ui_scale")}</span>
          <span className="text-2xl font-semibold text-white tabular-nums">{Math.round(scale * 100)}%</span>
        </div>
      )}

      {/* CONTROLLER LEGEND (always on top) */}
      <div className="relative z-50 mt-auto">
        <ControllerLegend left={legendLeft} right={legendRight} />
      </div>
    </main>
  );
}
