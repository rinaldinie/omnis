use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

/// Tracking strategy used to monitor game runtime without consuming CPU
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "target")]
pub enum ProcessTrackingMode {
    /// Zero-cost OS kernel notification (Job Objects on Windows, pidfd on Linux)
    KernelJobObject,
    /// Monitor process by executable file name
    ProcessName(String),
    /// Watch an installation directory for active executables
    WatchDirectory(PathBuf),
}

/// Action and parameters required to launch a game
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LaunchConfiguration {
    pub executable: String,
    pub arguments: Vec<String>,
    pub working_dir: Option<PathBuf>,
    pub tracking_mode: ProcessTrackingMode,
}

/// Discovered game emitted from library plugins during discovery/sync
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiscoveredGame {
    /// Library provider ID (e.g., "steam", "gog", "epic")
    pub library_id: String,
    /// Identifier on the external store/client
    pub external_id: String,
    /// Display title
    pub title: String,
    /// Optional installation directory if installed locally
    pub install_dir: Option<PathBuf>,
    /// Whether the game is currently installed and ready to launch
    pub is_installed: bool,
    /// Launch configuration for starting the title
    pub play_action: Option<LaunchConfiguration>,
    /// Accumulated playtime in seconds
    pub playtime_seconds: u64,
    /// Number of times the game was launched
    pub play_count: u32,
    /// Last played timestamp (UTC)
    pub last_activity: Option<DateTime<Utc>>,
    /// Optional local artwork cover path discovered directly from client cache
    #[serde(default)]
    pub cover_image_path: Option<String>,
    /// Optional local artwork hero background path discovered directly from client cache
    #[serde(default)]
    pub background_image_path: Option<String>,
}

/// Playnite-parity game completion status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CompletionStatus {
    NotPlayed,
    Playing,
    Beaten,
    Completed,
    Abandoned,
    Backlog,
    PlanToPlay,
}

impl CompletionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NotPlayed => "NotPlayed",
            Self::Playing => "Playing",
            Self::Beaten => "Beaten",
            Self::Completed => "Completed",
            Self::Abandoned => "Abandoned",
            Self::Backlog => "Backlog",
            Self::PlanToPlay => "PlanToPlay",
        }
    }
}

impl Default for CompletionStatus {
    fn default() -> Self {
        Self::NotPlayed
    }
}

impl std::fmt::Display for CompletionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for CompletionStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().replace([' ', '_', '-'], "").as_str() {
            "notplayed" => Ok(Self::NotPlayed),
            "playing" => Ok(Self::Playing),
            "beaten" => Ok(Self::Beaten),
            "completed" => Ok(Self::Completed),
            "abandoned" => Ok(Self::Abandoned),
            "backlog" => Ok(Self::Backlog),
            "plantoplay" => Ok(Self::PlanToPlay),
            _ => Err(format!("Unknown completion status: {}", s)),
        }
    }
}

/// Custom link attached to a game (e.g. wiki, guides, discord)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CustomLink {
    pub title: String,
    pub url: String,
}

/// Persistent Game entity stored in Omnis's high-performance SQLite database
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Game {
    pub id: Uuid,
    pub library_id: String,
    pub external_id: String,
    pub title: String,
    pub sorting_title: String,
    pub install_dir: Option<PathBuf>,
    pub is_installed: bool,
    pub playtime_seconds: u64,
    pub play_count: u32,
    pub last_activity: Option<DateTime<Utc>>,
    pub release_date: Option<String>,
    pub user_score: Option<u8>,
    pub critic_score: Option<u8>,
    pub community_score: Option<u8>,
    pub description: Option<String>,
    pub cover_image_path: Option<String>,
    pub background_image_path: Option<String>,
    pub icon_image_path: Option<String>,
    pub genres: Vec<String>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub tags: Vec<String>,
    pub categories: Vec<String>,
    #[serde(default)]
    pub features: Vec<String>,
    pub series: Option<String>,
    pub age_rating: Option<String>,
    pub completion_status: Option<String>,
    pub user_notes: Option<String>,
    #[serde(default)]
    pub extra_metadata: Option<String>,
    #[serde(default)]
    pub play_actions: Vec<LaunchConfiguration>,
    #[serde(default)]
    pub custom_links: Vec<CustomLink>,
    pub added_timestamp: DateTime<Utc>,
    pub modified_timestamp: DateTime<Utc>,
}

