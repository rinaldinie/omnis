use super::utils::html_to_plain_text;
use async_trait::async_trait;
use omnis_sdk::constants::stores;
use omnis_sdk::{
    GameMetadataPatch, MetadataField, MetadataProvider, MetadataSearchRequest, PluginSettingsSchema,
    SettingField, SettingGroup, SettingType,
};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// ============================================================================
// Steam Store API Typed DTOs
// ============================================================================

#[derive(Debug, Deserialize)]
struct SteamStoreSearchResponse {
    #[serde(default)]
    items: Vec<SteamStoreSearchItem>,
}

#[derive(Debug, Deserialize)]
struct SteamStoreSearchItem {
    id: u64,
}

#[derive(Debug, Deserialize)]
struct SteamAppDetailsWrapper {
    success: bool,
    data: Option<SteamAppDataDto>,
}

#[derive(Debug, Deserialize)]
struct SteamAppDataDto {
    short_description: Option<String>,
    release_date: Option<SteamReleaseDateDto>,
    metacritic: Option<SteamMetacriticDto>,
    #[serde(default)]
    genres: Vec<SteamDescriptionItemDto>,
    #[serde(default)]
    developers: Vec<String>,
    #[serde(default)]
    publishers: Vec<String>,
    #[serde(default)]
    categories: Vec<SteamDescriptionItemDto>,
    header_image: Option<String>,
    #[serde(default)]
    screenshots: Vec<SteamScreenshotDto>,
    achievements: Option<SteamAchievementsSummaryDto>,
}

