//! GOG Galaxy Achievements provider implementation
//!
//! Queries `gameplay.gog.com` for user achievement history, unlock dates,
//! and icons using an active GOG OAuth Bearer token.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use omnis_sdk::{Achievement, AchievementProvider, Game, StoreAccountSession};
use serde::{Deserialize, Serialize};
use tracing::debug;

/// Root response payload from gameplay.gog.com/clients/{client_id}/users/{user_id}/achievements
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GogAchievementsResponse {
    #[serde(alias = "total_count", default)]
    pub total_count: Option<usize>,
    #[serde(default)]
    pub items: Vec<GogAchievementItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GogAchievementItem {
    #[serde(alias = "achievement_id", default)]
    pub achievement_id: Option<String>,
    #[serde(alias = "achievement_key")]
    pub achievement_key: String,
    #[serde(default)]
    pub visible: Option<bool>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(alias = "image_url_unlocked", default)]
    pub image_url_unlocked: Option<String>,
    #[serde(alias = "image_url_locked", default)]
    pub image_url_locked: Option<String>,
    #[serde(alias = "date_unlocked", default)]
    pub date_unlocked: Option<String>,
    #[serde(default)]
    pub rarity: Option<f32>,
}

/// Helper to parse GOG Galaxy JSON payload into unified `Achievement` models
pub fn parse_gog_achievements_payload(
    game: &Game,
    json_str: &str,
) -> Result<Vec<Achievement>, String> {
    let parsed: GogAchievementsResponse = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse GOG achievements JSON: {e}"))?;

    let mut result = Vec::with_capacity(parsed.items.len());

    for item in parsed.items {
        let is_unlocked = item.date_unlocked.is_some();
        let unlock_time = item
            .date_unlocked
            .as_deref()
            .and_then(|t| DateTime::parse_from_rfc3339(t).ok())
            .map(|dt| dt.with_timezone(&Utc));

        let icon_unlocked_url = item
            .image_url_unlocked
            .filter(|url| !url.trim().is_empty())
            .or_else(|| item.image_url_locked.clone())
            .unwrap_or_default();

        let icon_locked_url = item
            .image_url_locked
            .filter(|url| !url.trim().is_empty())
            .or_else(|| {
                if !icon_unlocked_url.is_empty() {
                    Some(icon_unlocked_url.clone())
                } else {
                    None
                }
            });

        let is_hidden = !item.visible.unwrap_or(true);

        result.push(Achievement {
            id: format!("gog_{}_{}", game.id, item.achievement_key),
            game_id: game.id,
            api_name: item.achievement_key,
            display_name: item.name,
            description: item.description.filter(|d| !d.trim().is_empty()),
            icon_unlocked_url,
            icon_locked_url,
            local_icon_path: None,
            is_unlocked,
            unlock_time,
            rarity_percentage: item.rarity,
            points: None,
            is_hidden,
        });
    }

    Ok(result)
}

/// Fetch GOG Galaxy achievements over HTTP from gameplay.gog.com
pub async fn fetch_gog_achievements_api(
    client: &reqwest::Client,
    session: &StoreAccountSession,
    game: &Game,
) -> Result<Vec<Achievement>, String> {
    let product_id = &game.external_id;
    let user_id = &session.user_id;

    let endpoint = format!(
        "https://gameplay.gog.com/clients/{product_id}/users/{user_id}/achievements"
    );
    debug!("Fetching GOG achievements from {endpoint}");

    let mut req = client.get(&endpoint).header("Accept", "application/json");

    if !session.access_token.trim().is_empty() {
        req = req.header("Authorization", format!("Bearer {}", session.access_token));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("Failed to connect to GOG achievements endpoint: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GOG achievements request failed ({status}): {body}"));
    }

    let json_text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read GOG achievements body: {e}"))?;

    parse_gog_achievements_payload(game, &json_text)
}

