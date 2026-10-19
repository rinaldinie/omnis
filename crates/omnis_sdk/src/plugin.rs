use crate::events::PluginEvent;
use crate::settings_schema::PluginSettingsSchema;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// The core reactive, asynchronous plugin interface for Omnis Game Library
#[async_trait]
pub trait ReactivePlugin: Send + Sync {
    /// Unique identifier for this plugin (e.g. "steam_importer")
    fn id(&self) -> &'static str;

    /// User-friendly display name (e.g. "Steam Integration")
    fn name(&self) -> &'static str;

    /// Return declarative settings schema; returns None if plugin has no settings
    fn settings_schema(&self) -> Option<PluginSettingsSchema> {
        None
    }

    /// Initialize plugin with its persisted JSON configuration
    async fn initialize(&mut self, config_json: &str) -> Result<(), String>;

    /// Asynchronously react to an incoming event from the core engine
    /// Returns any resulting events to be dispatched back to the host
    async fn handle_event(&mut self, event: PluginEvent) -> Result<Vec<PluginEvent>, String>;

    /// Shutdown and clean up resources
    async fn shutdown(&mut self) -> Result<(), String> {
        Ok(())
    }
}

use crate::models::{DiscoveredGame, GameMetadataPatch, MetadataField, MetadataSearchRequest};

/// Error type returned by library scanner plugins
#[derive(Debug, Clone)]
pub enum PluginError {
    Io(String),
    Parse(String),
    Other(String),
}

impl std::fmt::Display for PluginError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "I/O error: {}", e),
            Self::Parse(e) => write!(f, "Parse error: {}", e),
            Self::Other(e) => write!(f, "Plugin error: {}", e),
        }
    }
}

impl std::error::Error for PluginError {}

impl From<std::io::Error> for PluginError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err.to_string())
    }
}

impl From<serde_json::Error> for PluginError {
    fn from(err: serde_json::Error) -> Self {
        Self::Parse(err.to_string())
    }
}

/// Dedicated Library Plugin trait for multi-store scanning and discovery
#[async_trait]
pub trait LibraryPlugin: Send + Sync {
    /// Unique library identifier (e.g. "epic", "steam", "gog")
    fn id(&self) -> &str;

    /// User-friendly display name (e.g. "Epic Games Store")
    fn name(&self) -> &str;

    /// Scan installed titles and return discovered games
    async fn scan(&self) -> Result<Vec<DiscoveredGame>, PluginError>;
}

/// Dedicated Metadata Provider trait for multi-source enrichment (Steam, SteamGridDB, OpenCritic, IGDB, etc.)
#[async_trait]
pub trait MetadataProvider: Send + Sync {
    /// Unique provider ID (e.g. "steamgriddb", "opencritic", "steam")
    fn id(&self) -> &str;

    /// User-facing provider name
    fn name(&self) -> &str;

    /// Provider description and capabilities
    fn description(&self) -> &str;

    /// Author or organization
    fn author(&self) -> &str {
        "Omnis Community"
    }

    /// Official website
    fn website(&self) -> Option<&str> {
        None
    }

    /// Direct URL for user to obtain a free API key
    fn key_help_url(&self) -> Option<&str> {
        None
    }

    /// Whether this provider requires an API key to function
    fn requires_api_key(&self) -> bool {
        false
    }

    /// Whether this is a built-in core provider compiled in the binary
    fn is_builtin(&self) -> bool {
        true
    }

    /// Plugin version string
    fn version(&self) -> Option<&str> {
        Some("0.1.0 (Core)")
    }

    /// Root filesystem path of the plugin if external
    fn plugin_path(&self) -> Option<&std::path::Path> {
        None
    }

    /// Fields supplied by this provider
    fn supported_fields(&self) -> Vec<MetadataField>;

    /// Declarative settings schema for API keys and options
    fn settings_schema(&self) -> Option<PluginSettingsSchema> {
        None
    }

    /// Fetch metadata for a given game search query
    async fn fetch_metadata(
        &self,
        request: &MetadataSearchRequest,
        settings: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<GameMetadataPatch, String>;

    /// Verify credentials and endpoint connectivity
    async fn test_connection(
        &self,
        settings: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<String, String> {
        let _ = settings;
        Ok("Connessione verificata con successo.".to_string())
    }

    /// Return declarative manifest for this metadata provider
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: self.id().to_string(),
            name: self.name().to_string(),
            version: self.version().unwrap_or("0.1.0").to_string(),
            author: self.author().to_string(),
            description: self.description().to_string(),
            plugin_type: "metadata".to_string(),
            website: self.website().map(|s| s.to_string()),
            key_help_url: self.key_help_url().map(|s| s.to_string()),
            requires_api_key: self.requires_api_key(),
            supported_fields: self.supported_fields(),
            entry_point: None,
            settings_schema: self.settings_schema(),
        }
    }
}

/// Declarative plugin manifest schema (Playnite / Omnis extension manifest)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    #[serde(default = "default_manifest_version")]
    pub version: String,
    #[serde(default = "default_manifest_author")]
    pub author: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_manifest_plugin_type", alias = "type")]
    pub plugin_type: String, // "metadata" | "library" | "generic"
    #[serde(default)]
    pub website: Option<String>,
    #[serde(default)]
    pub key_help_url: Option<String>,
    #[serde(default)]
    pub requires_api_key: bool,
    #[serde(default)]
    pub supported_fields: Vec<MetadataField>,
    #[serde(default)]
    pub entry_point: Option<String>,
    #[serde(default)]
    pub settings_schema: Option<PluginSettingsSchema>,
}

pub fn default_manifest_version() -> String {
    "1.0.0".to_string()
}

pub fn default_manifest_author() -> String {
    "Omnis Community Developer".to_string()
}

pub fn default_manifest_plugin_type() -> String {
    "metadata".to_string()
}

impl Default for PluginManifest {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            version: default_manifest_version(),
            author: default_manifest_author(),
            description: String::new(),
            plugin_type: default_manifest_plugin_type(),
            website: None,
            key_help_url: None,
            requires_api_key: false,
            supported_fields: Vec::new(),
            entry_point: None,
            settings_schema: None,
        }
    }
}

