use serde::{Deserialize, Serialize};

pub mod achievements;
pub mod constants;
pub mod events;
pub mod ffi;
pub mod models;
pub mod plugin;
pub mod settings_schema;
pub mod widget;

pub use async_trait::async_trait;
pub use uuid::Uuid;
pub use constants::*;
pub use events::*;
pub use ffi::*;
pub use models::*;
pub use plugin::*;
pub use settings_schema::*;
pub use widget::*;

/// Individual session summary within a day
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DaySessionDto {
    pub id: String,
    pub game_id: String,
    pub game_title: String,
    #[serde(default)]
    pub library_id: Option<String>,
    #[serde(default)]
    pub cover_image: Option<String>,
    pub started_at: String,
    pub ended_at: String,
    pub duration_seconds: u64,
}

/// External session payload to ingest into game_sessions
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExternalSessionDto {
    pub external_id: String,
    pub started_at: String,
    pub ended_at: String,
    pub duration_seconds: u64,
}

/// Heatmap activity record for a single day
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DayActivityDto {
    pub date: String,
    pub count_sessions: u32,
    pub duration_seconds: u64,
    #[serde(default)]
    pub sessions: Vec<DaySessionDto>,
}

/// Category share for store or genre distributions
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CategoryShareDto {
    pub name: String,
    pub duration_seconds: u64,
    pub percentage: f32,
}

/// Summary of library backlog and completion metrics
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BacklogSummaryDto {
    pub not_played_count: u32,
    pub in_progress_count: u32,
    pub completed_count: u32,
    pub total_games: u32,
    pub completion_percentage: f32,
}

/// Global library and session analytics payload
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GlobalStatsDto {
    pub total_playtime_year_seconds: u64,
    #[serde(default)]
    pub total_playtime_lifetime_seconds: u64,
    #[serde(default)]
    pub available_years: Vec<i32>,
    pub activity_heatmap: Vec<DayActivityDto>,
    pub store_distribution: Vec<CategoryShareDto>,
    pub genre_distribution: Vec<CategoryShareDto>,
    pub backlog_summary: BacklogSummaryDto,
}

/// Playtime aggregated for a specific 7-day interval
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WeekPlaytimeDto {
    pub week_label: String,
    pub start_date: String,
    pub end_date: String,
    pub duration_seconds: u64,
}

/// Detailed session statistics and recent activity bars for a game
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GameStatsDto {
    pub average_session_seconds: u64,
    pub longest_session_seconds: u64,
    pub last_4_weeks_bars: Vec<WeekPlaytimeDto>,
}


