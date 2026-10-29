use rusqlite::{Connection, OpenFlags, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Mutex, MutexGuard, RwLock};

use crate::search::FuzzyGameSearchIndex;

pub mod achievements;
pub mod games;
pub mod maintenance;
pub mod migrations;
pub mod search;
pub mod secrets;
pub mod sessions;
pub mod stats;

pub use achievements::AchievementRepository;
pub use games::GameRepository;
pub use maintenance::CatalogMaintenanceRepository;
pub use search::GameSearchRepository;
pub use secrets::SecretRepository;
pub use sessions::SessionRepository;
pub use stats::StatsRepository;

pub type DatabaseError = rusqlite::Error;

pub struct Database {
    pub(crate) writer: Mutex<Connection>,
    pub(crate) reader: Option<Mutex<Connection>>,
    pub(crate) search_index: RwLock<FuzzyGameSearchIndex>,
}

impl Database {
    /// Acquire a lock on the dedicated writer connection.
    #[inline]
    pub fn writer(&self) -> MutexGuard<'_, Connection> {
        self.writer.lock().unwrap()
    }

    /// Acquire a lock on the dedicated reader connection (or fallback to writer for in-memory databases).
    #[inline]
    pub fn reader(&self) -> MutexGuard<'_, Connection> {
        match &self.reader {
            Some(r) => r.lock().unwrap(),
            None => self.writer.lock().unwrap(),
        }
    }

    /// Compatibility accessor returning a guard to the primary connection.
    #[inline]
    pub fn conn(&self) -> MutexGuard<'_, Connection> {
        self.writer()
    }

    /// Open or create the unified SQLite database with WAL mode and dedicated reader/writer connections
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path_ref = path.as_ref();
        let writer = Connection::open(path_ref)?;

        // Tune SQLite for maximum desktop performance and safe WAL concurrency
        writer.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA temp_store = MEMORY;
            PRAGMA cache_size = -64000; -- 64MB memory cache
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
            ",
        )?;

        // Dedicated read connection with query_only enabled for non-blocking concurrent reads
        let reader = Connection::open_with_flags(
            path_ref,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
        )?;
        reader.execute_batch(
            "
            PRAGMA synchronous = NORMAL;
            PRAGMA temp_store = MEMORY;
            PRAGMA cache_size = -64000;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
            PRAGMA query_only = ON;
            ",
        )?;

        let db = Self {
            writer: Mutex::new(writer),
            reader: Some(Mutex::new(reader)),
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
            PRAGMA busy_timeout = 5000;
            ",
        )?;
        let db = Self {
            writer: Mutex::new(conn),
            reader: None,
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
        let conn = self.writer();
        migrations::run_migrations(&conn)
    }

    /// Retrieve the column names for a given table via PRAGMA table_info
    pub fn get_table_columns(&self, table: &str) -> Result<Vec<String>> {
        let conn = self.reader();
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
