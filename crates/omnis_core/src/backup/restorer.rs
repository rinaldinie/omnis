use crate::backup::error::BackupError;
use crate::backup::manifest::BackupManifest;
use crate::db::Database;
use omnis_sdk::constants::storage;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

/// Summary metadata extracted during archive inspection before confirmation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BackupInspection {
    pub manifest: BackupManifest,
    pub has_database: bool,
    pub has_settings: bool,
    pub custom_themes_count: usize,
    pub has_artwork: bool,
}

/// Outcome details after restoring an archive
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RestoreResult {
    pub games_restored: usize,
    pub settings_restored: bool,
    pub themes_restored: usize,
    pub artwork_restored: bool,
}

/// Inspects a `.zip` backup archive to preview contents without modifying local state
pub fn inspect_backup(backup_path: &Path) -> Result<BackupInspection, BackupError> {
    if !backup_path.is_file() {
        return Err(BackupError::InvalidArchive(format!(
            "Backup file does not exist: {}",
            backup_path.display()
        )));
    }

    let file = File::open(backup_path)?;
    let mut archive = ZipArchive::new(file)?;

    let mut manifest: Option<BackupManifest> = None;
    let mut has_database = false;
    let mut has_settings = false;
    let mut custom_themes_count = 0;
    let mut has_artwork = false;

    for i in 0..archive.len() {
        let file = archive.by_index(i)?;
        let name = file.name().to_string();

        if name == "manifest.json" {
            // Read manifest
            let mut content = Vec::new();
            let mut reader = file;
            reader.read_to_end(&mut content)?;
            manifest = Some(serde_json::from_slice(&content)?);
        } else if name == "database.db" {
            has_database = true;
        } else if name == "settings.json" {
            has_settings = true;
        } else if name.starts_with("custom_themes/") && !file.is_dir() {
            custom_themes_count += 1;
        } else if (name.starts_with("cache/covers/") || name.starts_with("cache/backgrounds/"))
            && !file.is_dir()
        {
            has_artwork = true;
        }
    }

    let manifest = manifest.ok_or_else(|| {
        BackupError::InvalidArchive("Archive is missing required 'manifest.json'".to_string())
    })?;

    if !has_database {
        return Err(BackupError::InvalidArchive(
            "Archive is missing required 'database.db'".to_string(),
        ));
    }

    Ok(BackupInspection {
        manifest,
        has_database,
        has_settings,
        custom_themes_count,
        has_artwork,
    })
}

/// Safely restores application state from a `.zip` backup bundle
pub fn restore_backup(
    db: &Database,
    app_dir: &Path,
    backup_path: &Path,
) -> Result<RestoreResult, BackupError> {
    if !backup_path.is_file() {
        return Err(BackupError::InvalidArchive(format!(
            "Backup file does not exist: {}",
            backup_path.display()
        )));
    }

    let file = File::open(backup_path)?;
    let mut archive = ZipArchive::new(file)?;

    // 1. Verify manifest existence and read
    let mut manifest_bytes = Vec::new();
    {
        let mut manifest_file = archive.by_name("manifest.json").map_err(|_| {
            BackupError::InvalidArchive("Archive does not contain 'manifest.json'".to_string())
        })?;
        manifest_file.read_to_end(&mut manifest_bytes)?;
    }
    let manifest: BackupManifest = serde_json::from_slice(&manifest_bytes)?;

    // 2. Prepare temporary directory for extraction and integrity check
    let temp_dir = std::env::temp_dir().join(format!("omnis_restore_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temp_dir)?;

    let temp_db_path = temp_dir.join("extracted_database.db");

    let result = (|| -> Result<RestoreResult, BackupError> {
        // Extract database.db to temp file
        {
            let mut db_entry = archive.by_name("database.db").map_err(|_| {
                BackupError::InvalidArchive("Archive does not contain 'database.db'".to_string())
            })?;
            let mut out = File::create(&temp_db_path)?;
            std::io::copy(&mut db_entry, &mut out)?;
        }

        // 3. SQLite Integrity Check on extracted snapshot
        {
            let check_conn = rusqlite::Connection::open(&temp_db_path)?;
            let check_result: String = check_conn
                .query_row("PRAGMA quick_check;", [], |row| row.get(0))
                .map_err(|e| BackupError::IntegrityFailed(e.to_string()))?;

            if !check_result.eq_ignore_ascii_case("ok") {
                return Err(BackupError::IntegrityFailed(format!(
                    "PRAGMA quick_check reported errors: {}",
                    check_result
                )));
            }
        }

        // 4. Close connections, swap file with .pre_restore_bak, reopen & run migrations
        let active_db_path = app_dir.join(storage::DATABASE_FILE);
        db.close_and_reopen_from_file(&temp_db_path, &active_db_path)?;

        // 5. Restore settings.json if present
        let mut settings_restored = false;
        if let Ok(mut settings_entry) = archive.by_name("settings.json") {
            let target_settings = app_dir.join("settings.json");
            let mut out = File::create(&target_settings)?;
            std::io::copy(&mut settings_entry, &mut out)?;
            settings_restored = true;
        }

        // 6. Extract custom themes & artwork
        let mut themes_restored = 0;
        let mut artwork_restored = false;

        let themes_dir = app_dir.join(storage::THEMES_DIR);
        let cache_dir = app_dir.join(storage::CACHE_DIR);

        for i in 0..archive.len() {
            let mut zip_entry = archive.by_index(i)?;
            let entry_name = zip_entry.name().to_string();

            if entry_name.starts_with("custom_themes/") && !zip_entry.is_dir() {
                if let Some(sub_path) = entry_name.strip_prefix("custom_themes/") {
                    let dest =
                        themes_dir.join(sub_path.replace('/', std::path::MAIN_SEPARATOR_STR));
                    if let Some(parent) = dest.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if let Ok(mut out) = File::create(&dest) {
                        if std::io::copy(&mut zip_entry, &mut out).is_ok() {
                            themes_restored += 1;
                        }
                    }
                }
            } else if entry_name.starts_with("cache/") && !zip_entry.is_dir() {
                if let Some(sub_path) = entry_name.strip_prefix("cache/") {
                    let dest = cache_dir.join(sub_path.replace('/', std::path::MAIN_SEPARATOR_STR));
                    if let Some(parent) = dest.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if let Ok(mut out) = File::create(&dest) {
                        if std::io::copy(&mut zip_entry, &mut out).is_ok() {
                            artwork_restored = true;
                        }
                    }
                }
            }
        }

        Ok(RestoreResult {
            games_restored: manifest.total_games,
            settings_restored,
            themes_restored,
            artwork_restored,
        })
    })();

    // Clean up temporary extraction folder
    let _ = fs::remove_dir_all(&temp_dir);

    result
}
