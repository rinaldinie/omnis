/**
 * Tauri IPC and frontend event channel names.
 * Mirrors `omnis_sdk::constants::events` and store/system events.
 */
export const TAURI_EVENTS = {
  // Library & Game Catalog
  LIBRARY_UPDATED: "library-updated",
  GAME_UPDATED: "game-updated",
  GAME_DELETED: "game-deleted",

  // Game Process Lifecycle
  GAME_STARTED: "game-started",
  GAME_STOPPED: "game-stopped",
  GAME_STATUS_CHANGED: "game-status-changed",

  // Window & UI
  APP_SET_FULLSCREEN: "app-set-fullscreen",

  // Metadata & Media
  METADATA_PROGRESS: "metadata-progress",

  // Achievements
  ACHIEVEMENT_SYNC_PROGRESS: "achievement-sync-progress",
  ACHIEVEMENTS_UPDATED: "achievements-updated",

  // Cloud Store Integration
  STORE_SYNC_PROGRESS: "store-sync-progress",
  STORE_ACCOUNT_CONNECTED: "store-account-connected",
  STORE_ACCOUNT_DISCONNECTED: "store-account-disconnected",

  // System Tray
  TRAY_LAUNCH_GAME: "tray-launch-game",
  TRAY_OPEN_SETTINGS: "tray-open-settings",

  // External Importers
  PLAYNITE_IMPORT_PROGRESS: "playnite://import-progress",
} as const;

export type TauriEvent = (typeof TAURI_EVENTS)[keyof typeof TAURI_EVENTS];
