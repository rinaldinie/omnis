use chrono::{DateTime, Utc};
use omnis_sdk::{
    CustomLink, DiscoveredGame, Game, GameMetadataPatch, GameUpdateDto, LaunchConfiguration,
};
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Open or create the unified SQLite database with WAL mode
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;

        // Tune SQLite for maximum desktop performance and safe concurrency
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA temp_store = MEMORY;
            PRAGMA cache_size = -64000; -- 64MB memory cache
            PRAGMA foreign_keys = ON;
            ",
        )?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    /// Open an in-memory database (useful for unit tests & benchmarks)
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(
            "
            PRAGMA temp_store = MEMORY;
            PRAGMA foreign_keys = ON;
            ",
        )?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    /// Initialize an in-memory database (alias for open_in_memory)
    pub fn new_in_memory() -> Result<Self> {
        Self::open_in_memory()
    }

    /// Create tables and indexes if they do not exist
    pub fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY NOT NULL,
                library_id TEXT NOT NULL,
                external_id TEXT NOT NULL,
                title TEXT NOT NULL COLLATE NOCASE,
                sorting_title TEXT NOT NULL COLLATE NOCASE,
                install_dir TEXT,
                is_installed INTEGER NOT NULL DEFAULT 0,
                playtime_seconds INTEGER NOT NULL DEFAULT 0,
                play_count INTEGER NOT NULL DEFAULT 0,
                last_activity TEXT,
                release_date TEXT,
                user_score INTEGER,
                critic_score INTEGER,
                community_score INTEGER,
                description TEXT,
                cover_image_path TEXT,
                background_image_path TEXT,
                icon_image_path TEXT,
                genres TEXT,
                developers TEXT,
                publishers TEXT,
                tags TEXT,
                series TEXT,
                age_rating TEXT,
                completion_status TEXT DEFAULT 'NotPlayed',
                user_notes TEXT,
                custom_links TEXT,
                play_actions TEXT,
                added_timestamp TEXT NOT NULL,
                modified_timestamp TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_games_library ON games(library_id);
            CREATE INDEX IF NOT EXISTS idx_games_installed ON games(is_installed);
            CREATE INDEX IF NOT EXISTS idx_games_sorting_title ON games(sorting_title);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_games_library_external ON games(library_id, external_id);

            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE
            );

            CREATE TABLE IF NOT EXISTS game_tags (
                game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY(game_id, tag_id)
            );

            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE
            );

            CREATE TABLE IF NOT EXISTS game_categories (
                game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                PRIMARY KEY(game_id, category_id)
            );
            ",
        )?;

        // Ensure columns exist on already-created tables (idempotent, non-destructive)
        let _ = conn.execute("ALTER TABLE games ADD COLUMN genres TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN developers TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN publishers TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN tags TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN series TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN age_rating TEXT;", []);
        let _ = conn.execute(
            "ALTER TABLE games ADD COLUMN completion_status TEXT DEFAULT 'NotPlayed';",
            [],
        );
        let _ = conn.execute("ALTER TABLE games ADD COLUMN user_notes TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN custom_links TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN play_actions TEXT;", []);

        // Ensure performance indexes exist on existing DBs
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_games_series ON games(series);", []);
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_games_completion_status ON games(completion_status);", []);
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_games_critic_score ON games(critic_score);", []);
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_games_playtime ON games(playtime_seconds);", []);

        Ok(())
    }

    /// Retrieve the column names for a given table via PRAGMA table_info
    pub fn get_table_columns(&self, table: &str) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let pragma = format!("PRAGMA table_info({})", table);
        let mut stmt = conn.prepare(&pragma)?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        let mut columns = Vec::new();
        for r in rows {
            columns.push(r?);
        }
        Ok(columns)
    }

    /// Ingest a batch of discovered games from a library plugin inside a single transaction
    pub fn ingest_discovered_batch(&self, games: &[DiscoveredGame]) -> Result<usize> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let now = Utc::now().to_rfc3339();

        let mut count = 0;
        for g in games {
            let install_dir_str = g.install_dir.as_ref().map(|p| p.to_string_lossy().to_string());
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
                    last_activity = COALESCE(excluded.last_activity, games.last_activity),
                    cover_image_path = COALESCE(games.cover_image_path, excluded.cover_image_path),
                    background_image_path = COALESCE(games.background_image_path, excluded.background_image_path),
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
        Ok(count)
    }

    /// Insert a custom game / non-store executable into the database
    pub fn insert_custom_game(
        &self,
        id: Uuid,
        title: &str,
        sorting_title: &str,
        install_dir: Option<PathBuf>,
        play_actions: Vec<LaunchConfiguration>,
        cover_image_path: Option<String>,
    ) -> Result<Game> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let play_actions_json = serde_json::to_string(&play_actions)
            .unwrap_or_else(|_| "[]".to_string());
        let install_dir_str = install_dir.as_ref().map(|p| p.to_string_lossy().to_string());

        conn.execute(
            "INSERT INTO games (
                id, library_id, external_id, title, sorting_title,
                install_dir, is_installed, play_actions, cover_image_path,
                added_timestamp, modified_timestamp
            ) VALUES (?1, 'custom', ?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?7)",
            params![
                id.to_string(),
                title,
                sorting_title,
                install_dir_str,
                play_actions_json,
                cover_image_path,
                now,
            ],
        )?;

        drop(conn);
        self.get_game_by_id(id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }
}

