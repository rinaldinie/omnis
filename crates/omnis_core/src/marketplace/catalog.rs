//! Marketplace Catalog Retrieval & Installation State Detection Service

use super::types::{file_url_to_path, is_newer_version, MarketplaceCatalog};
use std::path::{Path, PathBuf};

pub const DEFAULT_CATALOG_URL: &str =
    "https://raw.githubusercontent.com/rinaldinie/omnis/main/plugins/marketplace.json";

/// Service dedicated to retrieving the plugin catalog and enriching it with local installation status
pub struct MarketplaceCatalogService;

impl MarketplaceCatalogService {
    /// Fetch catalog from remote URL, local path, or fallback to embedded seed JSON
    pub async fn fetch_catalog(
        client: &reqwest::Client,
        custom_url: Option<&str>,
        embedded_seed: &str,
    ) -> Result<MarketplaceCatalog, String> {
        let mut fetched_catalog: Option<MarketplaceCatalog> = None;

        let target_url = custom_url.or(Some(DEFAULT_CATALOG_URL));
        if let Some(url) = target_url {
            if url.starts_with("http://") || url.starts_with("https://") {
                if let Ok(resp) = client.get(url).send().await {
                    if resp.status().is_success() {
                        if let Ok(cat) = resp.json::<MarketplaceCatalog>().await {
                            fetched_catalog = Some(cat);
                        }
                    }
                }
            } else {
                let local_path = if url.starts_with("file://") {
                    file_url_to_path(url)
                } else {
                    PathBuf::from(url)
                };
                if local_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&local_path) {
                        if let Ok(cat) = serde_json::from_str::<MarketplaceCatalog>(&content) {
                            fetched_catalog = Some(cat);
                        }
                    }
                }
            }
        }

        match fetched_catalog {
            Some(cat) => Ok(cat),
            None => serde_json::from_str::<MarketplaceCatalog>(embedded_seed)
                .map_err(|e| format!("Impossibile analizzare il catalogo seed del marketplace: {}", e)),
        }
    }

    /// Enriches catalog items by inspecting the filesystem for installed manifests or binaries
    pub fn enrich_installation_state(catalog: &mut MarketplaceCatalog, base_dir: &Path) {
        for plugin in &mut catalog.plugins {
            let p_dir = base_dir.join(&plugin.id);
            if p_dir.exists() {
                let manifest_path = p_dir.join("manifest.json");
                let extension_yaml = p_dir.join("extension.yaml");
                let mut installed_ver = None;

                if manifest_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(v) = val.get("version").and_then(|v| v.as_str()) {
                                installed_ver = Some(v.to_string());
                            }
                        }
                    }
                } else if extension_yaml.exists() {
                    if let Ok(content) = std::fs::read_to_string(&extension_yaml) {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(v) = val.get("version").and_then(|v| v.as_str()) {
                                installed_ver = Some(v.to_string());
                            }
                        }
                    }
                }

                if installed_ver.is_none() {
                    // Check if a native shared library is found in the folder
                    if crate::dynamic_loader::find_shared_library_in_dir(&p_dir).is_some() {
                        installed_ver = Some(plugin.version.clone());
                    }
                }

                if let Some(ver) = installed_ver {
                    plugin.is_installed = true;
                    plugin.has_update = is_newer_version(&plugin.version, &ver);
                    plugin.installed_version = Some(ver);
                } else {
                    plugin.is_installed = false;
                    plugin.installed_version = None;
                    plugin.has_update = false;
                }
            } else {
                plugin.is_installed = false;
                plugin.installed_version = None;
                plugin.has_update = false;
            }
        }
    }
}
