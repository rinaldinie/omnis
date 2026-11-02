import type { LucideIcon } from "lucide-react";

export const STORE_LABELS: Record<string, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  xbox: "Xbox",
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
