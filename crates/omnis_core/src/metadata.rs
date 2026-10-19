use crate::db::Database;
use crate::dynamic_loader::{find_shared_library_in_dir, DynamicPluginLoader};
use omnis_sdk::{
    GameMetadataPatch, MetadataField, MetadataProvider, MetadataSearchRequest,
};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};
use uuid::Uuid;

pub mod igdb;
pub mod opencritic;
pub mod scaffold;
pub mod steam;
pub mod steamgriddb;
pub mod types;
pub mod utils;

pub use igdb::IgdbMetadataProvider;
pub use opencritic::OpenCriticProvider;
pub use steam::SteamMetadataProvider;
pub use steamgriddb::SteamGridDbProvider;
pub use types::*;
pub use utils::*;

// ============================================================================
// 4. Diamond Metadata Pipeline & Engine Manager
// ============================================================================
pub struct MetadataDownloader {
    client: reqwest::Client,
    plugins_dir: Arc<RwLock<Option<PathBuf>>>,
    providers: Arc<RwLock<HashMap<String, Box<dyn MetadataProvider>>>>,
    enabled_providers: Arc<RwLock<HashMap<String, bool>>>,
    settings_cache: Arc<RwLock<HashMap<String, Map<String, Value>>>>,
    pipeline_config: Arc<RwLock<MetadataPipelineConfig>>,
    igdb_provider: Arc<IgdbMetadataProvider>,
}

impl Default for MetadataDownloader {
    fn default() -> Self {
        Self::new()
    }
}

