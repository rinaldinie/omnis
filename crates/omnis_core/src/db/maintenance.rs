use chrono::Utc;
use omnis_sdk::DiscoveredGame;
use rusqlite::{params, Result};
use std::path::PathBuf;
use uuid::Uuid;

use crate::backup::{BackupFrequency, BackupScheduleConfig};
use crate::db::{Database, LibraryCounts};

/// Repository trait for library counts, sample game seeding, and image cache path relocation
pub trait CatalogMaintenanceRepository: Send + Sync {
    /// Ingest a batch of discovered games from a library plugin inside a single transaction
    fn ingest_discovered_batch(&self, games: &[DiscoveredGame]) -> Result<usize>;

    /// Seed iconic starter games if the library is empty
    fn seed_sample_games(&self) -> Result<usize>;

    /// Get total game count
    fn count_games(&self) -> Result<usize>;

    /// Optimized single-pass SQL aggregation for library dashboard counts
    fn get_library_counts(&self) -> Result<LibraryCounts>;

    /// Safely realigns cached image and achievement paths to the active app directory
    fn relocate_image_paths(&self, new_base_dir: &str) -> Result<usize>;

    /// Retrieve current backup schedule configuration
    fn get_backup_schedule(&self) -> Result<BackupScheduleConfig>;

    /// Save or update backup schedule configuration
    fn save_backup_schedule(&self, config: &BackupScheduleConfig) -> Result<()>;

    /// Record the completion of an automated or manual backup
    fn record_backup_completed(&self, timestamp_utc: &str) -> Result<()>;
}

