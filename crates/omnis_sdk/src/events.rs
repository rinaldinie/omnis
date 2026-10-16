use crate::models::{DiscoveredGame, GameMetadataPatch};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

/// Asynchronous, non-blocking event bus messages
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum PluginEvent {
    // --- Host -> Plugin Events ---
    /// Request library synchronization
    SyncRequested {
        library_id: String,
        force_full: bool,
    },
    /// Game is preparing to launch
    GameLaunching {
        game_id: Uuid,
        install_dir: Option<PathBuf>,
    },
    /// Game has started running
    GameStarted {
        game_id: Uuid,
        process_id: u32,
    },
    /// Game process has terminated
    ProcessTerminated {
        game_id: Uuid,
        session_duration_seconds: u64,
    },
    /// Query metadata for an identified game
    MetadataQuery {
        game_id: Uuid,
        title: String,
        external_id: String,
    },

    // --- Plugin -> Host Events ---
    /// Stream a batch of discovered games (streamed with backpressure)
    BatchGamesDiscovered {
        library_id: String,
        games: Vec<DiscoveredGame>,
    },
    /// Provide resolved metadata patch for a game
    MetadataResolved {
        game_id: Uuid,
        metadata: GameMetadataPatch,
    },
    /// Emit a log/notification message to the core engine
    NotificationEmitted {
        level: LogLevel,
        message: String,
    },
}
