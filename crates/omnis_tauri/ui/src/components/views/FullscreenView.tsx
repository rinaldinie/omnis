import React from "react";
import {
  FolderOpen,
  ShieldCheck,
  Link2,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ActiveGameSession,
  GameDto,
  LibraryCounts,
  ThemeConfig,
  TranslateFn,
} from "../../types";
import { api } from "../../api";
import { useLibraryStore, useUiStore } from "../../stores";
import { categoryCount, getVisibleCategories, toCategoryId } from "../../utils/consoleCategories";
import { StoreIcon } from "../common/StoreBadge";
import soundEffects from "../../utils/soundEffects";
import { VideoBackdrop } from "../common/VideoBackdrop";
import { useTranslation } from "../../i18n/i18nContext";
import { useActiveGameTimer } from "../../context/ActiveGameTimerContext";
import { GameSortMode } from "../../utils/sortGames";
import { useUpdater } from "../../hooks/useAppUpdater";
import { useUiScale } from "../../hooks/useUiScale";
import { BACK_PRIORITY, useBackHandler } from "../../hooks/useBackHandler";
import type { ConsolePage, HomeFocusZone } from "../../hooks/useGamepadNavigation";
import {
  useClock,
  useInputPrompt,
} from "../fullscreen/ConsoleChrome";
import type { ControllerStyleSetting } from "../fullscreen/ConsoleChrome";
import {
  CARD_W_REM,
  CARD_GAP_REM,
  GRID_CARD_W_REM,
  GRID_GAP_REM,
  RECENT_ROW_SIZE,
  RECENT_ROW_MIN_VIEWPORT_REM,
  ArtImage,
} from "../fullscreen/FullscreenCards";
import { FullscreenQuickMenu } from "../fullscreen/FullscreenQuickMenu";
import { FullscreenConfirmDialog, ConfirmKind } from "../fullscreen/FullscreenConfirmDialog";
import { FullscreenDetailsOverlay } from "../fullscreen/FullscreenDetailsOverlay";
import { FullscreenTopBar } from "../fullscreen/FullscreenTopBar";
import { FullscreenHomeContent } from "../fullscreen/FullscreenHomeContent";
import { FullscreenOverlays } from "../fullscreen/FullscreenOverlays";
import { FullscreenLaunchOverlay } from "../fullscreen/FullscreenLaunchOverlay";
import { FullscreenAchievementsPage } from "../fullscreen/FullscreenAchievementsPage";
import { FullscreenStatsPage } from "../fullscreen/FullscreenStatsPage";
import { useGameAchievements } from "../achievements";
import { useFullscreenMenu } from "../fullscreen/useFullscreenMenu";
import {
  STORE_LABELS,
  FILTER_LABEL_KEYS,
  MENU_SECTION_LABEL_KEYS,
  duration as defaultDuration,
} from "../fullscreen/constants";
import type { PowerActionId } from "../fullscreen/constants";

interface FullscreenViewProps {
  focusedGame: GameDto | null;
  filteredGames: GameDto[];
  /** Whole library, unfiltered (statistics page) */
  allGames?: GameDto[];
  focusedIndex: number;
  setFocusedIndex: (idx: number) => void;
  counts?: LibraryCounts;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  cycleFilter?: (direction: number, onCycle?: (nextFilter: string) => void) => void;
  gamepadConnected: boolean;
  searchQuery: string;
  setShowVirtualKeyboard?: (show: boolean) => void;
  soundEnabled?: boolean;
  handleToggleSound: () => void;
  currentTheme: ThemeConfig;
  toggleFullscreen: () => void;
  handleMinimize: () => void;
  handleClose: () => void;
  handleLaunch: (gameId: string) => void;
  handleSync: () => void;
  isSyncing?: boolean;
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
  t: TranslateFn;
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
  consolePage?: ConsolePage | null;
  setConsolePage?: (page: ConsolePage | null) => void;
  themes?: ThemeConfig[];
  onSelectTheme?: (theme: ThemeConfig) => void;
}

export type GameAction = "folder" | "verify" | "shortcut" | "uninstall";
type HeroButton = "launch" | GameAction;

const HERO_ACTIONS: Record<GameAction, { icon: LucideIcon; labelKey: string; danger?: boolean }> = {
  folder: { icon: FolderOpen, labelKey: "console_ui.action_folder" },
  verify: { icon: ShieldCheck, labelKey: "console_ui.action_verify" },
  shortcut: { icon: Link2, labelKey: "console_ui.action_shortcut" },
  uninstall: { icon: Trash2, labelKey: "console_ui.action_uninstall", danger: true },
};

type LibraryLayout = "shelf" | "grid";
const LAYOUT_STORAGE_KEY = "omnis_fullscreen_layout";

function readSavedLayout(): LibraryLayout {
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY) === "grid" ? "grid" : "shelf";
  } catch {
    return "shelf";
  }
}

