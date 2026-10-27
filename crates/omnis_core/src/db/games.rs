use chrono::{DateTime, Utc};
use omnis_sdk::{
    CustomLink, Game, GameMetadataPatch, GameUpdateDto, LaunchConfiguration,
};
use rusqlite::{params, Result};
use std::path::PathBuf;
use uuid::Uuid;

use crate::db::Database;

/// Focused repository trait for core Game catalog CRUD operations
pub trait GameRepository: Send + Sync {
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

    /// Retrieve games by their IDs preserving the requested slice ordering
    fn get_games_by_ids(&self, ids: &[Uuid]) -> Result<Vec<Game>>;

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
}

pub(crate) const GAME_COLUMNS: &str = "
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

pub(crate) fn map_row_to_game(row: &rusqlite::Row) -> rusqlite::Result<Game> {
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
    fn insert_custom_game(
        &self,
        id: Uuid,
        title: &str,
        sorting_title: &str,
        install_dir: Option<PathBuf>,
        play_actions: Vec<LaunchConfiguration>,
        cover_image_path: Option<String>,
    ) -> Result<Game> {
        let conn = self.writer();
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

    /// Retrieve all games in library sorted alphabetically
    fn get_all_games(&self) -> Result<Vec<Game>> {
        let conn = self.reader();
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
        let conn = self.reader();
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


    fn get_games_by_ids(&self, ids: &[Uuid]) -> Result<Vec<Game>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.reader();
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
            let conn = self.writer();
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
        let conn = self.writer();
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
        let conn = self.writer();
        let deleted = conn.execute("DELETE FROM games", [])?;
        Ok(deleted)
    }

    /// Update the installation status of a game
    fn set_game_installed(&self, game_id: Uuid, is_installed: bool) -> Result<Game> {
        let conn = self.writer();
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
        let conn = self.writer();
        let affected = conn.execute(
            "DELETE FROM games WHERE id = ?1",
            params![game_id.to_string()],
        )?;
        drop(conn);
        Ok(affected > 0)
    }

    /// Retrieve recent games ordered by last_activity DESC (or playtime)
    fn get_recent_games(&self, limit: usize) -> Result<Vec<Game>> {
        let conn = self.reader();
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
}

// Inherent forwarders on Database for backward compatibility
impl Database {
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
    pub fn get_games_by_ids(&self, ids: &[Uuid]) -> Result<Vec<Game>> {
        GameRepository::get_games_by_ids(self, ids)
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
}
