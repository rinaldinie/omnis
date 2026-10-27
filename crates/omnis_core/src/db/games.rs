use chrono::{DateTime, Utc};
use omnis_sdk::{
    CustomLink, DiscoveredGame, Game, GameMetadataPatch, GameUpdateDto, LaunchConfiguration,
};
use rusqlite::{params, Result};
use std::path::PathBuf;
use uuid::Uuid;

use crate::db::{Database, LibraryCounts};
use crate::search::SearchItem;

/// Repository trait for game library catalog management, querying, FTS5 search, and metadata updates
pub trait GameRepository: Send + Sync {
    /// Ingest a batch of discovered games from a library plugin inside a single transaction
    fn ingest_discovered_batch(&self, games: &[DiscoveredGame]) -> Result<usize>;

    /// Reload all titles from database into the in-memory fuzzy search index
    fn reload_search_index(&self) -> Result<()>;

    /// Insert a custom game / non-store executable into the database
    fn insert_custom_game(
        &self,
        id: Uuid,
        title: &str,
        sorting_title: &str,
        install_dir: Option<PathBuf>,
        play_actions: Vec<LaunchConfiguration>,
        cover_image_path: Option<String>,
    ) -> Result<Game>;

    /// Retrieve all games in library sorted alphabetically
    fn get_all_games(&self) -> Result<Vec<Game>>;

    /// Retrieve a single game by its unique UUID
    fn get_game_by_id(&self, game_id: Uuid) -> Result<Option<Game>>;

    /// Search game IDs using SQLite FTS5 with trigram matching across titles and descriptions
    fn search_games_fts(&self, search_term: &str) -> Result<Vec<Uuid>>;

    /// Retrieve games by their IDs preserving the requested slice ordering
    fn get_games_by_ids(&self, ids: &[Uuid]) -> Result<Vec<Game>>;

    /// Search games using in-memory fuzzy title matching + SQLite FTS5 trigram search
    fn search_games(&self, search_term: &str) -> Result<Vec<Game>>;

    /// Legacy LIKE-based search fallback across genres, developers, tags, notes
    fn search_games_like(&self, search_term: &str) -> Result<Vec<Game>>;

    /// Update game metadata, custom links, play actions, completion status and user notes
    fn update_game(&self, update: &GameUpdateDto) -> Result<Game>;

    /// Apply a metadata patch from an external provider (e.g. Steam Store, IGDB)
    fn apply_metadata_patch(&self, game_id: Uuid, patch: &GameMetadataPatch) -> Result<bool>;

    /// Clear all games from the database
    fn clear_all_games(&self) -> Result<usize>;

    /// Update the installation status of a game
    fn set_game_installed(&self, game_id: Uuid, is_installed: bool) -> Result<Game>;

    /// Delete a game from the database
    fn delete_game(&self, game_id: Uuid) -> Result<bool>;

    /// Retrieve recent games ordered by last_activity DESC (or playtime)
    fn get_recent_games(&self, limit: usize) -> Result<Vec<Game>>;

    /// Seed iconic starter games if the library is empty
    fn seed_sample_games(&self) -> Result<usize>;

    /// Get total game count
    fn count_games(&self) -> Result<usize>;

    /// Optimized single-pass SQL aggregation for library dashboard counts
    fn get_library_counts(&self) -> Result<LibraryCounts>;

    /// Safely realigns cached image and achievement paths to the active app directory
    fn relocate_image_paths(&self, new_base_dir: &str) -> Result<usize>;
}

use chrono::{DateTime, Utc};
use omnis_sdk::{
    CustomLink, DiscoveredGame, Game, GameMetadataPatch, GameUpdateDto, LaunchConfiguration,
};
use rusqlite::{params, Result};
use std::path::PathBuf;
use uuid::Uuid;

use crate::db::{Database, LibraryCounts};
use crate::search::SearchItem;

impl GameRepository for Database {
    /// Ingest a batch of discovered games from a library plugin inside a single transaction
    fn ingest_discovered_batch(&self, games: &[DiscoveredGame]) -> Result<usize> {
        let mut conn = self.conn.lock().unwrap();
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

    /// Reload all titles from database into the in-memory fuzzy search index
    fn reload_search_index(&self) -> Result<()> {
        let items = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare("SELECT id, title FROM games;")?;
            let rows = stmt.query_map([], |row| {
                let id_str: String = row.get(0)?;
                let title: String = row.get(1)?;
                let id = Uuid::parse_str(&id_str).map_err(|_| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Text,
                        Box::new(std::io::Error::new(
                            std::io::ErrorKind::InvalidData,
                            "Invalid UUID",
                        )),
                    )
                })?;
                Ok(SearchItem { id, title })
            })?;

