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
  Settings,
  SlidersHorizontal,
  Library,
  MonitorPlay,
  Monitor,
  LogOut,
  Moon,
  RotateCw,
} from "lucide-react";
import { GameDto, ThemeConfig, TranslateFn } from "../../types";
import { LocaleCode, SUPPORTED_LOCALES } from "../../i18n/types";
import type { AppUpdater } from "../../hooks/useAppUpdater";
import type { ConfirmState } from "./FullscreenConfirmDialog";
import { GAME_SORT_MODES, GameSortMode } from "../../utils/sortGames";
import { UI_SCALE_STEPS } from "../../hooks/useUiScale";
import soundEffects from "../../utils/soundEffects";
import type { ControllerType, HomeFocusZone } from "../../hooks/useGamepadNavigation";
import type { ControllerStyleSetting } from "./ConsoleChrome";
import { ConsoleMenuItem, ConsoleMenuLevel, PowerActionId } from "./constants";

const TRAILERS_STORAGE_KEY = "omnis_fullscreen_trailers";
/** How long a system action stays armed waiting for the confirming press */
const ARM_TIMEOUT_MS = 4000;

type SettingsCategoryId = "general" | "library" | "visual" | "audio" | "input";
type MenuPageId = "root" | "settings" | `settings:${SettingsCategoryId}`;

interface MenuStackEntry {
  page: MenuPageId;
  index: number;
}

const ROOT_STACK: MenuStackEntry[] = [{ page: "root", index: 0 }];

export interface UseFullscreenMenuOptions {
  updater: AppUpdater | null;
  themes: ThemeConfig[];
  currentTheme: ThemeConfig;
  onSelectTheme?: (theme: ThemeConfig) => void;
  sortMode?: GameSortMode;
  onSortModeChange?: (mode: GameSortMode) => void;
  locale: string;
  setLocale: (code: LocaleCode) => void;
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
  scale: number;
  stepScale: (delta: 1 | -1, wrap?: boolean) => boolean;
  soundEnabled: boolean;
  handleToggleSound: () => void;
  styleSetting: ControllerStyleSetting;
  effectiveFamily: ControllerType;
  cycleControllerStyle: (delta: 1 | -1) => void;
  /** Runs a system / session action (already confirmed inline in the menu) */
  onPowerAction: (action: PowerActionId) => void;
  confirm: ConfirmState | null;
  /** Opens the console statistics page */
  onOpenStatistics?: () => void;
  activeGameTitle?: string | null;
  handleKillRunningGame?: () => void;
  t: TranslateFn;
}

