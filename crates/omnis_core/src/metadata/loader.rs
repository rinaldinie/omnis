use std::path::Path;
use serde_json::{Map, Value};
use tracing::warn;

use crate::dynamic_loader::{find_shared_library_in_dir, DynamicPluginLoader};
use omnis_sdk::{MetadataField, MetadataProvider, PluginManifest};

use super::opencritic::OpenCriticProvider;
use super::registry::ProviderRegistry;
use super::steamgriddb::SteamGridDbProvider;
use super::types::*;

/// Handles scanning directories, inspecting manifests, and loading dynamic C-ABI native or external plugins
pub struct DynamicPluginScanner;

impl DynamicPluginScanner {
    /// Scans the plugins folder for subdirectories and registers any valid dynamic plugins
    pub async fn scan_and_load_external_plugins(registry: &ProviderRegistry, dir: &Path) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            // Attempt to load and register the plugin
            let _ = Self::load_and_register_dynamic_plugin(registry, &path).await;
        }
    }

    /// Dynamically load and hot-register a native or manifest-based plugin from a library or directory
    pub async fn load_and_register_dynamic_plugin(
        registry: &ProviderRegistry,
        path: &Path,
    ) -> Result<ProviderInfo, String> {
        // 1. Try native dynamic library
        let library_path = if path.is_file() {
            Some(path.to_path_buf())
        } else if path.is_dir() {
            find_shared_library_in_dir(path)
        } else {
            return Err(format!("Il percorso specificato non esiste: {}", path.display()));
        };

        if let Some(ref lib_path) = library_path {
            if let Some(info) = Self::try_load_native_library(registry, lib_path).await? {
                return Ok(info);
            }
        }

        // 2. Fallback: try directory-based manifest (manifest.json or extension.yaml)
        let dir = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };

        if let Some(info) = Self::try_load_manifest_plugin(registry, dir).await? {
            return Ok(info);
        }

        Err(format!(
            "Nessuna libreria nativa valida né manifest.json trovato in {}",
            path.display()
        ))
    }

    async fn try_load_native_library(
        registry: &ProviderRegistry,
        lib_path: &Path,
    ) -> Result<Option<ProviderInfo>, String> {
        let loader = DynamicPluginLoader::new();
        match loader.load_metadata_provider_from_library(lib_path) {
            Ok(dynamic_provider) => {
                let id = dynamic_provider.id().to_string();
                let root_path = lib_path
                    .parent()
                    .map(|p| p.to_path_buf())
                    .unwrap_or_else(|| lib_path.to_path_buf());

                let settings_map = Self::load_settings_file(&root_path);
                let (is_enabled, has_key) = Self::sync_settings_and_enabled(
                    registry,
                    &id,
                    settings_map.clone(),
                    dynamic_provider.requires_api_key(),
                ).await;

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

                let mut providers_guard = registry.providers.write().await;
                providers_guard.insert(id, Box::new(dynamic_provider));

                Ok(Some(info))
            }
            Err(e) => {
                warn!("Errore nel caricamento nativo da {}: {}", lib_path.display(), e);
                Ok(None)
            }
        }
    }

    async fn try_load_manifest_plugin(
        registry: &ProviderRegistry,
        dir: &Path,
    ) -> Result<Option<ProviderInfo>, String> {
        let Some(manifest) = Self::parse_manifest_from_dir(dir) else {
            return Ok(None);
        };

        let id = manifest.id.clone();
        let settings_map = Self::load_settings_file(dir);
        let (is_enabled, has_key) = Self::sync_settings_and_enabled(
            registry,
            &id,
            settings_map.clone(),
            manifest.requires_api_key,
        ).await;

        let provider: Box<dyn MetadataProvider> = if id == "steamgriddb" {
            let mut p = SteamGridDbProvider::new(registry.client.clone());
            p.set_plugin_dir(dir.to_path_buf());
            Box::new(p)
        } else if id == "opencritic" {
            let mut p = OpenCriticProvider::new(registry.client.clone());
            p.set_plugin_dir(dir.to_path_buf());
            Box::new(p)
        } else if id == "igdb" {
            let mut p = (*registry.igdb_provider).clone();
            p.set_plugin_dir(dir.to_path_buf());
            Box::new(p)
        } else {
            Box::new(ExternalMetadataProvider::new(
                manifest,
                dir.to_path_buf(),
                registry.client.clone(),
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

        let mut providers_guard = registry.providers.write().await;
        providers_guard.insert(id, provider);

        Ok(Some(info))
    }

    fn parse_manifest_from_dir(dir: &Path) -> Option<PluginManifest> {
        let manifest_json = dir.join("manifest.json");
        let extension_yaml = dir.join("extension.yaml");

        if manifest_json.exists() {
            if let Ok(c) = std::fs::read_to_string(&manifest_json) {
                if let Ok(m) = serde_json::from_str::<PluginManifest>(&c) {
                    return Some(m);
                }
                if let Ok(val) = serde_json::from_str::<Value>(&c) {
                    return Self::manifest_from_value(&val);
                }
            }
        }

        if extension_yaml.exists() {
            if let Ok(c) = std::fs::read_to_string(&extension_yaml) {
                if let Ok(m) = serde_json::from_str::<PluginManifest>(&c) {
                    return Some(m);
                }
                if let Ok(val) = serde_json::from_str::<Value>(&c) {
                    return Self::manifest_from_value(&val);
                }
            }
        }

        None
    }

    fn manifest_from_value(val: &Value) -> Option<PluginManifest> {
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
            permissions: val.get("permissions").and_then(|p| p.as_array()).map(|arr| {
                arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
            }).unwrap_or_default(),
            ui_slots: val.get("ui_slots").and_then(|u| serde_json::from_value(u.clone()).ok()).unwrap_or_default(),
        })
    }

    fn load_settings_file(dir: &Path) -> Map<String, Value> {
        let settings_file = dir.join("settings.json");
        if let Ok(content) = std::fs::read_to_string(&settings_file) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                if let Some(map) = val.as_object() {
                    return map.clone();
                }
            }
        }
        Map::new()
    }

    async fn sync_settings_and_enabled(
        registry: &ProviderRegistry,
        id: &str,
        settings_map: Map<String, Value>,
        requires_api_key: bool,
    ) -> (bool, bool) {
        let mut settings_guard = registry.settings_cache.write().await;
        if !settings_map.is_empty() {
            settings_guard.insert(id.to_string(), settings_map.clone());
        }

        let mut enabled_guard = registry.enabled_providers.write().await;
        if !enabled_guard.contains_key(id) {
            enabled_guard.insert(id.to_string(), true);
        }
        let is_enabled = enabled_guard.get(id).copied().unwrap_or(true);

        let has_key = if !requires_api_key {
            true
        } else {
            settings_map
                .get("api_key")
                .and_then(|v| v.as_str())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false)
        };

        (is_enabled, has_key)
    }
}
