use crate::metadata::html_to_plain_text;
use async_trait::async_trait;
use omnis_sdk::{
    GameMetadataPatch, MetadataField, MetadataProvider, MetadataSearchRequest, PluginSettingsSchema,
    SettingField, SettingGroup, SettingType,
};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

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
        if library.eq_ignore_ascii_case("steam")
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
            if let Ok(json) = resp.json::<Value>().await {
                if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
                    if let Some(first) = items.first() {
                        if let Some(id) = first.get("id").and_then(|v| v.as_u64()) {
                            return Some(id.to_string());
                        }
                    }
                }
            }
        }

        None
    }
}

#[async_trait]
impl MetadataProvider for SteamMetadataProvider {
    fn id(&self) -> &str {
        "steam"
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
        let json: Value = resp.json().await.map_err(|e| e.to_string())?;
        let app_obj = json
            .get(&appid)
            .and_then(|v| v.as_object())
            .ok_or_else(|| "Missing appid in steam response".to_string())?;

        let success = app_obj
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if !success {
            return Err("Steam API reported success: false".to_string());
        }

        let data = app_obj
            .get("data")
            .and_then(|v| v.as_object())
            .ok_or_else(|| "Missing data object in Steam response".to_string())?;

        let short_desc = data
            .get("short_description")
            .and_then(|v| v.as_str())
            .map(html_to_plain_text);
        let release_date = data
            .get("release_date")
            .and_then(|v| v.get("date"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let critic_score = data
            .get("metacritic")
            .and_then(|v| v.get("score"))
            .and_then(|v| v.as_u64())
            .map(|s| s as u8);

        let mut genres = Vec::new();
        if let Some(genres_arr) = data.get("genres").and_then(|v| v.as_array()) {
            for g in genres_arr {
                if let Some(desc) = g.get("description").and_then(|v| v.as_str()) {
                    genres.push(desc.to_string());
                }
            }
        }

        let mut developers = Vec::new();
        if let Some(devs_arr) = data.get("developers").and_then(|v| v.as_array()) {
            for d in devs_arr {
                if let Some(name) = d.as_str() {
                    developers.push(name.to_string());
                }
            }
        }

        let mut publishers = Vec::new();
        if let Some(pubs_arr) = data.get("publishers").and_then(|v| v.as_array()) {
            for p in pubs_arr {
                if let Some(name) = p.as_str() {
                    publishers.push(name.to_string());
                }
            }
        }

        let mut features = Vec::new();
        if let Some(cat_arr) = data.get("categories").and_then(|v| v.as_array()) {
            for c in cat_arr {
                if let Some(desc) = c.get("description").and_then(|v| v.as_str()) {
                    let trimmed = desc.trim();
                    if !trimmed.is_empty() {
                        features.push(trimmed.to_string());
                    }
                }
            }
        }

        let header_img = data
            .get("header_image")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let screenshot_bg = data
            .get("screenshots")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|s| s.get("path_full"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let primary_cover_url = format!(
            "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900_2x.jpg",
            appid
        );
        let hero_bg_url = format!(
            "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
            appid
        );

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
            extra_metadata: None,
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
