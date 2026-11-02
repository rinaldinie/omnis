//! High-concurrency local icon caching engine for game achievements
//!
//! Downloads achievement icons to the local filesystem cache and updates
//! the database records idempotently with absolute paths.

use crate::db::Database;
use omnis_sdk::Achievement;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Semaphore;
use tracing::{debug, error, warn};
use uuid::Uuid;

/// Compute SHA-256 hex digest for an image URL to generate a safe unique filename
pub fn compute_icon_hash(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Helper to construct alternative modern Steam CDN URL if the provided URL points to legacy Akamai/Cloudflare paths
pub fn steam_modern_cdn_url(url: &str) -> Option<String> {
    if url.contains("steamcommunity/public/images/apps/") {
        if let Some(pos) = url.find("images/apps/") {
            let suffix = &url[pos + "images/apps/".len()..];
            return Some(format!(
                "https://shared.steamstatic.com/community_assets/images/apps/{suffix}"
            ));
        }
    }
    None
}

/// Helper to construct legacy Steam CDN URL if modern URL fails
pub fn steam_legacy_cdn_url(url: &str) -> Option<String> {
    if url.contains("community_assets/images/apps/") {
        if let Some(pos) = url.find("images/apps/") {
            let suffix = &url[pos + "images/apps/".len()..];
            return Some(format!(
                "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/{suffix}"
            ));
        }
    }
    None
}

/// Generate prioritized list of candidate URLs (modern Steam CDN first, legacy Akamai fallback)
pub fn get_steam_icon_candidates(url: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    if let Some(modern) = steam_modern_cdn_url(url) {
        // Legacy URL provided: prioritize modern first, then legacy original
        candidates.push(modern);
        candidates.push(url.to_string());
    } else if let Some(legacy) = steam_legacy_cdn_url(url) {
        // Modern URL provided: prioritize modern original first, then legacy fallback
        candidates.push(url.to_string());
        candidates.push(legacy);
    } else {
        candidates.push(url.to_string());
    }
    candidates
}

/// Resolves the default cache directory for achievements
pub fn default_achievements_cache_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return PathBuf::from(appdata)
                .join("omnis")
                .join("cache")
                .join("achievements");
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Caches")
                .join("omnis")
                .join("achievements");
        }
    }

    #[cfg(target_family = "unix")]
    {
        if let Ok(xdg_cache) = std::env::var("XDG_CACHE_HOME") {
            return PathBuf::from(xdg_cache).join("omnis").join("achievements");
        }
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join(".cache")
                .join("omnis")
                .join("achievements");
        }
    }

    std::env::temp_dir()
        .join("omnis")
        .join("cache")
        .join("achievements")
}

/// Asynchronous caching engine for achievement icon assets
#[derive(Clone)]
pub struct AchievementCacheManager {
    client: reqwest::Client,
    base_cache_dir: PathBuf,
    semaphore: Arc<Semaphore>,
}

impl Default for AchievementCacheManager {
    fn default() -> Self {
        Self::new(default_achievements_cache_dir())
    }
}

impl AchievementCacheManager {
    /// Creates a new cache manager with default 8 simultaneous downloads
    pub fn new(base_cache_dir: PathBuf) -> Self {
        Self::with_concurrency(base_cache_dir, 8)
    }

    /// Creates a new cache manager with custom concurrency limit
    pub fn with_concurrency(base_cache_dir: PathBuf, concurrency: usize) -> Self {
        let client = reqwest::Client::builder()
            .pool_max_idle_per_host(concurrency)
            .tcp_nodelay(true)
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .unwrap_or_default();

        Self {
            client,
            base_cache_dir,
            semaphore: Arc::new(Semaphore::new(concurrency.max(1))),
        }
    }

    /// Returns the base directory where achievements are stored
    pub fn base_cache_dir(&self) -> &Path {
        &self.base_cache_dir
    }