/** Translation with a hard-coded fallback for keys missing from older locale files */
function tr(t: TranslateFn, key: string, fallback: string): string {
  const val = t(key);
  return val && val !== key ? val : fallback;
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
  scale,
  stepScale,
  soundEnabled,
  handleToggleSound,
  styleSetting,
  effectiveFamily,
  activeGameTitle,
  handleKillRunningGame,
  cycleControllerStyle,
  onPowerAction,
  confirm,
  onOpenStatistics,
  t,
}: UseFullscreenMenuOptions) {
  const hasUpdate =
    updater?.status === "available" || updater?.status === "downloading" || updater?.status === "readyToInstall";

  // ---- Navigation stack (root → settings → category) ----
  const [stack, setStack] = useState<MenuStackEntry[]>(ROOT_STACK);
  const [armedId, setArmedId] = useState<string | null>(null);

  const pushPage = useCallback((page: MenuPageId) => {
    setArmedId(null);
    setStack((prev) => [...prev, { page, index: 0 }]);
  }, []);

  const goBack = useCallback(() => {
    setArmedId(null);
    if (stack.length > 1) {
      setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    } else {
      setIsMenuOpen?.(false);
    }
  }, [stack.length, setIsMenuOpen]);

  const setMenuFocusedIndex = useCallback((idx: number) => {
    setStack((prev) => {
      const top = prev[prev.length - 1];
      if (top.index === idx) return prev;
      return [...prev.slice(0, -1), { ...top, index: idx }];
    });
  }, []);

  // Inline confirmation expires on its own
  useEffect(() => {
    if (!armedId) return;
    const timer = window.setTimeout(() => setArmedId(null), ARM_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [armedId]);

  // ---- Setting helpers ----
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

  /** System actions run on the second press, without any modal dialog */
  const armedAction = (id: PowerActionId): Pick<ConsoleMenuItem, "armed" | "value" | "onActivate"> => {
    const armed = armedId === id;
    return {
      armed,
      value: armed ? tr(t, "console_ui.press_again_confirm", "Press again to confirm") : undefined,
      onActivate: () => {
        if (armedId !== id) {
          setArmedId(id);
          return;
        }
        setArmedId(null);
        setIsMenuOpen?.(false);
        onPowerAction(id);
      },
    };
  };

  const updateCheckValue =
    updater?.status === "checking"
      ? t("console_ui.update_checking")
      : updater?.status === "upToDate"
      ? t("console_ui.update_latest")
      : updater?.status === "error"
      ? t("console_ui.update_error")
      : undefined;

  const controllerStyleLabel =
    styleSetting === "auto"
      ? `Auto (${effectiveFamily.toUpperCase()})`
      : styleSetting === "xbox"
      ? "Xbox"
      : styleSetting === "playstation"
      ? "PlayStation"
      : styleSetting === "nintendo"
      ? "Nintendo Switch"
      : tr(t, "console_ui.controller_keyboard", locale === "it" ? "Tastiera" : "Keyboard");

  const scaleIdx = UI_SCALE_STEPS.indexOf(scale as (typeof UI_SCALE_STEPS)[number]);

  // ---- Page builders ----
  const settingsCategories: Array<{ id: SettingsCategoryId; icon: ConsoleMenuItem["icon"]; label: string }> = [
    { id: "general", icon: Settings, label: tr(t, "console_ui.settings_general", "General") },
    { id: "library", icon: Library, label: tr(t, "console_ui.settings_library", "Library") },
    { id: "visual", icon: MonitorPlay, label: tr(t, "console_ui.settings_visual", "Visuals") },
    { id: "audio", icon: Volume2, label: tr(t, "console_ui.settings_audio", "Audio") },
    { id: "input", icon: Gamepad2, label: tr(t, "console_ui.settings_input", "Input") },
  ];

  const buildRootPage = (): Omit<ConsoleMenuLevel, "focusedIndex"> => {
    const items: ConsoleMenuItem[] = [];

    if (activeGameTitle && handleKillRunningGame) {
      items.push({
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
      items.push({
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
    items.push({
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
      items.push({
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
    if (filteredGames.length > 1) {
      items.push({
        id: "random",
        icon: Shuffle,
        section: "library",
        label: t("console_ui.random_game"),
        onActivate: pickRandomGame,
      });
    }
    if (onOpenStatistics) {
      items.push({
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
    items.push({
      id: "sync",
      icon: RefreshCw,
      spinning: isSyncing,
      section: "library",
      label: t("console_ui.sync_library"),
      value: isSyncing ? t("console_ui.syncing") : undefined,
      onActivate: handleSync,
    });

    // System
    items.push(
      {
        id: "settings",
        icon: SlidersHorizontal,
        kind: "submenu",
        section: "system",
        label: tr(t, "console_ui.settings", "Settings"),
        onActivate: () => pushPage("settings"),
      },
      {
        id: "desktop",
        icon: Monitor,
        section: "system",
        label: t("console_ui.desktop_mode"),
        ...armedAction("desktop"),
      },
      {
        id: "exit",
        icon: LogOut,
        section: "system",
        label: t("console_ui.exit"),
        ...armedAction("exit"),
      }
    );

    // Power
    items.push(
      {
        id: "sleep",
        icon: Moon,
        section: "power",
        label: t("console_ui.sleep"),
        ...armedAction("sleep"),
      },
      {
        id: "restart",
        icon: RotateCw,
        section: "power",
        tone: "danger",
        label: t("console_ui.restart"),
        ...armedAction("restart"),
      },
      {
        id: "shutdown",
        icon: Power,
        section: "power",
        tone: "danger",
        label: t("console_ui.shutdown"),
        ...armedAction("shutdown"),
      }
    );

    return { id: "root", layout: "list", items };
  };

  const buildSettingsPage = (): Omit<ConsoleMenuLevel, "focusedIndex"> => ({
    id: "settings",
    title: tr(t, "console_ui.settings", "Settings"),
    layout: "list",
    items: settingsCategories.map((cat) => ({
      id: `settings-cat-${cat.id}`,
      icon: cat.icon,
      kind: "submenu" as const,
      section: "settings",
      label: cat.label,
      onActivate: () => pushPage(`settings:${cat.id}`),
    })),
  });

  const buildCategoryPage = (cat: SettingsCategoryId): Omit<ConsoleMenuLevel, "focusedIndex"> => {
    const items: ConsoleMenuItem[] = [];
    const section = `settings_${cat}`;

    if (cat === "general") {
      items.push({
        id: "language",
        icon: Languages,
        kind: "select",
        section,
        label: t("console_ui.language"),
        value: SUPPORTED_LOCALES.find((l) => l.code === locale)?.nativeName,
        onActivate: () => cycleLocale(1),
        onAdjust: cycleLocale,
      });
      if (updater) {
        items.push({
          id: "check-updates",
          icon: CloudDownload,
          spinning: updater.status === "checking",
          section,
          label: t("console_ui.check_updates"),
          value: hasUpdate
            ? updater.availableVersion
              ? `v${updater.availableVersion}`
              : t("general_settings.updater_available")
            : updateCheckValue ?? (updater.currentVersion ? `v${updater.currentVersion}` : undefined),
          onActivate: () => {
            if (updater.status !== "checking" && !hasUpdate) updater.checkForUpdates();
          },
        });
      }
    } else if (cat === "library") {
      items.push({
        id: "layout",
        icon: layout === "grid" ? LayoutGrid : GalleryHorizontal,
        kind: "select",
        section,
        label: t("console_ui.library_view"),
        value: layout === "grid" ? t("console_ui.view_grid") : t("console_ui.view_shelf"),
        onActivate: toggleLayout,
        onAdjust: () => toggleLayout(),
      });
      if (onSortModeChange && sortMode) {
        items.push({
          id: "sort",
          icon: ArrowDownWideNarrow,
          kind: "select",
          section,
          label: t("console_ui.sort_by"),
          value: t(`console_ui.sort_${sortMode}`),
          onActivate: () => cycleSort(1),
          onAdjust: cycleSort,
        });
      }
    } else if (cat === "visual") {
      if (onSelectTheme && themes.length > 0) {
        items.push({
          id: "theme",
          icon: Palette,
          kind: "select",
          section,
          label: t("console_ui.theme"),
          value: currentTheme.name,
          onActivate: () => cycleTheme(1),
          onAdjust: cycleTheme,
        });
      }
      items.push(
        {
          id: "scale",
          icon: Type,
          kind: "slider",
          section,
          label: t("console_ui.ui_scale"),
          value: `${Math.round(scale * 100)}%`,
          progress: scaleIdx === -1 ? 0.5 : scaleIdx / (UI_SCALE_STEPS.length - 1),
          onActivate: () => stepScale(1, true),
          onAdjust: (delta) => stepScale(delta),
        },
        {
          id: "trailers",
          icon: Film,
          kind: "toggle",
          section,
          label: t("console_ui.trailers"),
          checked: trailersEnabled,
          onActivate: toggleTrailers,
          onAdjust: () => toggleTrailers(),
        }
      );
    } else if (cat === "audio") {
      items.push({
        id: "sound",
        icon: soundEnabled ? Volume2 : VolumeX,
        kind: "toggle",
        section,
        label: t("console_ui.sound"),
        checked: soundEnabled,
        onActivate: handleToggleSound,
        onAdjust: () => handleToggleSound(),
      });
    } else if (cat === "input") {
      items.push({
        id: "controller-style",
        icon: Gamepad2,
        kind: "select",
        section,
        label: tr(t, "console_ui.controller_glyphs", locale === "it" ? "Stile Comandi" : "Controller Style"),
        value: controllerStyleLabel,
        onActivate: () => cycleControllerStyle(1),
        onAdjust: (delta) => cycleControllerStyle(delta),
      });
    }

    const meta = settingsCategories.find((c) => c.id === cat);
    return { id: `settings:${cat}`, title: meta?.label, layout: "panel", items };
  };

  const buildPage = (page: MenuPageId): Omit<ConsoleMenuLevel, "focusedIndex"> => {
    if (page === "root") return buildRootPage();
    if (page === "settings") return buildSettingsPage();
    return buildCategoryPage(page.slice("settings:".length) as SettingsCategoryId);
  };

  const menuLevels: ConsoleMenuLevel[] = stack.map((entry) => {
    const built = buildPage(entry.page);
    return {
      ...built,
      focusedIndex: Math.max(0, Math.min(entry.index, built.items.length - 1)),
    };
  });

  const activeLevel = menuLevels[menuLevels.length - 1];
  const menuItems = activeLevel.items;
  const menuFocusedIndex = stack[stack.length - 1].index;
  const safeMenuIndex = activeLevel.focusedIndex;
  const focusedMenuItem = menuItems[safeMenuIndex];

  /** Click on an entry of the parent level while a detail panel is open */
  const selectParentMenuItem = useCallback(
    (idx: number) => {
      setArmedId(null);
      setStack((prev) => {
        if (prev.length < 2) return prev;
        const parent = prev[prev.length - 2];
        return [...prev.slice(0, -2), { ...parent, index: idx }];
      });
    },
    []
  );

  const menuStateRef = useRef({ menuItems, focusedMenuItem, confirm, depth: stack.length, goBack });
  menuStateRef.current = { menuItems, focusedMenuItem, confirm, depth: stack.length, goBack };

  // Every time the menu opens it starts again from the root page
  useEffect(() => {
    if (isMenuOpen) {
      setStack(ROOT_STACK);
      setArmedId(null);
    }
  }, [isMenuOpen]);

  // Moving away from an armed entry cancels its pending confirmation
  const focusedMenuItemId = focusedMenuItem?.id;
  useEffect(() => {
    setArmedId((prev) => (prev && prev !== focusedMenuItemId ? null : prev));
  }, [focusedMenuItemId]);

  const menuItemRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (!isMenuOpen || !focusedMenuItemId) return;
    menuItemRefs.current[focusedMenuItemId]?.scrollIntoView?.({ block: "nearest" });
  }, [isMenuOpen, focusedMenuItemId, stack.length]);

  // D-pad / arrows and Button A / Enter inside the menu
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleMenuNav = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: "up" | "down" | "left" | "right" }>).detail?.direction;
      const {
        menuItems: items,
        focusedMenuItem: activeItem,
        confirm: activeConfirm,
        depth,
        goBack: back,
      } = menuStateRef.current;
      if (!dir || activeConfirm) return;
      const count = items.length;
      if (count === 0) {
        if (dir === "left" && depth > 1) back();
        return;
      }

      const step = (delta: 1 | -1) =>
        setStack((prev) => {
          const top = prev[prev.length - 1];
          const current = Math.min(top.index, count - 1);
          const next = (current + delta + count) % count;
          return [...prev.slice(0, -1), { ...top, index: next }];
        });

      if (dir === "down") {
        step(1);
        soundEffects.playNav();
      } else if (dir === "up") {
        step(-1);
        soundEffects.playNav();
      } else if (activeItem?.onAdjust) {
        if (activeItem.id !== "sound") soundEffects.playNav();
        activeItem.onAdjust(dir === "right" ? 1 : -1);
      } else if (dir === "right" && activeItem?.kind === "submenu") {
        soundEffects.playSelect();
        activeItem.onActivate();
      } else if (dir === "left" && depth > 1) {
        soundEffects.playNav();
        back();
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
    menuLevels,
    menuFocusedIndex,
    setMenuFocusedIndex,
    safeMenuIndex,
    focusedMenuItem,
    menuItemRefs,
    goBackMenu: goBack,
    selectParentMenuItem,
  };
}
