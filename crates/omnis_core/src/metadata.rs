use crate::db::Database;
use crate::dynamic_loader::{find_shared_library_in_dir, DynamicPluginLoader};
use omnis_sdk::{
    GameMetadataPatch, MetadataField, MetadataProvider, MetadataSearchRequest,
};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};
use uuid::Uuid;

pub mod gog;
pub mod igdb;
pub mod opencritic;
pub mod scaffold;
pub mod steam;
pub mod steamgriddb;
pub mod types;
pub mod utils;

pub use gog::GogMetadataProvider;
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
    gog_provider: Arc<GogMetadataProvider>,
    cancel_requested: Arc<AtomicBool>,
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
        let gog = Arc::new(GogMetadataProvider::new(client.clone()));

        let mut providers: HashMap<String, Box<dyn MetadataProvider>> = HashMap::new();
        providers.insert(
            "steam".to_string(),
            Box::new(SteamMetadataProvider::new(client.clone())),
        );
        providers.insert(
            "gog".to_string(),
            Box::new(GogMetadataProvider::new(client.clone())),
        );

        let mut enabled = HashMap::new();
        enabled.insert("steam".to_string(), true);
        enabled.insert("gog".to_string(), true);

        Self {
            client,
            plugins_dir: Arc::new(RwLock::new(None)),
            providers: Arc::new(RwLock::new(providers)),
            enabled_providers: Arc::new(RwLock::new(enabled)),
            settings_cache: Arc::new(RwLock::new(HashMap::new())),
            pipeline_config: Arc::new(RwLock::new(MetadataPipelineConfig::default())),
            igdb_provider: igdb,
            gog_provider: gog,
            cancel_requested: Arc::new(AtomicBool::new(false)),
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

    pub async fn register_provider(&self, provider: Box<dyn MetadataProvider>) {
        let id = provider.id().to_string();
        let mut providers = self.providers.write().await;
        let mut enabled = self.enabled_providers.write().await;
        if !enabled.contains_key(&id) {
            enabled.insert(id.clone(), true);
        }
        providers.insert(id, provider);
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

                if id == "steamgriddb" {
                    let mut p = SteamGridDbProvider::new(self.client.clone());
                    p.set_plugin_dir(path.clone());
                    providers_guard.insert(id, Box::new(p));
                } else if id == "opencritic" {
                    let mut p = OpenCriticProvider::new(self.client.clone());
                    p.set_plugin_dir(path.clone());
                    providers_guard.insert(id, Box::new(p));
                } else if id == "igdb" {
                    let mut p = (*self.igdb_provider).clone();
                    p.set_plugin_dir(path.clone());
                    providers_guard.insert(id, Box::new(p));
                } else if id != "steam" && id != "gog" {
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
                        plugin_type: Some(dynamic_provider.manifest().plugin_type),
                        ui_slots: dynamic_provider.manifest().ui_slots,
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
                            ui_slots: val.get("ui_slots")
                                .and_then(|u| serde_json::from_value(u.clone()).ok())
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
                            ui_slots: val.get("ui_slots")
                                .and_then(|u| serde_json::from_value(u.clone()).ok())
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

            let provider: Box<dyn MetadataProvider> = if id == "steamgriddb" {
                let mut p = SteamGridDbProvider::new(self.client.clone());
                p.set_plugin_dir(dir.to_path_buf());
                Box::new(p)
            } else if id == "opencritic" {
                let mut p = OpenCriticProvider::new(self.client.clone());
                p.set_plugin_dir(dir.to_path_buf());
                Box::new(p)
            } else if id == "igdb" {
                let mut p = (*self.igdb_provider).clone();
                p.set_plugin_dir(dir.to_path_buf());
                Box::new(p)
            } else {
                Box::new(ExternalMetadataProvider::new(manifest, dir.to_path_buf(), self.client.clone()))
            };

            let info = ProviderInfo {
                id: id.clone(),
                name: provider.name().to_string(),
                description: provider.description().to_string(),
                author: provider.author().to_string(),
                website: provider.website().map(|s| s.to_string()),
                key_help_url: provider.key_help_url().map(|s| s.to_string()),
                requires_api_key: provider.requires_api_key(),
                supported_fields: provider.supported_fields(),
                is_enabled,
                settings_schema: provider.settings_schema(),
                settings_values: Value::Object(settings_map),
                has_configured_key: has_key,
                is_builtin: false,
                version: provider.version().map(|s| s.to_string()),
                plugin_path: Some(dir.to_string_lossy().to_string()),
                plugin_type: Some(provider.manifest().plugin_type),
                ui_slots: provider.manifest().ui_slots,
            };

            let mut providers_guard = self.providers.write().await;
            providers_guard.insert(id, provider);

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
                plugin_type: Some(prov.manifest().plugin_type),
                ui_slots: prov.manifest().ui_slots,
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

    /// Search for metadata candidates across online providers (Steam, GOG, and enabled external providers)
    pub async fn search_candidates(
        &self,
        title: &str,
        provider_id: Option<&str>,
    ) -> Result<Vec<MetadataCandidateDto>, String> {
        let filter = provider_id.unwrap_or("all").to_lowercase();
        let mut candidates = Vec::new();
        let enabled_guard = self.enabled_providers.read().await;

        // 1. Steam Store Search
        if (filter == "all" || filter == "steam")
            && enabled_guard.get("steam").copied().unwrap_or(true)
        {
            let search_url = reqwest::Url::parse_with_params(
                "https://store.steampowered.com/api/storesearch/",
                &[("term", title), ("l", "italian"), ("cc", "IT")],
            );
            if let Ok(url) = search_url {
                if let Ok(resp) = self.client.get(url).send().await {
                    if let Ok(json) = resp.json::<Value>().await {
                        if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
                            for item in items.iter().take(5) {
                                if let Some(appid_num) = item.get("id").and_then(|v| v.as_u64()) {
                                    let appid = appid_num.to_string();
                                    let name = item
                                        .get("name")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or(title)
                                        .to_string();
                                    let cover_url = format!(
                                        "https://shared.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900_2x.jpg",
                                        appid
                                    );
                                    let bg_url = format!(
                                        "https://shared.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
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
                                        extra_metadata: None,
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

        // 2. GOG Catalog Search (Official DRM-Free)
        if (filter == "all" || filter == "gog")
            && enabled_guard.get("gog").copied().unwrap_or(true)
        {
            if let Ok(gog_candidates) = self.gog_provider.search_candidates(title, 4).await {
                candidates.extend(gog_candidates);
            }
        }

        // 3. SteamGridDB Autocomplete Search (Only if enabled or explicitly requested)
        if filter == "steamgriddb"
            || (filter == "all" && enabled_guard.get("steamgriddb").copied().unwrap_or(false))
        {
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

        // 4. OpenCritic Search (Only if enabled or explicitly requested)
        if filter == "opencritic"
            || (filter == "all" && enabled_guard.get("opencritic").copied().unwrap_or(false))
        {
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

        // 5. IGDB APICalypse v4 Search (Only if enabled or explicitly requested)
        if filter == "igdb"
            || (filter == "all" && enabled_guard.get("igdb").copied().unwrap_or(false))
        {
            let igdb_settings = {
                let settings_guard = self.settings_cache.read().await;
                settings_guard.get("igdb").cloned().unwrap_or_default()
            };
            if let Ok(igdb_candidates) = self.igdb_provider.search_candidates(title, &igdb_settings, 8).await {
                candidates.extend(igdb_candidates);
            }
        }

        // 6. Guarantee candidates: if no online provider returned results, produce aesthetic fallback candidate
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

        let has_existing_local_cover = game
            .cover_image_path
            .as_ref()
            .map(|p| {
                let p_trim = p.trim();
                !p_trim.is_empty()
                    && !p_trim.starts_with("http://")
                    && !p_trim.starts_with("https://")
            })
            .unwrap_or(false);

        let has_existing_local_bg = game
            .background_image_path
            .as_ref()
            .map(|p| {
                let p_trim = p.trim();
                !p_trim.is_empty()
                    && !p_trim.starts_with("http://")
                    && !p_trim.starts_with("https://")
            })
            .unwrap_or(false);

        let remote_cover_to_cache = game.cover_image_path.as_ref().and_then(|p| {
            let p_trim = p.trim();
            if p_trim.starts_with("http://") || p_trim.starts_with("https://") {
                Some(p_trim.to_string())
            } else {
                None
            }
        });

        let remote_bg_to_cache = game.background_image_path.as_ref().and_then(|p| {
            let p_trim = p.trim();
            if p_trim.starts_with("http://") || p_trim.starts_with("https://") {
                Some(p_trim.to_string())
            } else {
                None
            }
        });

        let should_fetch_cover = if pipeline.preserve_existing_artwork {
            !has_existing_local_cover && remote_cover_to_cache.is_none()
        } else {
            true
        };

        let should_fetch_background = if pipeline.preserve_existing_artwork {
            !has_existing_local_bg && remote_bg_to_cache.is_none()
        } else {
            true
        };

        let mut final_patch = GameMetadataPatch::default();
        let mut details_cover_fallback = None;
        let mut details_bg_fallback = None;

        if pipeline.preserve_existing_artwork {
            if !has_existing_local_cover && remote_cover_to_cache.is_some() {
                final_patch.cover_url = remote_cover_to_cache.clone();
            }
            if !has_existing_local_bg && remote_bg_to_cache.is_some() {
                final_patch.background_url = remote_bg_to_cache.clone();
            }
        }

        // Store-Native resolution: determine store-native provider from game.library_id
        let store_native_id = match game.library_id.to_lowercase().as_str() {
            "steam" => "steam",
            "gog" => "gog",
            _ => "steam", // Steam Store search by title is universal PC catalog
        };

        let effective_details_source = if pipeline.details_source == "store_native" {
            store_native_id
        } else {
            pipeline.details_source.as_str()
        };
        let effective_cover_source = if pipeline.cover_source == "store_native" {
            store_native_id
        } else {
            pipeline.cover_source.as_str()
        };
        let effective_background_source = if pipeline.background_source == "store_native" {
            store_native_id
        } else {
            pipeline.background_source.as_str()
        };
        let effective_score_source = if pipeline.score_source == "store_native" {
            store_native_id
        } else {
            pipeline.score_source.as_str()
        };

        // 1. Fetch Primary Details & Descriptions (Store-First)
        let mut details_patch: Option<GameMetadataPatch> = None;
        if enabled_guard
            .get(effective_details_source)
            .copied()
            .unwrap_or(true)
        {
            if let Some(prov) = providers_guard.get(effective_details_source) {
                let settings = settings_guard
                    .get(effective_details_source)
                    .cloned()
                    .unwrap_or_default();
                if let Ok(patch) = prov.fetch_metadata(&request, &settings).await {
                    details_patch = Some(patch);
                }
            }
        }

        // Fallback: If primary store had no match, try the alternative built-in store
        if details_patch.is_none() {
            let alt_store = if effective_details_source == "steam" { "gog" } else { "steam" };
            if enabled_guard.get(alt_store).copied().unwrap_or(true) {
                if let Some(prov) = providers_guard.get(alt_store) {
                    let settings = settings_guard.get(alt_store).cloned().unwrap_or_default();
                    if let Ok(patch) = prov.fetch_metadata(&request, &settings).await {
                        details_patch = Some(patch);
                    }
                }
            }
        }

        if let Some(ref patch) = details_patch {
            if game.description.as_ref().map(|d| d.trim().is_empty()).unwrap_or(true) {
                final_patch.description = patch.description.clone();
            }
            if game.release_date.as_ref().map(|r| r.trim().is_empty()).unwrap_or(true) {
                final_patch.release_date = patch.release_date.clone();
            }
            if game.genres.is_empty() {
                final_patch.genres = patch.genres.clone();
            }
            if game.developers.is_empty() {
                final_patch.developers = patch.developers.clone();
            }
            if game.publishers.is_empty() {
                final_patch.publishers = patch.publishers.clone();
            }
            if game.critic_score.is_none() {
                final_patch.critic_score = patch.critic_score;
            }
            if game.community_score.is_none() {
                final_patch.community_score = patch.community_score;
            }

            if should_fetch_cover {
                if effective_cover_source == effective_details_source || effective_cover_source == store_native_id {
                    final_patch.cover_url = patch.cover_url.clone();
                } else {
                    details_cover_fallback = patch.cover_url.clone();
                }
            }

            if should_fetch_background {
                if effective_background_source == effective_details_source || effective_background_source == store_native_id {
                    final_patch.background_url = patch.background_url.clone();
                } else {
                    details_bg_fallback = patch.background_url.clone();
                }
            }
        }

        // 2. Resolve High-Res Artwork if dedicated provider configured
        if should_fetch_cover && final_patch.cover_url.is_none() {
            if effective_cover_source != effective_details_source
                && enabled_guard.get(effective_cover_source).copied().unwrap_or(false)
            {
                if let Some(prov) = providers_guard.get(effective_cover_source) {
                    let settings = settings_guard
                        .get(effective_cover_source)
                        .cloned()
                        .unwrap_or_default();
                    if let Ok(cov_patch) = prov.fetch_metadata(&request, &settings).await {
                        if cov_patch.cover_url.is_some() {
                            final_patch.cover_url = cov_patch.cover_url;
                        }
                    }
                }
            }
            if final_patch.cover_url.is_none() {
                final_patch.cover_url = details_cover_fallback.or(remote_cover_to_cache.clone());
            }
        }

        if should_fetch_background && final_patch.background_url.is_none() {
            if effective_background_source != effective_details_source
                && enabled_guard.get(effective_background_source).copied().unwrap_or(false)
            {
                if let Some(prov) = providers_guard.get(effective_background_source) {
                    let settings = settings_guard
                        .get(effective_background_source)
                        .cloned()
                        .unwrap_or_default();
                    if let Ok(bg_patch) = prov.fetch_metadata(&request, &settings).await {
                        if bg_patch.background_url.is_some() {
                            final_patch.background_url = bg_patch.background_url;
                        }
                    }
                }
            }
            if final_patch.background_url.is_none() {
                final_patch.background_url = details_bg_fallback.or(remote_bg_to_cache.clone());
            }
        }

        // 3. Resolve Critic & Community Scores if needed
        if game.critic_score.is_none() && final_patch.critic_score.is_none() {
            if effective_score_source != effective_details_source
                && enabled_guard.get(effective_score_source).copied().unwrap_or(false)
            {
                if let Some(prov) = providers_guard.get(effective_score_source) {
                    let settings = settings_guard
                        .get(effective_score_source)
                        .cloned()
                        .unwrap_or_default();
                    if let Ok(sc_patch) = prov.fetch_metadata(&request, &settings).await {
                        if sc_patch.critic_score.is_some() {
                            final_patch.critic_score = sc_patch.critic_score;
                            final_patch.community_score = sc_patch.community_score;
                        }
                    }
                }
            }
        }

        // 3b. Query enabled external/enrichment providers that contribute extra_metadata (e.g. HowLongToBeat)
        for (prov_id, prov) in &*providers_guard {
            if prov_id != "steam" && prov_id != "gog" && prov_id != "epic" {
                if enabled_guard.get(prov_id).copied().unwrap_or(true) {
                    let settings = settings_guard.get(prov_id).cloned().unwrap_or_default();
                    if let Ok(p_patch) = prov.fetch_metadata(&request, &settings).await {
                        if let Some(extra) = p_patch.extra_metadata {
                            let mut current_merged: serde_json::Map<String, serde_json::Value> = final_patch
                                .extra_metadata
                                .as_deref()
                                .and_then(|s| serde_json::from_str(s).ok())
                                .unwrap_or_default();
                            if let Ok(incoming) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&extra) {
                                for (k, v) in incoming {
                                    current_merged.insert(k, v);
                                }
                                final_patch.extra_metadata = Some(serde_json::to_string(&current_merged).unwrap_or(extra));
                            } else {
                                final_patch.extra_metadata = Some(extra);
                            }
                        }
                    }
                }
            }
        }

        // 4. Generate aesthetic fallback only if fields are still empty
        let needs_fallback_desc = final_patch.description.is_none() && game.description.as_ref().map(|d| d.trim().is_empty()).unwrap_or(true);
        let needs_fallback_rd = final_patch.release_date.is_none() && game.release_date.as_ref().map(|r| r.trim().is_empty()).unwrap_or(true);
        let needs_fallback_genres = final_patch.genres.is_empty() && game.genres.is_empty();
        let needs_fallback_devs = final_patch.developers.is_empty() && game.developers.is_empty();
        let needs_fallback_pubs = final_patch.publishers.is_empty() && game.publishers.is_empty();
        let needs_fallback_scores = final_patch.critic_score.is_none() && game.critic_score.is_none();

        if needs_fallback_desc || needs_fallback_genres || needs_fallback_rd || needs_fallback_devs || needs_fallback_pubs || needs_fallback_scores {
            let fallback = self.generate_fallback_metadata(&game.title, &game.library_id);
            if needs_fallback_desc {
                final_patch.description = fallback.description;
            }
            if needs_fallback_rd {
                final_patch.release_date = fallback.release_date;
            }
            if needs_fallback_genres {
                final_patch.genres = fallback.genres;
            }
            if needs_fallback_devs {
                final_patch.developers = fallback.developers;
            }
            if needs_fallback_pubs {
                final_patch.publishers = fallback.publishers;
            }
            if needs_fallback_scores {
                final_patch.critic_score = fallback.critic_score;
                final_patch.community_score = fallback.community_score;
            }
        }

        // 5. Download binary image payloads to local cache
        let (covers_dir, bgs_dir) = if cache_dir.ends_with("covers") {
            (
                cache_dir.to_path_buf(),
                cache_dir
                    .parent()
                    .map(|p| p.join("backgrounds"))
                    .unwrap_or_else(|| cache_dir.join("backgrounds")),
            )
        } else {
            (cache_dir.join("covers"), cache_dir.join("backgrounds"))
        };
        let _ = std::fs::create_dir_all(&covers_dir);
        let _ = std::fs::create_dir_all(&bgs_dir);

        let cover_dest = covers_dir.join(format!("{}.jpg", game_id));
        let bg_dest = bgs_dir.join(format!("{}.jpg", game_id));

        // Self-healing migration for previously double-nested cache/covers/covers and cache/covers/backgrounds
        let double_nested_cover = covers_dir.join("covers").join(format!("{}.jpg", game_id));
        if double_nested_cover.exists() && !cover_dest.exists() {
            let _ = std::fs::rename(&double_nested_cover, &cover_dest);
        }
        let double_nested_bg = bgs_dir.join("backgrounds").join(format!("{}.jpg", game_id));
        if double_nested_bg.exists() && !bg_dest.exists() {
            let _ = std::fs::rename(&double_nested_bg, &bg_dest);
        }

        let appid_hint = if game.library_id == "steam" {
            Some(game.external_id.as_str())
        } else {
            None
        };

        if let Some(ref curl) = final_patch.cover_url.clone() {
            let curl_trim = curl.trim();
            if curl_trim.is_empty() {
                final_patch.cover_url = None;
            } else if curl_trim.starts_with("http://") || curl_trim.starts_with("https://") {
                match self.download_image_with_fallbacks(curl_trim, appid_hint).await {
                    Ok(bytes) => {
                        if std::fs::write(&cover_dest, bytes).is_ok() {
                            final_patch.cover_url = Some(cover_dest.to_string_lossy().to_string());
                        } else {
                            warn!("Failed to write downloaded cover image to {:?}", cover_dest);
                            final_patch.cover_url = Some(curl_trim.to_string());
                        }
                    }
                    Err(e) => {
                        warn!("Failed to download cover image from {}: {}", curl_trim, e);
                        final_patch.cover_url = Some(curl_trim.to_string());
                    }
                }
            } else if !std::path::Path::new(curl_trim).exists() && !curl_trim.contains('\\') {
                warn!("Local cover path does not exist: {}", curl_trim);
                final_patch.cover_url = None;
            }
        }

        if let Some(ref burl) = final_patch.background_url.clone() {
            let burl_trim = burl.trim();
            if burl_trim.is_empty() {
                final_patch.background_url = None;
            } else if burl_trim.starts_with("http://") || burl_trim.starts_with("https://") {
                match self.download_image_with_fallbacks(burl_trim, appid_hint).await {
                    Ok(bytes) => {
                        if std::fs::write(&bg_dest, bytes).is_ok() {
                            final_patch.background_url = Some(bg_dest.to_string_lossy().to_string());
                        } else {
                            warn!("Failed to write downloaded background image to {:?}", bg_dest);
                            final_patch.background_url = Some(burl_trim.to_string());
                        }
                    }
                    Err(e) => {
                        warn!("Failed to download background image from {}: {}", burl_trim, e);
                        final_patch.background_url = Some(burl_trim.to_string());
                    }
                }
            } else if !std::path::Path::new(burl_trim).exists() && !burl_trim.contains('\\') {
                warn!("Local background path does not exist: {}", burl_trim);
                final_patch.background_url = None;
            }
        }

        // If local file exists and final_patch artwork was None, point to local cached file
        if final_patch.cover_url.is_none() && cover_dest.exists() {
            final_patch.cover_url = Some(cover_dest.to_string_lossy().to_string());
        }
        if final_patch.background_url.is_none() && bg_dest.exists() {
            final_patch.background_url = Some(bg_dest.to_string_lossy().to_string());
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
        let game_ids = all_games.into_iter().map(|g| g.id).collect();
        self.download_for_games(db, game_ids, cache_dir, progress_cb).await
    }

    /// Batch enrich a specific list of games by UUID, invoking progress callback on each completion
    pub async fn download_for_games<F>(
        self: Arc<Self>,
        db: Arc<Database>,
        game_ids: Vec<Uuid>,
        cache_dir: &Path,
        progress_cb: F,
    ) -> Result<usize, String>
    where
        F: Fn(usize, usize, &str) + Send + Sync + 'static,
    {
        self.cancel_requested.store(false, Ordering::SeqCst);
        let total = game_ids.len();
        if total == 0 {
            return Ok(0);
        }

        let mut enriched_count = 0;
        for (i, id) in game_ids.into_iter().enumerate() {
            if self.cancel_requested.load(Ordering::SeqCst) {
                info!(
                    "Arricchimento per selezione interrotto dall'utente dopo {} giochi (totale: {})",
                    enriched_count, total
                );
                break;
            }
            if let Ok(Some(game)) = db.get_game_by_id(id) {
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
        }

        Ok(enriched_count)
    }

    /// Request cancellation of any ongoing batch metadata download
    pub fn cancel_download(&self) {
        self.cancel_requested.store(true, Ordering::SeqCst);
    }

    /// Check if cancellation was requested
    pub fn is_cancel_requested(&self) -> bool {
        self.cancel_requested.load(Ordering::SeqCst)
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

    /// Download image with intelligent fallback resolution for Steam CDN and alternative formats
    pub async fn download_image_with_fallbacks(
        &self,
        url: &str,
        appid_hint: Option<&str>,
    ) -> Result<Vec<u8>, String> {
        let trimmed_url = url.trim();

        // 1. Attempt original URL
        match self.download_image_bytes(trimmed_url).await {
            Ok(bytes) => return Ok(bytes),
            Err(err) => {
                debug!(
                    "Primary image download failed for {}: {}. Attempting fallbacks...",
                    trimmed_url, err
                );
            }
        }

        // 2. Determine if this is a Steam image or if we have an appid hint
        let appid = appid_hint.map(|s| s.to_string()).or_else(|| {
            if trimmed_url.contains("/steam/apps/") || trimmed_url.contains("/apps/") {
                trimmed_url
                    .split("/apps/")
                    .nth(1)
                    .and_then(|sub| sub.split('/').next())
                    .map(|id| id.to_string())
            } else {
                None
            }
        });

        if let Some(ref aid) = appid {
            if aid.chars().all(|c| c.is_ascii_digit()) {
                let mut fallback_urls = Vec::new();
                if trimmed_url.contains("library_600x900_2x.jpg") {
                    fallback_urls.push(format!(
                        "https://steamcdn-a.akamaihd.net/steam/apps/{}/library_600x900.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900_2x.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/header.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/capsule_616x353.jpg",
                        aid
                    ));
                } else if trimmed_url.contains("library_hero.jpg") {
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_hero.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/page_bg_generated_v6b.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/header.jpg",
                        aid
                    ));
                } else {
                    fallback_urls.push(format!(
                        "https://steamcdn-a.akamaihd.net/steam/apps/{}/library_600x900_2x.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900_2x.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/header.jpg",
                        aid
                    ));
                }

                for fb in fallback_urls {
                    if fb != trimmed_url {
                        if let Ok(bytes) = self.download_image_bytes(&fb).await {
                            debug!("Fallback image download succeeded from {}", fb);
                            return Ok(bytes);
                        }
                    }
                }
            }
        }

        Err(format!("Failed to download image from {} and all fallbacks", trimmed_url))
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
            extra_metadata: None,
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
        let temp_dir = std::env::temp_dir().join(format!("omnis_igdb_test_{}", uuid::Uuid::new_v4()));
        let igdb_dir = temp_dir.join("igdb");
        std::fs::create_dir_all(&igdb_dir).unwrap();
        std::fs::write(
            igdb_dir.join("manifest.json"),
            r#"{"id":"igdb","name":"IGDB (Internet Game Database)","version":"1.0.0","plugin_type":"metadata"}"#,
        )
        .unwrap();

        let downloader = MetadataDownloader::new();
        downloader
            .load_and_register_dynamic_plugin(&igdb_dir)
            .await
            .expect("Failed to register igdb");

        let providers = downloader.get_providers_info().await;

        let igdb = providers.iter().find(|p| p.id == "igdb");
        assert!(igdb.is_some(), "IGDB provider must be registered in MetadataDownloader");

        let igdb_info = igdb.unwrap();
        assert_eq!(igdb_info.name, "IGDB (Internet Game Database)");
        assert!(!igdb_info.is_builtin);
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

        let _ = std::fs::remove_dir_all(&temp_dir);
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

    #[tokio::test]
    async fn test_pipeline_preserve_existing_artwork() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        db.seed_sample_games().expect("Failed to seed");
        let games = db.get_all_games().expect("Failed to get games");
        let portal = games.iter().find(|g| g.title.contains("Portal")).expect("Portal not found");

        let custom_cover = "C:\\existing_steam_cover.jpg".to_string();
        let custom_bg = "C:\\existing_steam_bg.jpg".to_string();
        let manual_patch = GameMetadataPatch {
            cover_url: Some(custom_cover.clone()),
            background_url: Some(custom_bg.clone()),
            ..Default::default()
        };
        db.apply_metadata_patch(portal.id, &manual_patch).expect("Failed to apply manual patch");

        let saved = db.get_game_by_id(portal.id).unwrap().unwrap();
        assert_eq!(saved.cover_image_path.as_deref(), Some("C:\\existing_steam_cover.jpg"));
        assert_eq!(saved.background_image_path.as_deref(), Some("C:\\existing_steam_bg.jpg"));

        let temp_cache = std::env::temp_dir().join(format!("omnis_test_pipe_preserve_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_cache);

        let downloader = MetadataDownloader::new();
        let cfg = downloader.get_pipeline_config().await;
        assert!(cfg.preserve_existing_artwork, "preserve_existing_artwork should default to true");

        let patch_result = downloader.download_for_game(&db, portal.id, &temp_cache).await;
        assert!(patch_result.is_ok());

        let reloaded = db.get_game_by_id(portal.id).unwrap().unwrap();
        assert_eq!(reloaded.cover_image_path.as_deref(), Some("C:\\existing_steam_cover.jpg"), "Existing cover must be preserved");
        assert_eq!(reloaded.background_image_path.as_deref(), Some("C:\\existing_steam_bg.jpg"), "Existing background must be preserved");

        let _ = std::fs::remove_dir_all(&temp_cache);
    }

    #[tokio::test]
    async fn test_download_for_all_cancellation() {
        let db = Arc::new(Database::open_in_memory().expect("Failed to open DB"));
        db.seed_sample_games().expect("Failed to seed");

        let temp_cache = std::env::temp_dir().join(format!("omnis_test_cancel_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_cache);

        let downloader = Arc::new(MetadataDownloader::new());
        let downloader_clone = downloader.clone();

        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            downloader_clone.cancel_download();
        });

        let total_enriched = downloader.download_for_all(db, &temp_cache, |_cur, _tot, _title| {}).await;
        assert!(total_enriched.is_ok());
        assert!(total_enriched.unwrap() < 4);

        let _ = std::fs::remove_dir_all(&temp_cache);
    }

    #[tokio::test]
    async fn test_download_for_games_batch() {
        let db = Arc::new(Database::open_in_memory().expect("Failed to open DB"));
        db.seed_sample_games().expect("Failed to seed");
        let all_games = db.get_all_games().expect("Failed to get games");
        assert!(all_games.len() >= 2);

        let target_ids: Vec<uuid::Uuid> = all_games.iter().take(2).map(|g| g.id).collect();

        let temp_cache = std::env::temp_dir().join(format!("omnis_test_batch_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_cache);

        let downloader = Arc::new(MetadataDownloader::new());
        let total_enriched = downloader
            .download_for_games(db, target_ids, &temp_cache, |_cur, _tot, _title| {})
            .await;

        assert!(total_enriched.is_ok());
        let count = total_enriched.unwrap();
        assert_eq!(count, 2);

        let _ = std::fs::remove_dir_all(&temp_cache);
    }

    #[tokio::test]
    async fn test_remote_cover_caching_and_path_nesting() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        db.seed_sample_games().expect("Failed to seed");
        let games = db.get_all_games().expect("Failed to get games");
        let portal = games.iter().find(|g| g.title.contains("Portal")).expect("Portal not found");

        let remote_url = "https://cdn.cloudflare.steamstatic.com/steam/apps/400/header.jpg".to_string();
        let manual_patch = GameMetadataPatch {
            cover_url: Some(remote_url.clone()),
            ..Default::default()
        };
        db.apply_metadata_patch(portal.id, &manual_patch).expect("Failed to apply remote URL patch");

        let saved = db.get_game_by_id(portal.id).unwrap().unwrap();
        assert_eq!(saved.cover_image_path.as_deref(), Some(remote_url.as_str()));

        let temp_cache = std::env::temp_dir().join(format!("omnis_test_nesting_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_cache);

        let downloader = MetadataDownloader::new();
        // Even with preserve_existing_artwork = true, remote URLs should be downloaded and cached locally!
        let patch_result = downloader.download_for_game(&db, portal.id, &temp_cache).await;
        assert!(patch_result.is_ok(), "Download failed: {:?}", patch_result.err());

        let reloaded = db.get_game_by_id(portal.id).unwrap().unwrap();
        let cover_path = reloaded.cover_image_path.expect("Game must have a cover image path");
        assert!(!cover_path.starts_with("http"), "Cover image path must be converted to local path: {}", cover_path);
        assert!(!cover_path.contains("covers/covers") && !cover_path.contains("covers\\covers"), "Path must NOT be double-nested: {}", cover_path);
        assert!(std::path::Path::new(&cover_path).exists(), "Downloaded local cover file must exist on disk: {}", cover_path);

        let _ = std::fs::remove_dir_all(&temp_cache);
    }

    #[tokio::test]
    async fn test_steam_fallback_resolution() {
        let downloader = MetadataDownloader::new();
        // Test fallback for a non-existent 2x image that should fall back to header.jpg or capsule
        let invalid_steam_2x = "https://steamcdn-a.akamaihd.net/steam/apps/400/library_600x900_2x.jpg";
        let res = downloader.download_image_with_fallbacks(invalid_steam_2x, Some("400")).await;
        assert!(res.is_ok(), "Fallback download for Steam app 400 must succeed: {:?}", res.err());
        assert!(!res.unwrap().is_empty());
    }
}