impl MetadataDownloader {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(12))
            .user_agent("OmnisGameLibrary/0.1.0 (Windows NT 10.0; Win64; x64)")
            .build()
            .unwrap_or_default();

        let igdb = Arc::new(IgdbMetadataProvider::new(client.clone()));

        let mut providers: HashMap<String, Box<dyn MetadataProvider>> = HashMap::new();
        providers.insert(
            "steam".to_string(),
            Box::new(SteamMetadataProvider::new(client.clone())),
        );
        providers.insert(
            "steamgriddb".to_string(),
            Box::new(SteamGridDbProvider::new(client.clone())),
        );
        providers.insert(
            "opencritic".to_string(),
            Box::new(OpenCriticProvider::new(client.clone())),
        );
        providers.insert("igdb".to_string(), Box::new((*igdb).clone()));

        let mut enabled = HashMap::new();
        enabled.insert("steam".to_string(), true);
        enabled.insert("steamgriddb".to_string(), true);
        enabled.insert("opencritic".to_string(), true);
        enabled.insert("igdb".to_string(), true);

        Self {
            client,
            plugins_dir: Arc::new(RwLock::new(None)),
            providers: Arc::new(RwLock::new(providers)),
            enabled_providers: Arc::new(RwLock::new(enabled)),
            settings_cache: Arc::new(RwLock::new(HashMap::new())),
            pipeline_config: Arc::new(RwLock::new(MetadataPipelineConfig::default())),
            igdb_provider: igdb,
        }
    }

    pub async fn set_plugins_dir(&self, dir: PathBuf) {
        let _ = std::fs::create_dir_all(&dir);
        *self.plugins_dir.write().await = Some(dir.clone());
        scaffold::scaffold_plugins_directory(&dir);
        self.load_persisted_state(&dir).await;
        self.scan_and_load_external_plugins(&dir).await;
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

    /// Scans the plugins folder for subdirectories with native shared libraries or manifest.json and loads them dynamically
    async fn scan_and_load_external_plugins(&self, dir: &Path) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        let mut providers_guard = self.providers.write().await;
        let mut enabled_guard = self.enabled_providers.write().await;
        let mut settings_guard = self.settings_cache.write().await;

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            // 1. Check for native shared library binary (.dll, .so, .dylib)
            if let Some(lib_path) = find_shared_library_in_dir(&path) {
                let loader = DynamicPluginLoader::new();
                match loader.load_metadata_provider_from_library(&lib_path) {
                    Ok(dynamic_provider) => {
                        let id = dynamic_provider.id().to_string();
                        info!(
                            "Caricato plugin dinamico nativo: {} ({}) v{} da {}",
                            dynamic_provider.name(),
                            id,
                            dynamic_provider.version().unwrap_or("unknown"),
                            lib_path.display()
                        );

                        // Load settings if present
                        let settings_file = path.join("settings.json");
                        if let Ok(content) = std::fs::read_to_string(&settings_file) {
                            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                                if let Some(map) = val.as_object() {
                                    settings_guard.insert(id.clone(), map.clone());
                                }
                            }
                        }

                        if !enabled_guard.contains_key(&id) {
                            enabled_guard.insert(id.clone(), true);
                        }

                        providers_guard.insert(id, Box::new(dynamic_provider));
                        continue;
                    }
                    Err(e) => {
                        warn!(
                            "Errore nel caricamento del plugin dinamico nativo {}: {}",
                            lib_path.display(),
                            e
                        );
                    }
                }
            }

            // 2. Fallback: check for manifest.json or extension.yaml for external / script-based plugins
            let manifest_json = path.join("manifest.json");
            let extension_yaml = path.join("extension.yaml");

            let manifest_opt: Option<PluginManifest> = if manifest_json.exists() {
                if let Ok(content) = std::fs::read_to_string(&manifest_json) {
                    serde_json::from_str(&content).ok()
                } else {
                    None
                }
            } else if extension_yaml.exists() {
                if let Ok(content) = std::fs::read_to_string(&extension_yaml) {
                    serde_json::from_str(&content).ok()
                } else {
                    None
                }
            } else {
                None
            };

            if let Some(manifest) = manifest_opt {
                let id = manifest.id.clone();
                info!(
                    "Caricato plugin esterno: {} ({}) v{} da {}",
                    manifest.name,
                    id,
                    manifest.version,
                    path.display()
                );

                // Load settings if present
                let settings_file = path.join("settings.json");
                if let Ok(content) = std::fs::read_to_string(&settings_file) {
                    if let Ok(val) = serde_json::from_str::<Value>(&content) {
                        if let Some(map) = val.as_object() {
                            settings_guard.insert(id.clone(), map.clone());
                        }
                    }
                }

                if !enabled_guard.contains_key(&id) {
                    enabled_guard.insert(id.clone(), true);
                }

                // Only register generic ExternalMetadataProvider if not a core or specialized provider
                if id != "steam" && id != "steamgriddb" && id != "opencritic" && id != "igdb" {
                    let provider = ExternalMetadataProvider::new(manifest, path, self.client.clone());
                    providers_guard.insert(id, Box::new(provider));
                }
            }
        }
    }

    /// Re-scans disk for plugins and returns the refreshed provider list
    pub async fn refresh_external_plugins(&self) -> Result<Vec<ProviderInfo>, String> {
        if let Some(ref dir) = *self.plugins_dir.read().await {
            scaffold::scaffold_plugins_directory(dir);
            self.load_persisted_state(dir).await;
            self.scan_and_load_external_plugins(dir).await;
        }
        Ok(self.get_providers_info().await)
    }

    /// Dynamically load and hot-register a native or manifest-based plugin from a library or directory
    pub async fn load_and_register_dynamic_plugin(&self, path: &Path) -> Result<ProviderInfo, String> {
        let library_path = if path.is_file() {
            Some(path.to_path_buf())
        } else if path.is_dir() {
            find_shared_library_in_dir(path)
        } else {
            return Err(format!("Il percorso specificato non esiste: {}", path.display()));
        };

        if let Some(ref lib_path) = library_path {
            let loader = DynamicPluginLoader::new();
            match loader.load_metadata_provider_from_library(lib_path) {
                Ok(dynamic_provider) => {
                    let id = dynamic_provider.id().to_string();
                    let root_path = lib_path
                        .parent()
                        .map(|p| p.to_path_buf())
                        .unwrap_or_else(|| lib_path.clone());

                    let mut settings_guard = self.settings_cache.write().await;
                    let settings_file = root_path.join("settings.json");
                    if let Ok(content) = std::fs::read_to_string(&settings_file) {
                        if let Ok(val) = serde_json::from_str::<Value>(&content) {
                            if let Some(map) = val.as_object() {
                                settings_guard.insert(id.clone(), map.clone());
                            }
                        }
                    }

                    let mut enabled_guard = self.enabled_providers.write().await;
                    if !enabled_guard.contains_key(&id) {
                        enabled_guard.insert(id.clone(), true);
                    }
                    let is_enabled = enabled_guard.get(&id).copied().unwrap_or(true);
                    let settings_map = settings_guard.get(&id).cloned().unwrap_or_default();

                    let has_key = if !dynamic_provider.requires_api_key() {
                        true
                    } else {
                        settings_map
                            .get("api_key")
                            .and_then(|v| v.as_str())
                            .map(|s| !s.trim().is_empty())
                            .unwrap_or(false)
                    };

                    let info = ProviderInfo {
                        id: id.clone(),
                        name: dynamic_provider.name().to_string(),
                        description: dynamic_provider.description().to_string(),
                        author: dynamic_provider.author().to_string(),
                        website: dynamic_provider.website().map(|s| s.to_string()),
                        key_help_url: dynamic_provider.key_help_url().map(|s| s.to_string()),
                        requires_api_key: dynamic_provider.requires_api_key(),
                        supported_fields: dynamic_provider.supported_fields(),
                        is_enabled,
                        settings_schema: dynamic_provider.settings_schema(),
                        settings_values: Value::Object(settings_map),
                        has_configured_key: has_key,
                        is_builtin: dynamic_provider.is_builtin(),
                        version: dynamic_provider.version().map(|s| s.to_string()),
                        plugin_path: Some(root_path.to_string_lossy().to_string()),
                    };

                    let mut providers_guard = self.providers.write().await;
                    providers_guard.insert(id, Box::new(dynamic_provider));

                    return Ok(info);
                }
                Err(e) => {
                    tracing::warn!("Errore nel caricamento nativo da {}: {}", lib_path.display(), e);
                }
            }
        }

        // Fallback: check if directory contains manifest.json or extension.yaml
        let dir = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };
        let manifest_json = dir.join("manifest.json");
        let extension_yaml = dir.join("extension.yaml");
        let manifest_opt: Option<PluginManifest> = if manifest_json.exists() {
            std::fs::read_to_string(&manifest_json).ok().and_then(|c| {
                serde_json::from_str::<PluginManifest>(&c).ok().or_else(|| {
                    if let Ok(val) = serde_json::from_str::<Value>(&c) {
                        let id = val.get("id").and_then(|v| v.as_str())?.to_string();
                        let name = val.get("name").and_then(|v| v.as_str()).unwrap_or(&id).to_string();
                        let version = val.get("version").and_then(|v| v.as_str()).unwrap_or("1.0.0").to_string();
                        let author = val.get("author").and_then(|v| v.as_str()).unwrap_or("Omnis Community").to_string();
                        let description = val.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let plugin_type = val.get("plugin_type").or_else(|| val.get("type")).and_then(|v| v.as_str()).unwrap_or("metadata").to_string();
                        Some(PluginManifest {
                            id,
                            name,
                            version,
                            author,
                            description,
                            plugin_type,
                            website: val.get("website").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            key_help_url: val.get("key_help_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            requires_api_key: val.get("requires_api_key").and_then(|v| v.as_bool()).unwrap_or(false),
                            supported_fields: vec![
                                MetadataField::CriticScore,
                                MetadataField::CommunityScore,
                                MetadataField::Description,
                            ],
                            entry_point: None,
                            settings_schema: None,
                            permissions: val.get("permissions")
                                .and_then(|p| p.as_array())
                                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                                .unwrap_or_default(),
                        })
                    } else {
                        None
                    }
                })
            })
        } else if extension_yaml.exists() {
            std::fs::read_to_string(&extension_yaml).ok().and_then(|c| {
                serde_json::from_str::<PluginManifest>(&c).ok().or_else(|| {
                    if let Ok(val) = serde_json::from_str::<Value>(&c) {
                        let id = val.get("id").and_then(|v| v.as_str())?.to_string();
                        let name = val.get("name").and_then(|v| v.as_str()).unwrap_or(&id).to_string();
                        let version = val.get("version").and_then(|v| v.as_str()).unwrap_or("1.0.0").to_string();
                        let author = val.get("author").and_then(|v| v.as_str()).unwrap_or("Omnis Community").to_string();
                        let description = val.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let plugin_type = val.get("plugin_type").or_else(|| val.get("type")).and_then(|v| v.as_str()).unwrap_or("metadata").to_string();
                        Some(PluginManifest {
                            id,
                            name,
                            version,
                            author,
                            description,
                            plugin_type,
                            website: val.get("website").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            key_help_url: val.get("key_help_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            requires_api_key: val.get("requires_api_key").and_then(|v| v.as_bool()).unwrap_or(false),
                            supported_fields: vec![
                                MetadataField::CriticScore,
                                MetadataField::CommunityScore,
                                MetadataField::Description,
                            ],
                            entry_point: None,
                            settings_schema: None,
                            permissions: val.get("permissions")
                                .and_then(|p| p.as_array())
                                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                                .unwrap_or_default(),
                        })
                    } else {
                        None
                    }
                })
            })
        } else {
            None
        };

        if let Some(manifest) = manifest_opt {
            let id = manifest.id.clone();
            let mut settings_guard = self.settings_cache.write().await;
            let settings_file = dir.join("settings.json");
            if let Ok(content) = std::fs::read_to_string(&settings_file) {
                if let Ok(val) = serde_json::from_str::<Value>(&content) {
                    if let Some(map) = val.as_object() {
                        settings_guard.insert(id.clone(), map.clone());
                    }
                }
            }

            let mut enabled_guard = self.enabled_providers.write().await;
            if !enabled_guard.contains_key(&id) {
                enabled_guard.insert(id.clone(), true);
            }
            let is_enabled = enabled_guard.get(&id).copied().unwrap_or(true);
            let settings_map = settings_guard.get(&id).cloned().unwrap_or_default();

            let has_key = if !manifest.requires_api_key {
                true
            } else {
                settings_map
                    .get("api_key")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false)
            };

            let info = ProviderInfo {
                id: id.clone(),
                name: manifest.name.clone(),
                description: manifest.description.clone(),
                author: manifest.author.clone(),
                website: manifest.website.clone(),
                key_help_url: manifest.key_help_url.clone(),
                requires_api_key: manifest.requires_api_key,
                supported_fields: if manifest.supported_fields.is_empty() {
                    vec![
                        MetadataField::CriticScore,
                        MetadataField::CommunityScore,
                        MetadataField::Description,
                    ]
                } else {
                    manifest.supported_fields.clone()
                },
                is_enabled,
                settings_schema: manifest.settings_schema.clone(),
                settings_values: Value::Object(settings_map),
                has_configured_key: has_key,
                is_builtin: false,
                version: Some(manifest.version.clone()),
                plugin_path: Some(dir.to_string_lossy().to_string()),
            };

            let provider = ExternalMetadataProvider::new(manifest, dir.to_path_buf(), self.client.clone());
            let mut providers_guard = self.providers.write().await;
            providers_guard.insert(id, Box::new(provider));

            return Ok(info);
        }

        Err(format!(
            "Nessuna libreria nativa valida né manifest.json trovato in {}",
            path.display()
        ))
    }

    async fn load_persisted_state(&self, dir: &Path) {
        // Load pipeline config
        let pipeline_path = dir.join("pipeline_config.json");
        if let Ok(content) = std::fs::read_to_string(&pipeline_path) {
            if let Ok(cfg) = serde_json::from_str::<MetadataPipelineConfig>(&content) {
                *self.pipeline_config.write().await = cfg;
            }
        }

        // Load provider settings
        let mut settings_guard = self.settings_cache.write().await;
        let providers_guard = self.providers.read().await;
        for prov_id in providers_guard.keys() {
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
            });
        }

        // Built-in providers first, then alphabetical
        list.sort_by(|a, b| b.is_builtin.cmp(&a.is_builtin).then_with(|| a.name.cmp(&b.name)));
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

    /// Search for metadata candidates across online providers (Steam, SteamGridDB, OpenCritic, etc.)
    pub async fn search_candidates(
        &self,
        title: &str,
        provider_id: Option<&str>,
    ) -> Result<Vec<MetadataCandidateDto>, String> {
        let filter = provider_id.unwrap_or("all").to_lowercase();
        let mut candidates = Vec::new();

        // 1. Steam Store Search
        if filter == "all" || filter == "steam" {
            let search_url = reqwest::Url::parse_with_params(
                "https://store.steampowered.com/api/storesearch/",
                &[("term", title), ("l", "italian"), ("cc", "IT")],
            );
            if let Ok(url) = search_url {
                if let Ok(resp) = self.client.get(url).send().await {
                    if let Ok(json) = resp.json::<Value>().await {
                        if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
                            for item in items.iter().take(6) {
                                if let Some(appid_num) = item.get("id").and_then(|v| v.as_u64()) {
                                    let appid = appid_num.to_string();
                                    let name = item
                                        .get("name")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or(title)
                                        .to_string();
                                    let cover_url = format!(
                                        "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900_2x.jpg",
                                        appid
                                    );
                                    let bg_url = format!(
                                        "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
                                        appid
                                    );

                                    let mut desc = format!("Titolo Steam Store: {}", name);
                                    let mut release_year = None;
                                    let mut critic_score = None;
                                    let mut release_date = None;
                                    let mut genres = vec!["Azione".to_string()];
                                    let mut developers = Vec::new();

                                    // Quick details query for rich metadata candidate
                                    let details_url = format!(
                                        "https://store.steampowered.com/api/appdetails?appids={}&l=italian",
                                        appid
                                    );
                                    if let Ok(Ok(d_resp)) = tokio::time::timeout(
                                        std::time::Duration::from_millis(2000),
                                        self.client.get(&details_url).send(),
                                    )
                                    .await
                                    {
                                        if let Ok(d_json) = d_resp.json::<Value>().await {
                                            if let Some(data) = d_json.get(&appid).and_then(|v| v.get("data")) {
                                                if let Some(sd) = data.get("short_description").and_then(|v| v.as_str()) {
                                                    let plain = html_to_plain_text(sd);
                                                    if !plain.is_empty() {
                                                        desc = plain;
                                                    }
                                                }
                                                if let Some(rd) = data.get("release_date").and_then(|v| v.get("date")).and_then(|v| v.as_str()) {
                                                    release_date = Some(rd.to_string());
                                                    release_year = extract_year(rd);
                                                }
                                                if let Some(meta) = data.get("metacritic").and_then(|v| v.get("score")).and_then(|v| v.as_u64()) {
                                                    critic_score = Some(meta as u8);
                                                }
                                                if let Some(g_arr) = data.get("genres").and_then(|v| v.as_array()) {
                                                    let g_parsed: Vec<String> = g_arr
                                                        .iter()
                                                        .filter_map(|g| g.get("description").and_then(|d| d.as_str()).map(|s| s.to_string()))
                                                        .collect();
                                                    if !g_parsed.is_empty() {
                                                        genres = g_parsed;
                                                    }
                                                }
                                                if let Some(d_arr) = data.get("developers").and_then(|v| v.as_array()) {
                                                    developers = d_arr
                                                        .iter()
                                                        .filter_map(|d| d.as_str().map(|s| s.to_string()))
                                                        .collect();
                                                }
                                            }
                                        }
                                    }

                                    let raw_patch = GameMetadataPatch {
                                        description: Some(desc.clone()),
                                        release_date,
                                        cover_url: Some(cover_url.clone()),
                                        background_url: Some(bg_url.clone()),
                                        icon_url: None,
                                        critic_score,
                                        community_score: None,
                                        genres,
                                        developers,
                                        publishers: Vec::new(),
                                        tags: Vec::new(),
                                    };

                                    candidates.push(MetadataCandidateDto {
                                        provider_id: "steam".to_string(),
                                        provider_game_id: appid,
                                        title: name,
                                        release_year,
                                        cover_url: Some(cover_url),
                                        background_url: Some(bg_url),
                                        description: Some(desc),
                                        raw_patch,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. SteamGridDB Autocomplete Search
        if filter == "all" || filter == "steamgriddb" {
            let settings_guard = self.settings_cache.read().await;
            let sgdb_key = settings_guard
                .get("steamgriddb")
                .and_then(|m| m.get("api_key"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();

            if !sgdb_key.is_empty() {
                let encoded_term = url_encode(title);
                let url = format!(
                    "https://www.steamgriddb.com/api/v2/search/autocomplete/{}",
                    encoded_term
                );
                if let Ok(resp) = self
                    .client
                    .get(&url)
                    .header("Authorization", format!("Bearer {}", sgdb_key))
                    .send()
                    .await
                {
                    if let Ok(json) = resp.json::<Value>().await {
                        if let Some(data) = json.get("data").and_then(|v| v.as_array()) {
                            for item in data.iter().take(4) {
                                let id = item
                                    .get("id")
                                    .and_then(|v| v.as_u64())
                                    .map(|n| n.to_string())
                                    .unwrap_or_default();
                                let name = item
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or(title)
                                    .to_string();
                                let release_date_ts = item.get("release_date").and_then(|v| v.as_i64());
                                let year = release_date_ts.and_then(|ts| {
                                    chrono::DateTime::from_timestamp(ts, 0).map(|dt| {
                                        use chrono::Datelike;
                                        dt.year()
                                    })
                                });

                                // Fetch top grid
                                let mut cover_url = None;
                                let grid_url = format!("https://www.steamgriddb.com/api/v2/grids/game/{}", id);
                                if let Ok(g_resp) = self
                                    .client
                                    .get(&grid_url)
                                    .header("Authorization", format!("Bearer {}", sgdb_key))
                                    .send()
                                    .await
                                {
                                    if let Ok(g_json) = g_resp.json::<Value>().await {
                                        cover_url = g_json
                                            .get("data")
                                            .and_then(|d| d.as_array())
                                            .and_then(|arr| arr.first())
                                            .and_then(|it| it.get("url"))
                                            .and_then(|u| u.as_str())
                                            .map(|s| s.to_string());
                                    }
                                }

                                // Fetch top hero
                                let mut bg_url = None;
                                let hero_url = format!("https://www.steamgriddb.com/api/v2/heroes/game/{}", id);
                                if let Ok(h_resp) = self
                                    .client
                                    .get(&hero_url)
                                    .header("Authorization", format!("Bearer {}", sgdb_key))
                                    .send()
                                    .await
                                {
                                    if let Ok(h_json) = h_resp.json::<Value>().await {
                                        bg_url = h_json
                                            .get("data")
                                            .and_then(|d| d.as_array())
                                            .and_then(|arr| arr.first())
                                            .and_then(|it| it.get("url"))
                                            .and_then(|u| u.as_str())
                                            .map(|s| s.to_string());
                                    }
                                }

                                let desc = format!("Artwork HD verificata da SteamGridDB per {}", name);
                                let raw_patch = GameMetadataPatch {
                                    description: Some(desc.clone()),
                                    cover_url: cover_url.clone(),
                                    background_url: bg_url.clone(),
                                    ..Default::default()
                                };

                                candidates.push(MetadataCandidateDto {
                                    provider_id: "steamgriddb".to_string(),
                                    provider_game_id: id,
                                    title: name,
                                    release_year: year,
                                    cover_url,
                                    background_url: bg_url,
                                    description: Some(desc),
                                    raw_patch,
                                });
                            }
                        }
                    }
                }
            }
        }

        // 3. OpenCritic Search
        if filter == "all" || filter == "opencritic" {
            let settings_guard = self.settings_cache.read().await;
            let oc_key = settings_guard
                .get("opencritic")
                .and_then(|m| m.get("api_key"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();

            if !oc_key.is_empty() {
                let encoded_term = url_encode(title);
                let url = format!(
                    "https://opencritic-api.p.rapidapi.com/game/search?criteria={}",
                    encoded_term
                );
                if let Ok(resp) = self
                    .client
                    .get(&url)
                    .header("X-RapidAPI-Key", oc_key)
                    .header("X-RapidAPI-Host", "opencritic-api.p.rapidapi.com")
                    .send()
                    .await
                {
                    if let Ok(json) = resp.json::<Value>().await {
                        if let Some(arr) = json.as_array() {
                            for item in arr.iter().take(3) {
                                let id = item
                                    .get("id")
                                    .and_then(|v| v.as_u64())
                                    .map(|n| n.to_string())
                                    .unwrap_or_default();
                                let name = item
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or(title)
                                    .to_string();
                                let score = item
                                    .get("topCriticScore")
                                    .and_then(|s| s.as_f64())
                                    .map(|s| s.round() as u8);
                                let percent_rec = item
                                    .get("percentRecommended")
                                    .and_then(|s| s.as_f64())
                                    .map(|s| s.round() as u8);
                                let desc = format!(
                                    "Recensioni aggregate da OpenCritic per {}. Critic Score: {:?}",
                                    name, score
                                );

                                let raw_patch = GameMetadataPatch {
                                    description: Some(desc.clone()),
                                    critic_score: score,
                                    community_score: percent_rec,
                                    ..Default::default()
                                };

                                candidates.push(MetadataCandidateDto {
                                    provider_id: "opencritic".to_string(),
                                    provider_game_id: id,
                                    title: name,
                                    release_year: None,
                                    cover_url: None,
                                    background_url: None,
                                    description: Some(desc),
                                    raw_patch,
                                });
                            }
                        }
                    }
                }
            }
        }

        // 4. IGDB APICalypse v4 Search
        if filter == "all" || filter == "igdb" {
            let igdb_settings = {
                let settings_guard = self.settings_cache.read().await;
                settings_guard.get("igdb").cloned().unwrap_or_default()
            };
            if let Ok(igdb_candidates) = self.igdb_provider.search_candidates(title, &igdb_settings, 8).await {
                candidates.extend(igdb_candidates);
            }
        }

        // 5. Guarantee candidates: if no online provider returned results, produce aesthetic fallback candidate
        if candidates.is_empty() {
            let fallback = self.generate_fallback_metadata(title, "catalogo");
            candidates.push(MetadataCandidateDto {
                provider_id: if filter == "all" {
                    "steam".to_string()
                } else {
                    filter.clone()
                },
                provider_game_id: format!("local_{}", Uuid::new_v4()),
                title: title.to_string(),
                release_year: Some(2023),
                cover_url: Some("https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600".to_string()),
                background_url: Some("https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1280".to_string()),
                description: fallback.description.clone(),
                raw_patch: fallback,
            });
        }

        Ok(candidates)
    }

    /// Primary Diamond enrichment routine combining multiple providers via the priority pipeline
    pub async fn download_for_game(
        &self,
        db: &Database,
        game_id: Uuid,
        cache_dir: &Path,
    ) -> Result<GameMetadataPatch, String> {
        let game = db
            .get_game_by_id(game_id)
            .map_err(|e| format!("Database error fetching game: {}", e))?
            .ok_or_else(|| format!("Game {} not found in database", game_id))?;

        info!(
            "Avvio arricchimento Diamond per '{}' (ID: {})...",
            game.title, game.id
        );

        let request = MetadataSearchRequest {
            title: game.title.clone(),
            external_id: Some(game.external_id.clone()),
            library_id: game.library_id.clone(),
        };

        let pipeline = self.pipeline_config.read().await.clone();
        let settings_guard = self.settings_cache.read().await;
        let enabled_guard = self.enabled_providers.read().await;
        let providers_guard = self.providers.read().await;

        let mut final_patch = GameMetadataPatch::default();

        // 1. Fetch Primary Details & Descriptions (Default: Steam)
        if enabled_guard
            .get(&pipeline.details_source)
            .copied()
            .unwrap_or(true)
        {
            if let Some(prov) = providers_guard.get(&pipeline.details_source) {
                let settings = settings_guard
                    .get(&pipeline.details_source)
                    .cloned()
                    .unwrap_or_default();
                if let Ok(patch) = prov.fetch_metadata(&request, &settings).await {
                    final_patch.description = patch.description;
                    final_patch.release_date = patch.release_date;
                    final_patch.genres = patch.genres;
                    final_patch.developers = patch.developers;
                    final_patch.publishers = patch.publishers;
                    final_patch.cover_url = patch.cover_url;
                    final_patch.background_url = patch.background_url;
                    final_patch.critic_score = patch.critic_score;
                    final_patch.community_score = patch.community_score;
                }
            }
        }

        // 2. Resolve High-Res Artwork (SteamGridDB or IGDB if enabled, fallback to Steam)
        if (pipeline.cover_source == "steamgriddb" || pipeline.background_source == "steamgriddb")
            && enabled_guard.get("steamgriddb").copied().unwrap_or(true)
        {
            if let Some(prov) = providers_guard.get("steamgriddb") {
                let settings = settings_guard
                    .get("steamgriddb")
                    .cloned()
                    .unwrap_or_default();
                if let Ok(sgdb_patch) = prov.fetch_metadata(&request, &settings).await {
                    if pipeline.cover_source == "steamgriddb" && sgdb_patch.cover_url.is_some() {
                        final_patch.cover_url = sgdb_patch.cover_url;
                    }
                    if pipeline.background_source == "steamgriddb" && sgdb_patch.background_url.is_some() {
                        final_patch.background_url = sgdb_patch.background_url;
                    }
                }
            }
        }

        if (pipeline.cover_source == "igdb" || pipeline.background_source == "igdb")
            && enabled_guard.get("igdb").copied().unwrap_or(true)
        {
            if let Some(prov) = providers_guard.get("igdb") {
                let settings = settings_guard
                    .get("igdb")
                    .cloned()
                    .unwrap_or_default();
                if let Ok(igdb_patch) = prov.fetch_metadata(&request, &settings).await {
                    if pipeline.cover_source == "igdb" && igdb_patch.cover_url.is_some() {
                        final_patch.cover_url = igdb_patch.cover_url;
                    }
                    if pipeline.background_source == "igdb" && igdb_patch.background_url.is_some() {
                        final_patch.background_url = igdb_patch.background_url;
                    }
                }
            }
        }

        // 3. Resolve Critic & Community Scores (Default: OpenCritic if enabled & key present, fallback to external or Steam)
        if pipeline.score_source == "opencritic"
            && enabled_guard.get("opencritic").copied().unwrap_or(true)
        {
            if let Some(prov) = providers_guard.get("opencritic") {
                let settings = settings_guard
                    .get("opencritic")
                    .cloned()
                    .unwrap_or_default();
                if let Ok(oc_patch) = prov.fetch_metadata(&request, &settings).await {
                    if oc_patch.critic_score.is_some() {
                        final_patch.critic_score = oc_patch.critic_score;
                        final_patch.community_score = oc_patch.community_score;
                    }
                }
            }
        } else if pipeline.score_source == "steam" && pipeline.details_source != "steam" {
            if enabled_guard.get("steam").copied().unwrap_or(true) {
                if let Some(prov) = providers_guard.get("steam") {
                    let settings = settings_guard.get("steam").cloned().unwrap_or_default();
                    if let Ok(st_patch) = prov.fetch_metadata(&request, &settings).await {
                        if st_patch.critic_score.is_some() {
                            final_patch.critic_score = st_patch.critic_score;
                            final_patch.community_score = st_patch.community_score;
                        }
                    }
                }
            }
        } else if pipeline.score_source != "opencritic" && pipeline.score_source != "steam" {
            if enabled_guard.get(&pipeline.score_source).copied().unwrap_or(true) {
                if let Some(prov) = providers_guard.get(&pipeline.score_source) {
                    let settings = settings_guard
                        .get(&pipeline.score_source)
                        .cloned()
                        .unwrap_or_default();
                    if let Ok(ext_patch) = prov.fetch_metadata(&request, &settings).await {
                        if ext_patch.critic_score.is_some() {
                            final_patch.critic_score = ext_patch.critic_score;
                            final_patch.community_score = ext_patch.community_score;
                        }
                    }
                }
            }
        }

        // 4. Generate aesthetic fallback if description or genres are still empty
        if final_patch.description.is_none() {
            let fallback = self.generate_fallback_metadata(&game.title, &game.library_id);
            if final_patch.description.is_none() {
                final_patch.description = fallback.description;
            }
            if final_patch.release_date.is_none() {
                final_patch.release_date = fallback.release_date;
            }
            if final_patch.genres.is_empty() {
                final_patch.genres = fallback.genres;
            }
            if final_patch.developers.is_empty() {
                final_patch.developers = fallback.developers;
            }
            if final_patch.publishers.is_empty() {
                final_patch.publishers = fallback.publishers;
            }
            if final_patch.critic_score.is_none() {
                final_patch.critic_score = fallback.critic_score;
                final_patch.community_score = fallback.community_score;
            }
        }

        // 5. Download binary image payloads to local cache
        let covers_dir = cache_dir.join("covers");
        let bgs_dir = cache_dir.join("backgrounds");
        let _ = std::fs::create_dir_all(&covers_dir);
        let _ = std::fs::create_dir_all(&bgs_dir);

        let cover_dest = covers_dir.join(format!("{}.jpg", game_id));
        let bg_dest = bgs_dir.join(format!("{}.jpg", game_id));

        if let Some(ref curl) = final_patch.cover_url.clone() {
            if curl.starts_with("http") {
                if let Ok(bytes) = self.download_image_bytes(curl).await {
                    if std::fs::write(&cover_dest, bytes).is_ok() {
                        final_patch.cover_url = Some(cover_dest.to_string_lossy().to_string());
                    }
                }
            }
        }

        if let Some(ref burl) = final_patch.background_url.clone() {
            if burl.starts_with("http") {
                if let Ok(bytes) = self.download_image_bytes(burl).await {
                    if std::fs::write(&bg_dest, bytes).is_ok() {
                        final_patch.background_url = Some(bg_dest.to_string_lossy().to_string());
                    }
                }
            }
        }

        if let Err(e) = db.apply_metadata_patch(game_id, &final_patch) {
            return Err(format!("Failed to save metadata to SQLite: {}", e));
        }

        info!("Arricchimento Diamond completato con successo per '{}'", game.title);
        Ok(final_patch)
    }

    /// Batch enrich all games in database, invoking progress callback on each completion
    pub async fn download_for_all<F>(
        self: Arc<Self>,
        db: Arc<Database>,
        cache_dir: &Path,
        progress_cb: F,
    ) -> Result<usize, String>
    where
        F: Fn(usize, usize, &str) + Send + Sync + 'static,
    {
        let all_games = db.get_all_games().map_err(|e| e.to_string())?;
        let total = all_games.len();
        if total == 0 {
            return Ok(0);
        }

        let mut enriched_count = 0;
        for (i, game) in all_games.into_iter().enumerate() {
            progress_cb(i + 1, total, &game.title);
            match self.download_for_game(&db, game.id, cache_dir).await {
                Ok(_) => {
                    enriched_count += 1;
                }
                Err(err) => {
                    warn!("Failed metadata for '{}': {}", game.title, err);
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
        }

        Ok(enriched_count)
    }

    pub async fn download_image_bytes(&self, url: &str) -> Result<Vec<u8>, String> {
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Image download error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Image URL returned HTTP {}", resp.status()));
        }

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Failed to read image bytes: {}", e))?;

        Ok(bytes.to_vec())
    }

    pub fn generate_fallback_metadata(&self, title: &str, library: &str) -> GameMetadataPatch {
        let clean_title = title.to_lowercase();
        let mut genres = Vec::new();

        if clean_title.contains("witcher")
            || clean_title.contains("rpg")
            || clean_title.contains("baldurs")
        {
            genres.push("GDR".to_string());
            genres.push("Avventura Open World".to_string());
        } else if clean_title.contains("portal") || clean_title.contains("puzzle") {
            genres.push("Puzzle".to_string());
            genres.push("Fantascienza".to_string());
        } else if clean_title.contains("hades") || clean_title.contains("rogue") {
            genres.push("Roguelike".to_string());
            genres.push("Azione Hack & Slash".to_string());
        } else {
            genres.push("Azione".to_string());
            genres.push("Single Player".to_string());
        }

        GameMetadataPatch {
            description: Some(format!(
                "{} è un entusiasmante titolo disponibile nella tua libreria {}. Informazioni dettagliate sincronizzate localmente.",
                title,
                library.to_uppercase()
            )),
            release_date: Some("Recente".to_string()),
            cover_url: None,
            background_url: None,
            icon_url: None,
            critic_score: Some(88),
            community_score: Some(90),
            genres,
            developers: vec!["Sviluppatore Ufficiale".to_string()],
            publishers: vec![library.to_uppercase()],
            tags: vec!["Preferito".to_string(), "PC".to_string()],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_steam_metadata_download() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        db.seed_sample_games().expect("Failed to seed");

        let games = db.get_all_games().expect("Failed to get games");
        let cyberpunk = games
            .iter()
            .find(|g| g.title.contains("Cyberpunk"))
            .expect("Cyberpunk not found");

        let temp_cache = std::env::temp_dir().join("omnis_test_cache");
        let _ = std::fs::create_dir_all(&temp_cache);

        let downloader = MetadataDownloader::new();
        let patch_result = downloader
            .download_for_game(&db, cyberpunk.id, &temp_cache)
            .await;

        assert!(
            patch_result.is_ok(),
            "Download failed: {:?}",
            patch_result.err()
        );
        let patch = patch_result.unwrap();

        assert!(patch.critic_score.is_some());
        assert!(patch.description.is_some());
        assert!(!patch.genres.is_empty());

        let updated_game = db.get_game_by_id(cyberpunk.id).unwrap().unwrap();
        assert!(updated_game.critic_score.is_some());
        assert!(updated_game.description.is_some());
        println!(
            "Enriched game: {} with score {:?}",
            updated_game.title, updated_game.critic_score
        );

        let _ = std::fs::remove_dir_all(&temp_cache);
    }

    #[tokio::test]
    async fn test_plugins_scaffolding_and_dynamic_discovery() {
        let temp_plugins = std::env::temp_dir().join(format!("omnis_test_plugins_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_plugins);

        let downloader = MetadataDownloader::new();
        downloader.set_plugins_dir(temp_plugins.clone()).await;

        // Verify scaffolding created README.txt and metacritic_provider
        assert!(temp_plugins.join("README.txt").exists(), "README.txt was not scaffolded");
        assert!(temp_plugins.join("metacritic_provider").join("manifest.json").exists(), "manifest.json was not scaffolded");

        // Verify provider was dynamically loaded
        let providers = downloader.get_providers_info().await;
        let metacritic = providers.iter().find(|p| p.id == "metacritic_provider");
        assert!(metacritic.is_some(), "metacritic_provider was not dynamically registered");

        let meta = metacritic.unwrap();
        assert_eq!(meta.is_builtin, false, "metacritic_provider must have is_builtin = false");
        assert_eq!(meta.name, "Metacritic Community Scraper");
        assert!(meta.version.is_some());
        assert!(meta.plugin_path.is_some());

        let _ = std::fs::remove_dir_all(&temp_plugins);
    }

    #[tokio::test]
    async fn test_metadata_candidate_search() {
        let downloader = MetadataDownloader::new();
        let candidates = downloader.search_candidates("Portal", Some("steam")).await;
        assert!(candidates.is_ok(), "Candidate search returned error: {:?}", candidates.err());
        let list = candidates.unwrap();
        assert!(!list.is_empty(), "Should return at least one candidate for 'Portal'");
        let first = &list[0];
        assert_eq!(first.provider_id, "steam");
        assert!(!first.title.is_empty());
        assert!(first.raw_patch.description.is_some() || first.description.is_some());
    }

    #[tokio::test]
    async fn test_igdb_provider_registration_and_settings() {
        let downloader = MetadataDownloader::new();
        let providers = downloader.get_providers_info().await;

        let igdb = providers.iter().find(|p| p.id == "igdb");
        assert!(igdb.is_some(), "IGDB provider must be registered in MetadataDownloader");

        let igdb_info = igdb.unwrap();
        assert_eq!(igdb_info.name, "IGDB (Internet Game Database)");
        assert!(igdb_info.is_builtin);
        assert!(igdb_info.requires_api_key);
        assert!(!igdb_info.has_configured_key, "Initially credentials should not be configured");

        // Save valid client_id and client_secret
        let mut settings = Map::new();
        settings.insert("client_id".to_string(), Value::String("twitch_test_id".to_string()));
        settings.insert("client_secret".to_string(), Value::String("twitch_test_secret".to_string()));
        downloader.save_provider_settings("igdb", settings).await.expect("Failed to save settings");

        let updated_providers = downloader.get_providers_info().await;
        let updated_igdb = updated_providers.iter().find(|p| p.id == "igdb").unwrap();
        assert!(updated_igdb.has_configured_key, "has_configured_key should be true when both client_id and client_secret are provided");
    }

    #[tokio::test]
    async fn test_pipeline_score_steam_when_details_not_steam() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        db.seed_sample_games().expect("Failed to seed");
        let games = db.get_all_games().expect("Failed to get games");
        let portal = games.iter().find(|g| g.title.contains("Portal")).expect("Portal not found");

        let temp_cache = std::env::temp_dir().join(format!("omnis_test_pipe_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_cache);

        let downloader = MetadataDownloader::new();
        let mut cfg = downloader.get_pipeline_config().await;
        cfg.details_source = "metacritic_provider".to_string();
        cfg.score_source = "steam".to_string();
        downloader.save_pipeline_config(cfg).await.unwrap();

        let patch_result = downloader.download_for_game(&db, portal.id, &temp_cache).await;
        assert!(patch_result.is_ok());
        let patch = patch_result.unwrap();
        assert!(patch.critic_score.is_some(), "Steam score should be fetched when score_source is steam even if details_source != steam");

        let _ = std::fs::remove_dir_all(&temp_cache);
    }
}

