use async_trait::async_trait;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

use omnis_sdk::MetadataProvider;

use super::gog::GogMetadataProvider;
use super::hltb::HowLongToBeatProvider;
use super::igdb::IgdbMetadataProvider;
use super::opencritic::OpenCriticProvider;
use super::steam::SteamMetadataProvider;
use super::steamgriddb::SteamGridDbProvider;
use super::types::*;

/// Trait managing discovery, registration, configuration, and connectivity of metadata providers
#[async_trait]
pub trait MetadataRegistry: Send + Sync {
    async fn set_plugins_dir(&self, dir: PathBuf);
    async fn get_plugins_dir(&self) -> Option<PathBuf>;
    async fn unregister_provider(&self, provider_id: &str) -> Result<(), String>;
    async fn register_provider(&self, provider: Box<dyn MetadataProvider>);
    async fn refresh_external_plugins(&self) -> Result<Vec<ProviderInfo>, String>;
    async fn fetch_hltb_times(&self, title: &str) -> (String, String, String);
    async fn load_and_register_dynamic_plugin(&self, path: &Path) -> Result<ProviderInfo, String>;
    async fn get_providers_info(&self) -> Vec<ProviderInfo>;
    async fn save_provider_settings(
        &self,
        provider_id: &str,
        settings: Map<String, Value>,
    ) -> Result<(), String>;
    async fn toggle_provider(&self, provider_id: &str, enabled: bool) -> Result<(), String>;
    async fn test_provider_connection(&self, provider_id: &str) -> Result<String, String>;
    async fn get_pipeline_config(&self) -> MetadataPipelineConfig;
    async fn save_pipeline_config(&self, config: MetadataPipelineConfig) -> Result<(), String>;
}

/// Standalone Provider Registry managing built-in metadata providers, configuration, and priority pipelines
pub struct ProviderRegistry {
    pub plugins_dir: Arc<RwLock<Option<PathBuf>>>,
    pub providers: Arc<RwLock<HashMap<String, Box<dyn MetadataProvider>>>>,
    pub enabled_providers: Arc<RwLock<HashMap<String, bool>>>,
    pub settings_cache: Arc<RwLock<HashMap<String, Map<String, Value>>>>,
    pub pipeline_config: Arc<RwLock<MetadataPipelineConfig>>,
    pub igdb_provider: Arc<IgdbMetadataProvider>,
    pub gog_provider: Arc<GogMetadataProvider>,
    pub client: reqwest::Client,
}

impl ProviderRegistry {
    pub fn new(client: reqwest::Client) -> Self {
        let igdb = Arc::new(IgdbMetadataProvider::new(client.clone()));
        let gog = Arc::new(GogMetadataProvider::new(client.clone()));
        let steam = Box::new(SteamMetadataProvider::new(client.clone()));
        let steamgriddb = Box::new(SteamGridDbProvider::new(client.clone()));
        let opencritic = Box::new(OpenCriticProvider::new(client.clone()));
        let hltb = Box::new(HowLongToBeatProvider::new(client.clone()));

        let mut providers: HashMap<String, Box<dyn MetadataProvider>> = HashMap::new();
        providers.insert("steam".to_string(), steam);
        providers.insert("gog".to_string(), Box::new(GogMetadataProvider::new(client.clone())));
        providers.insert("igdb".to_string(), Box::new((*igdb).clone()));
        providers.insert("steamgriddb".to_string(), steamgriddb);
        providers.insert("opencritic".to_string(), opencritic);
        providers.insert("howlongtobeat".to_string(), hltb);

        let mut enabled = HashMap::new();
        enabled.insert("steam".to_string(), true);
        enabled.insert("gog".to_string(), true);
        enabled.insert("igdb".to_string(), true);
        enabled.insert("steamgriddb".to_string(), true);
        enabled.insert("opencritic".to_string(), true);
        enabled.insert("howlongtobeat".to_string(), true);

        Self {
            plugins_dir: Arc::new(RwLock::new(None)),
            providers: Arc::new(RwLock::new(providers)),
            enabled_providers: Arc::new(RwLock::new(enabled)),
            settings_cache: Arc::new(RwLock::new(HashMap::new())),
            pipeline_config: Arc::new(RwLock::new(MetadataPipelineConfig::default())),
            igdb_provider: igdb,
            gog_provider: gog,
            client,
        }
    }