impl CatalogMaintenanceRepository for Database {
    fn ingest_discovered_batch(&self, games: &[DiscoveredGame]) -> Result<usize> {
        let mut conn = self.writer();
        let tx = conn.transaction()?;
        let now = Utc::now().to_rfc3339();

        let mut count = 0;
        for g in games {
            let install_dir_str = g
                .install_dir
                .as_ref()
                .map(|p| p.to_string_lossy().to_string());
            let last_activity_str = g.last_activity.map(|t| t.to_rfc3339());
            let sorting_title = g.title.to_lowercase();
            let new_id = Uuid::new_v4().to_string();
            let library_play_action_json = g
                .play_action
                .as_ref()
                .and_then(|pa| serde_json::to_string(pa).ok());

            tx.execute(
                "
                INSERT INTO games (
                    id, library_id, external_id, title, sorting_title,
                    install_dir, is_installed, playtime_seconds, play_count,
                    last_activity, cover_image_path, background_image_path,
                    library_play_action, added_timestamp, modified_timestamp
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
                ON CONFLICT(library_id, external_id) DO UPDATE SET
                    title = CASE
                        WHEN excluded.title LIKE 'GOG Game %' AND games.title NOT LIKE 'GOG Game %'
                        THEN games.title
                        ELSE excluded.title
                    END,
                    sorting_title = CASE
                        WHEN excluded.title LIKE 'GOG Game %' AND games.title NOT LIKE 'GOG Game %'
                        THEN games.sorting_title
                        ELSE excluded.sorting_title
                    END,
                    install_dir = COALESCE(excluded.install_dir, games.install_dir),
                    is_installed = MAX(games.is_installed, excluded.is_installed),
                    playtime_seconds = MAX(games.playtime_seconds, excluded.playtime_seconds),
                    play_count = MAX(games.play_count, excluded.play_count),
                    last_activity = CASE
                        WHEN excluded.last_activity IS NOT NULL AND games.last_activity IS NOT NULL
                        THEN MAX(games.last_activity, excluded.last_activity)
                        ELSE COALESCE(excluded.last_activity, games.last_activity)
                    END,
                    cover_image_path = CASE
                        WHEN (games.cover_image_path LIKE '%/header.jpg' OR games.cover_image_path LIKE '%\\header.jpg') AND excluded.cover_image_path IS NOT NULL AND excluded.cover_image_path NOT LIKE '%/header.jpg' AND excluded.cover_image_path NOT LIKE '%\\header.jpg'
                        THEN excluded.cover_image_path
                        WHEN (games.cover_image_path LIKE '%_glx_logo%' OR games.cover_image_path LIKE '%icon.png') AND excluded.cover_image_path IS NOT NULL AND excluded.cover_image_path NOT LIKE '%_glx_logo%' AND excluded.cover_image_path NOT LIKE '%icon.png'
                        THEN excluded.cover_image_path
                        ELSE COALESCE(games.cover_image_path, excluded.cover_image_path)
                    END,
                    background_image_path = CASE
                        WHEN (games.background_image_path LIKE '%/header.jpg' OR games.background_image_path LIKE '%\\header.jpg') AND excluded.background_image_path IS NOT NULL AND excluded.background_image_path NOT LIKE '%/header.jpg' AND excluded.background_image_path NOT LIKE '%\\header.jpg'
                        THEN excluded.background_image_path
                        ELSE COALESCE(games.background_image_path, excluded.background_image_path)
                    END,
                    library_play_action = CASE
                        WHEN games.is_installed = 1 AND games.library_play_action IS NOT NULL AND TRIM(games.library_play_action) != '' AND excluded.is_installed = 0
                        THEN games.library_play_action
                        ELSE COALESCE(excluded.library_play_action, games.library_play_action)
                    END,
                    modified_timestamp = excluded.modified_timestamp
                ",
                params![
                    new_id,
                    g.library_id,
                    g.external_id,
                    g.title,
                    sorting_title,
                    install_dir_str,
                    g.is_installed as i32,
                    g.playtime_seconds as i64,
                    g.play_count as i32,
                    last_activity_str,
                    g.cover_image_path,
                    g.background_image_path,
                    library_play_action_json,
                    now
                ],
            )?;
            count += 1;
        }

        tx.commit()?;
        drop(conn);
        let _ = self.reload_search_index();
        Ok(count)
    }

    fn seed_sample_games(&self) -> Result<usize> {
        let count = self.count_games()?;
        if count > 0 {
            return Ok(0);
        }

        let samples = vec![
            DiscoveredGame {
                library_id: "steam".to_string(),
                external_id: "1091500".to_string(),
                title: "Cyberpunk 2077".to_string(),
                install_dir: Some(PathBuf::from("C:\\Games\\Cyberpunk 2077")),
                is_installed: true,
                play_action: None,
                playtime_seconds: 148500, // ~41 hours
                play_count: 24,
                last_activity: Some(Utc::now()),
                cover_image_path: None,
                background_image_path: None,
            },
            DiscoveredGame {
                library_id: "steam".to_string(),
                external_id: "292030".to_string(),
                title: "The Witcher 3: Wild Hunt".to_string(),
                install_dir: Some(PathBuf::from("C:\\Games\\The Witcher 3")),
                is_installed: true,
                play_action: None,
                playtime_seconds: 288000, // ~80 hours
                play_count: 52,
                last_activity: Some(Utc::now()),
                cover_image_path: None,
                background_image_path: None,
            },
            DiscoveredGame {
                library_id: "steam".to_string(),
                external_id: "1145360".to_string(),
                title: "Hades".to_string(),
                install_dir: None,
                is_installed: false,
                play_action: None,
                playtime_seconds: 93600, // ~26 hours
                play_count: 38,
                last_activity: Some(Utc::now()),
                cover_image_path: None,
                background_image_path: None,
            },
            DiscoveredGame {
                library_id: "steam".to_string(),
                external_id: "620".to_string(),
                title: "Portal 2".to_string(),
                install_dir: Some(PathBuf::from("C:\\Steam\\steamapps\\common\\Portal 2")),
                is_installed: true,
                play_action: None,
                playtime_seconds: 39600, // ~11 hours
                play_count: 12,
                last_activity: Some(Utc::now()),
                cover_image_path: None,
                background_image_path: None,
            },
            DiscoveredGame {
                library_id: "gog".to_string(),
                external_id: "1423714649".to_string(),
                title: "Baldur's Gate 3".to_string(),
                install_dir: None,
                is_installed: false,
                play_action: None,
                playtime_seconds: 432000, // ~120 hours
                play_count: 67,
                last_activity: Some(Utc::now()),
                cover_image_path: None,
                background_image_path: None,
            },
            DiscoveredGame {
                library_id: "steam".to_string(),
                external_id: "1245620".to_string(),
                title: "Elden Ring".to_string(),
                install_dir: None,
                is_installed: false,
                play_action: None,
                playtime_seconds: 252000, // ~70 hours
                play_count: 45,
                last_activity: Some(Utc::now()),
                cover_image_path: None,
                background_image_path: None,
            },
        ];

        self.ingest_discovered_batch(&samples)
    }

    fn count_games(&self) -> Result<usize> {
        let conn = self.reader();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM games", [], |row| row.get(0))?;
        Ok(count as usize)
    }

    /// Optimized single-pass SQL aggregation for library dashboard counts
    fn get_library_counts(&self) -> Result<LibraryCounts> {
        let conn = self.reader();
        let query = "
            SELECT
                COALESCE(SUM(CASE WHEN is_hidden = 0 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 0 AND is_installed = 1 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 0 AND LOWER(library_id) = 'steam' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 0 AND LOWER(library_id) = 'gog' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 0 AND LOWER(library_id) = 'epic' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 0 AND LOWER(library_id) = 'xbox' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 0 AND last_activity IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 0 AND is_favorite = 1 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 0 AND (LOWER(genres) LIKE '%action%' OR LOWER(genres) LIKE '%azione%') THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 0 AND (LOWER(genres) LIKE '%rpg%' OR LOWER(genres) LIKE '%gdr%') THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 0 AND (LOWER(genres) LIKE '%strategy%' OR LOWER(genres) LIKE '%strategia%' OR LOWER(genres) LIKE '%puzzle%') THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 0 AND LOWER(genres) LIKE '%indie%' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 1 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN is_hidden = 0 AND LOWER(library_id) = 'switch' THEN 1 ELSE 0 END), 0)
            FROM games
        ";
        let counts = conn.query_row(query, [], |row| {
            Ok(LibraryCounts {
                total: row.get::<_, i64>(0)? as usize,
                installed: row.get::<_, i64>(1)? as usize,
                steam: row.get::<_, i64>(2)? as usize,
                gog: row.get::<_, i64>(3)? as usize,
                epic: row.get::<_, i64>(4)? as usize,
                xbox: row.get::<_, i64>(5)? as usize,
                recent: row.get::<_, i64>(6)? as usize,
                favorites: row.get::<_, i64>(7)? as usize,
                action: row.get::<_, i64>(8)? as usize,
                rpg: row.get::<_, i64>(9)? as usize,
                strategy: row.get::<_, i64>(10)? as usize,
                indie: row.get::<_, i64>(11)? as usize,
                hidden: row.get::<_, i64>(12)? as usize,
                switch: row.get::<_, i64>(13)? as usize,
            })
        })?;
        Ok(counts)
    }

    /// Safely realigns cached image and achievement paths to the active app directory.
    /// Extracts the relative `cache/...` suffix from each entry and prepends the new base directory,
    /// completely preventing nested/recursive path concatenation.
    fn relocate_image_paths(&self, new_base_dir: &str) -> Result<usize> {
        let conn = self.writer();
        let target_base = new_base_dir.trim_end_matches(['\\', '/']);

        // Update games (cover, background, icon)
        let query_games = format!(
            "UPDATE games SET
                cover_image_path = CASE
                    WHEN cover_image_path LIKE '%cache/%'
                    THEN '{target}/' || SUBSTR(cover_image_path, INSTR(cover_image_path, 'cache/'))
                    WHEN cover_image_path LIKE '%cache\\%'
                    THEN '{target}\\' || SUBSTR(cover_image_path, INSTR(cover_image_path, 'cache\\'))
                    ELSE cover_image_path
                END,
                background_image_path = CASE
                    WHEN background_image_path LIKE '%cache/%'
                    THEN '{target}/' || SUBSTR(background_image_path, INSTR(background_image_path, 'cache/'))
                    WHEN background_image_path LIKE '%cache\\%'
                    THEN '{target}\\' || SUBSTR(background_image_path, INSTR(background_image_path, 'cache\\'))
                    ELSE background_image_path
                END,
                icon_image_path = CASE
                    WHEN icon_image_path LIKE '%cache/%'
                    THEN '{target}/' || SUBSTR(icon_image_path, INSTR(icon_image_path, 'cache/'))
                    WHEN icon_image_path LIKE '%cache\\%'
                    THEN '{target}\\' || SUBSTR(icon_image_path, INSTR(icon_image_path, 'cache\\'))
                    ELSE icon_image_path
                END
             WHERE (cover_image_path IS NOT NULL AND NOT cover_image_path LIKE '{target}%' AND NOT cover_image_path LIKE 'http%')
                OR (background_image_path IS NOT NULL AND NOT background_image_path LIKE '{target}%' AND NOT background_image_path LIKE 'http%')
                OR (icon_image_path IS NOT NULL AND NOT icon_image_path LIKE '{target}%' AND NOT icon_image_path LIKE 'http%');",
            target = target_base
        );
        let n1 = conn.execute(&query_games, []).unwrap_or(0);

        // Update game_achievements (local_icon_path)
        let query_achievements = format!(
            "UPDATE game_achievements SET
                local_icon_path = CASE
                    WHEN local_icon_path LIKE '%cache/%'
                    THEN '{target}/' || SUBSTR(local_icon_path, INSTR(local_icon_path, 'cache/'))
                    WHEN local_icon_path LIKE '%cache\\%'
                    THEN '{target}\\' || SUBSTR(local_icon_path, INSTR(local_icon_path, 'cache\\'))
                    ELSE local_icon_path
                END
             WHERE local_icon_path IS NOT NULL
               AND NOT local_icon_path LIKE '{target}%'
               AND NOT local_icon_path LIKE 'http%';",
            target = target_base
        );
        let n2 = conn.execute(&query_achievements, []).unwrap_or(0);

        Ok(n1 + n2)
    }

    fn get_backup_schedule(&self) -> Result<BackupScheduleConfig> {
        let conn = self.reader();
        let mut stmt = conn.prepare(
            "SELECT frequency, destination_dir, max_rotations, last_backup_utc, include_artwork, updated_at
             FROM backup_schedule WHERE id = 1;",
        )?;

        let res = stmt.query_row([], |row| {
            let freq_str: String = row.get(0)?;
            let dest_dir_str: Option<String> = row.get(1)?;
            let max_rotations: i64 = row.get(2)?;
            let last_backup_utc: Option<String> = row.get(3)?;
            let include_artwork_val: i64 = row.get(4)?;
            let updated_at: String = row.get(5)?;

            let frequency = BackupFrequency::from_str_name(&freq_str);
            let destination_dir = dest_dir_str.map(PathBuf::from);
            let max_rotations = (max_rotations as usize).clamp(1, 10);
            let include_artwork = include_artwork_val != 0;

            Ok(BackupScheduleConfig {
                frequency,
                destination_dir,
                max_rotations,
                last_backup_utc,
                include_artwork,
                updated_at,
            })
        });

        match res {
            Ok(config) => Ok(config),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(BackupScheduleConfig::default()),
            Err(err) => Err(err),
        }
    }

    fn save_backup_schedule(&self, config: &BackupScheduleConfig) -> Result<()> {
        let conn = self.writer();
        let freq_str = config.frequency.as_str();
        let dest_dir_str = config
            .destination_dir
            .as_ref()
            .map(|p| p.to_string_lossy().to_string());
        let max_rotations = config.clamped_max_rotations() as i64;
        let include_artwork = if config.include_artwork { 1 } else { 0 };
        let updated_at = if config.updated_at.trim().is_empty() {
            Utc::now().to_rfc3339()
        } else {
            config.updated_at.clone()
        };

        conn.execute(
            "INSERT INTO backup_schedule (id, frequency, destination_dir, max_rotations, last_backup_utc, include_artwork, updated_at)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                 frequency = excluded.frequency,
                 destination_dir = excluded.destination_dir,
                 max_rotations = excluded.max_rotations,
                 last_backup_utc = COALESCE(excluded.last_backup_utc, backup_schedule.last_backup_utc),
                 include_artwork = excluded.include_artwork,
                 updated_at = excluded.updated_at;",
            params![
                freq_str,
                dest_dir_str,
                max_rotations,
                config.last_backup_utc,
                include_artwork,
                updated_at,
            ],
        )?;

        Ok(())
    }

    fn record_backup_completed(&self, timestamp_utc: &str) -> Result<()> {
        let conn = self.writer();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO backup_schedule (id, frequency, destination_dir, max_rotations, last_backup_utc, include_artwork, updated_at)
             VALUES (1, 'disabled', NULL, 10, ?1, 0, ?2)
             ON CONFLICT(id) DO UPDATE SET
                 last_backup_utc = excluded.last_backup_utc,
                 updated_at = excluded.updated_at;",
            params![timestamp_utc, now],
        )?;
        Ok(())
    }
}

