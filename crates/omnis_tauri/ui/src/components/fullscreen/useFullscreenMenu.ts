import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Sparkles,
  Search,
  SearchX,
  LayoutGrid,
  GalleryHorizontal,
  ArrowDownWideNarrow,
  Shuffle,
  RefreshCw,
  Puzzle,
  Type,
  Palette,
  Film,
  Languages,
  Volume2,
  VolumeX,
  Gamepad2,
  CloudDownload,
  Power,
  BarChart3,
  OctagonX,
} from "lucide-react";
import { GameDto, ThemeConfig } from "../../types";
import { SUPPORTED_LOCALES } from "../../i18n/types";
import { GAME_SORT_MODES, GameSortMode } from "../../utils/sortGames";
import soundEffects from "../../utils/soundEffects";
import type { ControllerType, HomeFocusZone } from "../../hooks/useGamepadNavigation";
import type { ControllerStyleSetting } from "./ConsoleChrome";
import { ConsoleMenuItem } from "./constants";

const TRAILERS_STORAGE_KEY = "omnis_fullscreen_trailers";

export interface UseFullscreenMenuOptions {
  updater: any;
  themes: ThemeConfig[];
  currentTheme: ThemeConfig;
  onSelectTheme?: (theme: ThemeConfig) => void;
  sortMode?: GameSortMode;
  onSortModeChange?: (mode: GameSortMode) => void;
  locale: string;
  setLocale: (code: any) => void;
  filteredGames: GameDto[];
  focusedIndex: number;
  setFocusedIndex: (idx: number) => void;
  setHomeFocusZone?: (zone: HomeFocusZone) => void;
  isMenuOpen?: boolean;
  setIsMenuOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  onClearSearch?: () => void;
  setShowVirtualKeyboard: (show: boolean) => void;
  layout: "shelf" | "grid";
  toggleLayout: () => void;
  isSyncing: boolean;
  handleSync: () => void;
  loadProvidersAndConfig: () => void;
  scale: number;
  stepScale: (delta: 1 | -1, wrap?: boolean) => boolean;
  soundEnabled: boolean;
  handleToggleSound: () => void;
  styleSetting: ControllerStyleSetting;
  effectiveFamily: ControllerType;
  cycleControllerStyle: (delta: 1 | -1) => void;
  onOpenPowerMenu: () => void;
  confirm: any;
  /** Opens the console statistics page */
  onOpenStatistics?: () => void;
  activeGameTitle?: string | null;
  handleKillRunningGame?: () => void;
  t: (key: string, params?: Record<string, any>) => string;
}