    pub async fn set_plugins_dir(&self, dir: PathBuf) {
        let _ = std::fs::create_dir_all(&dir);
        *self.plugins_dir.write().await = Some(dir.clone());
        self.load_persisted_state(&dir).await;
    }

    pub async fn get_plugins_dir(&self) -> Option<PathBuf> {
        self.plugins_dir.read().await.clone()
    }

    pub async fn unregister_provider(&self, provider_id: &str) -> Result<(), String> {
        let mut providers = self.providers.write().await;
        providers.remove(provider_id);
        let mut enabled = self.enabled_providers.write().await;
        enabled.remove(provider_id);
        let mut settings = self.settings_cache.write().await;
        settings.remove(provider_id);
        Ok(())
    }

    pub async fn register_provider(&self, provider: Box<dyn MetadataProvider>) {
        let id = provider.id().to_string();
        let mut providers = self.providers.write().await;
        let mut enabled = self.enabled_providers.write().await;
        if !enabled.contains_key(&id) {
            enabled.insert(id.clone(), true);
        }
        providers.insert(id, provider);
    }

    /// Re-scans persisted settings and returns the refreshed provider list
    pub async fn refresh_external_plugins(&self) -> Result<Vec<ProviderInfo>, String> {
        if let Some(ref dir) = *self.plugins_dir.read().await {
            self.load_persisted_state(dir).await;
        }
        Ok(self.get_providers_info().await)
    }

    /// Fetches completion times from HowLongToBeat from source/API for a game title.
    #[inline]
    pub async fn fetch_hltb_times(&self, title: &str) -> (String, String, String) {
        super::hltb::HltbEnrichmentService::fetch_hltb_times(
            &self.providers,
            &self.settings_cache,
            title,
        )
        .await
    }

    /// Compatibility no-op / direct registration
    pub async fn load_and_register_dynamic_plugin(
        &self,
        _path: &Path,
    ) -> Result<ProviderInfo, String> {
        Ok(self
            .get_providers_info()
            .await
            .into_iter()
            .next()
            .unwrap_or_else(|| ProviderInfo {
                id: "unknown".to_string(),
                name: "Unknown".to_string(),
                description: String::new(),
                author: String::new(),
                website: None,
                key_help_url: None,
                requires_api_key: false,
                supported_fields: Vec::new(),
                is_enabled: true,
                settings_schema: None,
                settings_values: Value::Object(Map::new()),
                has_configured_key: true,
                is_builtin: true,
                version: None,
                plugin_path: None,
                plugin_type: None,
                ui_slots: Vec::new(),
            }))
    }

    async fn load_persisted_state(&self, dir: &Path) {
        // 1. Load pipeline config
        let pipeline_path = dir.join("pipeline_config.json");
        if let Ok(content) = std::fs::read_to_string(&pipeline_path) {
            if let Ok(mut cfg) = serde_json::from_str::<MetadataPipelineConfig>(&content) {
                cfg.ensure_field_rules();
                *self.pipeline_config.write().await = cfg;
            }
        }

        // 2. Load unified metadata_settings.json if present
        let unified_settings_path = dir.join("metadata_settings.json");
        if let Ok(content) = std::fs::read_to_string(&unified_settings_path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                if let Some(map) = val.as_object() {
                    let mut settings_guard = self.settings_cache.write().await;
                    for (k, v) in map {
                        if let Some(prov_map) = v.as_object() {
                            settings_guard.insert(k.clone(), prov_map.clone());
                        }
                    }
                }
            }
        }

