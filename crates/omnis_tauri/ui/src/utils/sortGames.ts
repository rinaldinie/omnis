import { GameDto } from "../types";

export const GAME_SORT_MODES = [
  "default",
  "recent",
  "title",
  "title_desc",
  "release_date",
  "playtime",
  "score",
] as const;
export type GameSortMode = (typeof GAME_SORT_MODES)[number];

const STORAGE_KEY = "omnis_fullscreen_sort";

export function readSavedSortMode(): GameSortMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as GameSortMode | null;
    if (saved && GAME_SORT_MODES.includes(saved)) return saved;
  } catch {
    // localStorage unavailable: fall back to library order
  }
  return "default";
}

export function saveSortMode(mode: GameSortMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Not persisted, still applied for this session
  }
}

const lastPlayed = (game: GameDto) => (game.last_activity ? Date.parse(game.last_activity) || 0 : 0);

const byTitle = (a: GameDto, b: GameDto) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

/** Returns a sorted copy of `games`; "default" keeps the library order untouched. */
export function sortGames(games: GameDto[], mode: GameSortMode): GameDto[] {
  if (mode === "default") return games;
  const sorted = [...games];
  switch (mode) {
    case "title":
      sorted.sort(byTitle);
      break;
    case "title_desc":
      sorted.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: "base" }));
      break;
    case "release_date":
      sorted.sort((a, b) => (b.release_date || "").localeCompare(a.release_date || "") || byTitle(a, b));
      break;
    case "playtime":
      sorted.sort((a, b) => b.playtime_seconds - a.playtime_seconds || byTitle(a, b));
      break;
    case "recent":
      // Never-played games (no timestamp) go last
      sorted.sort((a, b) => lastPlayed(b) - lastPlayed(a) || byTitle(a, b));
      break;
    case "score":
      sorted.sort((a, b) => (b.critic_score ?? -1) - (a.critic_score ?? -1) || byTitle(a, b));
      break;
  }
  return sorted;
}
