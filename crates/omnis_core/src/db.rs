use rusqlite::{Connection, OpenFlags, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
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
    pub(crate) readers: Vec<Mutex<Connection>>,
    pub(crate) reader_cursor: std::sync::atomic::AtomicUsize,
    pub(crate) search_index: RwLock<FuzzyGameSearchIndex>,
}

impl Database {
    /// Acquire a lock on the dedicated writer connection, safely recovering if previously poisoned.
    #[inline]
    pub fn writer(&self) -> MutexGuard<'_, Connection> {
        self.writer.lock().unwrap_or_else(|poisoned| {
            tracing::warn!("Database writer mutex was poisoned, recovering connection guard");
            poisoned.into_inner()
        })
    }

    /// Acquire a lock on a dedicated read connection from the reader pool using round-robin distribution
    /// (or fallback to writer for in-memory databases), safely recovering if previously poisoned.
    #[inline]
    pub fn reader(&self) -> MutexGuard<'_, Connection> {
        if self.readers.is_empty() {
            return self.writer();
        }
        let idx = self
            .reader_cursor
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            % self.readers.len();
        self.readers[idx].lock().unwrap_or_else(|poisoned| {
            tracing::warn!("Database reader mutex was poisoned, recovering connection guard");
            poisoned.into_inner()
        })
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

        // Initialize dedicated reader connection pool for non-blocking concurrent reads in WAL mode
        const READER_POOL_SIZE: usize = 4;
        let mut readers = Vec::with_capacity(READER_POOL_SIZE);
        for _ in 0..READER_POOL_SIZE {
            let reader = Connection::open_with_flags(
                path_ref,
                OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
            )?;
            reader.execute_batch(
                "
                PRAGMA synchronous = NORMAL;
                PRAGMA temp_store = MEMORY;
                PRAGMA cache_size = -32000;
                PRAGMA foreign_keys = ON;
                PRAGMA busy_timeout = 5000;
                PRAGMA query_only = ON;
                ",
            )?;
            readers.push(Mutex::new(reader));
        }

        let db = Self {
            writer: Mutex::new(writer),
            readers,
            reader_cursor: std::sync::atomic::AtomicUsize::new(0),
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
            readers: Vec::new(),
            reader_cursor: std::sync::atomic::AtomicUsize::new(0),
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

    /// Create a consolidated hot SQLite snapshot using VACUUM INTO.
    /// This writes out a clean single-file database with all WAL/SHM changes committed.
    pub fn snapshot_to<P: AsRef<Path>>(&self, dest: P) -> Result<()> {
        let dest_ref = dest.as_ref();
        if dest_ref.exists() {
            let _ = std::fs::remove_file(dest_ref);
        }
        let dest_str = dest_ref
            .to_str()
            .ok_or_else(|| rusqlite::Error::InvalidPath(dest_ref.to_path_buf()))?;
        let conn = self.writer();
        conn.execute("VACUUM INTO ?1;", rusqlite::params![dest_str])?;
        Ok(())
    }

    /// Safely suspend active database connections, backup current database to `.pre_restore_bak`,
    /// replace target database with `source_db`, clean WAL/SHM, reopen connections with WAL mode,
    /// run migrations, and refresh the search index.
    pub fn close_and_reopen_from_file<P: AsRef<Path>, Q: AsRef<Path>>(
        &self,
        source_db: P,
        target_db: Q,
    ) -> Result<()> {
        let source_path = source_db.as_ref();
        let target_path = target_db.as_ref();

        // 1. Acquire locks on both writer and readers to block concurrent operations
        let mut writer_guard = self.writer.lock().unwrap_or_else(|p| p.into_inner());
        let mut reader_guards: Vec<_> = self
            .readers
            .iter()
            .map(|r| r.lock().unwrap_or_else(|p| p.into_inner()))
            .collect();

        // 2. Temporarily swap connections to in-memory to release file locks on Windows
        *writer_guard = Connection::open_in_memory()?;
        for r_guard in reader_guards.iter_mut() {
            **r_guard = Connection::open_in_memory()?;
        }

        // 3. Backup active database file
        let bak_path = target_path.with_extension("db.pre_restore_bak");
        if target_path.exists() {
            let _ = std::fs::copy(target_path, &bak_path);
        }

        // 4. Remove lingering -wal and -shm files
        let wal_path = PathBuf::from(format!("{}-wal", target_path.display()));
        let shm_path = PathBuf::from(format!("{}-shm", target_path.display()));
        let _ = std::fs::remove_file(&wal_path);
        let _ = std::fs::remove_file(&shm_path);

        // Helper closure to reopen connections on target_path
        let reopen_connections = |w_guard: &mut Connection,
                                  r_guards: &mut [std::sync::MutexGuard<'_, Connection>]|
         -> Result<()> {
            let new_writer = Connection::open(target_path)?;
            new_writer.execute_batch(
                "
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                PRAGMA temp_store = MEMORY;
                PRAGMA cache_size = -64000;
                PRAGMA foreign_keys = ON;
                PRAGMA busy_timeout = 5000;
                ",
            )?;

            for r_guard in r_guards.iter_mut() {
                let new_reader = Connection::open_with_flags(
                    target_path,
                    OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
                )?;
                new_reader.execute_batch(
                    "
                    PRAGMA synchronous = NORMAL;
                    PRAGMA temp_store = MEMORY;
                    PRAGMA cache_size = -32000;
                    PRAGMA foreign_keys = ON;
                    PRAGMA busy_timeout = 5000;
                    PRAGMA query_only = ON;
                    ",
                )?;
                **r_guard = new_reader;
            }

            *w_guard = new_writer;
            Ok(())
        };

        // 5. Replace target DB with source DB
        if let Err(err) = std::fs::copy(source_path, target_path) {
            // Attempt rollback if backup exists
            if bak_path.exists() {
                let _ = std::fs::copy(&bak_path, target_path);
            }
            // Restore connections to target DB so they are not stranded in-memory
            let _ = reopen_connections(&mut writer_guard, &mut reader_guards);
            return Err(rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::other(format!(
                    "Failed replacing database file: {}",
                    err
                ))),
            ));
        }

        // 6 & 7. Reopen writer and reader pool on target DB
        if let Err(err) = reopen_connections(&mut writer_guard, &mut reader_guards) {
            if bak_path.exists() {
                let _ = std::fs::copy(&bak_path, target_path);
                let _ = reopen_connections(&mut writer_guard, &mut reader_guards);
            }
            return Err(err);
        }

        // 8. Run migrations on restored database
        migrations::run_migrations(&writer_guard)?;

        // Drop locks before search index reload
        drop(writer_guard);
        drop(reader_guards);

        // 9. Reload search index
        let _ = self.reload_search_index();

        Ok(())
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
