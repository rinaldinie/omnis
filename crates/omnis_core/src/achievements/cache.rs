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
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Compute SHA-256 hex digest for an image URL to generate a safe unique filename
pub fn compute_icon_hash(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    format!("{:x}", hasher.finalize())
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
            return PathBuf::from(xdg_cache)
                .join("omnis")
                .join("achievements");
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
        let game_folder = self.base_cache_dir.join(game_id.to_string());
        if !game_folder.exists() {
            tokio::fs::create_dir_all(&game_folder)
                .await
                .map_err(|e| format!("Failed to create achievements cache dir: {e}"))?;
        }

        let mut tasks = Vec::new();

        for ach in achievements {
            let url = if !ach.icon_unlocked_url.trim().is_empty() {
                ach.icon_unlocked_url.trim().to_string()
            } else if let Some(ref locked_url) = ach.icon_locked_url {
                locked_url.trim().to_string()
            } else {
                continue;
            };

            // Calculate destination file path: {game_folder}/{hash}.png
            let hash = compute_icon_hash(&url);
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

            tasks.push(tokio::spawn(async move {
                let _permit = match semaphore.acquire().await {
                    Ok(p) => p,
                    Err(e) => {
                        error!("Failed to acquire semaphore permit: {e}");
                        return None;
                    }
                };

                debug!("Downloading achievement icon for {} from {}", ach_id, url);
                match client.get(&url).send().await {
                    Ok(resp) if resp.status().is_success() => match resp.bytes().await {
                        Ok(bytes) => {
                            if let Err(e) = tokio::fs::write(&file_path, bytes).await {
                                warn!("Failed to write achievement icon to disk: {e}");
                                None
                            } else {
                                Some((ach_id, file_path_str))
                            }
                        }
                        Err(e) => {
                            warn!("Failed to read achievement icon body: {e}");
                            None
                        }
                    },
                    Ok(resp) => {
                        warn!("Icon download failed with HTTP status {}", resp.status());
                        None
                    }
                    Err(e) => {
                        warn!("Failed to download achievement icon: {e}");
                        None
                    }
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

        info!(
            "Cached {} icons for game {} (directory: {:?})",
            newly_cached, game_id, game_folder
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
        db.ingest_discovered_batch(&[sample]).expect("Failed ingest");
        let games = db.get_all_games().unwrap();
        let game_id = games[0].id;

        let icon_url = "https://example.com/pre_existing_icon.png";
        let hash = compute_icon_hash(icon_url);
        let game_folder = temp_dir.join(game_id.to_string());
        tokio::fs::create_dir_all(&game_folder).await.unwrap();
        let pre_existing_file = game_folder.join(format!("{hash}.png"));
        tokio::fs::write(&pre_existing_file, b"fake_png_data").await.unwrap();

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
