//! Xbox Live & PC Game Pass Achievements provider implementation
//!
//! Queries `achievements.xboxlive.com` for user achievement history, unlock dates,
//! Gamerscore points, and rarity percentages using an active XSTS OAuth token.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use omnis_sdk::{Achievement, AchievementProvider, Game, StoreAccountSession};
use serde::{Deserialize, Serialize};
use tracing::debug;

/// Root payload from achievements.xboxlive.com
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct XboxAchievementsResponse {
    #[serde(default)]
    pub achievements: Vec<XboxAchievementItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XboxAchievementItem {
    pub id: String,
    #[serde(alias = "serviceConfigId", default)]
    pub service_config_id: Option<String>,
    pub name: String,
    #[serde(alias = "progressState", default)]
    pub progress_state: Option<String>,
    #[serde(default)]
    pub progression: Option<XboxAchievementProgression>,
    #[serde(alias = "mediaAssets", default)]
    pub media_assets: Vec<XboxMediaAsset>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(alias = "lockedDescription", default)]
    pub locked_description: Option<String>,
    #[serde(alias = "isSecret", default)]
    pub is_secret: Option<bool>,
    #[serde(default)]
    pub rarity: Option<XboxAchievementRarity>,
    #[serde(default)]
    pub rewards: Vec<XboxAchievementReward>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct XboxAchievementProgression {
    #[serde(alias = "timeUnlocked", default)]
    pub time_unlocked: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XboxMediaAsset {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(alias = "type", default)]
    pub r#type: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct XboxAchievementRarity {
    #[serde(alias = "currentCategory", default)]
    pub current_category: Option<String>,
    #[serde(alias = "currentPercentage", default)]
    pub current_percentage: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XboxAchievementReward {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(alias = "type", default)]
    pub r#type: Option<String>,
    #[serde(default)]
    pub value: Option<serde_json::Value>,
}

/// Helper to parse Xbox Live JSON payload into unified `Achievement` models
pub fn parse_xbox_achievements_payload(
    game: &Game,
    json_str: &str,
) -> Result<Vec<Achievement>, String> {
    let parsed: XboxAchievementsResponse = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse Xbox achievements JSON: {e}"))?;

    let mut result = Vec::with_capacity(parsed.achievements.len());

    for item in parsed.achievements {
        let is_unlocked = item
            .progress_state
            .as_deref()
            .map(|s| s.eq_ignore_ascii_case("Achieved"))
            .unwrap_or(false);

        let unlock_time = item
            .progression
            .as_ref()
            .and_then(|p| p.time_unlocked.as_deref())
            .and_then(|t| DateTime::parse_from_rfc3339(t).ok())
            .map(|dt| dt.with_timezone(&Utc));

        let rarity_percentage = item
            .rarity
            .as_ref()
            .and_then(|r| r.current_percentage)
            .map(|p| p as f32);

        // Extract Gamerscore reward
        let points = item
            .rewards
            .iter()
            .find(|r| {
                r.r#type
                    .as_deref()
                    .map(|t| t.eq_ignore_ascii_case("Gamerscore"))
                    .unwrap_or(false)
                    || r.name
                        .as_deref()
                        .map(|n| n.eq_ignore_ascii_case("Gamerscore"))
                        .unwrap_or(false)
            })
            .and_then(|r| {
                r.value.as_ref().and_then(|v| {
                    if let Some(n) = v.as_u64() {
                        Some(n as u32)
                    } else if let Some(s) = v.as_str() {
                        s.parse::<u32>().ok()
                    } else {
                        None
                    }
                })
            });

        // Find primary icon asset (type == "Icon" or fallback to first)
        let icon_unlocked_url = item
            .media_assets
            .iter()
            .find(|a| {
                a.r#type
                    .as_deref()
                    .map(|t| t.eq_ignore_ascii_case("Icon"))
                    .unwrap_or(false)
            })
            .map(|a| a.url.clone())
            .or_else(|| item.media_assets.first().map(|a| a.url.clone()))
            .unwrap_or_default();

        let description = if is_unlocked {
            item.description.clone()
        } else {
            item.locked_description.clone().or(item.description.clone())
        };

        result.push(Achievement {
            id: format!("xbox_{}_{}", game.id, item.id),
            game_id: game.id,
            api_name: item.id,
            display_name: item.name,
            description: description.filter(|d| !d.trim().is_empty()),
            icon_unlocked_url: icon_unlocked_url.clone(),
            icon_locked_url: if !icon_unlocked_url.is_empty() {
                Some(icon_unlocked_url)
            } else {
                None
            },
            local_icon_path: None,
            is_unlocked,
            unlock_time,
            rarity_percentage,
            points,
            is_hidden: item.is_secret.unwrap_or(false),
        });
    }

    Ok(result)
}

/// Fetch Xbox achievements over HTTP from achievements.xboxlive.com
pub async fn fetch_xbox_achievements_api(
    client: &reqwest::Client,
    session: &StoreAccountSession,
    game: &Game,
) -> Result<Vec<Achievement>, String> {
    let title_id = &game.external_id;
    let xuid = &session.user_id;

    let auth_header_value = if session.access_token.starts_with("XBL3.0 ") {
        session.access_token.clone()
    } else if session.access_token.starts_with("x=") {
        format!("XBL3.0 {}", session.access_token)
    } else if session.access_token.contains(';') {
        format!("XBL3.0 x={}", session.access_token)
    } else {
        format!("XBL3.0 x={};{}", session.user_id, session.access_token)
    };

    let endpoint = format!(
        "https://achievements.xboxlive.com/users/xuid({xuid})/achievements?titleId={title_id}&maxItems=1000"
    );
    debug!("Fetching Xbox achievements from {endpoint}");

    let resp = client
        .get(&endpoint)
        .header("x-xbl-contract-version", "2")
        .header("Authorization", &auth_header_value)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Xbox achievements endpoint: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Xbox achievements request failed ({status}): {body}"
        ));
    }

    let json_text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read Xbox achievements response body: {e}"))?;

    parse_xbox_achievements_payload(game, &json_text)
}

