//! Steam Achievements provider implementation
//!
//! Queries Steam Web API for game achievement schemas, player unlock progress,
//! and global rarity unlock percentages.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use omnis_sdk::{Achievement, AchievementProvider, Game, StoreAccountSession};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{debug, warn};

/// Root response from ISteamUserStats/GetSchemaForGame/v2
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamGameSchemaResponse {
    pub game: Option<SteamGameSchemaData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SteamGameSchemaData {
    #[serde(alias = "gameName", default)]
    pub game_name: Option<String>,
    #[serde(alias = "availableGameStats", default)]
    pub available_game_stats: Option<SteamAvailableGameStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SteamAvailableGameStats {
    #[serde(default)]
    pub achievements: Vec<SteamSchemaAchievementItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamSchemaAchievementItem {
    pub name: String,
    #[serde(alias = "displayName", default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub hidden: Option<u8>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub icongray: Option<String>,
}

/// Root response from ISteamUserStats/GetPlayerAchievements/v1
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamPlayerAchievementsResponse {
    pub playerstats: Option<SteamPlayerStatsData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SteamPlayerStatsData {
    #[serde(default)]
    pub success: bool,
    #[serde(default)]
    pub achievements: Option<Vec<SteamPlayerAchievementItem>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamPlayerAchievementItem {
    pub apiname: String,
    pub achieved: u8,
    #[serde(default)]
    pub unlocktime: u64,
}

/// Root response from ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamGlobalPercentagesResponse {
    pub achievementpercentages: Option<SteamAchievementPercentagesData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SteamAchievementPercentagesData {
    #[serde(default)]
    pub achievements: Vec<SteamGlobalRarityItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamGlobalRarityItem {
    pub name: String,
    pub percent: f64,
}

/// Helper function to parse Steam API responses into unified `Achievement` domain models
pub fn parse_steam_achievements_payload(
    game: &Game,
    schema_json: &str,
    player_json: Option<&str>,
    rarity_json: Option<&str>,
) -> Result<Vec<Achievement>, String> {
    let schema: SteamGameSchemaResponse = serde_json::from_str(schema_json)
        .map_err(|e| format!("Failed to parse Steam schema response: {e}"))?;

    let schema_achievements = schema
        .game
        .and_then(|g| g.available_game_stats)
        .map(|s| s.achievements)
        .unwrap_or_default();

    if schema_achievements.is_empty() {
        return Ok(Vec::new());
    }

    // Map player unlock states by apiname
    let mut player_map = HashMap::new();
    if let Some(pj) = player_json {
        if let Ok(player_resp) = serde_json::from_str::<SteamPlayerAchievementsResponse>(pj) {
            if let Some(stats) = player_resp.playerstats {
                if let Some(list) = stats.achievements {
                    for item in list {
                        player_map.insert(item.apiname.clone(), item);
                    }
                }
            }
        }
    }

    // Map global rarity percentages by name
    let mut rarity_map = HashMap::new();
    if let Some(rj) = rarity_json {
        if let Ok(rarity_resp) = serde_json::from_str::<SteamGlobalPercentagesResponse>(rj) {
            if let Some(percentages) = rarity_resp.achievementpercentages {
                for item in percentages.achievements {
                    rarity_map.insert(item.name, item.percent as f32);
                }
            }
        }
    }

    let mut result = Vec::with_capacity(schema_achievements.len());

    for s_ach in schema_achievements {
        let player_stat = player_map.get(&s_ach.name);
        let is_unlocked = player_stat.map(|p| p.achieved > 0).unwrap_or(false);
        let unlock_time = player_stat.and_then(|p| {
            if p.unlocktime > 0 {
                DateTime::from_timestamp(p.unlocktime as i64, 0).map(|dt| dt.with_timezone(&Utc))
            } else {
                None
            }
        });

        let rarity_percentage = rarity_map.get(&s_ach.name).copied();
        let display_name = s_ach
            .display_name
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| s_ach.name.clone());

        let icon_locked_url = s_ach
            .icongray
            .filter(|url| !url.trim().is_empty())
            .or_else(|| {
                if !s_ach.icon.is_empty() {
                    Some(s_ach.icon.clone())
                } else {
                    None
                }
            });

        result.push(Achievement {
            id: format!("steam_{}_{}", game.id, s_ach.name),
            game_id: game.id,
            api_name: s_ach.name,
            display_name,
            description: s_ach.description.filter(|d| !d.trim().is_empty()),
            icon_unlocked_url: s_ach.icon,
            icon_locked_url,
            local_icon_path: None,
            is_unlocked,
            unlock_time,
            rarity_percentage,
            points: None,
            is_hidden: s_ach.hidden.map(|h| h > 0).unwrap_or(false),
        });
    }

    Ok(result)
}

/// Fetch Steam achievements over HTTP using Web API endpoints
pub async fn fetch_steam_achievements_web_api(
    client: &reqwest::Client,
    api_key: &str,
    steam_id: Option<&str>,
    game: &Game,
    lang: Option<&str>,
) -> Result<Vec<Achievement>, String> {
    let app_id = &game.external_id;
    let lang = lang.unwrap_or("english");

    // 1. Fetch Schema
    let schema_url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key={}&appid={}&l={}",
        api_key, app_id, lang
    );
    debug!("Fetching Steam achievement schema from {schema_url}");
    let schema_resp = client
        .get(&schema_url)
        .send()
        .await
        .map_err(|e| format!("Failed to request Steam schema: {e}"))?;

    if !schema_resp.status().is_success() {
        return Err(format!(
            "Steam schema request failed with status {}",
            schema_resp.status()
        ));
    }

    let schema_json = schema_resp
        .text()
        .await
        .map_err(|e| format!("Failed to read Steam schema body: {e}"))?;

    // 2. Fetch Player Achievements (if steam_id is provided)
    let player_json = if let Some(sid) = steam_id {
        let player_url = format!(
            "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key={}&steamid={}&appid={}",
            api_key, sid, app_id
        );
        debug!("Fetching Steam player achievements from {player_url}");
        match client.get(&player_url).send().await {
            Ok(resp) if resp.status().is_success() => resp.text().await.ok(),
            Ok(resp) => {
                warn!("Steam player achievements returned status {}", resp.status());
                None
            }
            Err(e) => {
                warn!("Failed to request Steam player achievements: {e}");
                None
            }
        }
    } else {
        None
    };

    // 3. Fetch Global Achievement Percentages
    let rarity_url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid={}",
        app_id
    );
    debug!("Fetching Steam global percentages from {rarity_url}");
    let rarity_json = match client.get(&rarity_url).send().await {
        Ok(resp) if resp.status().is_success() => resp.text().await.ok(),
        Ok(resp) => {
            warn!("Steam global percentages returned status {}", resp.status());
            None
        }
        Err(e) => {
            warn!("Failed to request Steam global percentages: {e}");
            None
        }
    };

    parse_steam_achievements_payload(
        game,
        &schema_json,
        player_json.as_deref(),
        rarity_json.as_deref(),
    )
}

#[async_trait]
impl AchievementProvider for crate::SteamPlugin {
    fn provider_id(&self) -> &'static str {
        "steam"
    }

    async fn fetch_achievements(
        &self,
        game: &Game,
        session: Option<&StoreAccountSession>,
    ) -> Result<Vec<Achievement>, String> {
        let api_key = session
            .and_then(|s| {
                if !s.access_token.starts_with("steam_session:") && !s.access_token.trim().is_empty() {
                    Some(s.access_token.as_str())
                } else {
                    None
                }
            })
            .or_else(|| self.config.api_key.as_deref())
            .ok_or_else(|| {
                "Steam Web API key is required to fetch achievements. Please configure it in Store Accounts or Plugin Settings."
                    .to_string()
            })?;

        let steam_id = session
            .map(|s| s.user_id.as_str())
            .or_else(|| self.config.steam_id64.as_deref());

        fetch_steam_achievements_web_api(&self.client, api_key, steam_id, game, Some("english"))
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use omnis_sdk::Uuid;

    #[test]
    fn test_steam_achievement_deserialization_and_parsing() {
        let dummy_game = Game {
            id: Uuid::parse_str("11111111-2222-3333-4444-555555555555").unwrap(),
            library_id: "steam".to_string(),
            external_id: "730".to_string(),
            title: "Counter-Strike".to_string(),
            sorting_title: "Counter-Strike".to_string(),
            install_dir: None,
            is_installed: true,
            playtime_seconds: 100,
            play_count: 1,
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
            completion_status: Some("NotPlayed".to_string()),
            user_notes: None,
            custom_links: vec![],
            play_actions: vec![],
            extra_metadata: None,
            added_timestamp: Utc::now(),
            modified_timestamp: Utc::now(),
        };

        let schema_json = r#"{
            "game": {
                "gameName": "ValveTestApp200",
                "availableGameStats": {
                    "achievements": [
                        {
                            "name": "ACH_WIN_ONE_GAME",
                            "displayName": "Winner Winner",
                            "hidden": 0,
                            "description": "Win your first game",
                            "icon": "https://cdn.steam.com/icon1.jpg",
                            "icongray": "https://cdn.steam.com/icon1_gray.jpg"
                        },
                        {
                            "name": "ACH_SECRET_LEVEL",
                            "displayName": "Secret Discoverer",
                            "hidden": 1,
                            "description": "Found a hidden easter egg",
                            "icon": "https://cdn.steam.com/icon2.jpg",
                            "icongray": "https://cdn.steam.com/icon2_gray.jpg"
                        }
                    ]
                }
            }
        }"#;

        let player_json = r#"{
            "playerstats": {
                "steamID": "76561198000000000",
                "gameName": "ValveTestApp200",
                "achievements": [
                    {
                        "apiname": "ACH_WIN_ONE_GAME",
                        "achieved": 1,
                        "unlocktime": 1609459200
                    },
                    {
                        "apiname": "ACH_SECRET_LEVEL",
                        "achieved": 0,
                        "unlocktime": 0
                    }
                ],
                "success": true
            }
        }"#;

        let rarity_json = r#"{
            "achievementpercentages": {
                "achievements": [
                    {
                        "name": "ACH_WIN_ONE_GAME",
                        "percent": 75.4
                    },
                    {
                        "name": "ACH_SECRET_LEVEL",
                        "percent": 3.2
                    }
                ]
            }
        }"#;

        let achievements = parse_steam_achievements_payload(
            &dummy_game,
            schema_json,
            Some(player_json),
            Some(rarity_json),
        )
        .expect("Failed to parse steam achievements");

        assert_eq!(achievements.len(), 2);

        let ach1 = &achievements[0];
        assert_eq!(ach1.api_name, "ACH_WIN_ONE_GAME");
        assert_eq!(ach1.display_name, "Winner Winner");
        assert_eq!(ach1.description.as_deref(), Some("Win your first game"));
        assert!(ach1.is_unlocked);
        assert_eq!(
            ach1.unlock_time,
            Some(DateTime::from_timestamp(1609459200, 0).unwrap().with_timezone(&Utc))
        );
        assert_eq!(ach1.rarity_percentage, Some(75.4));
        assert!(!ach1.is_hidden);

        let ach2 = &achievements[1];
        assert_eq!(ach2.api_name, "ACH_SECRET_LEVEL");
        assert!(!ach2.is_unlocked);
        assert_eq!(ach2.unlock_time, None);
        assert_eq!(ach2.rarity_percentage, Some(3.2));
        assert!(ach2.is_hidden);
    }
}
