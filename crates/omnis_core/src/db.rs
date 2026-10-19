use chrono::{DateTime, Utc};
use omnis_sdk::{
    CustomLink, DiscoveredGame, Game, GameMetadataPatch, GameSessionRecord, GameUpdateDto,
    LaunchConfiguration,
};
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

pub mod migrations;

pub type DatabaseError = rusqlite::Error;

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
        migrations::run_migrations(&conn)
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

    /// Clear all games from the database
    pub fn clear_all_games(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let deleted = conn.execute("DELETE FROM games", [])?;
        Ok(deleted)
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

    /// Initialize a new active play session in the database
    pub fn start_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        started_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), DatabaseError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let started_at_str = started_at.to_rfc3339();

        tx.execute(
            "
            INSERT INTO game_sessions (id, game_id, started_at, ended_at, duration_seconds)
            VALUES (?1, ?2, ?3, ?3, 0)
            ON CONFLICT(id) DO NOTHING
            ",
            params![
                session_id.to_string(),
                game_id.to_string(),
                started_at_str,
            ],
        )?;

        tx.execute(
            "
            UPDATE games SET
                play_count = play_count + 1,
                last_activity = ?1,
                modified_timestamp = ?1
            WHERE id = ?2
            ",
            params![started_at_str, game_id.to_string()],
        )?;

        tx.commit()?;
        Ok(())
    }

    /// Incrementally update an active play session (checkpoint every ~60s)
    pub fn checkpoint_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        delta_seconds: u64,
        current_time: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), DatabaseError> {
        if delta_seconds == 0 {
            return Ok(());
        }
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let now_str = current_time.to_rfc3339();

        tx.execute(
            "
            UPDATE game_sessions SET
                duration_seconds = duration_seconds + ?1,
                ended_at = ?2
            WHERE id = ?3
            ",
            params![delta_seconds as i64, now_str, session_id.to_string()],
        )?;

        tx.execute(
            "
            UPDATE games SET
                playtime_seconds = playtime_seconds + ?1,
                last_activity = ?2,
                modified_timestamp = ?2
            WHERE id = ?3
            ",
            params![delta_seconds as i64, now_str, game_id.to_string()],
        )?;

        tx.commit()?;
        Ok(())
    }

    /// Finalize an active play session, reconciling final total duration and end timestamp
    pub fn finish_play_session(
        &self,
        session_id: Uuid,
        game_id: Uuid,
        total_duration: u64,
        started_at: chrono::DateTime<chrono::Utc>,
        ended_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<GameSessionRecord, DatabaseError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let started_at_str = started_at.to_rfc3339();
        let ended_at_str = ended_at.to_rfc3339();

        let existing_duration: Option<i64> = tx
            .query_row(
                "SELECT duration_seconds FROM game_sessions WHERE id = ?1",
                params![session_id.to_string()],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(already_recorded) = existing_duration {
            let already_u64 = already_recorded.max(0) as u64;
            let remaining_delta = total_duration.saturating_sub(already_u64);

            tx.execute(
                "
                UPDATE game_sessions SET
                    duration_seconds = ?1,
                    ended_at = ?2
                WHERE id = ?3
                ",
                params![total_duration as i64, ended_at_str, session_id.to_string()],
            )?;

            if remaining_delta > 0 {
                tx.execute(
                    "
                    UPDATE games SET
                        playtime_seconds = playtime_seconds + ?1,
                        last_activity = ?2,
                        modified_timestamp = ?2
                    WHERE id = ?3
                    ",
                    params![remaining_delta as i64, ended_at_str, game_id.to_string()],
                )?;
            }
        } else {
            tx.execute(
                "
                INSERT INTO game_sessions (id, game_id, started_at, ended_at, duration_seconds)
                VALUES (?1, ?2, ?3, ?4, ?5)
                ",
                params![
                    session_id.to_string(),
                    game_id.to_string(),
                    started_at_str,
                    ended_at_str,
                    total_duration as i64,
                ],
            )?;

            tx.execute(
                "
                UPDATE games SET
                    playtime_seconds = playtime_seconds + ?1,
                    play_count = play_count + 1,
                    last_activity = ?2,
                    modified_timestamp = ?2
                WHERE id = ?3
                ",
                params![
                    total_duration as i64,
                    ended_at_str,
                    game_id.to_string(),
                ],
            )?;
        }

        tx.commit()?;

        Ok(GameSessionRecord {
            id: session_id,
            game_id,
            started_at,
            ended_at,
            duration_seconds: total_duration,
        })
    }

    /// Record a completed play session (convenience wrapper around finish_play_session)
    pub fn record_play_session(
        &self,
        game_id: Uuid,
        duration_seconds: u64,
        started_at: chrono::DateTime<chrono::Utc>,
        ended_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<GameSessionRecord, DatabaseError> {
        self.finish_play_session(
            Uuid::new_v4(),
            game_id,
            duration_seconds,
            started_at,
            ended_at,
        )
    }

    /// Retrieve all recorded play sessions for a given game ordered by started_at DESC
    pub fn get_game_sessions(
        &self,
        game_id: Uuid,
    ) -> Result<Vec<GameSessionRecord>, DatabaseError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "
            SELECT id, game_id, started_at, ended_at, duration_seconds
            FROM game_sessions
            WHERE game_id = ?1
            ORDER BY started_at DESC
            ",
        )?;

        let rows = stmt.query_map(params![game_id.to_string()], |row| {
            let id_str: String = row.get(0)?;
            let id = Uuid::parse_str(&id_str).unwrap_or_else(|_| Uuid::new_v4());
            let game_id_str: String = row.get(1)?;
            let g_id = Uuid::parse_str(&game_id_str).unwrap_or(game_id);
            let started_str: String = row.get(2)?;
            let started_at = DateTime::parse_from_rfc3339(&started_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            let ended_str: String = row.get(3)?;
            let ended_at = DateTime::parse_from_rfc3339(&ended_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            let duration_seconds: i64 = row.get(4)?;

            Ok(GameSessionRecord {
                id,
                game_id: g_id,
                started_at,
                ended_at,
                duration_seconds: duration_seconds.max(0) as u64,
            })
        })?;

        let mut sessions = Vec::new();
        for r in rows {
            sessions.push(r?);
        }
        Ok(sessions)
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