export function useFullscreenMenu({
  updater,
  themes,
  currentTheme,
  onSelectTheme,
  sortMode,
  onSortModeChange,
  locale,
  setLocale,
  filteredGames,
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
  loadProvidersAndConfig,
  scale,
  stepScale,
  soundEnabled,
  handleToggleSound,
  styleSetting,
  effectiveFamily,
  activeGameTitle,
  handleKillRunningGame,
  cycleControllerStyle,
  onOpenPowerMenu,
  confirm,
  onOpenStatistics,
  t,
}: UseFullscreenMenuOptions) {
  const hasUpdate =
    updater?.status === "available" || updater?.status === "downloading" || updater?.status === "readyToInstall";

  const cycleTheme = useCallback(
    (delta: 1 | -1) => {
      if (themes.length === 0 || !onSelectTheme) return;
      const current = themes.findIndex((th) => th.id === currentTheme.id);
      onSelectTheme(themes[(current + delta + themes.length) % themes.length]);
    },
    [themes, onSelectTheme, currentTheme.id]
  );

  const [trailersPref, setTrailersPref] = useState<boolean | null>(() => {
    try {
      const saved = localStorage.getItem(TRAILERS_STORAGE_KEY);
      return saved === null ? null : saved === "on";
    } catch {
      return null;
    }
  });
  const trailersEnabled = trailersPref ?? !!currentTheme.enable_video_backdrop;
  const backdropTheme = useMemo(
    () => ({ ...currentTheme, enable_video_backdrop: trailersEnabled }),
    [currentTheme, trailersEnabled]
  );

  const toggleTrailers = () => {
    const next = !trailersEnabled;
    setTrailersPref(next);
    try {
      localStorage.setItem(TRAILERS_STORAGE_KEY, next ? "on" : "off");
    } catch {
      // fallback
    }
  };

  const cycleSort = (delta: 1 | -1) => {
    if (!onSortModeChange || !sortMode) return;
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

  if (activeGameTitle && handleKillRunningGame) {
    menuItems.push({
      id: "kill-active-game",
      icon: OctagonX,
      tone: "danger",
      section: "active_game",
      label: t("console_ui.kill_active_game", { title: activeGameTitle }),
      onActivate: () => {
        setIsMenuOpen?.(false);
        handleKillRunningGame();
      },
    });
  }

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
  if (onSortModeChange && sortMode) {
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
  if (onOpenStatistics) {
    menuItems.push({
      id: "statistics",
      icon: BarChart3,
      section: "library",
      label: t("console_ui.statistics"),
      onActivate: () => {
        setIsMenuOpen?.(false);
        onOpenStatistics();
      },
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
    },
    {
      id: "controller-style",
      icon: Gamepad2,
      section: "display",
      label: (() => {
        const val = t("console_ui.controller_glyphs");
        return val && val !== "console_ui.controller_glyphs"
          ? val
          : locale === "it"
          ? "Stile Comandi"
          : "Controller Style";
      })(),
      value:
        styleSetting === "auto"
          ? `Auto (${effectiveFamily.toUpperCase()})`
          : styleSetting === "xbox"
          ? "Xbox"
          : styleSetting === "playstation"
          ? "PlayStation"
          : styleSetting === "nintendo"
          ? "Nintendo Switch"
          : (() => {
              const val = t("console_ui.controller_keyboard");
              return val && val !== "console_ui.controller_keyboard"
                ? val
                : locale === "it"
                ? "Tastiera"
                : "Keyboard";
            })(),
      onActivate: () => cycleControllerStyle(1),
      onAdjust: (delta) => cycleControllerStyle(delta),
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
  menuItems.push({
    id: "power",
    icon: Power,
    tone: "danger",
    section: "system",
    label: t("console_ui.power_options"),
    onActivate: () => {
      setIsMenuOpen?.(false);
      onOpenPowerMenu();
    },
  });

  const [menuFocusedIndex, setMenuFocusedIndex] = useState<number>(0);
  const safeMenuIndex = Math.min(menuFocusedIndex, menuItems.length - 1);
  const focusedMenuItem = menuItems[safeMenuIndex];
  const menuStateRef = useRef({ menuItems, focusedMenuItem, confirm });
  menuStateRef.current = { menuItems, focusedMenuItem, confirm };

  // Reset menu focus whenever the menu opens
  useEffect(() => {
    if (isMenuOpen) setMenuFocusedIndex(0);
  }, [isMenuOpen]);

  const menuItemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const focusedMenuItemId = focusedMenuItem?.id;
  useEffect(() => {
    if (!isMenuOpen || !focusedMenuItemId) return;
    menuItemRefs.current[focusedMenuItemId]?.scrollIntoView({ block: "nearest" });
  }, [isMenuOpen, focusedMenuItemId]);

  // D-pad / arrows and Button A / Enter inside the menu
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleMenuNav = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: "up" | "down" | "left" | "right" }>).detail?.direction;
      const { menuItems: items, focusedMenuItem: activeItem, confirm: activeConfirm } = menuStateRef.current;
      if (!dir || activeConfirm) return;
      const count = items.length;

      if (dir === "down") {
        setMenuFocusedIndex((prev) => (Math.min(prev, count - 1) + 1) % count);
        soundEffects.playNav();
      } else if (dir === "up") {
        setMenuFocusedIndex((prev) => (Math.min(prev, count - 1) <= 0 ? count - 1 : Math.min(prev, count - 1) - 1));
        soundEffects.playNav();
      } else if (activeItem?.onAdjust) {
        if (activeItem.id !== "sound") soundEffects.playNav();
        activeItem.onAdjust(dir === "right" ? 1 : -1);
      }
    };

    const handleMenuActionA = () => {
      const { focusedMenuItem: activeItem, confirm: activeConfirm } = menuStateRef.current;
      if (!activeItem || activeConfirm) return;
      soundEffects.playSelect();
      activeItem.onActivate();
    };

    window.addEventListener("omnis:menu-nav", handleMenuNav);
    window.addEventListener("omnis:menu-action-a", handleMenuActionA);
    return () => {
      window.removeEventListener("omnis:menu-nav", handleMenuNav);
      window.removeEventListener("omnis:menu-action-a", handleMenuActionA);
    };
  }, [isMenuOpen]);

  return {
    hasUpdate,
    trailersEnabled,
    backdropTheme,
    menuItems,
    menuFocusedIndex,
    setMenuFocusedIndex,
    safeMenuIndex,
    focusedMenuItem,
    menuItemRefs,
  };
}
