use serde::{Deserialize, Serialize};

/// Metadata stored in `manifest.json` inside the `.zip` backup archive.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BackupManifest {
    /// Format specification version (currently 1)
    pub format_version: u32,
    /// UTC timestamp of backup creation in ISO 8601 format
    pub created_at_utc: String,
    /// Omnis core engine version
    pub omnis_version: String,
    /// SQLite user_version / schema version
    pub schema_version: u32,
    /// Host machine name where backup was created
    pub hostname: String,
    /// Whether cache covers and backgrounds are included
    pub include_artwork: bool,
    /// Total games count stored in the database snapshot
    pub total_games: usize,
    /// Uncompressed or bundle metadata size hint
    #[serde(default)]
    pub backup_size_bytes: u64,
}

impl Default for BackupManifest {
    fn default() -> Self {
        Self {
            format_version: 1,
            created_at_utc: chrono::Utc::now().to_rfc3339(),
            omnis_version: env!("CARGO_PKG_VERSION").to_string(),
            schema_version: 1,
            hostname: "localhost".to_string(),
            include_artwork: false,
            total_games: 0,
            backup_size_bytes: 0,
        }
    }
}