// Inherent forwarders on Database for backward compatibility
impl Database {
    #[inline]
    pub fn ingest_discovered_batch(&self, games: &[DiscoveredGame]) -> Result<usize> {
        CatalogMaintenanceRepository::ingest_discovered_batch(self, games)
    }

    #[inline]
    pub fn seed_sample_games(&self) -> Result<usize> {
        CatalogMaintenanceRepository::seed_sample_games(self)
    }

    #[inline]
    pub fn count_games(&self) -> Result<usize> {
        CatalogMaintenanceRepository::count_games(self)
    }

    #[inline]
    pub fn get_library_counts(&self) -> Result<LibraryCounts> {
        CatalogMaintenanceRepository::get_library_counts(self)
    }

    #[inline]
    pub fn relocate_image_paths(&self, new_base_dir: &str) -> Result<usize> {
        CatalogMaintenanceRepository::relocate_image_paths(self, new_base_dir)
    }

    #[inline]
    pub fn get_backup_schedule(&self) -> Result<BackupScheduleConfig, rusqlite::Error> {
        CatalogMaintenanceRepository::get_backup_schedule(self)
    }

    #[inline]
    pub fn save_backup_schedule(
        &self,
        config: &BackupScheduleConfig,
    ) -> Result<(), rusqlite::Error> {
        CatalogMaintenanceRepository::save_backup_schedule(self, config)
    }

