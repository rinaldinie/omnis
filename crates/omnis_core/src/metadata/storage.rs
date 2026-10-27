use std::path::Path;
use tracing::warn;
use uuid::Uuid;
use omnis_sdk::GameMetadataPatch;

use super::media::MediaDownloader;

/// Handles local disk layout, caching of artwork assets, and path self-healing
pub struct MediaStorageManager;

impl MediaStorageManager {
    /// Caches downloaded cover and background images to local storage, resolving fallbacks and fixing nested folders
    pub async fn cache_game_artwork(
        media: &dyn MediaDownloader,
        game_id: Uuid,
        library_id: &str,
        external_id: &str,
        cache_dir: &Path,
        final_patch: &mut GameMetadataPatch,
    ) {
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

        let appid_hint = if library_id == "steam" {
            Some(external_id)
        } else {
            None
        };

        if let Some(ref curl) = final_patch.cover_url.clone() {
            let curl_trim = curl.trim();
            if curl_trim.is_empty() {
                final_patch.cover_url = None;
            } else if curl_trim.starts_with("http://") || curl_trim.starts_with("https://") {
                match media
                    .download_image_with_fallbacks(curl_trim, appid_hint)
                    .await
                {
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
                match media
                    .download_image_with_fallbacks(burl_trim, appid_hint)
                    .await
                {
                    Ok(bytes) => {
                        if std::fs::write(&bg_dest, bytes).is_ok() {
                            final_patch.background_url =
                                Some(bg_dest.to_string_lossy().to_string());
                        } else {
                            warn!(
                                "Failed to write downloaded background image to {:?}",
                                bg_dest
                            );
                            final_patch.background_url = Some(burl_trim.to_string());
                        }
                    }
                    Err(e) => {
                        warn!(
                            "Failed to download background image from {}: {}",
                            burl_trim, e
                        );
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


    }
}