#[async_trait]
impl AchievementProvider for crate::XboxCloudPlugin {
    fn provider_id(&self) -> &'static str {
        "xbox"
    }

    async fn fetch_achievements(
        &self,
        game: &Game,
        session: Option<&StoreAccountSession>,
    ) -> Result<Vec<Achievement>, String> {
        let sess = session.ok_or_else(|| {
            "An active Xbox Live session is required to fetch Xbox achievements.".to_string()
        })?;

        fetch_xbox_achievements_api(&self.client, sess, game).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use omnis_sdk::Uuid;

    #[test]
    fn test_xbox_achievement_deserialization_and_parsing() {
        let dummy_game = Game {
            id: Uuid::parse_str("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee").unwrap(),
            library_id: "xbox".to_string(),
            external_id: "123456789".to_string(),
            title: "Halo Infinite".to_string(),
            sorting_title: "Halo Infinite".to_string(),
            install_dir: None,
            is_installed: true,
            playtime_seconds: 3600,
            play_count: 5,
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
            "achievements": [
                {
                    "id": "1",
                    "serviceConfigId": "halo-scid",
                    "name": "First Flight",
                    "progressState": "Achieved",
                    "progression": {
                        "timeUnlocked": "2024-03-15T18:30:00Z"
                    },
                    "mediaAssets": [
                        {
                            "name": "Icon",
                            "type": "Icon",
                            "url": "https://images-eds.xboxlive.com/image?url=first_flight.png"
                        }
                    ],
                    "description": "Complete the tutorial",
                    "lockedDescription": "Complete the tutorial to unlock",
                    "isSecret": false,
                    "rarity": {
                        "currentCategory": "Common",
                        "currentPercentage": 92.4
                    },
                    "rewards": [
                        {
                            "name": "Gamerscore",
                            "type": "Gamerscore",
                            "value": 20
                        }
                    ]
                },
                {
                    "id": "2",
                    "serviceConfigId": "halo-scid",
                    "name": "Mythic Master",
                    "progressState": "NotStarted",
                    "progression": {
                        "timeUnlocked": null
                    },
                    "mediaAssets": [
                        {
                            "name": "Icon",
                            "type": "Icon",
                            "url": "https://images-eds.xboxlive.com/image?url=mythic.png"
                        }
                    ],
                    "description": "Complete campaign on LASO difficulty",
                    "lockedDescription": "Classified secret mission",
                    "isSecret": true,
                    "rarity": {
                        "currentCategory": "Rare",
                        "currentPercentage": 1.1
                    },
                    "rewards": [
                        {
                            "name": "Gamerscore",
                            "type": "Gamerscore",
                            "value": "100"
                        }
                    ]
                }
            ],
            "pagingInfo": {
                "continuationToken": null,
                "totalItems": 2
            }
        }"#;

        let achievements = parse_xbox_achievements_payload(&dummy_game, json_payload)
            .expect("Failed to parse Xbox achievements");

        assert_eq!(achievements.len(), 2);

        let ach1 = &achievements[0];
        assert_eq!(ach1.api_name, "1");
        assert_eq!(ach1.display_name, "First Flight");
        assert_eq!(ach1.description.as_deref(), Some("Complete the tutorial"));
        assert_eq!(
            ach1.icon_unlocked_url,
            "https://images-eds.xboxlive.com/image?url=first_flight.png"
        );
        assert!(ach1.is_unlocked);
        assert_eq!(
            ach1.unlock_time,
            Some(DateTime::parse_from_rfc3339("2024-03-15T18:30:00Z").unwrap().with_timezone(&Utc))
        );
        assert_eq!(ach1.rarity_percentage, Some(92.4));
        assert_eq!(ach1.points, Some(20));
        assert!(!ach1.is_hidden);

        let ach2 = &achievements[1];
        assert_eq!(ach2.api_name, "2");
        assert_eq!(ach2.display_name, "Mythic Master");
        assert_eq!(ach2.description.as_deref(), Some("Classified secret mission"));
        assert!(!ach2.is_unlocked);
        assert_eq!(ach2.unlock_time, None);
        assert_eq!(ach2.rarity_percentage, Some(1.1));
        assert_eq!(ach2.points, Some(100)); // parsed from string "100"
        assert!(ach2.is_hidden);
    }
}
