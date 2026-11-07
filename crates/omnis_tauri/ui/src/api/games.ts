import { invokeIpc, invokeTauri } from "./client";
import type {
  ActiveGameSession,
  DuplicateHiderConfig,
  DuplicateHiderStats,
  GameDto,
  LibraryCounts,
  StoreDetectionResult,
} from "../types";

export const gamesApi = {
  /** Fetch all games in the library */
  getGames: (): Promise<GameDto[]> => invokeIpc<GameDto[]>("get_games"),

  /** Fetch library counts categorized by stores, status, genres */
  getCounts: (): Promise<LibraryCounts> => invokeIpc<LibraryCounts>("get_counts"),

  /** Launch a game by ID */
  launchGame: (gameId: string): Promise<void> => invokeIpc<void>("launch_game", { gameId }),

  /** Kill currently running game process */
  killRunningGame: (): Promise<boolean> => invokeIpc<boolean>("kill_running_game"),

  /** Check currently running active game session */
  getRunningGame: (): Promise<ActiveGameSession | null> =>
    invokeIpc<ActiveGameSession | null>("get_running_game"),

  /** Open installation directory in file explorer */
  openGameInstallDir: (gameId: string): Promise<void> =>
    invokeIpc<void>("open_game_install_dir", { gameId }),

  /** Uninstall a game from the local machine */
  uninstallGame: (gameId: string): Promise<void> =>
    invokeIpc<void>("uninstall_game", { gameId }),

  /** Remove a game record from the Omnis database */
  removeGameFromLibrary: (gameId: string): Promise<void> =>
    invokeIpc<void>("remove_game_from_library", { gameId }),

  /** Create desktop shortcut for a game */
  createDesktopShortcut: (gameId: string): Promise<string> =>
    invokeIpc<string>("create_desktop_shortcut", { gameId }),

  /** Verify local files for a game */
  verifyGameFiles: (gameId: string): Promise<void> =>
    invokeIpc<void>("verify_game_files", { gameId }),

  /** Update play completion status */
  updateGameCompletionStatus: (gameId: string, completionStatus: string): Promise<GameDto> =>
    invokeIpc<GameDto>("update_game_completion_status", { gameId, completionStatus }),

  /** Trigger metadata enrichment for a single game */
  enrichSingleGame: (gameId: string): Promise<GameDto> =>
    invokeIpc<GameDto>("enrich_single_game", { gameId }),

  /** Refresh HowLongToBeat playtimes for a single game */
  refreshGameHowlongtobeat: (gameId: string): Promise<GameDto> =>
    invokeIpc<GameDto>("refresh_game_howlongtobeat", { gameId }),

  /** Synchronize local store installations */
  syncLibrary: (): Promise<number> => invokeIpc<number>("sync_library"),

  /** Detect installed launchers and stores */
  detectStores: (): Promise<StoreDetectionResult[]> =>
    invokeIpc<StoreDetectionResult[]>("detect_stores"),

  /** Add custom executable game to library */
  addCustomGame: (payload: {
    title: string;
    executable_path: string;
    arguments?: string[];
    working_dir?: string | null;
    cover_image_path?: string | null;
  }): Promise<GameDto> => invokeIpc<GameDto>("add_custom_game", { payload }),

  /** Search executables in a directory */
  findExecutablesInFolder: (folderPath: string): Promise<string[]> =>
    invokeIpc<string[]>("find_executables_in_folder", { folderPath }),

  /** Native file dialog: pick executable */
  pickExecutableFile: (): Promise<string | null> =>
    invokeIpc<string | null>("pick_executable_file"),

  /** Native file dialog: pick directory */
  pickDirectory: (): Promise<string | null> => invokeIpc<string | null>("pick_directory"),

  /** Native file dialog: pick image file */
  pickImageFile: (): Promise<string | null> => invokeIpc<string | null>("pick_image_file"),

  /** Set sync achievements on game exit */
  setSyncAchievementsOnGameExit: (enabled: boolean): Promise<void> =>
    invokeIpc<void>("set_sync_achievements_on_game_exit", { enabled }),

  /** Fetch full detailed game model by ID */
  getGame: (gameId: string): Promise<Record<string, unknown>> =>
    invokeIpc<Record<string, unknown>>("get_game", { gameId }),

  /** Update user game metadata (title, media, play actions, links) */
  updateGameMetadata: (gameUpdate: Record<string, unknown>): Promise<GameDto> =>
    invokeIpc<GameDto>("update_game_metadata", { gameUpdate }),

  /** Start library achievement sync */
  startLibraryAchievementSync: (): Promise<void> =>
    invokeIpc<void>("start_library_achievement_sync"),

  /** Get game trailer stream/video URL */
  getGameTrailerUrl: (params: {
    gameId: string;
    libraryId: string;
    externalId?: string;
  }): Promise<string | null> =>
    invokeIpc<string | null>("get_game_trailer_url", params as Record<string, unknown>),

  /** Fetch Duplicate Hider configuration */
  getDuplicateHiderConfig: (): Promise<DuplicateHiderConfig> =>
    invokeIpc<DuplicateHiderConfig>("get_duplicate_hider_config"),

  /** Save Duplicate Hider configuration and recompute duplicates */
  saveDuplicateHiderConfig: (config: DuplicateHiderConfig): Promise<DuplicateHiderStats> =>
    invokeIpc<DuplicateHiderStats>("save_duplicate_hider_config", { config }),

  /** Trigger immediate Duplicate Hider evaluation */
  applyDuplicateHider: (): Promise<DuplicateHiderStats> =>
    invokeIpc<DuplicateHiderStats>("apply_duplicate_hider"),

  /** Manually hide or unhide a game */
  setGameHidden: (gameId: string, isHidden: boolean): Promise<GameDto> =>
    invokeIpc<GameDto>("set_game_hidden", { gameId, isHidden }),

  /** Toggle favorite status of a game */
  setGameFavorite: (gameId: string, isFavorite: boolean): Promise<GameDto> =>
    invokeIpc<GameDto>("set_game_favorite", { gameId, isFavorite }),

  /** Promote a duplicate copy to be the visible primary copy in its group */
  promoteDuplicateCopy: (gameId: string): Promise<GameDto[]> =>
    invokeIpc<GameDto[]>("promote_duplicate_copy", { gameId }),
};
