//! Standard shared constants for store identifiers, IPC event channels, and storage layouts

/// Standard store and library provider identifiers
pub mod stores {
    pub const STEAM: &str = "steam";
    pub const GOG: &str = "gog";
    pub const EPIC: &str = "epic";
    pub const XBOX: &str = "xbox";
    pub const MANUAL: &str = "manual";
    pub const CUSTOM: &str = "custom";

    /// Slice of all primary built-in cloud store identifiers
    pub const ALL_BUILTIN: &[&str] = &[STEAM, GOG, EPIC, XBOX];

    /// Checks if a given library ID matches a known built-in store (case-insensitive)
    pub fn is_builtin(library_id: &str) -> bool {
        ALL_BUILTIN.iter().any(|&s| s.eq_ignore_ascii_case(library_id))
    }
}

/// Tauri IPC and frontend event channel names
pub mod events {
    /// Emitted when the game library catalog is updated (insert, update, delete, sync)
    pub const LIBRARY_UPDATED: &str = "library-updated";
    /// Emitted when a game process has successfully spawned and is being tracked
    pub const GAME_STARTED: &str = "game-started";
    /// Emitted when a game process exits and playtime session is finalized
    pub const GAME_STOPPED: &str = "game-stopped";
    /// Emitted when the runtime status of an active game process changes (e.g. launching, running, stopping)
    pub const GAME_STATUS_CHANGED: &str = "game-status-changed";
    /// Emitted to request the UI to toggle or set fullscreen mode
    pub const APP_SET_FULLSCREEN: &str = "app-set-fullscreen";
    /// Emitted when a single game metadata or status changes
    pub const GAME_UPDATED: &str = "game-updated";
    /// Emitted when a game is removed from the library
    pub const GAME_DELETED: &str = "game-deleted";
    /// Emitted during bulk metadata downloads with progress info
    pub const METADATA_PROGRESS: &str = "metadata-progress";
}

/// Standard file and directory names across Omnis storage
pub mod storage {
    pub const DATABASE_FILE: &str = "library.db";
    pub const CACHE_DIR: &str = "cache";
    pub const COVERS_DIR: &str = "covers";
    pub const BACKGROUNDS_DIR: &str = "backgrounds";
    pub const PLUGINS_DIR: &str = "plugins";
    pub const THEMES_DIR: &str = "themes";
    pub const TRAILERS_DIR: &str = "trailers";
    pub const ACHIEVEMENTS_DIR: &str = "achievements";
}
