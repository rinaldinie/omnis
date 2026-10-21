export interface CustomLink {
  title: string;
  url: string;
}

export type ProcessTrackingMode =
  | { type: "KernelJobObject" }
  | { type: "ProcessName"; target: string }
  | { type: "WatchDirectory"; target: string };

export interface LaunchConfiguration {
  executable: string;
  arguments: string[];
  working_dir?: string | null;
  tracking_mode: ProcessTrackingMode;
}

export interface GameEditorFormData {
  title: string;
  sorting_title: string;
  series: string;
  age_rating: string;
  completion_status: string;
  release_date: string;
  user_score: number | null;
  critic_score: number | null;
  community_score: number | null;
  genresText: string;
  developersText: string;
  publishersText: string;
  tagsText: string;
  description: string;
  user_notes: string;
  cover_image_path: string;
  background_image_path: string;
  icon_image_path: string;
  play_actions: LaunchConfiguration[];
  custom_links: CustomLink[];
}

export const COMPLETION_STATUSES = [
  { value: "NotPlayed", label: "Non giocato", color: "#94a3b8" },
  { value: "Playing", label: "In corso", color: "#38bdf8" },
  { value: "Beaten", label: "Finito", color: "#a855f7" },
  { value: "Completed", label: "Completato al 100%", color: "#22c55e" },
  { value: "Abandoned", label: "Abbandonato", color: "#ef4444" },
  { value: "Backlog", label: "Backlog", color: "#f59e0b" },
  { value: "PlanToPlay", label: "Da iniziare", color: "#6366f1" },
];
