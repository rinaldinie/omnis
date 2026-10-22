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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct GameAchievementsSummary {
    pub game_id: Uuid,
    pub total_count: u32,
    pub unlocked_count: u32,
    pub completion_percentage: f32,
    pub total_points: u32,
    pub earned_points: u32,
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
