use async_trait::async_trait;
use omnis_sdk::{
    GameMetadataPatch, MetadataField, MetadataProvider, MetadataSearchRequest, PluginSettingsSchema,
    SettingField, SettingGroup, SettingType,
};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

// ============================================================================
// SteamGridDB Metadata Provider (External Plugin)
// ============================================================================
pub struct SteamGridDbProvider {
    client: reqwest::Client,
    plugin_dir: Option<PathBuf>,
}

impl SteamGridDbProvider {
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
}

#[async_trait]
impl MetadataProvider for SteamGridDbProvider {
    fn id(&self) -> &str {
        "steamgriddb"
    }

    fn name(&self) -> &str {
        "SteamGridDB Artwork"
    }

    fn description(&self) -> &str {
        "Database n.1 per locandine verticali (600x900), sfondi panoramici hero 4K, loghi e icone personalizzate create dalla community."
    }

    fn author(&self) -> &str {
        "SteamGridDB Community"
    }

    fn website(&self) -> Option<&str> {
        Some("https://www.steamgriddb.com")
    }

    fn key_help_url(&self) -> Option<&str> {
        Some("https://www.steamgriddb.com/profile/preferences/api")
    }

    fn requires_api_key(&self) -> bool {
        true
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
            MetadataField::Icon,
        ]
    }

    fn settings_schema(&self) -> Option<PluginSettingsSchema> {
        Some(PluginSettingsSchema {
            plugin_id: "steamgriddb".to_string(),
            title: "Configurazione SteamGridDB".to_string(),
            groups: vec![SettingGroup {
                id: "auth".to_string(),
                title: "Autenticazione".to_string(),
                fields: vec![SettingField {
                    key: "api_key".to_string(),
                    label: "API Key Personale".to_string(),
                    description: Some(
                        "Genera la tua chiave gratuita su steamgriddb.com/profile/preferences/api"
                            .to_string(),
                    ),
                    required: true,
                    field_type: SettingType::SecretString {
                        placeholder: Some("Incolla qui la chiave API SteamGridDB...".to_string()),
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
        let api_key = settings
            .get("api_key")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if api_key.is_empty() {
            return Err("Chiave API SteamGridDB non configurata.".to_string());
        }

        let search_url = match reqwest::Url::parse_with_params(
            "https://www.steamgriddb.com/api/v2/search/autocomplete",
            &[("term", request.title.as_str())],
        ) {
            Ok(u) => u,
            Err(_) => return Err("URL SteamGridDB non valido".to_string()),
        };

        let search_resp = self
            .client
            .get(search_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
            .map_err(|e| format!("Errore ricerca SteamGridDB: {}", e))?;

        if !search_resp.status().is_success() {
            return Err(format!(
                "SteamGridDB search ha risposto con codice HTTP {}",
                search_resp.status()
            ));
        }

        let json: Value = search_resp.json().await.map_err(|e| e.to_string())?;
        let game_id = json
            .get("data")
            .and_then(|d| d.as_array())
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("id"))
            .and_then(|id| id.as_u64())
            .ok_or_else(|| format!("Titolo '{}' non trovato su SteamGridDB", request.title))?;

        // 1. Fetch 600x900 vertical covers
        let grids_url = format!(
            "https://www.steamgriddb.com/api/v2/grids/game/{}?dimensions=600x900",
            game_id
        );
        let mut cover_url = None;
        if let Ok(resp) = self
            .client
            .get(&grids_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
        {
            if let Ok(data) = resp.json::<Value>().await {
                cover_url = data
                    .get("data")
                    .and_then(|d| d.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|item| item.get("url"))
                    .and_then(|u| u.as_str())
                    .map(|s| s.to_string());
            }
        }

        // 2. Fetch hero panoramic background
        let heroes_url = format!(
            "https://www.steamgriddb.com/api/v2/heroes/game/{}",
            game_id
        );
        let mut bg_url = None;
        if let Ok(resp) = self
            .client
            .get(&heroes_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
        {
            if let Ok(data) = resp.json::<Value>().await {
                bg_url = data
                    .get("data")
                    .and_then(|d| d.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|item| item.get("url"))
                    .and_then(|u| u.as_str())
                    .map(|s| s.to_string());
            }
        }

        Ok(GameMetadataPatch {
            cover_url,
            background_url: bg_url,
            ..Default::default()
        })
    }

    async fn test_connection(&self, settings: &Map<String, Value>) -> Result<String, String> {
        let api_key = settings
            .get("api_key")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if api_key.is_empty() {
            return Err(
                "Chiave API SteamGridDB non impostata. Inserisci la tua API Key e riprova."
                    .to_string(),
            );
        }

        let url = "https://www.steamgriddb.com/api/v2/search/autocomplete/Cyberpunk";
        let resp = self
            .client
            .get(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
            .map_err(|e| format!("Errore di rete SteamGridDB: {}", e))?;

        let status = resp.status();
        if status.is_success() {
            if let Ok(json) = resp.json::<Value>().await {
                if json.get("success").and_then(|v| v.as_bool()) == Some(true) {
                    return Ok(
                        "Autenticazione SteamGridDB riuscita! API Key verificata e attiva."
                            .to_string(),
                    );
                }
            }
            return Ok("Connessione a SteamGridDB riuscita.".to_string());
        }

        if status.as_u16() == 401 {
            return Err(
                "Autenticazione fallita: API Key SteamGridDB non valida o non autorizzata."
                    .to_string(),
            );
        }

        Err(format!(
            "SteamGridDB ha restituito codice HTTP {}",
            status
        ))
    }
}