const GAME_COLUMNS: &str = "
    id, library_id, external_id, title, sorting_title,
    install_dir, is_installed, playtime_seconds, play_count,
    last_activity, release_date, user_score, critic_score,
    community_score, description, cover_image_path,
    background_image_path, icon_image_path,
    genres, developers, publishers, tags,
    series, age_rating, completion_status, user_notes,
    custom_links, play_actions,
    added_timestamp, modified_timestamp
";

fn map_row_to_game(row: &rusqlite::Row) -> rusqlite::Result<Game> {
    let id_str: String = row.get(0)?;
    let id = Uuid::parse_str(&id_str).unwrap_or_else(|_| Uuid::new_v4());
    let library_id: String = row.get(1)?;
    let external_id: String = row.get(2)?;
    let title: String = row.get(3)?;
    let sorting_title: String = row.get(4)?;
    let install_dir_str: Option<String> = row.get(5)?;
    let install_dir = install_dir_str.map(PathBuf::from);
    let is_installed_int: i32 = row.get(6)?;
    let playtime: i64 = row.get(7)?;
    let play_count: i32 = row.get(8)?;
    let last_activity_str: Option<String> = row.get(9)?;
    let last_activity = last_activity_str.and_then(|s| {
        DateTime::parse_from_rfc3339(&s)
            .ok()
            .map(|dt| dt.with_timezone(&Utc))
    });
    let release_date: Option<String> = row.get(10)?;
    let user_score: Option<u8> = row.get(11)?;
    let critic_score: Option<u8> = row.get(12)?;
    let community_score: Option<u8> = row.get(13)?;
    let description: Option<String> = row.get(14)?;
    let cover_image_path: Option<String> = row.get(15)?;
    let background_image_path: Option<String> = row.get(16)?;
    let icon_image_path: Option<String> = row.get(17)?;

    let genres_str: Option<String> = row.get(18)?;
    let genres: Vec<String> = genres_str
        .map(|s| {
            s.split(',')
                .map(|g| g.trim().to_string())
                .filter(|g| !g.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let devs_str: Option<String> = row.get(19)?;
    let developers: Vec<String> = devs_str
        .map(|s| {
            s.split(',')
                .map(|d| d.trim().to_string())
                .filter(|d| !d.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let pubs_str: Option<String> = row.get(20)?;
    let publishers: Vec<String> = pubs_str
        .map(|s| {
            s.split(',')
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let tags_str: Option<String> = row.get(21)?;
    let tags: Vec<String> = tags_str
        .map(|s| {
            s.split(',')
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let series: Option<String> = row.get(22)?;
    let age_rating: Option<String> = row.get(23)?;
    let completion_status: Option<String> = row.get(24)?;
    let user_notes: Option<String> = row.get(25)?;

    let custom_links: Vec<CustomLink> = row
        .get::<_, Option<String>>(26)?
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let play_actions: Vec<LaunchConfiguration> = row
        .get::<_, Option<String>>(27)?
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let added_str: String = row.get(28)?;
    let added_timestamp = DateTime::parse_from_rfc3339(&added_str)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);

    let mod_str: String = row.get(29)?;
    let modified_timestamp = DateTime::parse_from_rfc3339(&mod_str)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);

    Ok(Game {
        id,
        library_id,
        external_id,
        title,
        sorting_title,
        install_dir,
        is_installed: is_installed_int != 0,
        playtime_seconds: playtime as u64,
        play_count: play_count as u32,
        last_activity,
        release_date,
        user_score,
        critic_score,
        community_score,
        description,
        cover_image_path,
        background_image_path,
        icon_image_path,
        genres,
        developers,
        publishers,
        tags,
        categories: Vec::new(),
        series,
        age_rating,
        completion_status,
        user_notes,
        play_actions,
        custom_links,
        added_timestamp,
        modified_timestamp,
    })
}

impl Database {
    /// Retrieve all games in library sorted alphabetically
    pub fn get_all_games(&self) -> Result<Vec<Game>> {
        let conn = self.conn.lock().unwrap();
        let query = format!(
            "
            SELECT {}
            FROM games
            ORDER BY sorting_title ASC
            ",
            GAME_COLUMNS
        );
        let mut stmt = conn.prepare(&query)?;

        let rows = stmt.query_map([], map_row_to_game)?;

        let mut games = Vec::new();
        for r in rows {
            games.push(r?);
        }
        Ok(games)
    }

    /// Retrieve a single game by its unique UUID
    pub fn get_game_by_id(&self, game_id: Uuid) -> Result<Option<Game>> {
        let conn = self.conn.lock().unwrap();
        let query = format!(
            "
            SELECT {}
            FROM games
            WHERE id = ?1
            ",
            GAME_COLUMNS
        );
        let mut stmt = conn.prepare(&query)?;

        let mut rows = stmt.query_map(params![game_id.to_string()], map_row_to_game)?;

        if let Some(r) = rows.next() {
            Ok(Some(r?))
        } else {
            Ok(None)
        }
    }

    /// Search games across titles, series, genres, developers, publishers, tags, notes
    pub fn search_games(&self, search_term: &str) -> Result<Vec<Game>> {
        let conn = self.conn.lock().unwrap();
        let pattern = format!("%{}%", search_term);
        let sql = format!(
            "
            SELECT {}
            FROM games
            WHERE title LIKE ?1
               OR sorting_title LIKE ?1
               OR series LIKE ?1
               OR genres LIKE ?1
               OR developers LIKE ?1
               OR publishers LIKE ?1
               OR tags LIKE ?1
               OR user_notes LIKE ?1
            ORDER BY sorting_title ASC
            ",
            GAME_COLUMNS
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![pattern], map_row_to_game)?;

        let mut games = Vec::new();
        for r in rows {
            games.push(r?);
        }
        Ok(games)
    }

    /// Update game metadata, custom links, play actions, completion status and user notes
    pub fn update_game(&self, update: &GameUpdateDto) -> Result<Game> {
        let now = Utc::now().to_rfc3339();
        let sorting_title = match &update.sorting_title {
            Some(st) if !st.trim().is_empty() => st.clone(),
            _ => update.title.to_lowercase(),
        };
        let genres_str = if update.genres.is_empty() {
            None
        } else {
            Some(update.genres.join(", "))
        };
        let devs_str = if update.developers.is_empty() {
            None
        } else {
            Some(update.developers.join(", "))
        };
        let pubs_str = if update.publishers.is_empty() {
            None
        } else {
            Some(update.publishers.join(", "))
        };
        let tags_str = if update.tags.is_empty() {
            None
        } else {
            Some(update.tags.join(", "))
        };
        let custom_links_json = serde_json::to_string(&update.custom_links)
            .unwrap_or_else(|_| "[]".to_string());
        let play_actions_json = serde_json::to_string(&update.play_actions)
            .unwrap_or_else(|_| "[]".to_string());
        let completion_status_val = update
            .completion_status
            .as_deref()
            .unwrap_or("NotPlayed");

        {
            let conn = self.conn.lock().unwrap();
            let rows_affected = conn.execute(
                "
                UPDATE games SET
                    title = ?2,
                    sorting_title = ?3,
                    release_date = ?4,
                    description = ?5,
                    user_score = ?6,
                    critic_score = ?7,
                    community_score = ?8,
                    series = ?9,
                    age_rating = ?10,
                    completion_status = ?11,
                    user_notes = ?12,
                    genres = ?13,
                    developers = ?14,
                    publishers = ?15,
                    tags = ?16,
                    cover_image_path = ?17,
                    background_image_path = ?18,
                    icon_image_path = ?19,
                    play_actions = ?20,
                    custom_links = ?21,
                    modified_timestamp = ?22
                WHERE id = ?1
                ",
                params![
                    update.id.to_string(),
                    update.title,
                    sorting_title,
                    update.release_date,
                    update.description,
                    update.user_score,
                    update.critic_score,
                    update.community_score,
                    update.series,
                    update.age_rating,
                    completion_status_val,
                    update.user_notes,
                    genres_str,
                    devs_str,
                    pubs_str,
                    tags_str,
                    update.cover_image_path,
                    update.background_image_path,
                    update.icon_image_path,
                    play_actions_json,
                    custom_links_json,
                    now,
                ],
            )?;

            if rows_affected == 0 {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }
        }

        self.get_game_by_id(update.id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    /// Apply a metadata patch from an external provider (e.g. Steam Store, IGDB)
    pub fn apply_metadata_patch(&self, game_id: Uuid, patch: &GameMetadataPatch) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        let genres_joined = if !patch.genres.is_empty() {
            Some(patch.genres.join(", "))
        } else {
            None
        };
        let devs_joined = if !patch.developers.is_empty() {
            Some(patch.developers.join(", "))
        } else {
            None
        };
        let pubs_joined = if !patch.publishers.is_empty() {
            Some(patch.publishers.join(", "))
        } else {
            None
        };
        let tags_joined = if !patch.tags.is_empty() {
            Some(patch.tags.join(", "))
        } else {
            None
        };

        let updated = conn.execute(
            "
            UPDATE games SET
                description = COALESCE(?2, description),
                release_date = COALESCE(?3, release_date),
                cover_image_path = COALESCE(?4, cover_image_path),
                background_image_path = COALESCE(?5, background_image_path),
                icon_image_path = COALESCE(?6, icon_image_path),
                critic_score = COALESCE(?7, critic_score),
                community_score = COALESCE(?8, community_score),
                genres = COALESCE(?9, genres),
                developers = COALESCE(?10, developers),
                publishers = COALESCE(?11, publishers),
                tags = COALESCE(?12, tags),
                modified_timestamp = ?13
            WHERE id = ?1
            ",
            params![
                game_id.to_string(),
                patch.description,
                patch.release_date,
                patch.cover_url,
                patch.background_url,
                patch.icon_url,
                patch.critic_score,
                patch.community_score,
                genres_joined,
                devs_joined,
                pubs_joined,
                tags_joined,
                now,
            ],
        )?;

        Ok(updated > 0)
    }

    /// Seed iconic starter games if the library is empty
    pub fn seed_sample_games(&self) -> Result<usize> {
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

    /// Record a completed play session with duration
    pub fn record_play_session(&self, game_id: Uuid, session_seconds: u64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "
            UPDATE games SET
                playtime_seconds = playtime_seconds + ?2,
                play_count = play_count + 1,
                last_activity = ?3,
                modified_timestamp = ?3
            WHERE id = ?1
            ",
            params![game_id.to_string(), session_seconds as i64, now],
        )?;
        Ok(())
    }

    /// Get total game count
    pub fn count_games(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM games", [], |row| row.get(0))?;
        Ok(count as usize)
    }

    /// Optimized single-pass SQL aggregation for library dashboard counts
    pub fn get_library_counts(&self) -> Result<LibraryCounts> {
        let conn = self.conn.lock().unwrap();
        let query = "
            SELECT
                COUNT(*),
                COALESCE(SUM(CASE WHEN is_installed = 1 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN LOWER(library_id) = 'steam' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN LOWER(library_id) = 'gog' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN LOWER(library_id) = 'epic' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN LOWER(library_id) = 'xbox' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN playtime_seconds > 0 THEN 1 ELSE 0 END), 0),
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
}

/// DTO for library summary counters computed via single-pass SQL
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct LibraryCounts {
    pub total: usize,
    pub installed: usize,
    pub steam: usize,
    pub gog: usize,
    pub epic: usize,
    pub xbox: usize,
    pub recent: usize,
    pub favorites: usize,
    pub action: usize,
    pub rpg: usize,
    pub strategy: usize,
    pub indie: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_batch_ingest_and_query_performance() {
        let db = Database::open_in_memory().expect("Failed to open DB");

        // Generate 5,000 synthetic games
        let mut sample_batch = Vec::with_capacity(5000);
        for i in 0..5000 {
            sample_batch.push(DiscoveredGame {
                library_id: "steam".to_string(),
                external_id: format!("app_{}", i),
                title: format!("Game Title {}", i),
                install_dir: Some(PathBuf::from(format!("C:\\Games\\Title_{}", i))),
                is_installed: i % 2 == 0,
                play_action: None,
                playtime_seconds: (i * 60) as u64,
                play_count: (i % 10) as u32,
                last_activity: Some(Utc::now()),
                cover_image_path: None,
                background_image_path: None,
            });
        }

        let start_insert = Instant::now();
        let count = db.ingest_discovered_batch(&sample_batch).expect("Failed batch insert");
        let insert_duration = start_insert.elapsed();

        assert_eq!(count, 5000);
        println!(
            "-> Inserted 5,000 games in {:.2}ms ({:.0} games/sec)",
            insert_duration.as_secs_f64() * 1000.0,
            5000.0 / insert_duration.as_secs_f64()
        );

        let start_query = Instant::now();
        let all_games = db.get_all_games().expect("Failed to get all games");
        let query_duration = start_query.elapsed();

        assert_eq!(all_games.len(), 5000);
        println!(
            "-> Fetched 5,000 games sorted in {:.2}ms",
            query_duration.as_secs_f64() * 1000.0
        );

        // Verification: Query 5,000 games must be fast
        assert!(query_duration.as_millis() < 100);
    }

    #[test]
    fn test_seed_and_metadata_patch() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        let seeded = db.seed_sample_games().expect("Failed to seed games");
        assert!(seeded > 0);

        let games = db.get_all_games().expect("Failed to get games");
        assert_eq!(games.len(), seeded);

        let target_game = &games[0];
        let patch = GameMetadataPatch {
            description: Some("Test description".to_string()),
            release_date: Some("2020-12-10".to_string()),
            cover_url: Some("/cache/covers/test.jpg".to_string()),
            background_url: Some("/cache/backgrounds/test.jpg".to_string()),
            icon_url: None,
            critic_score: Some(92),
            community_score: Some(94),
            genres: vec!["GDR".to_string(), "Azione".to_string()],
            developers: vec!["CD PROJEKT RED".to_string()],
            publishers: vec!["CD PROJEKT".to_string()],
            tags: vec![],
        };

        let updated = db.apply_metadata_patch(target_game.id, &patch).expect("Failed to apply patch");
        assert!(updated);

        let fetched = db.get_game_by_id(target_game.id).expect("Failed query").expect("Game not found");
        assert_eq!(fetched.critic_score, Some(92));
        assert_eq!(fetched.description.as_deref(), Some("Test description"));
        assert_eq!(fetched.cover_image_path.as_deref(), Some("/cache/covers/test.jpg"));
        assert_eq!(fetched.genres, vec!["GDR", "Azione"]);
        assert_eq!(fetched.developers, vec!["CD PROJEKT RED"]);
        assert_eq!(fetched.publishers, vec!["CD PROJEKT"]);
    }

    #[test]
    fn test_update_game_extended_metadata_and_json_fields() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        db.seed_sample_games().expect("Failed to seed games");

        let games = db.get_all_games().expect("Failed to get games");
        let target = &games[0];
        // Default completion status from SQLite table default
        assert_eq!(target.completion_status.as_deref(), Some("NotPlayed"));
        assert_eq!(target.play_actions, Vec::<LaunchConfiguration>::new());
        assert_eq!(target.custom_links, Vec::<CustomLink>::new());

        let update_dto = GameUpdateDto {
            id: target.id,
            title: "Cyberpunk 2077: Phantom Liberty".to_string(),
            sorting_title: Some("cyberpunk 2077 phantom liberty".to_string()),
            release_date: Some("2023-09-26".to_string()),
            description: Some("Spy-thriller adventure expansion".to_string()),
            user_score: Some(95),
            critic_score: Some(89),
            community_score: Some(91),
            series: Some("Cyberpunk".to_string()),
            age_rating: Some("M - Mature 17+".to_string()),
            completion_status: Some("Completed".to_string()),
            user_notes: Some("Incredible expansion and soundtrack".to_string()),
            genres: vec!["RPG".to_string(), "Sci-Fi".to_string()],
            developers: vec!["CD PROJEKT RED".to_string()],
            publishers: vec!["CD PROJEKT".to_string()],
            tags: vec!["Cyberpunk".to_string(), "Story Rich".to_string()],
            cover_image_path: Some("/cache/covers/cp2077_pl.jpg".to_string()),
            background_image_path: Some("/cache/backgrounds/cp2077_pl.jpg".to_string()),
            icon_image_path: Some("/cache/icons/cp2077_pl.ico".to_string()),
            play_actions: vec![LaunchConfiguration {
                executable: "bin/x64/Cyberpunk2077.exe".to_string(),
                arguments: vec!["--launcher-skip".to_string()],
                working_dir: Some(PathBuf::from("C:\\Games\\Cyberpunk 2077")),
                tracking_mode: omnis_sdk::ProcessTrackingMode::KernelJobObject,
            }],
            custom_links: vec![CustomLink {
                title: "Official Wiki".to_string(),
                url: "https://cyberpunk.fandom.com".to_string(),
            }],
        };

        let updated_game = db.update_game(&update_dto).expect("Failed to update game");
        assert_eq!(updated_game.title, "Cyberpunk 2077: Phantom Liberty");
        assert_eq!(updated_game.sorting_title, "cyberpunk 2077 phantom liberty");
        assert_eq!(updated_game.series.as_deref(), Some("Cyberpunk"));
        assert_eq!(updated_game.age_rating.as_deref(), Some("M - Mature 17+"));
        assert_eq!(updated_game.completion_status.as_deref(), Some("Completed"));
        assert_eq!(
            updated_game.completion_status_enum(),
            Some(omnis_sdk::CompletionStatus::Completed)
        );
        assert_eq!(
            updated_game.user_notes.as_deref(),
            Some("Incredible expansion and soundtrack")
        );
        assert_eq!(updated_game.genres, vec!["RPG", "Sci-Fi"]);
        assert_eq!(updated_game.developers, vec!["CD PROJEKT RED"]);
        assert_eq!(updated_game.publishers, vec!["CD PROJEKT"]);
        assert_eq!(updated_game.tags, vec!["Cyberpunk", "Story Rich"]);
        assert_eq!(updated_game.play_actions.len(), 1);
        assert_eq!(
            updated_game.play_actions[0].executable,
            "bin/x64/Cyberpunk2077.exe"
        );
        assert_eq!(updated_game.custom_links.len(), 1);
        assert_eq!(updated_game.custom_links[0].title, "Official Wiki");

        // Verify refetched game via get_game_by_id
        let refetched = db
            .get_game_by_id(target.id)
            .expect("Query failed")
            .expect("Game not found");
        assert_eq!(refetched, updated_game);

        // Verify get_all_games returns updated state
        let all_games = db.get_all_games().expect("Failed to fetch all");
        let found = all_games.iter().find(|g| g.id == target.id).unwrap();
        assert_eq!(found.completion_status.as_deref(), Some("Completed"));
        assert_eq!(found.custom_links.len(), 1);
        assert_eq!(found.play_actions.len(), 1);
    }

    #[test]
    fn test_migration_idempotency_and_defaults() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        // Running migrate multiple times must succeed without error
        db.migrate().expect("Second migration failed");
        db.migrate().expect("Third migration failed");

        let single = DiscoveredGame {
            library_id: "steam".to_string(),
            external_id: "999999".to_string(),
            title: "Test Idempotent Game".to_string(),
            install_dir: None,
            is_installed: false,
            play_action: None,
            playtime_seconds: 0,
            play_count: 0,
            last_activity: None,
            cover_image_path: None,
            background_image_path: None,
        };
        db.ingest_discovered_batch(&[single]).expect("Ingest failed");

        let games = db.get_all_games().expect("Query failed");
        assert_eq!(games.len(), 1);
        let g = &games[0];
        assert_eq!(g.completion_status.as_deref(), Some("NotPlayed"));
        assert_eq!(g.play_actions, Vec::<LaunchConfiguration>::new());
        assert_eq!(g.custom_links, Vec::<CustomLink>::new());
        assert_eq!(g.series, None);
        assert_eq!(g.age_rating, None);
        assert_eq!(g.user_notes, None);
    }

    #[test]
    fn test_search_games() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        db.seed_sample_games().expect("Failed to seed games");

        let games = db.get_all_games().expect("Failed to get games");
        let target = &games[0];

        // Update target with custom series and notes
        let update_dto = GameUpdateDto {
            id: target.id,
            title: target.title.clone(),
            sorting_title: Some(target.sorting_title.clone()),
            release_date: None,
            description: None,
            user_score: None,
            critic_score: None,
            community_score: None,
            series: Some("NeonUniverse".to_string()),
            age_rating: None,
            completion_status: Some("Playing".to_string()),
            user_notes: Some("SecretNoteKeyword".to_string()),
            genres: vec!["Cybernetic".to_string()],
            developers: vec![],
            publishers: vec![],
            tags: vec![],
            cover_image_path: None,
            background_image_path: None,
            icon_image_path: None,
            play_actions: vec![],
            custom_links: vec![],
        };
        db.update_game(&update_dto).expect("Update failed");

        // Search by series
        let results = db.search_games("NeonUniverse").expect("Search failed");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, target.id);

        // Search by note
        let results = db.search_games("SecretNoteKeyword").expect("Search failed");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, target.id);

        // Search by genre
        let results = db.search_games("Cybernetic").expect("Search failed");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, target.id);

        // Search non-existent
        let results = db.search_games("NonExistentTermXYZ").expect("Search failed");
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_update_nonexistent_game_returns_error() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        let non_existent = GameUpdateDto {
            id: Uuid::new_v4(),
            title: "Ghost Game".to_string(),
            sorting_title: None,
            release_date: None,
            description: None,
            user_score: None,
            critic_score: None,
            community_score: None,
            series: None,
            age_rating: None,
            completion_status: None,
            user_notes: None,
            genres: vec![],
            developers: vec![],
            publishers: vec![],
            tags: vec![],
            cover_image_path: None,
            background_image_path: None,
            icon_image_path: None,
            play_actions: vec![],
            custom_links: vec![],
        };

        let result = db.update_game(&non_existent);
        assert!(result.is_err());
    }

    #[test]
    fn test_library_counts_aggregation() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        let samples = vec![
            DiscoveredGame {
                library_id: "steam".to_string(),
                external_id: "s1".to_string(),
                title: "Steam Game".to_string(),
                install_dir: Some(PathBuf::from("C:\\Steam\\g1")),
                is_installed: true,
                play_action: None,
                playtime_seconds: 3600,
                play_count: 5,
                last_activity: Some(Utc::now()),
                cover_image_path: None,
                background_image_path: None,
            },
            DiscoveredGame {
                library_id: "gog".to_string(),
                external_id: "g1".to_string(),
                title: "GOG Game".to_string(),
                install_dir: None,
                is_installed: false,
                play_action: None,
                playtime_seconds: 0,
                play_count: 0,
                last_activity: None,
                cover_image_path: None,
                background_image_path: None,
            },
            DiscoveredGame {
                library_id: "epic".to_string(),
                external_id: "e1".to_string(),
                title: "Epic Game".to_string(),
                install_dir: None,
                is_installed: false,
                play_action: None,
                playtime_seconds: 0,
                play_count: 0,
                last_activity: None,
                cover_image_path: None,
                background_image_path: None,
            },
            DiscoveredGame {
                library_id: "xbox".to_string(),
                external_id: "x1".to_string(),
                title: "Xbox Title".to_string(),
                install_dir: None,
                is_installed: false,
                play_action: None,
                playtime_seconds: 1200,
                play_count: 2,
                last_activity: None,
                cover_image_path: None,
                background_image_path: None,
            },
        ];

        db.ingest_discovered_batch(&samples).expect("Ingest failed");
        let counts = db.get_library_counts().expect("get_library_counts failed");

        assert_eq!(counts.total, 4);
        assert_eq!(counts.installed, 1);
        assert_eq!(counts.steam, 1);
        assert_eq!(counts.gog, 1);
        assert_eq!(counts.epic, 1);
        assert_eq!(counts.xbox, 1);
        assert_eq!(counts.recent, 2); // 2 games with playtime_seconds > 0
    }
}
