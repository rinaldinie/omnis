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
};

export interface ConsoleMenuItem {
  id: string;
  section: string;
  icon: LucideIcon;
  label: string;
  value?: string;
  spinning?: boolean;
  tone?: "accent" | "danger" | "default";
  onActivate: () => void;
  onAdjust?: (direction: 1 | -1) => void;
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
