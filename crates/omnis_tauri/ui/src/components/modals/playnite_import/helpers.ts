const STORE_BADGE_CLASSES: Record<string, string> = {
  steam: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  epic: "bg-slate-700/60 text-slate-200 border-slate-600/50",
  gog: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  xbox: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  amazon: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

const DEFAULT_STORE_BADGE_CLASS = "bg-slate-800 text-slate-400 border-slate-700";

/** Format a playtime duration in seconds as `Xh Ym` or `Ym`. */
export function formatPlaytime(seconds: number = 0): string {
  if (!seconds || seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes > 0 ? `${minutes}m` : ""}`.trim();
  }
  return `${minutes}m`;
}

/** Return Tailwind badge classes for a game store identifier. */
export function getStoreBadgeClass(store?: string): string {
  const normalized = (store || "manual").toLowerCase();
  return STORE_BADGE_CLASSES[normalized] ?? DEFAULT_STORE_BADGE_CLASS;
}