    /// Caches all missing achievement icons for a given game
    ///
    /// Skips icons that are already present on disk and up-to-date in SQLite.
    /// Downloads missing icons concurrently (limited by semaphore) and updates SQLite.
    pub async fn cache_achievements_for_game(
        &self,
        db: &Database,
        game_id: Uuid,
        achievements: &[Achievement],
    ) -> Result<usize, String> {
        let game_title: Arc<str> = Arc::from(
            db.get_game_by_id(game_id)
                .ok()
                .flatten()
                .map(|g| g.title)
                .unwrap_or_else(|| game_id.to_string())
                .as_str(),
        );

        let game_folder = self.base_cache_dir.join(game_id.to_string());
        if !game_folder.exists() {
            tokio::fs::create_dir_all(&game_folder)
                .await
                .map_err(|e| format!("Failed to create achievements cache dir: {e}"))?;
        }

        let mut tasks = Vec::new();

        for ach in achievements {
            let primary_url = if !ach.icon_unlocked_url.trim().is_empty() {
                Some(ach.icon_unlocked_url.trim().to_string())
            } else {
                None
            };

            let fallback_url = ach
                .icon_locked_url
                .as_ref()
                .map(|u| u.trim().to_string())
                .filter(|u| !u.is_empty() && Some(u) != primary_url.as_ref());

            let mut candidates = Vec::new();
            if let Some(ref p) = primary_url {
                for c in get_steam_icon_candidates(p) {
                    if !candidates.contains(&c) {
                        candidates.push(c);
                    }
                }
            }
            if let Some(ref f) = fallback_url {
                for c in get_steam_icon_candidates(f) {
                    if !candidates.contains(&c) {
                        candidates.push(c);
                    }
                }
            }

            if candidates.is_empty() {
                continue;
            }

            // Target URL is the primary candidate (modern CDN prioritized)
            let hash_source = &candidates[0];
            let hash = compute_icon_hash(hash_source);
            let file_name = format!("{hash}.png");
            let file_path = game_folder.join(file_name);
            let file_path_str = file_path.to_string_lossy().to_string();

            // Check if file is already cached on disk
            if file_path.exists() {
                // If local_icon_path is not already matching, update DB
                if ach.local_icon_path.as_deref() != Some(&file_path_str) {
                    let _ = db.update_achievement_local_icon(&ach.id, &file_path_str);
                }
                continue;
            }

            let client = self.client.clone();
            let semaphore = self.semaphore.clone();
            let ach_id = ach.id.clone();
            let ach_name = ach.display_name.clone();
            let title = Arc::clone(&game_title);
            let original_url = primary_url
                .as_deref()
                .or(fallback_url.as_deref())
                .unwrap_or(hash_source)
                .to_string();

            tasks.push(tokio::spawn(async move {
                let _permit = match semaphore.acquire().await {
                    Ok(p) => p,
                    Err(e) => {
                        error!("Failed to acquire semaphore permit for '{title}': {e}");
                        return None;
                    }
                };

                async fn download_icon(
                    client: &reqwest::Client,
                    u: &str,
                    dest: &Path,
                ) -> Result<(), String> {
                    match client.get(u).send().await {
                        Ok(resp) if resp.status().is_success() => match resp.bytes().await {
                            Ok(bytes) => {
                                tokio::fs::write(dest, bytes)
                                    .await
                                    .map_err(|e| format!("Failed to write to disk: {e}"))?;
                                Ok(())
                            }
                            Err(e) => Err(format!("Failed to read body: {e}")),
                        },
                        Ok(resp) => Err(format!("HTTP status {}", resp.status())),
                        Err(e) => Err(format!("Network error: {e}")),
                    }
                }

                let mut last_err = String::new();
                let mut success = false;

                for candidate in &candidates {
                    debug!("Downloading achievement icon for '{title}' - '{ach_name}' ({ach_id}) from {candidate}");
                    match download_icon(&client, candidate, &file_path).await {
                        Ok(()) => {
                            success = true;
                            break;
                        }
                        Err(err) => {
                            debug!("Candidate {candidate} failed: {err}");
                            last_err = err;
                        }
                    }
                }

                if success {
                    Some((ach_id, file_path_str))
                } else {
                    warn!(
                        "Icon download failed for game '{}' (achievement '{}', url: '{}'): {}",
                        title, ach_name, original_url, last_err
                    );
                    None
                }
            }));
        }

        let mut newly_cached = 0;
        for task in tasks {
            if let Ok(Some((ach_id, path))) = task.await {
                if let Err(e) = db.update_achievement_local_icon(&ach_id, &path) {
                    warn!("Failed to update local icon path in DB for {ach_id}: {e}");
                } else {
                    newly_cached += 1;
                }
            }
        }

        debug!(
            "Cached {} icons for game '{}' ({}) (directory: {:?})",
            newly_cached, game_title, game_id, game_folder
        );

        Ok(newly_cached)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use omnis_sdk::DiscoveredGame;

    #[test]
    fn test_compute_icon_hash() {
        let hash1 = compute_icon_hash("https://example.com/icon.png");
        let hash2 = compute_icon_hash("https://example.com/icon.png");
        let hash3 = compute_icon_hash("https://example.com/other.png");

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
        assert_eq!(hash1.len(), 64);
    }

    #[test]
    fn test_steam_modern_and_legacy_cdn_urls() {
        let legacy = "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/200710/7055d6067c41339fa28f0b10bd49bc3a33953625.jpg";
        let modern = "https://shared.steamstatic.com/community_assets/images/apps/200710/7055d6067c41339fa28f0b10bd49bc3a33953625.jpg";

        assert_eq!(steam_modern_cdn_url(legacy).as_deref(), Some(modern));
        assert_eq!(steam_legacy_cdn_url(modern).as_deref(), Some(legacy));

        let non_steam = "https://example.com/icon.png";
        assert_eq!(steam_modern_cdn_url(non_steam), None);
        assert_eq!(steam_legacy_cdn_url(non_steam), None);

        // Prioritized candidates: modern first, then legacy
        let candidates_from_legacy = get_steam_icon_candidates(legacy);
        assert_eq!(candidates_from_legacy.len(), 2);
        assert_eq!(candidates_from_legacy[0], modern);
        assert_eq!(candidates_from_legacy[1], legacy);

        let candidates_from_modern = get_steam_icon_candidates(modern);
        assert_eq!(candidates_from_modern.len(), 2);
        assert_eq!(candidates_from_modern[0], modern);
        assert_eq!(candidates_from_modern[1], legacy);
    }

    #[tokio::test]
    async fn test_cache_idempotency_and_existing_files() {
        let temp_dir = std::env::temp_dir().join(format!("omnis_ach_test_{}", Uuid::new_v4()));
        let _ = tokio::fs::create_dir_all(&temp_dir).await;

        let manager = AchievementCacheManager::new(temp_dir.clone());
        let db = Database::open_in_memory().expect("Failed to open DB");

        // Insert game
        let sample = DiscoveredGame {
            library_id: "steam".to_string(),
            external_id: "730".to_string(),
            title: "CS:GO".to_string(),
            install_dir: None,
            is_installed: true,
            play_action: None,
            playtime_seconds: 0,
            play_count: 0,
            last_activity: None,
            cover_image_path: None,
            background_image_path: None,
        };
        db.ingest_discovered_batch(&[sample])
            .expect("Failed ingest");
        let games = db.get_all_games().unwrap();
        let game_id = games[0].id;

        let icon_url = "https://example.com/pre_existing_icon.png";
        let hash = compute_icon_hash(icon_url);
        let game_folder = temp_dir.join(game_id.to_string());
        tokio::fs::create_dir_all(&game_folder).await.unwrap();
        let pre_existing_file = game_folder.join(format!("{hash}.png"));
        tokio::fs::write(&pre_existing_file, b"fake_png_data")
            .await
            .unwrap();

        let achievements = vec![Achievement {
            id: format!("steam_{}_ach_1", game_id),
            game_id,
            api_name: "ach_1".to_string(),
            display_name: "First Blood".to_string(),
            description: None,
            icon_unlocked_url: icon_url.to_string(),
            icon_locked_url: None,
            local_icon_path: None,
            is_unlocked: true,
            unlock_time: None,
            rarity_percentage: None,
            points: None,
            is_hidden: false,
        }];

        db.upsert_achievements(game_id, &achievements).unwrap();

        let downloaded = manager
            .cache_achievements_for_game(&db, game_id, &achievements)
            .await
            .expect("Failed caching");

        // Should be 0 network downloads since file was pre-existing
        assert_eq!(downloaded, 0);

        // But DB should be updated with the local path
        let summary = db.get_game_achievements(game_id).unwrap();
        assert_eq!(
            summary.achievements[0].local_icon_path.as_deref(),
            Some(pre_existing_file.to_string_lossy().as_ref())
        );

        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
    }
}
