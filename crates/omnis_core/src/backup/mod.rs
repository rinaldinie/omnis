//! Native Backup and Restore engine for Omnis Game Library
//!
//! Provides hot SQLite snapshots via `VACUUM INTO`, safe credentials sanitization,
//! compressed `.zip` bundle generation, retention rotation, and atomic restore with rollback protection.

pub mod creator;
pub mod error;
pub mod manifest;
pub mod restorer;
pub mod rotation;
pub mod schedule;

pub use creator::{create_backup, BackupOptions, BackupResult};
pub use error::BackupError;
pub use manifest::BackupManifest;
pub use restorer::{inspect_backup, restore_backup, BackupInspection, RestoreResult};
pub use rotation::{rotate_backups, sanitize_hostname};
pub use schedule::{
    calculate_next_backup_utc, is_backup_due, BackupFrequency, BackupScheduleConfig,
};
