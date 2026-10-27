use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use serde_json::Value;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use crate::dynamic_loader::{find_shared_library_in_dir, DynamicPluginLoader};
use omnis_sdk::{MetadataField, MetadataProvider};

use super::types::*;
use super::utils::*;

/// Handles scanning directories, inspecting manifests, and loading dynamic C-ABI native plugins
pub struct DynamicPluginScanner;

impl DynamicPluginScanner {
    pub async fn scan_and_load_external_plugins(
        providers: &Arc<RwLock<HashMap<String, Box<dyn MetadataProvider>>>>,
        enabled_providers: &Arc<RwLock<HashMap<String, bool>>>,
        settings_cache: &Arc<RwLock<HashMap<String, serde_json::Map<String, Value>>>>,
 dir: &Path) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        let mut providers_guard = providers.write().await;
        let mut enabled_guard = enabled_providers.write().await;
        let mut settings_guard = settings_cache.write().await;

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


    /// Dynamically load and hot-register a native or manifest-based plugin from a library or directory
    pub async fn load_and_register_dynamic_plugin(
        providers: &Arc<RwLock<HashMap<String, Box<dyn MetadataProvider>>>>,
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

                    let mut providers_guard = providers.write().await;
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

            let mut providers_guard = providers.write().await;
            providers_guard.insert(id, provider);

            return Ok(info);
        }

        Err(format!(
            "Nessuna libreria nativa valida né manifest.json trovato in {}",
            path.display()
        ))
    }

}