#[async_trait]
impl AchievementProvider for crate::GogCloudPlugin {
    fn provider_id(&self) -> &'static str {
        "gog"
    }

    async fn fetch_achievements(
        &self,
        game: &Game,
        session: Option<&StoreAccountSession>,
    ) -> Result<Vec<Achievement>, String> {
        let sess = session.ok_or_else(|| {
            "An active GOG Galaxy session is required to fetch GOG achievements.".to_string()
        })?;

        fetch_gog_achievements_api(&self.client, sess, game).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use omnis_sdk::Uuid;

    #[test]
    fn test_gog_achievement_deserialization_and_parsing() {
        let dummy_game = Game {
            id: Uuid::parse_str("33333333-3333-3333-3333-333333333333").unwrap(),
            library_id: "gog".to_string(),
            external_id: "1437060567".to_string(),
            title: "The Witcher 3: Wild Hunt".to_string(),
            sorting_title: "Witcher 3".to_string(),
            install_dir: None,
            is_installed: true,
            playtime_seconds: 7200,
            play_count: 3,
            last_activity: None,
            release_date: None,
            user_score: None,
            critic_score: None,
            community_score: None,
            description: None,
            cover_image_path: None,
            background_image_path: None,
            icon_image_path: None,
            genres: vec![],
            developers: vec![],
            publishers: vec![],
            tags: vec![],
            categories: vec![],
            features: vec![],
            series: None,
            age_rating: None,
            completion_status: Some("Playing".to_string()),
            user_notes: None,
            custom_links: vec![],
            play_actions: vec![],
            extra_metadata: None,
            added_timestamp: Utc::now(),
            modified_timestamp: Utc::now(),
        };

        let json_payload = r#"{
            "total_count": 2,
            "items": [
                {
                    "achievement_id": "48497841707623054",
                    "achievement_key": "ACH_BUTCHER_OF_BLAVIKEN",
                    "visible": true,
                    "name": "Butcher of Blaviken",
                    "description": "Kill at least 5 opponents in under 10 seconds",
                    "image_url_unlocked": "https://images.gog.com/witcher_ach1.jpg",
                    "image_url_locked": "https://images.gog.com/witcher_ach1_locked.jpg",
                    "date_unlocked": "2024-02-14T20:15:00Z",
                    "rarity": 8.5
                },
                {
                    "achievement_id": "48497841707623055",
                    "achievement_key": "ACH_SECRET_QUEST",
                    "visible": false,
                    "name": "Secret Heritage",
                    "description": "Uncover the secret Witcher gear in Kaer Morhen",
                    "image_url_unlocked": "https://images.gog.com/witcher_ach2.jpg",
                    "image_url_locked": "https://images.gog.com/witcher_ach2_locked.jpg",
                    "date_unlocked": null,
                    "rarity": 2.1
                }
            ]
        }"#;

        let achievements = parse_gog_achievements_payload(&dummy_game, json_payload)
            .expect("Failed to parse GOG achievements");

        assert_eq!(achievements.len(), 2);

        let ach1 = &achievements[0];
        assert_eq!(ach1.api_name, "ACH_BUTCHER_OF_BLAVIKEN");
        assert_eq!(ach1.display_name, "Butcher of Blaviken");
        assert_eq!(
            ach1.description.as_deref(),
            Some("Kill at least 5 opponents in under 10 seconds")
        );
        assert_eq!(ach1.icon_unlocked_url, "https://images.gog.com/witcher_ach1.jpg");
        assert!(ach1.is_unlocked);
        assert_eq!(
            ach1.unlock_time,
            Some(DateTime::parse_from_rfc3339("2024-02-14T20:15:00Z").unwrap().with_timezone(&Utc))
        );
        assert_eq!(ach1.rarity_percentage, Some(8.5));
        assert!(!ach1.is_hidden);

        let ach2 = &achievements[1];
        assert_eq!(ach2.api_name, "ACH_SECRET_QUEST");
        assert!(!ach2.is_unlocked);
        assert_eq!(ach2.unlock_time, None);
        assert_eq!(ach2.rarity_percentage, Some(2.1));
        assert!(ach2.is_hidden); // visible: false -> is_hidden: true
    }
}
