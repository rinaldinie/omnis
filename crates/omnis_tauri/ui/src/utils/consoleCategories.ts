import { FILTER_ORDER, LibraryCounts } from "../types";

// Categories always shown as tabs, even when empty
export const PINNED_CATEGORIES = ["all", "installed", "recent", "favorites"];

/** Maps an active filter string to its category tab id. */
export function toCategoryId(filter: string): string {
  const lower = filter.toLowerCase().trim();
  return FILTER_ORDER.includes(lower) ? lower : filter;
}

export function categoryCount(counts: LibraryCounts, id: string): number {
  return (counts as unknown as Record<string, number>)[id === "all" ? "total" : id] ?? 0;
}

/**
 * Categories the console view shows and LB / RB cycles through, in FILTER_ORDER.
 * Libraries without games (e.g. stores not configured) are skipped.
 */
export function getVisibleCategories(counts: LibraryCounts, activeFilter: string): string[] {
  const activeId = toCategoryId(activeFilter);
  return FILTER_ORDER.filter(
    (id) => PINNED_CATEGORIES.includes(id) || id === activeId || categoryCount(counts, id) > 0
  );
}
