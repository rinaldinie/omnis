use async_trait::async_trait;
use omnis_sdk::{
    GameMetadataPatch, MetadataField, MetadataProvider, MetadataSearchRequest, PluginSettingsSchema,
    SettingField, SettingGroup, SettingType,
};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

// ============================================================================
// OpenCritic Metadata Provider (External Plugin)
// ============================================================================
pub struct OpenCriticProvider {
    client: reqwest::Client,
    plugin_dir: Option<PathBuf>,
}

impl OpenCriticProvider {
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
impl MetadataProvider for OpenCriticProvider {
    fn id(&self) -> &str {
        "opencritic"
    }

    fn name(&self) -> &str {
        "OpenCritic Aggregate Reviews"
    }

    fn description(&self) -> &str {
        "Punteggi della critica globale con Top Critic Score (0-100), Tier e percentuale di raccomandazione."
    }

    fn author(&self) -> &str {
        "OpenCritic"
    }

    fn website(&self) -> Option<&str> {
        Some("https://opencritic.com")
    }

    fn key_help_url(&self) -> Option<&str> {
        Some("https://rapidapi.com/opencritic-opencritic-default/api/opencritic-api")
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
        vec![MetadataField::CriticScore, MetadataField::CommunityScore]
    }

    fn settings_schema(&self) -> Option<PluginSettingsSchema> {
        Some(PluginSettingsSchema {
            plugin_id: "opencritic".to_string(),
            title: "Configurazione OpenCritic".to_string(),
            groups: vec![SettingGroup {
                id: "auth".to_string(),
                title: "Autenticazione RapidAPI".to_string(),
                fields: vec![SettingField {
                    key: "api_key".to_string(),
                    label: "RapidAPI Key".to_string(),
                    description: Some(
                        "Chiave RapidAPI per accedere all'endpoint ufficiale OpenCritic".to_string(),
                    ),
                    required: true,
                    field_type: SettingType::SecretString {
                        placeholder: Some(
                            "Incolla chiave RapidAPI per OpenCritic...".to_string(),
                        ),
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
            return Err("Chiave API OpenCritic mancante.".to_string());
        }

        let search_url = match reqwest::Url::parse_with_params(
            "https://opencritic-api.p.rapidapi.com/game/search",
            &[("criteria", request.title.as_str())],
        ) {
            Ok(u) => u,
            Err(_) => return Err("URL OpenCritic non valido".to_string()),
        };

        let search_resp = self
            .client
            .get(search_url)
            .header("X-RapidAPI-Key", api_key)
            .header("X-RapidAPI-Host", "opencritic-api.p.rapidapi.com")
            .send()
            .await
            .map_err(|e| format!("Errore connessione OpenCritic: {}", e))?;

        if !search_resp.status().is_success() {
            return Err(format!(
                "OpenCritic search error: HTTP {}",
                search_resp.status()
            ));
        }

        let json: Value = search_resp.json().await.map_err(|e| e.to_string())?;
        let first_id = json
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|g| g.get("id"))
            .and_then(|id| id.as_u64())
            .ok_or_else(|| format!("Titolo '{}' non trovato su OpenCritic", request.title))?;

        let detail_url = format!("https://opencritic-api.p.rapidapi.com/game/{}", first_id);
        let detail_resp = self
            .client
            .get(&detail_url)
            .header("X-RapidAPI-Key", api_key)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let data: Value = detail_resp.json().await.map_err(|e| e.to_string())?;
        let score = data
            .get("topCriticScore")
            .and_then(|s| s.as_f64())
            .map(|s| s.round() as u8);
        let percent_rec = data
            .get("percentRecommended")
            .and_then(|s| s.as_f64())
            .map(|s| s.round() as u8);

        Ok(GameMetadataPatch {
            critic_score: score,
            community_score: percent_rec,
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
                "Chiave API OpenCritic mancante. Inserisci una chiave RapidAPI valida.".to_string(),
            );
        }

        let url = "https://opencritic-api.p.rapidapi.com/game/search?criteria=Portal";
        let resp = self
            .client
            .get(url)
            .header("X-RapidAPI-Key", api_key)
            .header("X-RapidAPI-Host", "opencritic-api.p.rapidapi.com")
            .send()
            .await
            .map_err(|e| format!("Errore di rete OpenCritic: {}", e))?;

        if resp.status().is_success() {
            Ok("Connessione a OpenCritic API verificata con successo!".to_string())
        } else if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
            Err("Autenticazione fallita: RapidAPI Key per OpenCritic non autorizzata.".to_string())
        } else {
            Err(format!(
                "OpenCritic ha risposto con codice HTTP {}",
                resp.status()
            ))
        }
    }
}
