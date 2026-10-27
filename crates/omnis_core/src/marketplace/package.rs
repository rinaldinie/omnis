//! Plugin Package Download, Verification, and Extraction Service

use super::types::{file_url_to_path, MarketplacePlatformAsset, MarketplacePluginItem};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tracing::{info, warn};

/// Service handling asset download, SHA-256 integrity verification, ZIP unpacking, and uninstallation
pub struct PluginPackageInstaller;

impl PluginPackageInstaller {
    /// Download or read local package bytes for a plugin asset, verifying its SHA-256 hash if present
    pub async fn download_or_read_asset(
        client: &reqwest::Client,
        plugin_id: &str,
        asset: &MarketplacePlatformAsset,
    ) -> Result<Option<Vec<u8>>, String> {
        let is_remote_http =
            asset.download_url.starts_with("http://") || asset.download_url.starts_with("https://");
        let is_file_url = asset.download_url.starts_with("file://");
        let mut downloaded_bytes: Option<Vec<u8>> = None;

        if is_remote_http {
            info!("Scaricamento plugin '{}' da: {}", plugin_id, asset.download_url);
            if let Ok(resp) = client.get(&asset.download_url).send().await {
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

        if let Some(ref bytes) = downloaded_bytes {
            if let Some(ref expected_sha256) = asset.sha256 {
                Self::verify_sha256(bytes, expected_sha256, plugin_id)?;
            }
        }

        Ok(downloaded_bytes)
    }

    /// Verifies SHA-256 integrity of downloaded bytes against expected hash
    pub fn verify_sha256(bytes: &[u8], expected_sha256: &str, plugin_id: &str) -> Result<(), String> {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        let actual_sha256 = format!("{:x}", hasher.finalize());
        if !expected_sha256.is_empty() && !actual_sha256.eq_ignore_ascii_case(expected_sha256) {
            return Err(format!(
                "Verifica integrità SHA-256 fallita per il plugin '{}': atteso '{}', calcolato '{}'",
                plugin_id, expected_sha256, actual_sha256
            ));
        }
        info!("Integrità SHA-256 verificata con successo per '{}'", plugin_id);
        Ok(())
    }

    /// Writes or extracts package bytes into the target plugin directory
    pub fn unpack_package(
        bytes: &[u8],
        filename: &str,
        target_dir: &Path,
    ) -> Result<(), String> {
        if filename.ends_with(".zip") || (bytes.len() >= 4 && &bytes[0..4] == b"PK\x03\x04") {
            Self::extract_zip(bytes, target_dir)?;
            Self::normalize_extracted_dir(target_dir);
        } else {
            let safe_filename = std::path::Path::new(filename)
                .file_name()
                .ok_or_else(|| "Nome file asset non valido".to_string())?;
            let dest = target_dir.join(safe_filename);
            std::fs::write(&dest, bytes).map_err(|e| {
                format!("Impossibile salvare il file del plugin in {}: {}", dest.display(), e)
            })?;
        }
        Ok(())
    }

    /// Unpacks a ZIP byte stream safely into target_dir
    pub fn extract_zip(bytes: &[u8], target_dir: &Path) -> Result<(), String> {
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
    pub fn normalize_extracted_dir(target_dir: &Path) {
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

    /// Populates mock manifest and binary fallback when no remote asset was retrieved
    pub fn setup_mock_or_local_fallback(
        plugin_id: &str,
        item: &MarketplacePluginItem,
        asset: &MarketplacePlatformAsset,
        target_dir: &Path,
    ) -> Result<(), String> {
        info!(
            "Configurazione risorsa locale/mock per il plugin '{}' (URL: {})",
            plugin_id, asset.download_url
        );

        if plugin_id == "sample_dynamic" || asset.filename.contains("sample_dynamic_provider") {
            if let Some(src_bin) = Self::find_sample_dynamic_binary(&asset.filename) {
                let dest = target_dir.join(&asset.filename);
                if let Err(e) = std::fs::copy(&src_bin, &dest) {
                    warn!("Copia binario sample fallita da {}: {}", src_bin.display(), e);
                }
            }
        }

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

        Ok(())
    }

    /// Safely deletes the plugin directory verifying boundaries against path traversal attacks
    pub fn safe_uninstall_directory(plugins_dir: &Path, plugin_id: &str) -> Result<(), String> {
        let target_dir = plugins_dir.join(plugin_id);
        if target_dir.exists() {
            if let (Ok(canonical_target), Ok(canonical_plugins)) =
                (target_dir.canonicalize(), plugins_dir.canonicalize())
            {
                if !canonical_target.starts_with(&canonical_plugins)
                    || canonical_target == canonical_plugins
                {
                    return Err(
                        "Tentativo di cancellazione non consentito fuori dalla directory plugins".to_string(),
                    );
                }

                if let Err(e) = std::fs::remove_dir_all(&canonical_target) {
                    warn!(
                        "Impossibile rimuovere immediatamente la cartella {}: {}. Tento pulizia file...",
                        canonical_target.display(),
                        e
                    );
                    if let Ok(entries) = std::fs::read_dir(&canonical_target) {
                        for entry in entries.flatten() {
                            let _ = std::fs::remove_file(entry.path());
                        }
                    }
                    let _ = std::fs::remove_dir_all(&canonical_target);
                }
            }
        }
        Ok(())
    }

    /// Finds the compiled sample_dynamic_provider native binary in workspace target dirs
    pub fn find_sample_dynamic_binary(filename: &str) -> Option<PathBuf> {
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
}