    #[inline]
    pub fn record_backup_completed(&self, timestamp_utc: &str) -> Result<(), rusqlite::Error> {
        CatalogMaintenanceRepository::record_backup_completed(self, timestamp_utc)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_backup_schedule_crud_and_defaults() {
        let db = Database::open_in_memory().expect("Failed to open test in-memory DB");

        // 1. Initial seeded schedule must be default (disabled, max 10)
        let initial = db
            .get_backup_schedule()
            .expect("Failed to get initial schedule");
        assert_eq!(initial.frequency, BackupFrequency::Disabled);
        assert_eq!(initial.destination_dir, None);
        assert_eq!(initial.max_rotations, 10);
        assert_eq!(initial.last_backup_utc, None);
        assert!(!initial.include_artwork);

        // 2. Update schedule config (e.g. Daily, with destination dir, max 5, include artwork)
        let custom_cfg = BackupScheduleConfig {
            frequency: BackupFrequency::Daily,
            destination_dir: Some(PathBuf::from("/backups/omnis")),
            max_rotations: 5,
            last_backup_utc: None,
            include_artwork: true,
            updated_at: "2026-11-01T08:00:00Z".to_string(),
        };
        db.save_backup_schedule(&custom_cfg)
            .expect("Failed to save schedule");

        let saved = db.get_backup_schedule().expect("Failed to reload schedule");
        assert_eq!(saved.frequency, BackupFrequency::Daily);
        assert_eq!(saved.destination_dir, Some(PathBuf::from("/backups/omnis")));
        assert_eq!(saved.max_rotations, 5);
        assert_eq!(saved.last_backup_utc, None);
        assert!(saved.include_artwork);

        // 3. Record backup completed should update last_backup_utc
        let completed_ts = "2026-11-01T12:00:00Z";
        db.record_backup_completed(completed_ts)
            .expect("Failed to record completion");

        let after_completed = db
            .get_backup_schedule()
            .expect("Failed to read after completed");
        assert_eq!(
            after_completed.last_backup_utc,
            Some(completed_ts.to_string())
        );
        assert_eq!(after_completed.frequency, BackupFrequency::Daily);
        assert_eq!(after_completed.max_rotations, 5);
        assert!(after_completed.include_artwork);

        // 4. Saving again with last_backup_utc = None should preserve existing last_backup_utc via COALESCE
        let update_without_ts = BackupScheduleConfig {
            frequency: BackupFrequency::Weekly,
            destination_dir: Some(PathBuf::from("/backups/omnis_weekly")),
            max_rotations: 15, // should be clamped to 10
            last_backup_utc: None,
            include_artwork: false,
            updated_at: "2026-11-01T13:00:00Z".to_string(),
        };
        db.save_backup_schedule(&update_without_ts)
            .expect("Failed to save update");

        let preserved = db
            .get_backup_schedule()
            .expect("Failed to reload after preserve");
        assert_eq!(preserved.frequency, BackupFrequency::Weekly);
        assert_eq!(preserved.max_rotations, 10); // clamped to 10
        assert_eq!(preserved.last_backup_utc, Some(completed_ts.to_string()));
        assert!(!preserved.include_artwork);
    }
}
