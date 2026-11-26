use omnis_sdk::Game;
use rusqlite::{params, Result};
use uuid::Uuid;

use crate::db::games::{map_row_to_game, GAME_COLUMNS};
use crate::db::Database;
use crate::search::SearchItem;

/// Repository trait for game full-text search (SQLite FTS5) and in-memory fuzzy matching
pub trait GameSearchRepository: Send + Sync {
    /// Reload all titles from database into the in-memory fuzzy search index
    fn reload_search_index(&self) -> Result<()>;

    /// Search game IDs using SQLite FTS5 with trigram matching across titles and descriptions
    fn search_games_fts(&self, search_term: &str) -> Result<Vec<Uuid>>;

    /// Search game IDs using SQLite FTS5 trigram matching across metadata columns
    /// (sorting_title, series, genres, developers, publishers, tags, features, user_notes)
    fn search_games_meta_fts(&self, search_term: &str) -> Result<Vec<Uuid>>;

    /// Search games using in-memory fuzzy title matching + SQLite FTS5 trigram search
    fn search_games(&self, search_term: &str) -> Result<Vec<Game>>;

    /// Legacy LIKE-based search fallback across genres, developers, tags, notes
    fn search_games_like(&self, search_term: &str) -> Result<Vec<Game>>;
}

fn query_fts_ids(conn: &rusqlite::Connection, table: &str, search_term: &str) -> Result<Vec<Uuid>> {
    let trimmed = search_term.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let safe_query = format!("\"{}\"", trimmed.replace('"', "\"\""));
    let sql = format!(
        "SELECT g.id FROM games g JOIN {table} f ON g.rowid = f.rowid WHERE {table} MATCH ?1 ORDER BY rank;"
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![safe_query], |row| {
        let id_str = row.get_ref(0)?.as_str()?;
        Uuid::parse_str(id_str).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(e),
            )
        })
    })?;
    Ok(rows.flatten().collect())
}

impl GameSearchRepository for Database {
    fn reload_search_index(&self) -> Result<()> {
        let items = {
            let conn = self.reader();
            let mut stmt = conn.prepare("SELECT id, title FROM games;")?;
            let rows = stmt.query_map([], |row| {
                let id_str = row.get_ref(0)?.as_str()?;
                let id = Uuid::parse_str(id_str).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?;
                let title: String = row.get(1)?;
                Ok(SearchItem { id, title })
            })?;

            rows.flatten().collect::<Vec<_>>()
        };

        let mut index = self.search_index.write().unwrap_or_else(|p| p.into_inner());
        index.build_from_items(items);
        Ok(())
    }

    fn search_games_fts(&self, search_term: &str) -> Result<Vec<Uuid>> {
        let conn = self.reader();
        Ok(query_fts_ids(&conn, "games_fts", search_term).unwrap_or_default())
    }

    fn search_games_meta_fts(&self, search_term: &str) -> Result<Vec<Uuid>> {
        let conn = self.reader();
        query_fts_ids(&conn, "games_meta_fts", search_term)
    }

    fn search_games(&self, search_term: &str) -> Result<Vec<Game>> {
        let term = search_term.trim();
        if term.is_empty() {
            return self.get_all_games();
        }

        // 1. In-memory fuzzy search on titles (nucleo-matcher)
        let fuzzy_matches = {
            let index = self.search_index.read().unwrap_or_else(|p| p.into_inner());
            index.search(term)
        };

        let mut matched_ids: Vec<Uuid> = fuzzy_matches.into_iter().map(|(id, _)| id).collect();
        let mut seen: std::collections::HashSet<Uuid> = matched_ids.iter().copied().collect();

        // 2. Full-text search (SQLite FTS5 trigram) across descriptions, titles, and metadata columns.
        // Trigram FTS5 indexes substrings of length >= 3; shorter queries fall back to LIKE below.
        let meta_fts_available = if term.chars().count() >= 3 {
            if let Ok(fts_ids) = self.search_games_fts(term) {
                for id in fts_ids {
                    if seen.insert(id) {
                        matched_ids.push(id);
                    }
                }
            }
            match self.search_games_meta_fts(term) {
                Ok(meta_ids) => {
                    for id in meta_ids {
                        if seen.insert(id) {
                            matched_ids.push(id);
                        }
                    }
                    true
                }
                Err(_) => false,
            }
        } else {
            false
        };

        // 3. Fallback to LIKE scan only for queries under the 3-char trigram minimum
        //    or when the metadata FTS table is unavailable.
        if matched_ids.is_empty() && !meta_fts_available {
            return self.search_games_like(term);
        }

        // 4. Retrieve full Game objects preserving order
        self.get_games_by_ids(&matched_ids)
    }

    /// Legacy LIKE-based search fallback across genres, developers, tags, notes
    fn search_games_like(&self, search_term: &str) -> Result<Vec<Game>> {
        let conn = self.reader();
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
}

// Inherent forwarders on Database for backward compatibility
impl Database {
    #[inline]
    pub fn reload_search_index(&self) -> Result<()> {
        GameSearchRepository::reload_search_index(self)
    }

    #[inline]
    pub fn search_games_fts(&self, search_term: &str) -> Result<Vec<Uuid>> {
        GameSearchRepository::search_games_fts(self, search_term)
    }

    #[inline]
    pub fn search_games_meta_fts(&self, search_term: &str) -> Result<Vec<Uuid>> {
        GameSearchRepository::search_games_meta_fts(self, search_term)
    }

    #[inline]
    pub fn search_games(&self, search_term: &str) -> Result<Vec<Game>> {
        GameSearchRepository::search_games(self, search_term)
    }

    #[inline]
    pub fn search_games_like(&self, search_term: &str) -> Result<Vec<Game>> {
        GameSearchRepository::search_games_like(self, search_term)
    }
}
