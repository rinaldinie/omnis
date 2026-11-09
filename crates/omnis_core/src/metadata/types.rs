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

use std::collections::HashMap;

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

fn default_cover_source() -> String {
    "steamgriddb".to_string()
}

fn default_background_source() -> String {
    "steamgriddb".to_string()
}

fn default_score_source() -> String {
    "opencritic".to_string()
}

fn default_details_source() -> String {
    "steam".to_string()
}

/// Configuration rule for a specific metadata field in the priority cascade
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldPipelineRule {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub sources: Vec<String>,
}

impl FieldPipelineRule {
    pub fn new(enabled: bool, sources: Vec<&str>) -> Self {
        Self {
            enabled,
            sources: sources.into_iter().map(String::from).collect(),
        }
    }
}

pub fn default_field_rules() -> HashMap<MetadataField, FieldPipelineRule> {
    let mut map = HashMap::new();
    map.insert(
        MetadataField::Name,
        FieldPipelineRule::new(true, vec!["official_store", "steam", "igdb"]),
    );
    map.insert(
        MetadataField::Genres,
        FieldPipelineRule::new(true, vec!["official_store", "igdb", "steam", "gog"]),
    );
    map.insert(
        MetadataField::ReleaseDate,
        FieldPipelineRule::new(true, vec!["official_store", "igdb", "steam", "gog"]),
    );
    map.insert(
        MetadataField::Developers,
        FieldPipelineRule::new(true, vec!["official_store", "igdb", "steam", "gog"]),
    );
    map.insert(
        MetadataField::Publishers,
        FieldPipelineRule::new(true, vec!["official_store", "igdb", "steam", "gog"]),
    );
    map.insert(
        MetadataField::Features,
        FieldPipelineRule::new(true, vec!["official_store", "steam", "igdb", "gog"]),
    );
    map.insert(
        MetadataField::Tags,
        FieldPipelineRule::new(true, vec!["steam", "gog", "official_store", "igdb"]),
    );
    map.insert(
        MetadataField::Description,
        FieldPipelineRule::new(true, vec!["official_store", "steam", "gog", "igdb"]),
    );
    map.insert(
        MetadataField::Links,
        FieldPipelineRule::new(true, vec!["official_store", "igdb", "steam"]),
    );
    map.insert(
        MetadataField::CriticScore,
        FieldPipelineRule::new(true, vec!["opencritic", "igdb", "steam"]),
    );
    map.insert(
        MetadataField::CommunityScore,
        FieldPipelineRule::new(true, vec!["steam", "igdb", "gog"]),
    );
    map.insert(
        MetadataField::AgeRating,
        FieldPipelineRule::new(true, vec!["official_store", "igdb", "steam"]),
    );
    map.insert(
        MetadataField::Series,
        FieldPipelineRule::new(true, vec!["igdb", "official_store"]),
    );
    map.insert(
        MetadataField::Region,
        FieldPipelineRule::new(false, vec!["official_store"]),
    );
    map.insert(
        MetadataField::Platform,
        FieldPipelineRule::new(true, vec!["official_store"]),
    );
    map.insert(
        MetadataField::CoverImage,
        FieldPipelineRule::new(
            true,
            vec!["steamgriddb", "official_store", "steam", "igdb", "gog"],
        ),
    );
    map.insert(
        MetadataField::Icon,
        FieldPipelineRule::new(
            true,
            vec!["official_store", "steamgriddb", "steam", "gog"],
        ),
    );
    map.insert(
        MetadataField::BackgroundImage,
        FieldPipelineRule::new(
            true,
            vec!["steamgriddb", "official_store", "steam", "igdb", "gog"],
        ),
    );
    map.insert(
        MetadataField::InstallSize,
        FieldPipelineRule::new(true, vec!["official_store", "gog"]),
    );
    map
}

/// Pipeline configuration determining provider source priority per field
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataPipelineConfig {
    #[serde(default = "default_field_rules")]
    pub fields: HashMap<MetadataField, FieldPipelineRule>,
    #[serde(default = "default_true")]
    pub preserve_existing_artwork: bool,
    #[serde(default = "default_provider_priority")]
    pub provider_priority: Vec<String>,
    #[serde(default = "default_cover_source")]
    pub cover_source: String,
    #[serde(default = "default_background_source")]
    pub background_source: String,
    #[serde(default = "default_score_source")]
    pub score_source: String,
    #[serde(default = "default_details_source")]
    pub details_source: String,
}

impl MetadataPipelineConfig {
    /// Ensure all modern fields are present in the configuration
    pub fn ensure_field_rules(&mut self) {
        let defaults = default_field_rules();
        for (field, default_rule) in defaults {
            self.fields.entry(field).or_insert(default_rule);
        }
    }
}

impl Default for MetadataPipelineConfig {
    fn default() -> Self {
        Self {
            fields: default_field_rules(),
            preserve_existing_artwork: true,
            provider_priority: default_provider_priority(),
            cover_source: default_cover_source(),
            background_source: default_background_source(),
            score_source: default_score_source(),
            details_source: default_details_source(),
        }
    }
}
