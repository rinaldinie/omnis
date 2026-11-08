pub use omnis_sdk::PluginManifest;
use omnis_sdk::{MetadataField, PluginSettingsSchema};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use super::hltb::HowLongToBeatProvider as ExternalMetadataProvider;

/// DTO representing a registered metadata provider for frontend UI management
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub website: Option<String>,
    pub key_help_url: Option<String>,
    pub requires_api_key: bool,
    pub supported_fields: Vec<MetadataField>,
    pub is_enabled: bool,
    pub settings_schema: Option<PluginSettingsSchema>,
    pub settings_values: Value,
    pub has_configured_key: bool,
    #[serde(default = "default_builtin")]
    pub is_builtin: bool,
    pub version: Option<String>,
    pub plugin_path: Option<String>,
    #[serde(default)]
    pub plugin_type: Option<String>,
    #[serde(default)]
    pub ui_slots: Vec<omnis_sdk::PluginSlotDeclaration>,
}

fn default_builtin() -> bool {
    true
}

/// DTO representing a metadata candidate result from a provider for resolution and selection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataCandidateDto {
    pub provider_id: String,
    pub provider_game_id: String,
    pub title: String,
    pub release_year: Option<i32>,
    pub cover_url: Option<String>,
    pub background_url: Option<String>,
    pub description: Option<String>,
    pub raw_patch: omnis_sdk::GameMetadataPatch,
}

fn default_true() -> bool {
    true
}

fn default_provider_priority() -> Vec<String> {
    vec![
        "steamgriddb".to_string(),
        "steam".to_string(),
        "igdb".to_string(),
        "opencritic".to_string(),
        "howlongtobeat".to_string(),
        "gog".to_string(),
    ]
}

/// Pipeline configuration determining provider source priority per field
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataPipelineConfig {
    pub cover_source: String,
    pub background_source: String,
    pub score_source: String,
    pub details_source: String,
    #[serde(default = "default_true")]
    pub preserve_existing_artwork: bool,
    #[serde(default = "default_provider_priority")]
    pub provider_priority: Vec<String>,
}

impl Default for MetadataPipelineConfig {
    fn default() -> Self {
        Self {
            cover_source: "steamgriddb".to_string(),
            background_source: "steamgriddb".to_string(),
            score_source: "opencritic".to_string(),
            details_source: "steam".to_string(),
            preserve_existing_artwork: true,
            provider_priority: default_provider_priority(),
        }
    }
}
