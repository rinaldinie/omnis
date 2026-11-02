import { invokeIpc } from "./client";
import type { GameStatsDto, GlobalStatsDto } from "../types";

export const statsApi = {
  /** Fetch aggregated statistics across all played games */
  getGlobalStatistics: (params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<GlobalStatsDto> =>
    invokeIpc<GlobalStatsDto>("get_global_statistics", params as Record<string, unknown>),

  /** Fetch gameplay statistics for an individual game */
  getGameStatistics: (gameId: string): Promise<GameStatsDto> =>
    invokeIpc<GameStatsDto>("get_game_statistics", { gameId }),

  /** Reset statistics database records */
  resetStatistics: (params?: { gameId?: string; scope?: string }): Promise<void> =>
    invokeIpc<void>("reset_statistics", params as Record<string, unknown>),
};
