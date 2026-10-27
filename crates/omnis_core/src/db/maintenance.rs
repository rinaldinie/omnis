use chrono::Utc;
use rusqlite::{params, Result};
use std::path::PathBuf;
use uuid::Uuid;
use omnis_sdk::DiscoveredGame;

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
            let play_actions_json = g
                .play_action
                .as_ref()
                .and_then(|pa| serde_json::to_string(&vec![pa.clone()]).ok());

            tx.execute(
                "
                INSERT INTO games (
                    id, library_id, external_id, title, sorting_title,
                    install_dir, is_installed, playtime_seconds, play_count,
                    last_activity, cover_image_path, background_image_path,
                    play_actions, added_timestamp, modified_timestamp
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
                ON CONFLICT(library_id, external_id) DO UPDATE SET
                    title = excluded.title,
                    sorting_title = excluded.sorting_title,
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
                        WHEN (games.cover_image_path LIKE '%/header.jpg' OR games.cover_image_path LIKE '%/header.jpg') AND excluded.cover_image_path IS NOT NULL AND excluded.cover_image_path NOT LIKE '%/header.jpg' AND excluded.cover_image_path NOT LIKE '%/header.jpg'
                        THEN excluded.cover_image_path
                        ELSE COALESCE(games.cover_image_path, excluded.cover_image_path)
                    END,
                    background_image_path = CASE
                        WHEN (games.background_image_path LIKE '%/header.jpg' OR games.background_image_path LIKE '%/header.jpg') AND excluded.background_image_path IS NOT NULL AND excluded.background_image_path NOT LIKE '%/header.jpg' AND excluded.background_image_path NOT LIKE '%/header.jpg'
                        THEN excluded.background_image_path
                        ELSE COALESCE(games.background_image_path, excluded.background_image_path)
                    END,
                    play_actions = CASE
                        WHEN games.is_installed = 1 AND games.play_actions IS NOT NULL AND TRIM(games.play_actions) != '' AND TRIM(games.play_actions) != '[]' AND excluded.is_installed = 0
                        THEN games.play_actions
                        ELSE COALESCE(excluded.play_actions, games.play_actions)
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
                    play_actions_json,
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
                COUNT(*),
                COALESCE(SUM(CASE WHEN is_installed = 1 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN LOWER(library_id) = 'steam' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN LOWER(library_id) = 'gog' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN LOWER(library_id) = 'epic' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN LOWER(library_id) = 'xbox' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN last_activity IS NOT NULL OR playtime_seconds > 0 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN critic_score >= 90 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN LOWER(genres) LIKE '%action%' OR LOWER(genres) LIKE '%azione%' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN LOWER(genres) LIKE '%rpg%' OR LOWER(genres) LIKE '%gdr%' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN LOWER(genres) LIKE '%strategy%' OR LOWER(genres) LIKE '%strategia%' OR LOWER(genres) LIKE '%puzzle%' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN LOWER(genres) LIKE '%indie%' THEN 1 ELSE 0 END), 0)
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
}
