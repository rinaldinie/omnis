import { invokeIpc } from "./client";
import type { GameAchievementsSummary } from "../types";

export const achievementsApi = {
  /** Fetch unlocked and locked achievements for a game */
  getGameAchievements: (gameId: string): Promise<GameAchievementsSummary> =>
    invokeIpc<GameAchievementsSummary>("get_game_achievements", { gameId }),

  /** Force re-sync achievements for a single game from upstream store */
  refreshGameAchievements: (gameId: string): Promise<GameAchievementsSummary> =>
    invokeIpc<GameAchievementsSummary>("refresh_game_achievements", { gameId }),

  /** Start library-wide achievement background sync */
  startLibraryAchievementSync: (): Promise<void> =>
    invokeIpc<void>("start_library_achievement_sync"),

  /** Configure sync achievements on game exit */
  setSyncAchievementsOnGameExit: (enabled: boolean): Promise<void> =>
    invokeIpc<void>("set_sync_achievements_on_game_exit", { enabled }),
};
