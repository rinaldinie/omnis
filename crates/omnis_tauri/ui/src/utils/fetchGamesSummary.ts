import { api } from "../api";
import type { GameDto } from "../types";

/**
 * Fetches lightweight catalog summaries when `getGamesSummary` is available,
 * falling back to `getGames` only in partial test mocks where summary IPC is absent.
 */
export function fetchGamesSummary(): Promise<GameDto[]> {
  if (typeof api.games.getGamesSummary === "function") {
    return api.games.getGamesSummary();
  }
  return api.games.getGames();
}
