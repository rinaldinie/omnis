use async_trait::async_trait;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use serde_json::{Map, Value};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use crate::dynamic_loader::{find_shared_library_in_dir, DynamicPluginLoader};
use omnis_sdk::{MetadataField, MetadataProvider, MetadataSearchRequest};

use super::scaffold;
use super::types::*;
use super::utils::*;
use super::MetadataDownloader;

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
    async fn save_provider_settings(&self, provider_id: &str, settings: Map<String, Value>) -> Result<(), String>;
    async fn toggle_provider(&self, provider_id: &str, enabled: bool) -> Result<(), String>;
    async fn test_provider_connection(&self, provider_id: &str) -> Result<String, String>;
    async fn get_pipeline_config(&self) -> MetadataPipelineConfig;
    async fn save_pipeline_config(&self, config: MetadataPipelineConfig) -> Result<(), String>;
}

impl MetadataDownloader {
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
                    let provider =
                        ExternalMetadataProvider::new(manifest, path, self.client.clone());
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

    /// Fetches completion times from HowLongToBeat from source/API for a game title.
    pub async fn fetch_hltb_times(&self, title: &str) -> (String, String, String) {
        let providers_guard = self.providers.read().await;
        if let Some(prov) = providers_guard.get("howlongtobeat") {
            let request = MetadataSearchRequest {
                title: title.to_string(),
                external_id: None,
                library_id: "all".to_string(),
            };
            let settings_guard = self.settings_cache.read().await;
            let settings = settings_guard
                .get("howlongtobeat")
                .cloned()
                .unwrap_or_default();
            if let Ok(patch) = prov.fetch_metadata(&request, &settings).await {
                if let Some(extra_str) = patch.extra_metadata {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&extra_str) {
                        if let Some(hltb) = v.get("howlongtobeat") {
                            let main_s = hltb
                                .get("main_story")
                                .and_then(|x| x.as_str())
                                .unwrap_or("N/D")
                                .to_string();
                            let extra_s = hltb
                                .get("main_extra")
                                .and_then(|x| x.as_str())
                                .unwrap_or("N/D")
                                .to_string();
                            let comp_s = hltb
                                .get("completionist")
                                .and_then(|x| x.as_str())
                                .unwrap_or("N/D")
                                .to_string();
                            return (main_s, extra_s, comp_s);
                        }
                    }
                }
            }
        }
        ExternalMetadataProvider::fallback_hltb_times(title)
    }

    /// Dynamically load and hot-register a native or manifest-based plugin from a library or directory
    pub async fn load_and_register_dynamic_plugin(
        &self,
        path: &Path,
    ) -> Result<ProviderInfo, String> {
        let library_path = if path.is_file() {
            Some(path.to_path_buf())
        } else if path.is_dir() {
            find_shared_library_in_dir(path)
        } else {
            return Err(format!(
                "Il percorso specificato non esiste: {}",
                path.display()
            ));
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
                    tracing::warn!(
                        "Errore nel caricamento nativo da {}: {}",
                        lib_path.display(),
                        e
                    );
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
                        let name = val
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or(&id)
                            .to_string();
                        let version = val
                            .get("version")
                            .and_then(|v| v.as_str())
                            .unwrap_or("1.0.0")
                            .to_string();
                        let author = val
                            .get("author")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Omnis Community")
                            .to_string();
                        let description = val
                            .get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let plugin_type = val
                            .get("plugin_type")
                            .or_else(|| val.get("type"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("metadata")
                            .to_string();
                        Some(PluginManifest {
                            id,
                            name,
                            version,
                            author,
                            description,
                            plugin_type,
                            website: val
                                .get("website")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            key_help_url: val
                                .get("key_help_url")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            requires_api_key: val
                                .get("requires_api_key")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false),
                            supported_fields: vec![
                                MetadataField::CriticScore,
                                MetadataField::CommunityScore,
                                MetadataField::Description,
                            ],
                            entry_point: None,
                            settings_schema: None,
                            permissions: val
                                .get("permissions")
                                .and_then(|p| p.as_array())
                                .map(|arr| {
                                    arr.iter()
                                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                        .collect()
                                })
                                .unwrap_or_default(),
                            ui_slots: val
                                .get("ui_slots")
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
                        let name = val
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or(&id)
                            .to_string();
                        let version = val
                            .get("version")
                            .and_then(|v| v.as_str())
                            .unwrap_or("1.0.0")
                            .to_string();
                        let author = val
                            .get("author")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Omnis Community")
                            .to_string();
                        let description = val
                            .get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let plugin_type = val
                            .get("plugin_type")
                            .or_else(|| val.get("type"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("metadata")
                            .to_string();
                        Some(PluginManifest {
                            id,
                            name,
                            version,
                            author,
                            description,
                            plugin_type,
                            website: val
                                .get("website")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            key_help_url: val
                                .get("key_help_url")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            requires_api_key: val
                                .get("requires_api_key")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false),
                            supported_fields: vec![
                                MetadataField::CriticScore,
                                MetadataField::CommunityScore,
                                MetadataField::Description,
                            ],
                            entry_point: None,
                            settings_schema: None,
                            permissions: val
                                .get("permissions")
                                .and_then(|p| p.as_array())
                                .map(|arr| {
                                    arr.iter()
                                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                        .collect()
                                })
                                .unwrap_or_default(),
                            ui_slots: val
                                .get("ui_slots")
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
                Box::new(ExternalMetadataProvider::new(
                    manifest,
                    dir.to_path_buf(),
                    self.client.clone(),
                ))
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
impl MetadataRegistry for MetadataDownloader {
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
    async fn save_provider_settings(&self, provider_id: &str, settings: Map<String, Value>) -> Result<(), String> {
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