        // 3. Fallback: load per-provider settings subfolders for backwards compatibility
        let mut settings_guard = self.settings_cache.write().await;
        let providers_guard = self.providers.read().await;
        for prov_id in providers_guard.keys() {
            if !settings_guard.contains_key(prov_id) {
                let prov_file = dir.join(prov_id).join("settings.json");
                if let Ok(content) = std::fs::read_to_string(&prov_file) {
                    if let Ok(val) = serde_json::from_str::<Value>(&content) {
                        if let Some(map) = val.as_object() {
                            settings_guard.insert(prov_id.clone(), map.clone());
                        }
                    }
                }
            }
        }
    }

    pub async fn get_providers_info(&self) -> Vec<ProviderInfo> {
        let enabled_guard = self.enabled_providers.read().await;
        let settings_guard = self.settings_cache.read().await;
        let providers_guard = self.providers.read().await;
        let plugins_dir_guard = self.plugins_dir.read().await;

        let mut list = Vec::new();
        for (id, prov) in &*providers_guard {
            let is_enabled = enabled_guard.get(id).copied().unwrap_or(true);
            let settings_map = settings_guard.get(id).cloned().unwrap_or_default();
            let has_key = if id == "igdb" {
                let client_id = settings_map
                    .get("client_id")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false);
                let client_secret = settings_map
                    .get("client_secret")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false);
                client_id && client_secret
            } else if !prov.requires_api_key() {
                true
            } else {
                settings_map
                    .get("api_key")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false)
            };

            let mut plugin_path_val = prov.plugin_path().map(|p| p.to_string_lossy().to_string());
            if plugin_path_val.is_none() && !prov.is_builtin() {
                if let Some(ref dir) = *plugins_dir_guard {
                    let candidate = dir.join(id);
                    if candidate.exists() {
                        plugin_path_val = Some(candidate.to_string_lossy().to_string());
                    }
                }
            }

            list.push(ProviderInfo {
                id: id.clone(),
                name: prov.name().to_string(),
                description: prov.description().to_string(),
                author: prov.author().to_string(),
                website: prov.website().map(|s| s.to_string()),
                key_help_url: prov.key_help_url().map(|s| s.to_string()),
                requires_api_key: prov.requires_api_key(),
                supported_fields: prov.supported_fields(),
                is_enabled,
                settings_schema: prov.settings_schema(),
                settings_values: Value::Object(settings_map),
                has_configured_key: has_key,
                is_builtin: prov.is_builtin(),
                version: prov.version().map(|s| s.to_string()),
                plugin_path: plugin_path_val,
                plugin_type: Some(prov.manifest().plugin_type),
                ui_slots: prov.manifest().ui_slots,
            });
        }

        // Built-in providers first, then alphabetical
        list.sort_by(|a, b| {
            b.is_builtin
                .cmp(&a.is_builtin)
                .then_with(|| a.name.cmp(&b.name))
        });
        list
    }

    pub async fn save_provider_settings(
        &self,
        provider_id: &str,
        settings: Map<String, Value>,
    ) -> Result<(), String> {
        {
            let providers_guard = self.providers.read().await;
            if !providers_guard.contains_key(provider_id) {
                return Err(format!("Provider '{}' non trovato", provider_id));
            }
        }

        self.settings_cache
            .write()
            .await
            .insert(provider_id.to_string(), settings.clone());

        if provider_id == "igdb" {
            self.igdb_provider.invalidate_token().await;
        }

        if let Some(ref dir) = *self.plugins_dir.read().await {
            // Write to unified metadata_settings.json
            let unified_settings_path = dir.join("metadata_settings.json");
            let mut all_settings: Map<String, Value> =
                if let Ok(content) = std::fs::read_to_string(&unified_settings_path) {
                    serde_json::from_str::<Value>(&content)
                        .ok()
                        .and_then(|v| v.as_object().cloned())
                        .unwrap_or_default()
                } else {
                    Map::new()
                };

            all_settings.insert(provider_id.to_string(), Value::Object(settings.clone()));
            if let Ok(json) = serde_json::to_string_pretty(&Value::Object(all_settings)) {
                let _ = std::fs::write(&unified_settings_path, json);
            }

            // Also keep per-provider folder settings for backwards compatibility
            let prov_dir = dir.join(provider_id);
            let _ = std::fs::create_dir_all(&prov_dir);
            let json = serde_json::to_string_pretty(&Value::Object(settings))
                .map_err(|e| e.to_string())?;
            std::fs::write(prov_dir.join("settings.json"), json).map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    pub async fn toggle_provider(&self, provider_id: &str, enabled: bool) -> Result<(), String> {
        self.enabled_providers
            .write()
            .await
            .insert(provider_id.to_string(), enabled);
        Ok(())
    }

    pub async fn test_provider_connection(&self, provider_id: &str) -> Result<String, String> {
        let providers_guard = self.providers.read().await;
        let prov = providers_guard
            .get(provider_id)
            .ok_or_else(|| format!("Provider '{}' non trovato", provider_id))?;
        let settings = self
            .settings_cache
            .read()
            .await
            .get(provider_id)
            .cloned()
            .unwrap_or_default();
        prov.test_connection(&settings).await
    }

    pub async fn get_pipeline_config(&self) -> MetadataPipelineConfig {
        self.pipeline_config.read().await.clone()
    }

    pub async fn save_pipeline_config(&self, config: MetadataPipelineConfig) -> Result<(), String> {
        *self.pipeline_config.write().await = config.clone();
        if let Some(ref dir) = *self.plugins_dir.read().await {
            let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
            std::fs::write(dir.join("pipeline_config.json"), json).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

#[async_trait]
impl MetadataRegistry for ProviderRegistry {
    #[inline]
    async fn set_plugins_dir(&self, dir: PathBuf) {
        self.set_plugins_dir(dir).await;
    }

    #[inline]
    async fn get_plugins_dir(&self) -> Option<PathBuf> {
        self.get_plugins_dir().await
    }

    #[inline]
    async fn unregister_provider(&self, provider_id: &str) -> Result<(), String> {
        self.unregister_provider(provider_id).await
    }

    #[inline]
    async fn register_provider(&self, provider: Box<dyn MetadataProvider>) {
        self.register_provider(provider).await;
    }

    #[inline]
    async fn refresh_external_plugins(&self) -> Result<Vec<ProviderInfo>, String> {
        self.refresh_external_plugins().await
    }

    #[inline]
    async fn fetch_hltb_times(&self, title: &str) -> (String, String, String) {
        self.fetch_hltb_times(title).await
    }

    #[inline]
    async fn load_and_register_dynamic_plugin(&self, path: &Path) -> Result<ProviderInfo, String> {
        self.load_and_register_dynamic_plugin(path).await
    }

    #[inline]
    async fn get_providers_info(&self) -> Vec<ProviderInfo> {
        self.get_providers_info().await
    }

    #[inline]
    async fn save_provider_settings(
        &self,
        provider_id: &str,
        settings: Map<String, Value>,
    ) -> Result<(), String> {
        self.save_provider_settings(provider_id, settings).await
    }

    #[inline]
    async fn toggle_provider(&self, provider_id: &str, enabled: bool) -> Result<(), String> {
        self.toggle_provider(provider_id, enabled).await
    }

    #[inline]
    async fn test_provider_connection(&self, provider_id: &str) -> Result<String, String> {
        self.test_provider_connection(provider_id).await
    }

    #[inline]
    async fn get_pipeline_config(&self) -> MetadataPipelineConfig {
        self.get_pipeline_config().await
    }

    #[inline]
    async fn save_pipeline_config(&self, config: MetadataPipelineConfig) -> Result<(), String> {
        self.save_pipeline_config(config).await
    }
}
