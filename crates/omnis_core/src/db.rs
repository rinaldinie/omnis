use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Mutex, RwLock};

use crate::search::FuzzyGameSearchIndex;

pub mod achievements;
pub mod games;
pub mod maintenance;
pub mod migrations;
pub mod search;
pub mod secrets;
pub mod sessions;

pub use achievements::AchievementRepository;
pub use games::GameRepository;
pub use maintenance::CatalogMaintenanceRepository;
pub use search::GameSearchRepository;
pub use secrets::SecretRepository;
pub use sessions::SessionRepository;

pub type DatabaseError = rusqlite::Error;

pub struct Database {
    pub(crate) conn: Mutex<Connection>,
    pub(crate) search_index: RwLock<FuzzyGameSearchIndex>,
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
            search_index: RwLock::new(FuzzyGameSearchIndex::new()),
        };
        db.migrate()?;
        let _ = db.reload_search_index();
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
            search_index: RwLock::new(FuzzyGameSearchIndex::new()),
        };
        db.migrate()?;
        let _ = db.reload_search_index();
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
