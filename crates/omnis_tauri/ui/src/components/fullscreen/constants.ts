import type React from "react";
import type { LucideIcon } from "lucide-react";

export const CONSOLE_PILL_STYLE: React.CSSProperties = {
  backgroundColor: "rgba(10, 14, 24, 0.68)",
  border: "1px solid rgba(255, 255, 255, 0.2)",
};

export const CONSOLE_MODAL_SURFACE_STYLE: React.CSSProperties = {
  backgroundColor: "rgba(10, 14, 24, 0.88)",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  boxShadow: "0 24px 64px rgba(0, 0, 0, 0.65)",
};

export const CONSOLE_OPTION_ACTIVE_STYLE: React.CSSProperties = {
  backgroundColor: "#ffffff",
  color: "#0b0f19",
  border: "1px solid rgba(255, 255, 255, 0.9)",
};

export const CONSOLE_OPTION_IDLE_STYLE: React.CSSProperties = {
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  color: "#f8fafc",
  border: "1px solid rgba(255, 255, 255, 0.2)",
};

export const STORE_LABELS: Record<string, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  xbox: "Xbox",
  switch: "Switch",
};

export const FILTER_LABEL_KEYS: Record<string, string> = {
  all: "sidebar.all_games",
  installed: "sidebar.installed",
  recent: "sidebar.recent",
  favorites: "sidebar.favorites",
  action: "sidebar.genre_action",
  rpg: "sidebar.genre_rpg",
  strategy: "sidebar.genre_strategy",
  indie: "sidebar.genre_indie",
};

export const MENU_SECTION_LABEL_KEYS: Record<string, string> = {
  active_game: "console_ui.section_active_game",
  library: "console_ui.section_library",
  display: "console_ui.section_display",
  system: "console_ui.system",
  power: "console_ui.power_options",
};

/** System / session actions available from the console menu */
export type PowerActionId = "sleep" | "restart" | "shutdown" | "desktop" | "exit";

/**
 * How a menu entry is rendered and driven:
 * - `action`: plain command (default)
 * - `submenu`: opens a nested page (chevron on the right)
 * - `toggle`: on/off checkbox
 * - `select`: cycles through values with ◄ ►
 * - `slider`: numeric value with a progress track
 */
export type ConsoleMenuItemKind = "action" | "submenu" | "toggle" | "select" | "slider";

export interface ConsoleMenuItem {
  id: string;
  section: string;
  icon: LucideIcon;
  label: string;
  value?: string;
  spinning?: boolean;
  tone?: "accent" | "danger" | "default";
  kind?: ConsoleMenuItemKind;
  /** Toggle state (kind `toggle`) */
  checked?: boolean;
  /** Fill ratio between 0 and 1 (kind `slider`) */
  progress?: number;
  /** Inline confirmation pending: the next activation runs the action */
  armed?: boolean;
  onActivate: () => void;
  onAdjust?: (direction: 1 | -1) => void;
}

/** One level of the console menu navigation stack. */
export interface ConsoleMenuLevel {
  id: string;
  title?: string;
  /** `list` shows the level in the side bar; `panel` shows it as a detail panel beside its parent */
  layout: "list" | "panel";
  items: ConsoleMenuItem[];
  focusedIndex: number;
}

export function duration(s: number): string {
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
