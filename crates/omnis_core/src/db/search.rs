use rusqlite::{params, Result};
use uuid::Uuid;
use omnis_sdk::Game;

use crate::db::Database;
use crate::db::games::{map_row_to_game, GAME_COLUMNS};
use crate::search::SearchItem;

/// Repository trait for game full-text search (SQLite FTS5) and in-memory fuzzy matching
pub trait GameSearchRepository: Send + Sync {
    /// Reload all titles from database into the in-memory fuzzy search index
    fn reload_search_index(&self) -> Result<()>;

    /// Search game IDs using SQLite FTS5 with trigram matching across titles and descriptions
    fn search_games_fts(&self, search_term: &str) -> Result<Vec<Uuid>>;

    /// Search games using in-memory fuzzy title matching + SQLite FTS5 trigram search
    fn search_games(&self, search_term: &str) -> Result<Vec<Game>>;

    /// Legacy LIKE-based search fallback across genres, developers, tags, notes
    fn search_games_like(&self, search_term: &str) -> Result<Vec<Game>>;
}

impl GameSearchRepository for Database {
    fn reload_search_index(&self) -> Result<()> {
        let items = {
            let conn = self.reader();
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


    fn search_games_fts(&self, search_term: &str) -> Result<Vec<Uuid>> {
        let trimmed = search_term.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.reader();
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
    pub fn search_games(&self, search_term: &str) -> Result<Vec<Game>> {
        GameSearchRepository::search_games(self, search_term)
    }

    #[inline]
    pub fn search_games_like(&self, search_term: &str) -> Result<Vec<Game>> {
        GameSearchRepository::search_games_like(self, search_term)
    }
}
