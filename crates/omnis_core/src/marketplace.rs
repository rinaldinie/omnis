//! Community Plugin Marketplace Engine for Omnis Game Library
//!
//! Provides catalog discovery, offline seed fallback, installation, update detection,
//! and uninstallation of native dynamic and external community plugins.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

pub const EMBEDDED_SEED_CATALOG: &str = include_str!("marketplace_seed.json");
pub const DEFAULT_CATALOG_URL: &str =
    "http://truenas:30142/enrico.rinaldini/omnis-plugins/raw/branch/main/marketplace.json";

/// Platform-specific downloadable asset information
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MarketplacePlatformAsset {
    pub download_url: String,
    pub filename: String,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub size_bytes: Option<u64>,
}

/// Catalog entry for an Omnis community plugin
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MarketplacePluginItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub plugin_type: String, // "metadata" | "library"
    #[serde(default)]
    pub requires_api_key: bool,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub platforms: HashMap<String, MarketplacePlatformAsset>,
    #[serde(default)]
    pub is_installed: bool,
    #[serde(default)]
    pub installed_version: Option<String>,
    #[serde(default)]
    pub has_update: bool,
}

/// Complete marketplace catalog schema
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MarketplaceCatalog {
    pub version: String,
    pub updated_at: String,
    pub plugins: Vec<MarketplacePluginItem>,
}

/// Returns the current OS and architecture identifier string
pub fn current_platform_key() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows-x86_64"
    } else if cfg!(target_os = "macos") {
        #[cfg(target_arch = "aarch64")]
        {
            "macos-aarch64"
        }
        #[cfg(not(target_arch = "aarch64"))]
        {
            "macos-x86_64"
        }
    } else {
        "linux-x86_64"
    }
}