#[derive(Debug, Deserialize)]
struct SteamReleaseDateDto {
    date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SteamMetacriticDto {
    score: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct SteamDescriptionItemDto {
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SteamScreenshotDto {
    path_full: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SteamAchievementsSummaryDto {
    total: Option<u64>,
}

// ============================================================================
// Steam Metadata Provider (External Plugin)
// ============================================================================
pub struct SteamMetadataProvider {
    client: reqwest::Client,
    plugin_dir: Option<PathBuf>,
}

impl SteamMetadataProvider {
    pub fn new(client: reqwest::Client) -> Self {
        Self {
            client,
            plugin_dir: None,
        }
    }

    pub fn with_plugin_dir(mut self, path: PathBuf) -> Self {
        self.plugin_dir = Some(path);
        self
    }

    pub fn set_plugin_dir(&mut self, path: PathBuf) {
        self.plugin_dir = Some(path);
    }

    async fn resolve_appid(&self, library: &str, external_id: &str, title: &str) -> Option<String> {
        if library.eq_ignore_ascii_case(stores::STEAM)
            && external_id.chars().all(|c| c.is_ascii_digit())
            && !external_id.is_empty()
        {
            return Some(external_id.to_string());
        }

        let search_url = reqwest::Url::parse_with_params(
            "https://store.steampowered.com/api/storesearch/",
            &[("term", title), ("l", "italian"), ("cc", "IT")],
        )
        .ok()?;

        if let Ok(resp) = self.client.get(search_url).send().await {
            if let Ok(search_res) = resp.json::<SteamStoreSearchResponse>().await {
                if let Some(first) = search_res.items.first() {
                    return Some(first.id.to_string());
                }
            }
        }

        None
    }
}

#[async_trait]
impl MetadataProvider for SteamMetadataProvider {
    fn id(&self) -> &str {
        stores::STEAM
    }

    fn name(&self) -> &str {
        "Steam Store & Community Engine"
    }

    fn description(&self) -> &str {
        "Recupera descrizioni ufficiali localizzate, generi, sviluppatori, date di rilascio, cover 600x900 e hero banner tramite Steam Store API."
    }

    fn author(&self) -> &str {
        "Valve / Steam Community"
    }

    fn website(&self) -> Option<&str> {
        Some("https://store.steampowered.com")
    }

    fn requires_api_key(&self) -> bool {
        false
    }

    fn is_builtin(&self) -> bool {
        false
    }

    fn version(&self) -> Option<&str> {
        Some("1.0.0")
    }

    fn plugin_path(&self) -> Option<&Path> {
        self.plugin_dir.as_deref()
    }

    fn supported_fields(&self) -> Vec<MetadataField> {
        vec![
            MetadataField::CoverImage,
            MetadataField::BackgroundImage,
            MetadataField::Description,
            MetadataField::ReleaseDate,
            MetadataField::Genres,
            MetadataField::Developers,
            MetadataField::Publishers,
            MetadataField::CriticScore,
        ]
    }

    fn settings_schema(&self) -> Option<PluginSettingsSchema> {
        Some(PluginSettingsSchema {
            plugin_id: "steam".to_string(),
            title: "Configurazione Steam Store".to_string(),
            groups: vec![SettingGroup {
                id: "general".to_string(),
                title: "Preferenze Lingua".to_string(),
                fields: vec![SettingField {
                    key: "language".to_string(),
                    label: "Lingua preferita".to_string(),
                    description: Some("Lingua usata per sinossi e generi ufficiali".to_string()),
                    required: false,
                    field_type: SettingType::Enum {
                        options: vec![
                            "italian".to_string(),
                            "english".to_string(),
                            "french".to_string(),
                            "german".to_string(),
                            "spanish".to_string(),
                        ],
                        default: Some("italian".to_string()),
                    },
                }],
            }],
        })
    }

    async fn fetch_metadata(
        &self,
        request: &MetadataSearchRequest,
        settings: &Map<String, Value>,
    ) -> Result<GameMetadataPatch, String> {
        let lang = settings
            .get("language")
            .and_then(|v| v.as_str())
            .unwrap_or("italian");
        let external = request.external_id.as_deref().unwrap_or("");
        let appid = match self
            .resolve_appid(&request.library_id, external, &request.title)
            .await
        {
            Some(id) => id,
            None => {
                return Err(format!(
                    "Nessun titolo corrispondente trovato su Steam Store per '{}'",
                    request.title
                ))
            }
        };

        let details_url = format!(
            "https://store.steampowered.com/api/appdetails?appids={}&l={}",
            appid, lang
        );

        let resp = self
            .client
            .get(&details_url)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let mut app_map: HashMap<String, SteamAppDetailsWrapper> =
            resp.json().await.map_err(|e| e.to_string())?;

        let app_obj = app_map
            .remove(&appid)
            .ok_or_else(|| "Missing appid in steam response".to_string())?;

        if !app_obj.success {
            return Err("Steam API reported success: false".to_string());
        }

        let data = app_obj
            .data
            .ok_or_else(|| "Missing data object in Steam response".to_string())?;

        let short_desc = data.short_description.as_deref().map(html_to_plain_text);
        let release_date = data.release_date.and_then(|r| r.date);
        let critic_score = data.metacritic.and_then(|m| m.score).map(|s| s as u8);

        let genres: Vec<String> = data
            .genres
            .into_iter()
            .filter_map(|g| g.description)
            .collect();

        let developers = data.developers;
        let publishers = data.publishers;

        let features: Vec<String> = data
            .categories
            .into_iter()
            .filter_map(|c| {
                c.description
                    .map(|d| d.trim().to_string())
                    .filter(|d| !d.is_empty())
            })
            .collect();

        let header_img = data.header_image;
        let screenshot_bg = data.screenshots.into_iter().next().and_then(|s| s.path_full);

        let primary_cover_url = format!(
            "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900_2x.jpg",
            appid
        );
        let hero_bg_url = format!(
            "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
            appid
        );

        let extra_metadata = data
            .achievements
            .and_then(|a| a.total)
            .filter(|&total| total > 0)
            .map(|total| {
                serde_json::json!({
                    "achievements": {
                        "total": total,
                        "unlocked": 0,
                    }
                })
                .to_string()
            });

        Ok(GameMetadataPatch {
            description: short_desc,
            release_date,
            cover_url: Some(primary_cover_url).or(header_img.clone()),
            background_url: Some(hero_bg_url).or(screenshot_bg).or(header_img),
            icon_url: None,
            critic_score,
            community_score: critic_score.map(|s| s.saturating_add(2).min(100)),
            genres,
            developers,
            publishers,
            tags: Vec::new(),
            features,
            extra_metadata,
        })
    }

    async fn test_connection(&self, _settings: &Map<String, Value>) -> Result<String, String> {
        let url = "https://store.steampowered.com/api/storesearch/?term=Portal&l=italian&cc=IT";
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Errore di rete Steam Store: {}", e))?;
        if resp.status().is_success() {
            Ok("Connessione a Steam Store API verificata con successo (200 OK).".to_string())
        } else {
            Err(format!(
                "Steam Store API ha risposto con codice HTTP {}",
                resp.status()
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_steam_app_details_deserialization() {
        let json = r#"{
            "400": {
                "success": true,
                "data": {
                    "short_description": "Portal&trade; is a new single player game from Valve.",
                    "release_date": { "date": "10 Oct, 2007" },
                    "metacritic": { "score": 90 },
                    "genres": [
                        { "description": "Action" }
                    ],
                    "developers": ["Valve"],
                    "publishers": ["Valve"],
                    "categories": [
                        { "description": "Single-player" }
                    ],
                    "header_image": "https://cdn.steam.com/header.jpg",
                    "screenshots": [
                        { "path_full": "https://cdn.steam.com/ss1.jpg" }
                    ],
                    "achievements": { "total": 15 }
                }
            }
        }"#;

        let mut app_map: HashMap<String, SteamAppDetailsWrapper> =
            serde_json::from_str(json).expect("Failed to deserialize Steam app details");
        let app = app_map.remove("400").expect("Missing appid 400");
        assert!(app.success);
        let data = app.data.expect("Missing data");
        assert_eq!(data.short_description.as_deref(), Some("Portal&trade; is a new single player game from Valve."));
        assert_eq!(data.release_date.and_then(|r| r.date), Some("10 Oct, 2007".to_string()));
        assert_eq!(data.metacritic.and_then(|m| m.score), Some(90));
        assert_eq!(data.developers, vec!["Valve"]);
        assert_eq!(data.achievements.and_then(|a| a.total), Some(15));
    }
}
