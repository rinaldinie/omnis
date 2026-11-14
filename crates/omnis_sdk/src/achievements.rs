use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Achievement {
    pub id: String,
    pub game_id: Uuid,
    pub api_name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub icon_unlocked_url: String,
    pub icon_locked_url: Option<String>,
    pub local_icon_path: Option<String>,
    pub is_unlocked: bool,
    pub unlock_time: Option<DateTime<Utc>>,
    pub rarity_percentage: Option<f32>,
    pub points: Option<u32>,
    pub is_hidden: bool,
}

/// Persisted achievement scan state for a game
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AchievementsSyncStatus {
    /// Never scanned or previous scan failed before obtaining a definitive result
    #[default]
    Unknown,
    /// Store scan succeeded and found one or more achievements
    Available,
    /// Store scan succeeded and confirmed the game has no achievements
    None,
}

impl AchievementsSyncStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Unknown => "unknown",
            Self::Available => "available",
            Self::None => "none",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "available" => Self::Available,
            "none" => Self::None,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct GameAchievementsSummary {
    pub game_id: Uuid,
    pub total_count: u32,
    pub unlocked_count: u32,
    pub completion_percentage: f32,
    pub total_points: u32,
    pub earned_points: u32,
    #[serde(default)]
    pub sync_status: AchievementsSyncStatus,
    pub achievements: Vec<Achievement>,
}

#[async_trait::async_trait]
pub trait AchievementProvider: Send + Sync {
    fn provider_id(&self) -> &'static str;
    async fn fetch_achievements(
        &self,
        game: &crate::models::Game,
        session: Option<&crate::plugin::StoreAccountSession>,
    ) -> Result<Vec<Achievement>, String>;
}