export default function FullscreenView({
  focusedGame,
  filteredGames,
  allGames: propAllGames,
  focusedIndex,
  setFocusedIndex,
  counts: propCounts,
  activeFilter,
  setActiveFilter,
  cycleFilter: propCycleFilter,
  gamepadConnected,
  searchQuery,
  setShowVirtualKeyboard: propSetShowVirtualKeyboard,
  soundEnabled: propSoundEnabled,
  handleToggleSound,
  currentTheme,
  toggleFullscreen,
  handleMinimize: _handleMinimize,
  handleClose,
  handleLaunch,
  handleSync,
  isSyncing: propIsSyncing,
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
  isGameRunning: propIsGameRunning,
  activeGame: propActiveGame,
  elapsedSeconds,
  formatDuration,
  handleKillRunningGame,
  sessionToast: propSessionToast,
  onDismissToast: propOnDismissToast,
  homeFocusZone = "carousel",
  setHomeFocusZone,
  isMenuOpen = false,
  setIsMenuOpen,
  consolePage = null,
  setConsolePage,
  themes = [],
  onSelectTheme,
}: FullscreenViewProps) {
  const storeGames = useLibraryStore((s) => s.games);
  const storeCounts = useLibraryStore((s) => s.counts);
  const storeSetShowVirtualKeyboard = useUiStore((s) => s.setShowVirtualKeyboard);
  const storeSoundEnabled = useUiStore((s) => s.soundEnabled);
  const storeIsSyncing = useUiStore((s) => s.isSyncing);
  const storeIsGameRunning = useUiStore((s) => s.isGameRunning);
  const storeActiveGame = useUiStore((s) => s.activeGame);
  const storeSessionToast = useUiStore((s) => s.sessionToast);
  const storeSetSessionToast = useUiStore((s) => s.setSessionToast);

  const allGames = propAllGames ?? storeGames;
  const counts = propCounts ?? storeCounts;
  const setShowVirtualKeyboard = propSetShowVirtualKeyboard ?? storeSetShowVirtualKeyboard;
  const soundEnabled = propSoundEnabled ?? storeSoundEnabled;
  const isSyncing = propIsSyncing ?? storeIsSyncing;
  const isGameRunning = propIsGameRunning ?? storeIsGameRunning;
  const activeGame = propActiveGame !== undefined ? propActiveGame : storeActiveGame;
  const sessionToast = propSessionToast !== undefined ? propSessionToast : storeSessionToast;
  const onDismissToast = propOnDismissToast ?? (() => storeSetSessionToast(null));
  const { locale, setLocale } = useTranslation();
  const timerContextSeconds = useActiveGameTimer();
  const actualElapsed = elapsedSeconds ?? timerContextSeconds;
  const { styleSetting, setStyleSetting, effectiveFamily } = useInputPrompt();
  const updater = useUpdater();
  const clock = useClock(locale);
  const { scale, stepScale, resetScale } = useUiScale(true);
  const isFocusedGameRunning = activeGame?.game_id === focusedGame?.id;
  const duration = (seconds: number) => (formatDuration ? formatDuration(seconds) : defaultDuration(seconds));

  const cycleControllerStyle = React.useCallback(
    (delta: 1 | -1 = 1) => {
      const styles: ControllerStyleSetting[] = ["auto", "xbox", "playstation", "nintendo", "keyboard"];
      const currentIdx = styles.indexOf(styleSetting);
      const nextIdx = (currentIdx + delta + styles.length) % styles.length;
      setStyleSetting(styles[nextIdx]);
    },
    [styleSetting, setStyleSetting]
  );

  // Interface scale: Ctrl + / Ctrl - / Ctrl 0
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

  // Layout mode
  const [layout, setLayout] = React.useState<LibraryLayout>(readSavedLayout);

  const toggleLayout = React.useCallback(() => {
    setLayout((prev) => {
      const next = prev === "grid" ? "shelf" : "grid";
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, next);
      } catch {
        // fallback
      }
      return next;
    });
    setHomeFocusZone?.("carousel");
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement && activeEl.tagName === "BUTTON") {
      activeEl.blur();
    }
  }, [setHomeFocusZone]);

  React.useEffect(() => {
    const handleToggle = () => {
      soundEffects.playSelect();
      toggleLayout();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      if ((e.key.toLowerCase() === "g" || e.key === "Tab") && !e.ctrlKey && !e.altKey && !isMenuOpen && !showFullscreenDetails && !consolePage) {
        e.preventDefault();
        handleToggle();
      }
    };
    window.addEventListener("omnis:toggle-layout", handleToggle);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("omnis:toggle-layout", handleToggle);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleLayout, isMenuOpen, showFullscreenDetails, consolePage]);

  const gridRef = React.useRef<HTMLDivElement>(null);
  const [gridColumns, setGridColumns] = React.useState(0);
  const hasGridContent = layout === "grid" && filteredGames.length > 0;

  React.useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!hasGridContent || !grid) {
      setGridColumns(0);
      return;
    }
    const measure = () => {
      if (grid.clientWidth <= 0) return;
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
  }, [hasGridContent, scale]);

  React.useEffect(() => {
    onGridColumnsChange?.(layout === "grid" ? gridColumns : 0);
  }, [layout, gridColumns, onGridColumnsChange]);

  // Viewport height
  const [viewportHeightRem, setViewportHeightRem] = React.useState<number>(() => {
    if (typeof window === "undefined") return 60;
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return window.innerHeight / remPx;
  });
  React.useEffect(() => {
    const measure = () => {
      const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setViewportHeightRem(window.innerHeight / remPx);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [scale]);

  // Recent row
  const recentGames = React.useMemo(() => {
    const installed = filteredGames.filter((g) => g.is_installed);
    const sorted = [...installed]
      .filter((g) => {
        const aTime = g.last_activity ? new Date(g.last_activity).getTime() : 0;
        return aTime > 0 || g.playtime_seconds > 0;
      })
      .sort((a, b) => {
        const aTime = a.last_activity ? new Date(a.last_activity).getTime() : 0;
        const bTime = b.last_activity ? new Date(b.last_activity).getTime() : 0;
        if (bTime !== aTime) return bTime - aTime;
        return b.playtime_seconds - a.playtime_seconds;
      });
    return sorted.slice(0, RECENT_ROW_SIZE);
  }, [filteredGames]);

  const showRecentRow =
    layout === "shelf" &&
    recentGames.length > 0 &&
    viewportHeightRem >= RECENT_ROW_MIN_VIEWPORT_REM;

  React.useEffect(() => {
    onRecentRowChange?.(showRecentRow);
  }, [showRecentRow, onRecentRowChange]);

  const [recentIndex, setRecentIndex] = React.useState<number>(0);
  const safeRecentIndex = Math.min(recentIndex, Math.max(0, recentGames.length - 1));
  const infoGame =
    homeFocusZone === "recent" && showRecentRow
      ? recentGames[safeRecentIndex] || focusedGame
      : focusedGame;
  const isInfoGameRunning = !!infoGame && activeGame?.game_id === infoGame.id;

  // Global emergency gamepad combo: hold Start (9) + Select (8) for 2 seconds to kill active game
  React.useEffect(() => {
    if (!activeGame || !handleKillRunningGame) return;
    let rafId = 0;
    let comboStart: number | null = null;
    let triggered = false;

    const poll = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let bothHeld = false;
      for (const gp of gamepads) {
        if (gp && gp.buttons[8]?.pressed && gp.buttons[9]?.pressed) {
          bothHeld = true;
          break;
        }
      }

      if (bothHeld) {
        if (comboStart === null) {
          comboStart = performance.now();
        } else if (!triggered && performance.now() - comboStart >= 2000) {
          triggered = true;
          handleKillRunningGame();
        }
      } else {
        comboStart = null;
        triggered = false;
      }

      rafId = requestAnimationFrame(poll);
    };

    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [activeGame, handleKillRunningGame]);

  // Confirmation dialog state (game uninstall); system actions are confirmed inline in the menu
  const [confirm, setConfirm] = React.useState<{ kind: ConfirmKind; game?: GameDto } | null>(null);
  const [confirmFocus, setConfirmFocus] = React.useState<"cancel" | "confirm">("cancel");
  const confirmRef = React.useRef(confirm);
  confirmRef.current = confirm;
  const confirmFocusRef = React.useRef(confirmFocus);
  confirmFocusRef.current = confirmFocus;
  const openConfirm = (kind: ConfirmKind, game?: GameDto) => {
    setConfirm({ kind, game });
    setConfirmFocus("cancel");
  };

  const activeGameTitle = activeGame
    ? ((allGames ?? filteredGames).find((g) => g.id === activeGame.game_id)?.title ?? activeGame.game_id)
    : null;

  // Side menu hook
  const {
    hasUpdate,
    backdropTheme,
    menuItems,
    menuLevels,
    safeMenuIndex,
    setMenuFocusedIndex,
    focusedMenuItem,
    menuItemRefs,
    goBackMenu,
    selectParentMenuItem,
  } = useFullscreenMenu({
    updater,
    themes,
    currentTheme,
    onSelectTheme,
    sortMode,
    onSortModeChange,
    locale,
    setLocale,
    filteredGames,
    activeGameTitle,
    handleKillRunningGame,
    focusedIndex,
    setFocusedIndex,
    setHomeFocusZone,
    isMenuOpen,
    setIsMenuOpen,
    searchQuery,
    onClearSearch,
    setShowVirtualKeyboard,
    layout,
    toggleLayout,
    isSyncing,
    handleSync,
    scale,
    stepScale,
    soundEnabled,
    handleToggleSound,
    styleSetting,
    effectiveFamily,
    cycleControllerStyle,
    onPowerAction: (action) => runPowerAction(action),
    confirm,
    onOpenStatistics: setConsolePage ? () => setConsolePage("stats") : undefined,
    t,
  });

  // Leave the row when it disappears (filter, search, layout or window size change)
  React.useEffect(() => {
    if (homeFocusZone === "recent" && !showRecentRow) setHomeFocusZone?.("carousel");
  }, [homeFocusZone, showRecentRow, setHomeFocusZone]);

  const showRecentRowRef = React.useRef(showRecentRow);
  showRecentRowRef.current = showRecentRow;
  const recentGamesRef = React.useRef(recentGames);
  recentGamesRef.current = recentGames;
  const safeRecentIndexRef = React.useRef(safeRecentIndex);
  safeRecentIndexRef.current = safeRecentIndex;
  const filteredGamesRef = React.useRef(filteredGames);
  filteredGamesRef.current = filteredGames;
  const handleLaunchRef = React.useRef(handleLaunch);
  handleLaunchRef.current = handleLaunch;

  // Recent row events
  React.useEffect(() => {
    const handleRecentNav = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: "left" | "right" }>).detail?.direction;
      if (!dir || !showRecentRowRef.current || recentGamesRef.current.length === 0) return;
      setRecentIndex((prev) => {
        const cur = Math.min(prev, Math.max(0, recentGamesRef.current.length - 1));
        const next = dir === "right" ? Math.min(recentGamesRef.current.length - 1, cur + 1) : Math.max(0, cur - 1);
        if (next !== cur) soundEffects.playNav();
        safeRecentIndexRef.current = next;
        return next;
      });
    };

    const handleRecentAction = (e: Event) => {
      const action = (e as CustomEvent<{ action?: "launch" | "details" }>).detail?.action ?? "launch";
      if (!showRecentRowRef.current || recentGamesRef.current.length === 0) return;
      const game = recentGamesRef.current[safeRecentIndexRef.current];
      if (!game) return;
      soundEffects.playSelect();
      if (action === "launch") {
        handleLaunchRef.current(game.id);
        return;
      }
      const targetIdx = filteredGamesRef.current.findIndex((g) => g.id === game.id);
      if (targetIdx !== -1) {
        setFocusedIndex(targetIdx);
        setHomeFocusZone?.("carousel");
        setShowFullscreenDetails(true);
      } else {
        handleLaunchRef.current(game.id);
      }
    };

    window.addEventListener("omnis:recent-nav", handleRecentNav);
    window.addEventListener("omnis:recent-action", handleRecentAction);
    window.addEventListener("omnis:recent-action-a", handleRecentAction);
    return () => {
      window.removeEventListener("omnis:recent-nav", handleRecentNav);
      window.removeEventListener("omnis:recent-action", handleRecentAction);
      window.removeEventListener("omnis:recent-action-a", handleRecentAction);
    };
  }, [
    setRecentIndex,
    setFocusedIndex,
    setHomeFocusZone,
    setShowFullscreenDetails,
  ]);

  // Shelf auto-scroll
  React.useEffect(() => {
    const shelf = carouselRef.current;
    if (layout !== "shelf" || !shelf) return;
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const pitch = (CARD_W_REM + CARD_GAP_REM) * remPx;
    shelf.scrollTo({ left: Math.max(0, focusedIndex * pitch), behavior: "smooth" });
  }, [layout, focusedIndex, scale, filteredGames.length, carouselRef]);

  // Grid auto-scroll: keep focused card inside the visible viewport
  React.useEffect(() => {
    const grid = gridRef.current;
    if (layout !== "grid" || !grid) return;
    const card = grid.children[focusedIndex] as HTMLElement | undefined;
    card?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [layout, focusedIndex, gridColumns, scale, filteredGames.length]);

  // Category tabs
  const activeCategory = toCategoryId(activeFilter);
  const filterLabel = (id: string) => {
    if (STORE_LABELS[id]) return STORE_LABELS[id];
    if (FILTER_LABEL_KEYS[id]) return t(FILTER_LABEL_KEYS[id]);
    if (id.startsWith("genre:")) return id.slice(6);
    if (id.startsWith("feature:")) return id.slice(8);
    if (id === "custom") return t("console_ui.custom_filter");
    return id;
  };
  const filterCount = (id: string) => categoryCount(counts, id);
  const visibleFilters = React.useMemo(() => getVisibleCategories(counts, activeFilter), [counts, activeFilter]);

  const cycleFilter = React.useCallback(
    (direction: number, onCycle?: (nextFilter: string) => void) => {
      if (propCycleFilter) {
        propCycleFilter(direction, onCycle);
        return;
      }
      const currentIndex = visibleFilters.indexOf(activeCategory);
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + direction + visibleFilters.length) % visibleFilters.length;
      const nextFilter = visibleFilters[nextIndex];
      setActiveFilter(nextFilter);
      if (onCycle) onCycle(nextFilter);
    },
    [propCycleFilter, visibleFilters, activeCategory, setActiveFilter]
  );

  const tabRefs = React.useRef<Record<string, HTMLElement | null>>({});
  React.useEffect(() => {
    tabRefs.current[activeCategory]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeCategory]);

  // Details page
  const [notice, setNotice] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(id);
  }, [notice]);

  /** System / session actions (confirmed inline in the menu or through the confirmation dialog) */
  const runPowerAction = (action: PowerActionId) => {
    setIsMenuOpen?.(false);
    if (action === "exit") {
      handleClose();
    } else if (action === "desktop") {
      toggleFullscreen();
    } else if (action === "sleep") {
      api.window.systemSleep().catch((e) => setNotice(String(e)));
    } else if (action === "restart") {
      api.window.systemRestart().catch((e) => setNotice(String(e)));
    } else if (action === "shutdown") {
      api.window.systemShutdown().catch((e) => setNotice(String(e)));
    }
  };
  const runPowerActionRef = React.useRef(runPowerAction);
  runPowerActionRef.current = runPowerAction;

  const [detailGame, setDetailGame] = React.useState<GameDto | null>(null);
  React.useEffect(() => {
    if (showFullscreenDetails && focusedGame) {
      setDetailGame(focusedGame);
    } else if (!showFullscreenDetails || !focusedGame) {
      setDetailGame(null);
    }
  }, [showFullscreenDetails, focusedGame]);

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
    ],
    [hasGameActions, detailInstalled]
  );
  const detailsScrollRef = React.useRef<HTMLDivElement>(null);
  const achievementsCardRef = React.useRef<HTMLButtonElement>(null);
  const {
    summary: achievementsSummary,
    loading: achievementsLoading,
    supported: achievementsSupported,
  } = useGameAchievements(showFullscreenDetails ? activeDetailGame : null);
  const hasAchievements = !!achievementsSummary && achievementsSummary.total_count > 0;
  const [canRevealAchievement, setCanRevealAchievement] = React.useState(false);

  React.useEffect(() => {
    if (showFullscreenDetails) {
      setDetailsFocusedSection("hero");
      setHeroFocusedButton("launch");
      detailsScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [showFullscreenDetails]);

  // The achievements page belongs to the details page: it never outlives it
  React.useEffect(() => {
    if (consolePage === "achievements" && !showFullscreenDetails) setConsolePage?.(null);
  }, [consolePage, showFullscreenDetails, setConsolePage]);

  // Details navigation
  React.useEffect(() => {
    if (!showFullscreenDetails) return;

    const handleDetailsNav = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: "up" | "down" | "left" | "right" }>).detail?.direction;
      if (!dir || confirm) return;

      if (dir === "down") {
        if (detailsFocusedSection === "hero" && hasAchievements) {
          setDetailsFocusedSection("achievements");
          soundEffects.playNav();
          achievementsCardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        } else {
          detailsScrollRef.current?.scrollBy({ top: 220, behavior: "smooth" });
        }
      } else if (dir === "up") {
        if (detailsFocusedSection === "achievements") {
          setDetailsFocusedSection("hero");
          soundEffects.playNav();
          detailsScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          detailsScrollRef.current?.scrollBy({ top: -220, behavior: "smooth" });
        }
      } else if (detailsFocusedSection === "hero") {
        setHeroFocusedButton((prev) => {
          const current = Math.max(0, heroButtons.indexOf(prev));
          const nextIdx = Math.max(0, Math.min(heroButtons.length - 1, current + (dir === "right" ? 1 : -1)));
          if (heroButtons[nextIdx] !== prev) soundEffects.playNav();
          return heroButtons[nextIdx];
        });
      }
    };

    window.addEventListener("omnis:details-nav", handleDetailsNav);
    return () => window.removeEventListener("omnis:details-nav", handleDetailsNav);
  }, [showFullscreenDetails, detailsFocusedSection, hasAchievements, heroButtons, confirm]);

  // A section without achievements cannot keep the focus (e.g. after a sync emptied it)
  React.useEffect(() => {
    if (detailsFocusedSection === "achievements" && !hasAchievements) setDetailsFocusedSection("hero");
  }, [detailsFocusedSection, hasAchievements]);

  const openAchievementsPage = React.useCallback(() => {
    if (!hasAchievements) return;
    soundEffects.playSelect();
    setDetailsFocusedSection("achievements");
    setConsolePage?.("achievements");
  }, [hasAchievements, setConsolePage]);

  // Details action A
  React.useEffect(() => {
    if (!showFullscreenDetails) return;

    const handleActionA = () => {
      if (confirm) return;
      if (detailsFocusedSection === "achievements") {
        openAchievementsPage();
        return;
      }
      soundEffects.playSelect();
      if (!activeDetailGame) return;
      if (heroFocusedButton === "launch") {
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
    openAchievementsPage,
    t,
  ]);

  // Shortcut key listener: "k" or "Delete"
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      if (isMenuOpen || showFullscreenDetails || consolePage || e.ctrlKey || e.altKey || e.metaKey) return;
      if (
        (e.key.toLowerCase() === "k" || e.key === "Delete") &&
        (isFocusedGameRunning || isInfoGameRunning) &&
        handleKillRunningGame
      ) {
        e.preventDefault();
        handleKillRunningGame();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFocusedGameRunning, isInfoGameRunning, handleKillRunningGame, isMenuOpen, showFullscreenDetails, consolePage]);

  // Back / ESC registration for home focus zones and confirmation modal
  useBackHandler(
    Boolean(setHomeFocusZone) && (homeFocusZone === "topbar" || homeFocusZone === "recent"),
    () => {
      soundEffects.playNav();
      setHomeFocusZone?.("carousel");
    },
    BACK_PRIORITY.HOME_ZONE
  );

  useBackHandler(
    !!confirm,
    () => {
      soundEffects.playSelect();
      setConfirm(null);
    },
    BACK_PRIORITY.CONFIRM_DIALOG
  );

  // Confirmation dialog input (directional + A/Enter confirmation)
  React.useEffect(() => {
    if (!confirm) return;

    const handleNav = (e: Event) => {
      e.preventDefault();
      const dir = (e as CustomEvent<{ direction?: "up" | "down" | "left" | "right" }>).detail?.direction;
      soundEffects.playNav();
      if (dir === "up") {
        setConfirmFocus("confirm");
      } else if (dir === "down") {
        setConfirmFocus("cancel");
      } else {
        setConfirmFocus((f) => (f === "cancel" ? "confirm" : "cancel"));
      }
    };

    const handleAction = (e?: Event) => {
      e?.preventDefault();
      soundEffects.playSelect();
      const currentFocus = confirmFocusRef.current;
      const currentConfirm = confirmRef.current;
      setConfirm(null);
      if (currentFocus !== "confirm" || !currentConfirm) return;
      if (currentConfirm.kind !== "uninstall") {
        runPowerActionRef.current(currentConfirm.kind);
      } else if (currentConfirm.game && onGameAction) {
        onGameAction("uninstall", currentConfirm.game.id);
        setNotice(t("console_ui.notice_uninstall"));
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        soundEffects.playNav();
        setConfirmFocus("confirm");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        soundEffects.playNav();
        setConfirmFocus("cancel");
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        handleAction();
      }
    };

    const events: Array<[string, EventListener]> = [
      ["omnis:overlay-nav", handleNav],
      ["omnis:overlay-action-a", handleAction],
      ["omnis:menu-nav", handleNav],
      ["omnis:details-nav", handleNav],
      ["omnis:menu-action-a", handleAction],
      ["omnis:details-action-a", handleAction],
    ];
    events.forEach(([name, fn]) => window.addEventListener(name, fn));
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      events.forEach(([name, fn]) => window.removeEventListener(name, fn));
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [confirm, onGameAction, t]);

  // Controller legend
  const legendLeft = [
    {
      kind: "menu" as const,
      label: t("console_ui.menu"),
      onClick:
        consolePage || showFullscreenDetails
          ? undefined
          : () => {
              soundEffects.playSelect();
              setIsMenuOpen?.((prev) => !prev);
            },
    },
  ];
  let legendRight;

  if (consolePage === "achievements") {
    legendRight = [
      { kind: "bumpers" as const, label: t("console_ui.filter") },
      { kind: "y" as const, label: t("console_ui.sort_by") },
      ...(canRevealAchievement ? [{ kind: "a" as const, label: t("console_ui.reveal") }] : []),
      {
        kind: "b" as const,
        label: t("console_ui.back"),
        onClick: () => {
          soundEffects.playSelect();
          setConsolePage?.(null);
        },
      },
    ];
  } else if (consolePage === "stats") {
    legendRight = [
      { kind: "key" as const, glyphLabel: "▲ ▼", label: t("console_ui.scroll") },
      { kind: "bumpers" as const, label: t("console_ui.year") },
      {
        kind: "b" as const,
        label: t("console_ui.back"),
        onClick: () => {
          soundEffects.playSelect();
          setConsolePage?.(null);
        },
      },
    ];
  } else if (confirm) {
    legendRight = [
      { kind: "a" as const, label: t("console_ui.select") },
      { kind: "b" as const, label: t("common.cancel") },
    ];
  } else if (isMenuOpen) {
    legendRight = [
      ...(focusedMenuItem?.onAdjust ? [{ kind: "key" as const, glyphLabel: "◄ ►", label: t("console_ui.adjust") }] : []),
      { kind: "a" as const, label: t("console_ui.select") },
      {
        kind: "b" as const,
        label: t("console_ui.back"),
        onClick: () => {
          soundEffects.playSelect();
          goBackMenu();
        },
      },
    ];
  } else if (showFullscreenDetails && activeDetailGame) {
    legendRight =
      detailsFocusedSection === "hero"
        ? [
            ...(hasAchievements ? [{ kind: "key" as const, glyphLabel: "▼", label: t("achievements.title") }] : []),
            {
              kind: "a" as const,
              label:
                heroFocusedButton !== "launch"
                  ? t(HERO_ACTIONS[heroFocusedButton].labelKey)
                  : isFocusedGameRunning
                  ? t("console_ui.stop")
                  : activeDetailGame.is_installed
                  ? t("console_ui.play")
                  : t("console_ui.install"),
            },
            {
              kind: "b" as const,
              label: t("console_ui.back"),
              onClick: () => {
                soundEffects.playSelect();
                setShowFullscreenDetails(false);
              },
            },
          ]
        : [
            { kind: "key" as const, glyphLabel: "▲", label: t("console_ui.play") },
            { kind: "a" as const, label: t("console_ui.view_all") },
            {
              kind: "b" as const,
              label: t("console_ui.back"),
              onClick: () => {
                soundEffects.playSelect();
                setShowFullscreenDetails(false);
              },
            },
          ];
  } else if (homeFocusZone === "topbar") {
    legendRight = [
      { kind: "a" as const, label: t("console_ui.menu") },
      { kind: "b" as const, label: t("console_ui.back") },
    ];
  } else if (homeFocusZone === "recent") {
    legendRight = [
      { kind: "bumpers" as const, label: t("console_ui.category") },
      { kind: "y" as const, label: t("console_ui.search") },
      ...(filteredGames.length > 0
        ? [
            { kind: "x" as const, label: t("console_ui.details") },
            isInfoGameRunning
              ? { kind: "key" as const, glyphLabel: "K", label: t("console_ui.stop"), tone: "danger" as const }
              : { kind: "a" as const, label: infoGame?.is_installed ? t("console_ui.play") : t("console_ui.install") },
          ]
        : []),
      { kind: "b" as const, label: t("console_ui.back") },
    ];
  } else {
    legendRight = [
      { kind: "bumpers" as const, label: t("console_ui.category") },
      ...(layout === "grid" ? [{ kind: "key" as const, glyphLabel: "▲ ▼", label: t("console_ui.scroll") }] : []),
      {
        kind: "r3" as const,
        label: layout === "grid" ? t("console_ui.view_shelf") : t("console_ui.view_grid"),
        onClick: () => {
          soundEffects.playSelect();
          toggleLayout();
        },
      },
      { kind: "y" as const, label: t("console_ui.search") },
      ...(filteredGames.length > 0
        ? [
            { kind: "x" as const, label: t("console_ui.details") },
            isInfoGameRunning
              ? { kind: "key" as const, glyphLabel: "K", label: t("console_ui.stop"), tone: "danger" as const }
              : { kind: "a" as const, label: infoGame?.is_installed ? t("console_ui.play") : t("console_ui.install") },
          ]
        : []),
    ];
  }

  const playtimeLabel = (game: GameDto) =>
    game.playtime_seconds > 0 ? game.playtime_formatted : t("console_ui.never_played");

  return (
    <main
      data-omnis="fullscreen"
      tabIndex={0}
      className="relative w-screen h-screen overflow-hidden select-none flex flex-col font-sans outline-none omnis-fullscreen-viewport"
      style={{
        backgroundColor: "var(--bg-base)",
        color: "var(--text-primary)",
        fontFamily: currentTheme.font_family || undefined,
      }}
    >
      {/* Details-matched hero backdrop of the focused game */}
      {infoGame && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-[75vh]">
            {backdropTheme?.enable_video_backdrop ? (
              <VideoBackdrop
                game={infoGame}
                theme={backdropTheme}
                blurLevel="none"
                gradientOverlay="hero"
                imageFit="cover"
                objectPosition="center center"
                className="pointer-events-none"
                isPaused={isGameRunning}
              />
            ) : (
              <ArtImage
                sources={[infoGame.background_image, infoGame.cover_image]}
                title={infoGame.title}
                library={infoGame.library}
                showFallbackTitle={false}
              />
            )}
          </div>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0.35) 35%, var(--bg-base) 75%), linear-gradient(to right, rgba(0, 0, 0, 0.6) 0%, transparent 60%)",
            }}
          />
        </div>
      )}

      {/* TOP BAR: menu, category tabs, status */}
      <FullscreenTopBar
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        homeFocusZone={homeFocusZone}
        cycleFilter={cycleFilter}
        visibleFilters={visibleFilters}
        activeCategory={activeCategory}
        filterLabel={filterLabel}
        filterCount={filterCount}
        tabRefs={tabRefs}
        setActiveFilter={setActiveFilter}
        setFocusedIndex={setFocusedIndex}
        activeGame={activeGame}
        actualElapsed={actualElapsed}
        hasUpdate={hasUpdate}
        searchQuery={searchQuery}
        gamepadConnected={gamepadConnected}
        clock={clock}
        t={t}
      />

      {/* HOME CONTENT */}
      <FullscreenHomeContent
        filteredGames={filteredGames}
        layout={layout}
        searchQuery={searchQuery}
        showRecentRow={showRecentRow}
        recentGames={recentGames}
        safeRecentIndex={safeRecentIndex}
        setRecentIndex={setRecentIndex}
        homeFocusZone={homeFocusZone}
        setHomeFocusZone={setHomeFocusZone}
        focusedIndex={focusedIndex}
        setFocusedIndex={setFocusedIndex}
        setShowFullscreenDetails={setShowFullscreenDetails}
        handleLaunch={handleLaunch}
        activeCategory={activeCategory}
        filterLabel={filterLabel}
        sortMode={sortMode}
        carouselRef={carouselRef}
        gridRef={gridRef}
        gridColumns={gridColumns}
        activeGame={activeGame}
        actualElapsed={actualElapsed}
        playtimeLabel={playtimeLabel}
        infoGame={infoGame}
        t={t}
      />

      {/* GAME DETAILS PAGE */}
      <FullscreenDetailsOverlay
        showFullscreenDetails={showFullscreenDetails}
        activeDetailGame={activeDetailGame}
        detailsScrollRef={detailsScrollRef}
        isFocusedGameRunning={isFocusedGameRunning}
        activeGame={activeGame}
        elapsedSeconds={actualElapsed}
        duration={duration}
        handleLaunch={handleLaunch}
        handleKillRunningGame={handleKillRunningGame}
        setShowFullscreenDetails={setShowFullscreenDetails}
        detailsFocusedSection={detailsFocusedSection}
        heroFocusedButton={heroFocusedButton}
        heroButtons={heroButtons}
        heroActions={HERO_ACTIONS}
        onGameAction={onGameAction}
        openConfirm={openConfirm}
        setNotice={setNotice}
        soundEffects={soundEffects}
        playtimeLabel={playtimeLabel}
        achievementsSupported={achievementsSupported}
        achievementsSummary={achievementsSummary}
        achievementsLoading={achievementsLoading}
        achievementsCardRef={achievementsCardRef}
        onOpenAchievements={openAchievementsPage}
        storeLabels={STORE_LABELS}
        renderStoreIcon={(lib) => <StoreIcon library={lib} className="w-4 h-4" />}
        t={t}
      />

      {/* CONSOLE PAGES */}
      <FullscreenAchievementsPage
        isOpen={consolePage === "achievements"}
        game={activeDetailGame}
        summary={achievementsSummary}
        loading={achievementsLoading}
        onClose={() => setConsolePage?.(null)}
        onCanRevealChange={setCanRevealAchievement}
        locale={locale}
        t={t}
      />
      <FullscreenStatsPage
        isOpen={consolePage === "stats"}
        games={allGames ?? filteredGames}
        locale={locale}
        onClose={() => setConsolePage?.(null)}
        t={t}
      />

      {/* SIDE MENU (with Settings sub menus and inline-confirmed system actions) */}
      <FullscreenQuickMenu
        isMenuOpen={!!isMenuOpen}
        onClose={() => setIsMenuOpen?.(false)}
        updater={updater}
        clock={clock}
        menuItems={menuItems}
        safeMenuIndex={safeMenuIndex}
        setMenuFocusedIndex={setMenuFocusedIndex}
        soundEffects={soundEffects}
        t={t}
        menuSectionLabelKeys={MENU_SECTION_LABEL_KEYS}
        menuItemRefs={menuItemRefs}
        levels={menuLevels}
        onBack={goBackMenu}
        onSelectParentItem={selectParentMenuItem}
      />

      {/* CONFIRMATION DIALOG */}
      <FullscreenConfirmDialog
        confirm={confirm}
        confirmFocus={confirmFocus}
        onSelectButton={(button) => {
          const kind = confirm?.kind;
          const game = confirm?.game;
          setConfirm(null);
          if (button === "cancel" || !kind) return;
          if (kind !== "uninstall") {
            runPowerAction(kind);
          } else if (game && onGameAction) {
            onGameAction("uninstall", game.id);
            setNotice(t("console_ui.notice_uninstall"));
          }
        }}
        soundEffects={soundEffects}
        t={t}
      />

      {/* LAUNCH TRANSITION OVERLAY */}
      <FullscreenLaunchOverlay
        activeGame={activeGame}
        allGames={allGames}
        filteredGames={filteredGames}
        t={t}
      />

      {/* ACTION NOTICE, TOASTS & CONTROLLER LEGEND */}
      <FullscreenOverlays
        notice={notice}
        sessionToast={sessionToast}
        sessionGame={
          sessionToast ? (allGames ?? filteredGames).find((g) => g.id === sessionToast.gameId) ?? null : null
        }
        onDismissToast={onDismissToast}
        updater={updater}
        scaleHintVisible={scaleHintVisible}
        scale={scale}
        legendLeft={legendLeft}
        legendRight={legendRight}
        t={t}
      />
    </main>
  );
}
