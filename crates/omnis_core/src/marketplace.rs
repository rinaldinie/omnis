//! Community Plugin Marketplace Engine for Omnis Game Library
//!
//! Provides catalog discovery, offline seed fallback, installation, update detection,
//! and uninstallation of native dynamic and external community plugins.

pub mod catalog;
pub mod package;
pub mod types;

pub use catalog::{MarketplaceCatalogService, DEFAULT_CATALOG_URL};
pub use package::PluginPackageInstaller;
pub use types::*;

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

pub const EMBEDDED_SEED_CATALOG: &str = include_str!("marketplace_seed.json");

/// Marketplace Manager handling catalog queries and plugin lifecycle
pub struct MarketplaceManager {
    client: reqwest::Client,
    plugins_dir: Arc<RwLock<Option<PathBuf>>>,
    catalog_cache: Arc<RwLock<Option<MarketplaceCatalog>>>,
}

impl Default for MarketplaceManager {
    fn default() -> Self {
        Self::new()
    }
}

impl MarketplaceManager {
    /// Creates a new MarketplaceManager instance with default HTTP client
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(3))
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
            plugins_dir: Arc::new(RwLock::new(None)),
            catalog_cache: Arc::new(RwLock::new(None)),
        }
    }

    /// Creates a new MarketplaceManager with a preconfigured plugins directory
    pub fn with_plugins_dir(dir: PathBuf) -> Self {
        Self {
            client: reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(3))
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
            plugins_dir: Arc::new(RwLock::new(Some(dir))),
            catalog_cache: Arc::new(RwLock::new(None)),
        }
    }

    /// Sets or updates the active plugins directory
    pub async fn set_plugins_dir(&self, dir: PathBuf) {
        *self.plugins_dir.write().await = Some(dir);
    }

    /// Returns the currently configured plugins directory, if any
    pub async fn get_plugins_dir(&self) -> Option<PathBuf> {
        self.plugins_dir.read().await.clone()
    }

    /// Fetches the marketplace catalog from a remote URL or falls back to the embedded seed
    pub async fn get_catalog(&self, custom_url: Option<&str>) -> Result<MarketplaceCatalog, String> {
        let mut catalog =
            MarketplaceCatalogService::fetch_catalog(&self.client, custom_url, EMBEDDED_SEED_CATALOG)
                .await?;

        // Enrich catalog items with local installation state
        let plugins_dir_opt = self.plugins_dir.read().await.clone();
        if let Some(ref base_dir) = plugins_dir_opt {
            MarketplaceCatalogService::enrich_installation_state(&mut catalog, base_dir);
        }

        *self.catalog_cache.write().await = Some(catalog.clone());
        Ok(catalog)
    }

    /// Installs or updates a plugin by downloading or locating its asset and hot-registering it
    pub async fn install_plugin(
        &self,
        plugin_id: &str,
        downloader: &Arc<crate::metadata::MetadataDownloader>,
    ) -> Result<crate::metadata::ProviderInfo, String> {
        validate_plugin_id(plugin_id)?;

        let cached = { self.catalog_cache.read().await.clone() };
        let catalog = match cached {
            Some(c) => c,
            None => self.get_catalog(None).await?,
        };
        let item = catalog
            .plugins
            .into_iter()
            .find(|p| p.id == plugin_id)
            .ok_or_else(|| format!("Plugin '{}' non trovato nel catalogo del marketplace", plugin_id))?;

        let platform_key = current_platform_key();
        let asset = item
            .platforms
            .get(platform_key)
            .or_else(|| item.platforms.values().next())
            .ok_or_else(|| {
                format!(
                    "Nessun asset disponibile per la piattaforma '{}' per il plugin '{}'",
                    platform_key, plugin_id
                )
            })?
            .clone();

        let plugins_dir = match self.plugins_dir.read().await.clone() {
            Some(d) => d,
            None => match downloader.get_plugins_dir().await {
                Some(d) => d,
                None => return Err("Nessuna cartella plugins configurata nel sistema".to_string()),
            },
        };

        let target_dir = plugins_dir.join(plugin_id);
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| format!("Impossibile creare la cartella per il plugin: {}", e))?;

        let downloaded_bytes =
            PluginPackageInstaller::download_or_read_asset(&self.client, plugin_id, &asset).await?;

        if let Some(bytes) = downloaded_bytes {
            PluginPackageInstaller::unpack_package(&bytes, &asset.filename, &target_dir)?;
        } else {
            PluginPackageInstaller::setup_mock_or_local_fallback(
                plugin_id,
                &item,
                &asset,
                &target_dir,
            )?;
        }

        // Hot register in the runtime metadata downloader
        let provider_info = downloader
            .load_and_register_dynamic_plugin(&target_dir)
            .await
            .map_err(|e| format!("Registrazione a caldo del plugin fallita: {}", e))?;

        // Update local catalog cache
        if let Some(ref mut cached_catalog) = *self.catalog_cache.write().await {
            for p in &mut cached_catalog.plugins {
                if p.id == plugin_id {
                    p.is_installed = true;
                    p.installed_version = Some(item.version.clone());
                    p.has_update = false;
                }
            }
        }

        info!("Plugin '{}' installato e registrato con successo!", plugin_id);
        Ok(provider_info)
    }

    /// Uninstalls a plugin, removing it from runtime and deleting its directory
    pub async fn uninstall_plugin(
        &self,
        plugin_id: &str,
        downloader: &Arc<crate::metadata::MetadataDownloader>,
    ) -> Result<(), String> {
        validate_plugin_id(plugin_id)?;
        info!("Disinstallazione plugin '{}'...", plugin_id);

        // 1. Unregister from metadata downloader
        let _ = downloader.unregister_provider(plugin_id).await;

        // 2. Remove folder from disk
        let plugins_dir = match self.plugins_dir.read().await.clone() {
            Some(d) => d,
            None => match downloader.get_plugins_dir().await {
                Some(d) => d,
                None => return Err("Nessuna cartella plugins configurata nel sistema".to_string()),
            },
        };

        PluginPackageInstaller::safe_uninstall_directory(&plugins_dir, plugin_id)?;

        // 3. Update catalog cache
        if let Some(ref mut cached_catalog) = *self.catalog_cache.write().await {
            for p in &mut cached_catalog.plugins {
                if p.id == plugin_id {
                    p.is_installed = false;
                    p.installed_version = None;
                    p.has_update = false;
                }
            }
        }

        info!("Plugin '{}' disinstallato correttamente.", plugin_id);
        Ok(())
    }
}

#[cfg(test)]
mod tests;