impl Game {
    pub fn new(library_id: String, external_id: String, title: String) -> Self {
        let now = Utc::now();
        let sorting_title = title.to_lowercase();
        Self {
            id: Uuid::new_v4(),
            library_id,
            external_id,
            title,
            sorting_title,
            install_dir: None,
            is_installed: false,
            playtime_seconds: 0,
            play_count: 0,
            last_activity: None,
            release_date: None,
            user_score: None,
            critic_score: None,
            community_score: None,
            description: None,
            cover_image_path: None,
            background_image_path: None,
            icon_image_path: None,
            genres: Vec::new(),
            developers: Vec::new(),
            publishers: Vec::new(),
            tags: Vec::new(),
            categories: Vec::new(),
            features: Vec::new(),
            series: None,
            age_rating: None,
            completion_status: None,
            user_notes: None,
            extra_metadata: None,
            play_actions: Vec::new(),
            custom_links: Vec::new(),
            added_timestamp: now,
            modified_timestamp: now,
        }
    }

    /// Helper to retrieve completion status as typed enum if valid
    pub fn completion_status_enum(&self) -> Option<CompletionStatus> {
        self.completion_status.as_deref().and_then(|s| s.parse().ok())
    }
}

/// DTO payload for updating game metadata, custom actions, and categorization
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GameUpdateDto {
    pub id: Uuid,
    pub title: String,
    pub sorting_title: Option<String>,
    pub release_date: Option<String>,
    pub description: Option<String>,
    pub user_score: Option<u8>,
    pub critic_score: Option<u8>,
    pub community_score: Option<u8>,
    pub series: Option<String>,
    pub age_rating: Option<String>,
    pub completion_status: Option<String>,
    pub user_notes: Option<String>,
    #[serde(default)]
    pub extra_metadata: Option<String>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub developers: Vec<String>,
    #[serde(default)]
    pub publishers: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub features: Vec<String>,
    pub cover_image_path: Option<String>,
    pub background_image_path: Option<String>,
    pub icon_image_path: Option<String>,
    #[serde(default)]
    pub play_actions: Vec<LaunchConfiguration>,
    #[serde(default)]
    pub custom_links: Vec<CustomLink>,
}

/// Discrete metadata fields for granular provider fallback and priority configuration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MetadataField {
    CoverImage,
    BackgroundImage,
    Icon,
    CriticScore,
    CommunityScore,
    Description,
    ReleaseDate,
    Genres,
    Developers,
    Publishers,
}

/// Query context passed to metadata provider plugins
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MetadataSearchRequest {
    pub title: String,
    pub external_id: Option<String>,
    pub library_id: String,
}

/// Metadata update patch supplied by a metadata provider plugin
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
pub struct GameMetadataPatch {
    pub description: Option<String>,
    pub release_date: Option<String>,
    pub cover_url: Option<String>,
    pub background_url: Option<String>,
    pub icon_url: Option<String>,
    pub critic_score: Option<u8>,
    pub community_score: Option<u8>,
    pub genres: Vec<String>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub tags: Vec<String>,
    #[serde(default)]
    pub features: Vec<String>,
    #[serde(default)]
    pub extra_metadata: Option<String>,
}

/// Store account summary DTO exposed to the UI/frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreAccountDto {
    pub store_id: String,
    pub name: String,
    pub is_connected: bool,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub last_sync: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(default)]
    pub has_api_key: Option<bool>,
    #[serde(default)]
    pub is_syncing: bool,
}

/// Progress event emitted during cloud store synchronization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreSyncProgressPayload {
    pub store_id: String,
    pub current: usize,
    pub total: usize,
    pub status: String, // "syncing" | "completed" | "error"
    pub message: Option<String>,
}

/// State of an active game session
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionState {
    Launching,
    Running,
    Stopping,
}

/// Historical game play session record
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameSessionRecord {
    pub id: Uuid,
    pub game_id: Uuid,
    pub started_at: DateTime<Utc>,
    pub ended_at: DateTime<Utc>,
    pub duration_seconds: u64,
}

pub use crate::achievements::*;
pub use crate::{
    BacklogSummaryDto, CategoryShareDto, DayActivityDto, GameStatsDto, GlobalStatsDto,
    WeekPlaytimeDto,
};