            let mut items = Vec::new();
            for r in rows {
                if let Ok(item) = r {
                    items.push(item);
                }
            }
            items
        };

        let mut index = self.search_index.write().unwrap();
        index.build_from_items(items);
        Ok(())
    }

    /// Insert a custom game / non-store executable into the database
    fn insert_custom_game(
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
        let play_actions_json =
            serde_json::to_string(&play_actions).unwrap_or_else(|_| "[]".to_string());
        let install_dir_str = install_dir
            .as_ref()
            .map(|p| p.to_string_lossy().to_string());

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
        self.search_index
            .write()
            .unwrap()
            .insert_or_update(id, title);
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
    genres, developers, publishers, tags, features,
    series, age_rating, completion_status, user_notes,
    custom_links, play_actions, extra_metadata,
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

    let features_str: Option<String> = row.get(22)?;
    let features: Vec<String> = features_str
        .map(|s| {
            s.split(',')
                .map(|f| f.trim().to_string())
                .filter(|f| !f.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let series: Option<String> = row.get(23)?;
    let age_rating: Option<String> = row.get(24)?;
    let completion_status: Option<String> = row.get(25)?;
    let user_notes: Option<String> = row.get(26)?;

    let custom_links: Vec<CustomLink> = row
        .get::<_, Option<String>>(27)?
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let play_actions: Vec<LaunchConfiguration> = row
        .get::<_, Option<String>>(28)?
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let extra_metadata: Option<String> = row.get(29)?;

    let added_str: String = row.get(30)?;
    let added_timestamp = DateTime::parse_from_rfc3339(&added_str)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);

    let mod_str: String = row.get(31)?;
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
        features,
        series,
        age_rating,
        completion_status,
        user_notes,
        extra_metadata,
        play_actions,
        custom_links,
        added_timestamp,
        modified_timestamp,
    })
}