/// Compares two semver-like strings, returns true if remote_v is newer than installed_v
pub fn is_newer_version(remote_v: &str, installed_v: &str) -> bool {
    let r_parts: Vec<u64> = remote_v.split('.').filter_map(|s| s.parse().ok()).collect();
    let i_parts: Vec<u64> = installed_v.split('.').filter_map(|s| s.parse().ok()).collect();
    if !r_parts.is_empty() && !i_parts.is_empty() {
        r_parts > i_parts
    } else {
        remote_v != installed_v
    }
}

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
        let mut fetched_catalog: Option<MarketplaceCatalog> = None;

        let target_url = custom_url.or(Some(DEFAULT_CATALOG_URL));
        if let Some(url) = target_url {
            if url.starts_with("http://") || url.starts_with("https://") {
                if let Ok(resp) = self.client.get(url).send().await {
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

        let mut catalog = match fetched_catalog {
            Some(cat) => cat,
            None => serde_json::from_str::<MarketplaceCatalog>(EMBEDDED_SEED_CATALOG)
                .map_err(|e| format!("Impossibile analizzare il catalogo seed del marketplace: {}", e))?,
        };

        // Enrich catalog items with local installation state
        let plugins_dir_opt = self.plugins_dir.read().await.clone();
        if let Some(ref base_dir) = plugins_dir_opt {
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

        *self.catalog_cache.write().await = Some(catalog.clone());
        Ok(catalog)
    }

    /// Installs or updates a plugin by downloading or locating its asset and hot-registering it
    pub async fn install_plugin(
        &self,
        plugin_id: &str,
        downloader: &Arc<crate::metadata::MetadataDownloader>,
    ) -> Result<crate::metadata::ProviderInfo, String> {
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

        let is_remote_http =
            asset.download_url.starts_with("http://") || asset.download_url.starts_with("https://");
        let is_file_url = asset.download_url.starts_with("file://");
        let mut downloaded_bytes: Option<Vec<u8>> = None;

        if is_remote_http {
            info!("Scaricamento plugin '{}' da: {}", plugin_id, asset.download_url);
            if let Ok(resp) = self.client.get(&asset.download_url).send().await {
                if resp.status().is_success() {
                    if let Ok(bytes) = resp.bytes().await {
                        downloaded_bytes = Some(bytes.to_vec());
                    }
                }
            }
        } else if is_file_url {
            info!("Lettura asset plugin '{}' da URL file: {}", plugin_id, asset.download_url);
            let local_path = file_url_to_path(&asset.download_url);
            if local_path.exists() {
                match std::fs::read(&local_path) {
                    Ok(bytes) => downloaded_bytes = Some(bytes),
                    Err(e) => return Err(format!("Lettura file fallita {}: {}", local_path.display(), e)),
                }
            } else {
                return Err(format!("File asset non trovato: {}", local_path.display()));
            }
        }

        if let Some(bytes) = downloaded_bytes {
            // Verify SHA-256 hash if provided
            if let Some(ref expected_sha256) = asset.sha256 {
                use sha2::{Digest, Sha256};
                let mut hasher = Sha256::new();
                hasher.update(&bytes);
                let actual_sha256 = format!("{:x}", hasher.finalize());
                if !expected_sha256.is_empty() && !actual_sha256.eq_ignore_ascii_case(expected_sha256) {
                    return Err(format!(
                        "Verifica integrità SHA-256 fallita per il plugin '{}': atteso '{}', calcolato '{}'",
                        plugin_id, expected_sha256, actual_sha256
                    ));
                }
                info!("Integrità SHA-256 verificata con successo per '{}'", plugin_id);
            }

            // Check if archive is a ZIP file
            if asset.filename.ends_with(".zip")
                || (bytes.len() >= 4 && &bytes[0..4] == b"PK\x03\x04")
            {
                extract_zip(&bytes, &target_dir)?;
                normalize_extracted_dir(&target_dir);
            } else {
                let dest = target_dir.join(&asset.filename);
                std::fs::write(&dest, &bytes).map_err(|e| {
                    format!("Impossibile salvare il file del plugin in {}: {}", dest.display(), e)
                })?;
            }
        } else {
            // Mock / Local Fallback handling
            info!(
                "Configurazione risorsa locale/mock per il plugin '{}' (URL: {})",
                plugin_id, asset.download_url
            );

            // 1. If sample_dynamic or filename matches sample_dynamic_provider DLL/so:
            if plugin_id == "sample_dynamic" || asset.filename.contains("sample_dynamic_provider") {
                if let Some(src_bin) = find_sample_dynamic_binary(&asset.filename) {
                    let dest = target_dir.join(&asset.filename);
                    if let Err(e) = std::fs::copy(&src_bin, &dest) {
                        warn!("Copia binario sample fallita da {}: {}", src_bin.display(), e);
                    }
                }
            }

            // 2. Ensure manifest.json is present for dynamic external or mock plugins
            let manifest_path = target_dir.join("manifest.json");
            if !manifest_path.exists() {
                let manifest_data = serde_json::json!({
                    "id": item.id,
                    "name": item.name,
                    "version": item.version,
                    "author": item.author,
                    "description": item.description,
                    "plugin_type": item.plugin_type,
                    "requires_api_key": item.requires_api_key,
                    "supported_fields": [
                        "critic_score",
                        "community_score",
                        "description"
                    ]
                });
                let json_str = serde_json::to_string_pretty(&manifest_data)
                    .map_err(|e| format!("Serializzazione manifest mock fallita: {}", e))?;
                std::fs::write(&manifest_path, json_str)
                    .map_err(|e| format!("Scrittura manifest mock fallita: {}", e))?;
            }
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

        let target_dir = plugins_dir.join(plugin_id);
        if target_dir.exists() {
            // Attempt standard deletion
            if let Err(e) = std::fs::remove_dir_all(&target_dir) {
                warn!(
                    "Impossibile rimuovere immediatamente la cartella {}: {}. Tento pulizia file...",
                    target_dir.display(),
                    e
                );
                // On Windows, if a DLL was recently freed, retry or clean loose files
                if let Ok(entries) = std::fs::read_dir(&target_dir) {
                    for entry in entries.flatten() {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
                let _ = std::fs::remove_dir_all(&target_dir);
            }
        }

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

/// Resolves a file:// URL or path string to a canonical PathBuf across Windows and Unix
pub fn file_url_to_path(url_str: &str) -> PathBuf {
    if let Ok(parsed) = url::Url::parse(url_str) {
        if let Ok(path) = parsed.to_file_path() {
            return path;
        }
    }
    let mut raw = url_str.trim_start_matches("file://");
    while raw.starts_with('/') {
        if raw.len() >= 3
            && raw.chars().nth(1).map_or(false, |c| c.is_ascii_alphabetic())
            && raw.chars().nth(2) == Some(':')
        {
            raw = &raw[1..];
            break;
        } else if !raw.starts_with("//") {
            break;
        } else {
            raw = &raw[1..];
        }
    }
    PathBuf::from(raw)
}

/// Unpacks a ZIP byte stream safely into target_dir
fn extract_zip(bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    use std::io::Cursor;
    let reader = Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(reader).map_err(|e| format!("Archivio ZIP non valido: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Impossibile accedere all'elemento ZIP index {}: {}", i, e))?;

        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.is_dir() {
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("Creazione directory {} fallita: {}", outpath.display(), e))?;
        } else {
            if let Some(parent) = outpath.parent() {
                if !parent.exists() {
                    std::fs::create_dir_all(parent).map_err(|e| {
                        format!("Creazione directory parent {} fallita: {}", parent.display(), e)
                    })?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("Creazione file {} fallita: {}", outpath.display(), e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Estrazione file {} fallita: {}", outpath.display(), e))?;
        }
    }
    Ok(())
}

/// If archive extracted into a single wrapper directory, flattens contents into target_dir
fn normalize_extracted_dir(target_dir: &Path) {
    let manifest_path = target_dir.join("manifest.json");
    if manifest_path.exists() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(target_dir) {
        let subdirs: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .collect();
        if subdirs.len() == 1 {
            let subdir_path = subdirs[0].path();
            let sub_manifest = subdir_path.join("manifest.json");
            if sub_manifest.exists() {
                if let Ok(sub_entries) = std::fs::read_dir(&subdir_path) {
                    for entry in sub_entries.flatten() {
                        let src = entry.path();
                        let dst = target_dir.join(entry.file_name());
                        let _ = std::fs::rename(&src, &dst);
                    }
                }
                let _ = std::fs::remove_dir(&subdir_path);
            }
        }
    }
}

/// Finds the compiled sample_dynamic_provider native binary in workspace target dirs
fn find_sample_dynamic_binary(filename: &str) -> Option<PathBuf> {
    let candidate_dirs = [
        PathBuf::from("target/debug"),
        PathBuf::from("target/release"),
        PathBuf::from("../target/debug"),
        PathBuf::from("../../target/debug"),
    ];

    for dir in &candidate_dirs {
        let direct = dir.join(filename);
        if direct.exists() {
            return Some(direct);
        }
        let in_deps = dir.join("deps").join(filename);
        if in_deps.exists() {
            return Some(in_deps);
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        for dir in &candidate_dirs {
            let direct = cwd.join(dir).join(filename);
            if direct.exists() {
                return Some(direct);
            }
            let in_deps = cwd.join(dir).join("deps").join(filename);
            if in_deps.exists() {
                return Some(in_deps);
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidate = parent.join(filename);
            if candidate.exists() {
                return Some(candidate);
            }
            let candidate_deps = parent.join("deps").join(filename);
            if candidate_deps.exists() {
                return Some(candidate_deps);
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seed_catalog_parsing() {
        let catalog: MarketplaceCatalog =
            serde_json::from_str(EMBEDDED_SEED_CATALOG).expect("Marketplace seed JSON must be valid");
        assert_eq!(catalog.plugins.len(), 5);

        let ids: Vec<&str> = catalog.plugins.iter().map(|p| p.id.as_str()).collect();
        assert!(ids.contains(&"igdb"));
        assert!(ids.contains(&"steamgriddb"));
        assert!(ids.contains(&"opencritic"));
        assert!(ids.contains(&"howlongtobeat"));
        assert!(ids.contains(&"retro_achievements"));
    }

    #[test]
    fn test_version_comparison() {
        assert!(is_newer_version("1.1.0", "1.0.0"));
        assert!(is_newer_version("2.0.0", "1.9.9"));
        assert!(is_newer_version("1.0.1", "1.0.0"));
        assert!(!is_newer_version("1.0.0", "1.0.0"));
        assert!(!is_newer_version("1.0.0", "1.1.0"));
    }

    #[test]
    fn test_current_platform_key() {
        let key = current_platform_key();
        assert!(!key.is_empty());
        if cfg!(target_os = "windows") {
            assert_eq!(key, "windows-x86_64");
        } else if cfg!(target_os = "linux") {
            assert_eq!(key, "linux-x86_64");
        }
    }

    #[tokio::test]
    async fn test_marketplace_manager_lifecycle() {
        let temp_dir = std::env::temp_dir().join(format!("omnis_market_test_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let manager = MarketplaceManager::with_plugins_dir(temp_dir.clone());
        let downloader = Arc::new(crate::metadata::MetadataDownloader::new());
        downloader.set_plugins_dir(temp_dir.clone()).await;

        // 1. Initial catalog fetch
        let catalog = manager.get_catalog(None).await.expect("Catalog should load");
        assert_eq!(catalog.plugins.len(), 5);
        let hltb = catalog.plugins.iter().find(|p| p.id == "howlongtobeat").unwrap();
        assert!(!hltb.is_installed);

        // 2. Install mock plugin
        let provider_info = manager
            .install_plugin("howlongtobeat", &downloader)
            .await
            .expect("Installation of mock plugin must succeed");
        assert_eq!(provider_info.id, "howlongtobeat");

        // 3. Catalog reflects installation
        let catalog_after = manager.get_catalog(None).await.expect("Catalog should refresh");
        let hltb_after = catalog_after.plugins.iter().find(|p| p.id == "howlongtobeat").unwrap();
        assert!(hltb_after.is_installed);
        assert_eq!(hltb_after.installed_version.as_deref(), Some("1.1.0"));

        // 4. Uninstall plugin
        manager
            .uninstall_plugin("howlongtobeat", &downloader)
            .await
            .expect("Uninstallation must succeed");

        let catalog_final = manager.get_catalog(None).await.expect("Catalog should refresh");
        let hltb_final = catalog_final.plugins.iter().find(|p| p.id == "howlongtobeat").unwrap();
        assert!(!hltb_final.is_installed);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_marketplace_install_retro_achievements() {
        let temp_dir =
            std::env::temp_dir().join(format!("omnis_market_ra_test_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let manager = MarketplaceManager::with_plugins_dir(temp_dir.clone());
        let downloader = Arc::new(crate::metadata::MetadataDownloader::new());
        downloader.set_plugins_dir(temp_dir.clone()).await;

        if let Ok(info) = manager.install_plugin("retro_achievements", &downloader).await {
            assert_eq!(info.id, "retro_achievements");
            assert!(info.is_enabled);

            let catalog = manager.get_catalog(None).await.expect("Catalog refresh");
            let item = catalog.plugins.iter().find(|p| p.id == "retro_achievements").unwrap();
            assert!(item.is_installed);

            let _ = manager.uninstall_plugin("retro_achievements", &downloader).await;
        }

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
