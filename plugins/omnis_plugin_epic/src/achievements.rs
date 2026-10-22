//! Epic Games Store Achievements provider implementation
//!
//! Queries `https://graphql.epicgames.com/graphql` for product achievement definitions,
//! XP values, rarity percentages, and player unlock progress using active Epic OAuth tokens.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use omnis_sdk::{Achievement, AchievementProvider, Game, StoreAccountSession};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::debug;

/// Root GraphQL response wrapper
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EpicGraphQLResponse<T> {
    pub data: Option<T>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EpicAchievementsData {
    #[serde(rename = "Achievement", default)]
    pub achievement: Option<EpicAchievementNamespaceData>,
    #[serde(rename = "PlayerAchievement", default)]
    pub player_achievement: Option<EpicPlayerAchievementData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EpicAchievementNamespaceData {
    #[serde(rename = "productAchievementsRecordBySandbox", default)]
    pub product_achievements_record: Option<EpicProductAchievementsRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EpicProductAchievementsRecord {
    #[serde(rename = "totalAchievements", default)]
    pub total_achievements: Option<usize>,
    #[serde(rename = "totalProductXP", default)]
    pub total_product_xp: Option<u32>,
    #[serde(default)]
    pub achievements: Vec<EpicAchievementEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpicAchievementEntry {
    pub achievement: EpicAchievementDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpicAchievementDetail {
    pub name: String,
    #[serde(default)]
    pub hidden: Option<bool>,
    #[serde(rename = "unlockedDisplayName", default)]
    pub unlocked_display_name: Option<String>,
    #[serde(rename = "lockedDisplayName", default)]
    pub locked_display_name: Option<String>,
    #[serde(rename = "unlockedDescription", default)]
    pub unlocked_description: Option<String>,
    #[serde(rename = "lockedDescription", default)]
    pub locked_description: Option<String>,
    #[serde(rename = "unlockedIconLink", default)]
    pub unlocked_icon_link: Option<String>,
    #[serde(rename = "lockedIconLink", default)]
    pub locked_icon_link: Option<String>,
    #[serde(rename = "XP", default)]
    pub xp: Option<u32>,
    #[serde(default)]
    pub rarity: Option<EpicRarity>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EpicRarity {
    pub percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EpicPlayerAchievementData {
    #[serde(rename = "playerAchievementGameRecords", default)]
    pub player_achievement_game_records: Option<EpicPlayerGameRecords>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EpicPlayerGameRecords {
    #[serde(default)]
    pub records: Vec<EpicPlayerGameRecordItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EpicPlayerGameRecordItem {
    #[serde(rename = "totalUnlocked", default)]
    pub total_unlocked: Option<usize>,
    #[serde(default)]
    pub achievements: Vec<EpicPlayerAchievementItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpicPlayerAchievementItem {
    #[serde(rename = "achievementName")]
    pub achievement_name: String,
    pub unlocked: bool,
    #[serde(rename = "unlockDate", default)]
    pub unlock_date: Option<String>,
}

/// Helper to parse Epic GraphQL JSON payload into unified `Achievement` models
pub fn parse_epic_achievements_payload(
    game: &Game,
    json_str: &str,
) -> Result<Vec<Achievement>, String> {
    let parsed: EpicGraphQLResponse<EpicAchievementsData> = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse Epic GraphQL achievements response: {e}"))?;

    let data = parsed
        .data
        .ok_or_else(|| "Epic GraphQL response contained no 'data' field".to_string())?;

    let product_achievements = data
        .achievement
        .and_then(|a| a.product_achievements_record)
        .map(|r| r.achievements)
        .unwrap_or_default();

    if product_achievements.is_empty() {
        return Ok(Vec::new());
    }

    // Map player unlock stats by achievementName
    let mut player_map = HashMap::new();
    if let Some(player_data) = data.player_achievement {
        if let Some(game_records) = player_data.player_achievement_game_records {
            for record in game_records.records {
                for item in record.achievements {
                    player_map.insert(item.achievement_name.clone(), item);
                }
            }
        }
    }

    let mut result = Vec::with_capacity(product_achievements.len());

    for entry in product_achievements {
        let detail = entry.achievement;
        let player_stat = player_map.get(&detail.name);
        let is_unlocked = player_stat.map(|p| p.unlocked).unwrap_or(false);
        let unlock_time = player_stat
            .and_then(|p| p.unlock_date.as_deref())
            .and_then(|t| DateTime::parse_from_rfc3339(t).ok())
            .map(|dt| dt.with_timezone(&Utc));

        let display_name = if is_unlocked {
            detail
                .unlocked_display_name
                .or(detail.locked_display_name)
                .unwrap_or_else(|| detail.name.clone())
        } else {
            detail
                .locked_display_name
                .or(detail.unlocked_display_name)
                .unwrap_or_else(|| detail.name.clone())
        };

        let description = if is_unlocked {
            detail.unlocked_description.or(detail.locked_description)
        } else {
            detail.locked_description.or(detail.unlocked_description)
        };

        let icon_unlocked_url = detail
            .unlocked_icon_link
            .filter(|url| !url.trim().is_empty())
            .or_else(|| detail.locked_icon_link.clone())
            .unwrap_or_default();

        let icon_locked_url = detail
            .locked_icon_link
            .filter(|url| !url.trim().is_empty())
            .or_else(|| {
                if !icon_unlocked_url.is_empty() {
                    Some(icon_unlocked_url.clone())
                } else {
                    None
                }
            });

        let rarity_percentage = detail
            .rarity
            .as_ref()
            .and_then(|r| r.percent)
            .map(|p| p as f32);

        result.push(Achievement {
            id: format!("epic_{}_{}", game.id, detail.name),
            game_id: game.id,
            api_name: detail.name,
            display_name,
            description: description.filter(|d| !d.trim().is_empty()),
            icon_unlocked_url,
            icon_locked_url,
            local_icon_path: None,
            is_unlocked,
            unlock_time,
            rarity_percentage,
            points: detail.xp,
            is_hidden: detail.hidden.unwrap_or(false),
        });
    }

    Ok(result)
}

/// Fetch Epic Games Store achievements via GraphQL
pub async fn fetch_epic_achievements_api(
    client: &reqwest::Client,
    session: Option<&StoreAccountSession>,
    game: &Game,
) -> Result<Vec<Achievement>, String> {
    // Extract sandbox_id (namespace) from extra_metadata if present, otherwise external_id
    let sandbox_id = if let Some(ref extra) = game.extra_metadata {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(extra) {
            val.get("namespace")
                .and_then(|v| v.as_str())
                .unwrap_or(&game.external_id)
                .to_string()
        } else {
            game.external_id.clone()
        }
    } else {
        game.external_id.clone()
    };

    let epic_account_id = session.map(|s| s.user_id.as_str()).unwrap_or_default();

    let query = r#"
        query getGameAndPlayerAchievements($sandboxId: String!, $epicAccountId: String!, $locale: String!) {
            Achievement {
                productAchievementsRecordBySandbox(sandboxId: $sandboxId, locale: $locale) {
                    totalAchievements
                    totalProductXP
                    achievements {
                        achievement {
                            name
                            hidden
                            unlockedDisplayName
                            lockedDisplayName
                            unlockedDescription
                            lockedDescription
                            unlockedIconLink
                            lockedIconLink
                            XP
                            rarity {
                                percent
                            }
                        }
                    }
                }
            }
            PlayerAchievement {
                playerAchievementGameRecords(epicAccountId: $epicAccountId, sandboxId: $sandboxId, includeAchievements: true) {
                    records {
                        totalUnlocked
                        achievements {
                            achievementName
                            unlocked
                            unlockDate
                        }
                    }
                }
            }
        }
    "#;

    let body = serde_json::json!({
        "query": query,
        "variables": {
            "sandboxId": sandbox_id,
            "epicAccountId": epic_account_id,
            "locale": "en-US"
        }
    });

    let mut req = client
        .post("https://graphql.epicgames.com/graphql")
        .header("Content-Type", "application/json")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher")
        .json(&body);

    if let Some(sess) = session {
        if !sess.access_token.trim().is_empty() {
            req = req.header("Authorization", format!("Bearer {}", sess.access_token));
        }
    }

    debug!("Sending Epic Games achievements GraphQL query for sandboxId={sandbox_id}");
    let resp = req
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Epic GraphQL endpoint: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Epic achievements GraphQL error ({status}): {err_text}"));
    }

    let json_text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read Epic achievements GraphQL body: {e}"))?;

    parse_epic_achievements_payload(game, &json_text)
}

#[async_trait]
impl AchievementProvider for crate::EpicLibraryPlugin {
    fn provider_id(&self) -> &'static str {
        "epic"
    }

    async fn fetch_achievements(
        &self,
        game: &Game,
        session: Option<&StoreAccountSession>,
    ) -> Result<Vec<Achievement>, String> {
        fetch_epic_achievements_api(&self.client, session, game).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use omnis_sdk::Uuid;

    #[test]
    fn test_epic_achievement_deserialization_and_parsing() {
        let dummy_game = Game {
            id: Uuid::parse_str("44444444-4444-4444-4444-444444444444").unwrap(),
            library_id: "epic".to_string(),
            external_id: "fallguys_sandbox_1".to_string(),
            title: "Fall Guys".to_string(),
            sorting_title: "Fall Guys".to_string(),
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
            "data": {
                "Achievement": {
                    "productAchievementsRecordBySandbox": {
                        "totalAchievements": 2,
                        "totalProductXP": 150,
                        "achievements": [
                            {
                                "achievement": {
                                    "name": "QUALIFY_FIRST_ROUND",
                                    "hidden": false,
                                    "unlockedDisplayName": "One Small Trip",
                                    "lockedDisplayName": "One Small Trip",
                                    "unlockedDescription": "Qualify from your first round",
                                    "lockedDescription": "Qualify from your first round",
                                    "unlockedIconLink": "https://cdn.epicgames.com/icon1_unlocked.png",
                                    "lockedIconLink": "https://cdn.epicgames.com/icon1_locked.png",
                                    "XP": 50,
                                    "rarity": {
                                        "percent": 88.5
                                    }
                                }
                            },
                            {
                                "achievement": {
                                    "name": "INCOGNITO_CHAMP",
                                    "hidden": true,
                                    "unlockedDisplayName": "Secret Crown",
                                    "lockedDisplayName": "Classified Crown",
                                    "unlockedDescription": "Win a show wearing a secret outfit",
                                    "lockedDescription": "Secret mystery task",
                                    "unlockedIconLink": "https://cdn.epicgames.com/icon2_unlocked.png",
                                    "lockedIconLink": "https://cdn.epicgames.com/icon2_locked.png",
                                    "XP": 100,
                                    "rarity": {
                                        "percent": 3.4
                                    }
                                }
                            }
                        ]
                    }
                },
                "PlayerAchievement": {
                    "playerAchievementGameRecords": {
                        "records": [
                            {
                                "totalUnlocked": 1,
                                "achievements": [
                                    {
                                        "achievementName": "QUALIFY_FIRST_ROUND",
                                        "unlocked": true,
                                        "unlockDate": "2024-04-10T12:00:00Z"
                                    },
                                    {
                                        "achievementName": "INCOGNITO_CHAMP",
                                        "unlocked": false,
                                        "unlockDate": null
                                    }
                                ]
                            }
                        ]
                    }
                }
            }
        }"#;

        let achievements = parse_epic_achievements_payload(&dummy_game, json_payload)
            .expect("Failed to parse Epic achievements");

        assert_eq!(achievements.len(), 2);

        let ach1 = &achievements[0];
        assert_eq!(ach1.api_name, "QUALIFY_FIRST_ROUND");
        assert_eq!(ach1.display_name, "One Small Trip");
        assert_eq!(ach1.description.as_deref(), Some("Qualify from your first round"));
        assert!(ach1.is_unlocked);
        assert_eq!(
            ach1.unlock_time,
            Some(DateTime::parse_from_rfc3339("2024-04-10T12:00:00Z").unwrap().with_timezone(&Utc))
        );
        assert_eq!(ach1.rarity_percentage, Some(88.5));
        assert_eq!(ach1.points, Some(50));
        assert!(!ach1.is_hidden);

        let ach2 = &achievements[1];
        assert_eq!(ach2.api_name, "INCOGNITO_CHAMP");
        assert_eq!(ach2.display_name, "Classified Crown"); // locked name shown when locked
        assert_eq!(ach2.description.as_deref(), Some("Secret mystery task"));
        assert!(!ach2.is_unlocked);
        assert_eq!(ach2.unlock_time, None);
        assert_eq!(ach2.rarity_percentage, Some(3.4));
        assert_eq!(ach2.points, Some(100));
        assert!(ach2.is_hidden);
    }
}