impl GameRepository for Database {
    /// Retrieve all games in library sorted alphabetically
    fn get_all_games(&self) -> Result<Vec<Game>> {
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
    fn get_game_by_id(&self, game_id: Uuid) -> Result<Option<Game>> {
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

    /// Search game IDs using SQLite FTS5 with trigram matching across titles and descriptions
    fn search_games_fts(&self, search_term: &str) -> Result<Vec<Uuid>> {
        let trimmed = search_term.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.conn.lock().unwrap();
        let safe_query = format!("\"{}\"", trimmed.replace('"', "\"\""));

        let mut stmt = match conn.prepare(
            "SELECT g.id FROM games g JOIN games_fts f ON g.rowid = f.rowid WHERE games_fts MATCH ?1 ORDER BY rank;"
        ) {
            Ok(s) => s,
            Err(_) => return Ok(Vec::new()),
        };

        let rows = stmt.query_map(params![safe_query], |row| {
            let id_str: String = row.get(0)?;
            Uuid::parse_str(&id_str).map_err(|_| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "Invalid UUID",
                    )),
                )
            })
        })?;

        let mut ids = Vec::new();
        for r in rows {
            if let Ok(id) = r {
                ids.push(id);
            }
        }
        Ok(ids)
    }

    /// Retrieve games by their IDs preserving the requested slice ordering
    fn get_games_by_ids(&self, ids: &[Uuid]) -> Result<Vec<Game>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.conn.lock().unwrap();
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT {} FROM games WHERE id IN ({});",
            GAME_COLUMNS, placeholders
        );

        let mut stmt = conn.prepare(&sql)?;
        let id_strings: Vec<String> = ids.iter().map(|id| id.to_string()).collect();
        let rusqlite_params = rusqlite::params_from_iter(id_strings.iter());

        let rows = stmt.query_map(rusqlite_params, map_row_to_game)?;
        let mut map = std::collections::HashMap::new();
        for r in rows {
            let game = r?;
            map.insert(game.id, game);
        }

        let mut ordered = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(game) = map.remove(id) {
                ordered.push(game);
            }
        }
        Ok(ordered)
    }

    /// Search games using in-memory fuzzy title matching (nucleo-matcher)
    /// + SQLite FTS5 trigram search on descriptions and titles.
    fn search_games(&self, search_term: &str) -> Result<Vec<Game>> {
        let term = search_term.trim();
        if term.is_empty() {
            return self.get_all_games();
        }

        // 1. In-memory fuzzy search on titles (nucleo-matcher)
        let fuzzy_matches = {
            let index = self.search_index.read().unwrap();
            index.search(term)
        };

        let mut matched_ids: Vec<Uuid> = fuzzy_matches.into_iter().map(|(id, _)| id).collect();

        // 2. Full-text search (SQLite FTS5 with trigram) on descriptions & titles
        if let Ok(fts_ids) = self.search_games_fts(term) {
            for id in fts_ids {
                if !matched_ids.contains(&id) {
                    matched_ids.push(id);
                }
            }
        }

        // 3. Fallback to LIKE query across metadata if no matches found or short queries
        if matched_ids.is_empty() {
            return self.search_games_like(term);
        }

        // 4. Retrieve full Game objects preserving order
        self.get_games_by_ids(&matched_ids)
    }

    /// Legacy LIKE-based search fallback across genres, developers, tags, notes
    fn search_games_like(&self, search_term: &str) -> Result<Vec<Game>> {
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
               OR features LIKE ?1
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
    fn update_game(&self, update: &GameUpdateDto) -> Result<Game> {
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
        let features_str = if update.features.is_empty() {
            None
        } else {
            Some(update.features.join(", "))
        };
        let custom_links_json =
            serde_json::to_string(&update.custom_links).unwrap_or_else(|_| "[]".to_string());
        let play_actions_json =
            serde_json::to_string(&update.play_actions).unwrap_or_else(|_| "[]".to_string());
        let completion_status_val = update.completion_status.as_deref().unwrap_or("NotPlayed");

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
                    features = ?17,
                    cover_image_path = ?18,
                    background_image_path = ?19,
                    icon_image_path = ?20,
                    play_actions = ?21,
                    custom_links = ?22,
                    extra_metadata = COALESCE(?23, extra_metadata),
                    modified_timestamp = ?24
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
                    features_str,
                    update.cover_image_path,
                    update.background_image_path,
                    update.icon_image_path,
                    play_actions_json,
                    custom_links_json,
                    update.extra_metadata,
                    now,
                ],
            )?;

            if rows_affected == 0 {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }
        }

        self.search_index
            .write()
            .unwrap()
            .insert_or_update(update.id, &update.title);

        self.get_game_by_id(update.id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    /// Apply a metadata patch from an external provider (e.g. Steam Store, IGDB)
    fn apply_metadata_patch(&self, game_id: Uuid, patch: &GameMetadataPatch) -> Result<bool> {
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
        let features_joined = if !patch.features.is_empty() {
            Some(patch.features.join(", "))
        } else {
            None
        };

        let extra_metadata_merged: Option<String> = if let Some(ref new_extra_str) =
            patch.extra_metadata
        {
            let existing_str: Option<String> = conn
                .query_row(
                    "SELECT extra_metadata FROM games WHERE id = ?1",
                    params![game_id.to_string()],
                    |r| r.get(0),
                )
                .ok()
                .flatten();

            let mut merged_map: serde_json::Map<String, serde_json::Value> = existing_str
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default();

            if let Ok(new_map) =
                serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(new_extra_str)
            {
                for (k, v) in new_map {
                    merged_map.insert(k, v);
                }
                Some(serde_json::to_string(&merged_map).unwrap_or_else(|_| new_extra_str.clone()))
            } else {
                Some(new_extra_str.clone())
            }
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
                features = COALESCE(?15, features),
                extra_metadata = COALESCE(?14, extra_metadata),
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
                extra_metadata_merged,
                features_joined,
            ],
        )?;

        Ok(updated > 0)
    }

    /// Clear all games from the database
    fn clear_all_games(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let deleted = conn.execute("DELETE FROM games", [])?;
        Ok(deleted)
    }

    /// Update the installation status of a game
    fn set_game_installed(&self, game_id: Uuid, is_installed: bool) -> Result<Game> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE games SET is_installed = ?2, modified_timestamp = ?3 WHERE id = ?1",
            params![game_id.to_string(), if is_installed { 1 } else { 0 }, now],
        )?;
        drop(conn);
        self.get_game_by_id(game_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    /// Delete a game from the database
    fn delete_game(&self, game_id: Uuid) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let affected = conn.execute(
            "DELETE FROM games WHERE id = ?1",
            params![game_id.to_string()],
        )?;
        drop(conn);
        Ok(affected > 0)
    }

    /// Retrieve recent games ordered by last_activity DESC (or playtime)
    fn get_recent_games(&self, limit: usize) -> Result<Vec<Game>> {
        let conn = self.conn.lock().unwrap();
        let sql = format!(
            "SELECT {} FROM games WHERE last_activity IS NOT NULL OR playtime_seconds > 0 ORDER BY COALESCE(last_activity, added_timestamp) DESC LIMIT ?1",
            GAME_COLUMNS
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![limit as i64], map_row_to_game)?;
        let mut games = Vec::new();
        for r in rows {
            games.push(r?);
        }
        Ok(games)
    }

    /// Seed iconic starter games if the library is empty
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


    /// Get total game count
    fn count_games(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM games", [], |row| row.get(0))?;
        Ok(count as usize)
    }

    /// Optimized single-pass SQL aggregation for library dashboard counts
    fn get_library_counts(&self) -> Result<LibraryCounts> {
        let conn = self.conn.lock().unwrap();
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
        let conn = self.conn.lock().unwrap();
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

// Inherent methods forwarding to GameRepository for backward compatibility
impl Database {
    #[inline]
    pub fn ingest_discovered_batch(&self, games: &[DiscoveredGame]) -> Result<usize> {
        GameRepository::ingest_discovered_batch(self, games)
    }

    #[inline]
    pub fn reload_search_index(&self) -> Result<()> {
        GameRepository::reload_search_index(self)
    }

    #[inline]
    pub fn insert_custom_game(
        &self,
        id: Uuid,
        title: &str,
        sorting_title: &str,
        install_dir: Option<PathBuf>,
        play_actions: Vec<LaunchConfiguration>,
        cover_image_path: Option<String>,
    ) -> Result<Game> {
        GameRepository::insert_custom_game(self, id, title, sorting_title, install_dir, play_actions, cover_image_path)
    }

    #[inline]
    pub fn get_all_games(&self) -> Result<Vec<Game>> {
        GameRepository::get_all_games(self)
    }

    #[inline]
    pub fn get_game_by_id(&self, game_id: Uuid) -> Result<Option<Game>> {
        GameRepository::get_game_by_id(self, game_id)
    }

    #[inline]
    pub fn search_games_fts(&self, search_term: &str) -> Result<Vec<Uuid>> {
        GameRepository::search_games_fts(self, search_term)
    }

    #[inline]
    pub fn get_games_by_ids(&self, ids: &[Uuid]) -> Result<Vec<Game>> {
        GameRepository::get_games_by_ids(self, ids)
    }

    #[inline]
    pub fn search_games(&self, search_term: &str) -> Result<Vec<Game>> {
        GameRepository::search_games(self, search_term)
    }

    #[inline]
    pub fn search_games_like(&self, search_term: &str) -> Result<Vec<Game>> {
        GameRepository::search_games_like(self, search_term)
    }

    #[inline]
    pub fn update_game(&self, update: &GameUpdateDto) -> Result<Game> {
        GameRepository::update_game(self, update)
    }

    #[inline]
    pub fn apply_metadata_patch(&self, game_id: Uuid, patch: &GameMetadataPatch) -> Result<bool> {
        GameRepository::apply_metadata_patch(self, game_id, patch)
    }

    #[inline]
    pub fn clear_all_games(&self) -> Result<usize> {
        GameRepository::clear_all_games(self)
    }

    #[inline]
    pub fn set_game_installed(&self, game_id: Uuid, is_installed: bool) -> Result<Game> {
        GameRepository::set_game_installed(self, game_id, is_installed)
    }

    #[inline]
    pub fn delete_game(&self, game_id: Uuid) -> Result<bool> {
        GameRepository::delete_game(self, game_id)
    }

    #[inline]
    pub fn get_recent_games(&self, limit: usize) -> Result<Vec<Game>> {
        GameRepository::get_recent_games(self, limit)
    }

    #[inline]
    pub fn seed_sample_games(&self) -> Result<usize> {
        GameRepository::seed_sample_games(self)
    }

    #[inline]
    pub fn count_games(&self) -> Result<usize> {
        GameRepository::count_games(self)
    }

    #[inline]
    pub fn get_library_counts(&self) -> Result<LibraryCounts> {
        GameRepository::get_library_counts(self)
    }

    #[inline]
    pub fn relocate_image_paths(&self, new_base_dir: &str) -> Result<usize> {
        GameRepository::relocate_image_paths(self, new_base_dir)
    }
}
