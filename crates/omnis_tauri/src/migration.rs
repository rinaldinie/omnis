//! One-time migration from the legacy `OmnisGameLibrary` data directory
//! to the Tauri-managed `Omnis Game Library` directory.
//!
//! This module ensures existing user data (database, cache, plugins, themes,
//! trailers, vault keys) is preserved when upgrading to a version that uses
//! the canonical Tauri app_local_data_dir path.

use std::path::{Path, PathBuf};
use tracing::{info, warn, error};

const LEGACY_FOLDER_NAME: &str = "OmnisGameLibrary";
const MIGRATION_MARKER: &str = "_MIGRATED.txt";

/// Items to migrate from the legacy directory.
/// Each entry is a relative path inside the legacy folder.
const MIGRATION_ITEMS: &[&str] = &[
    "library.db",
    "library.db-wal",
    "library.db-shm",
    "master.key",
    "cache",
    "plugins",
    "themes",
    "trailers",
];

/// Resolves the legacy data directory path.
///
/// Returns `None` if `LOCALAPPDATA` is not set (non-Windows) or if the legacy
/// folder does not exist.
fn legacy_data_dir() -> Option<PathBuf> {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    let path = PathBuf::from(local).join(LEGACY_FOLDER_NAME);
    if path.is_dir() {
        Some(path)
    } else {
        None
    }
}

/// Returns `true` if the legacy directory has already been migrated
/// (marker file present) or does not exist.
fn is_already_migrated(legacy_dir: &Path) -> bool {
    legacy_dir.join(MIGRATION_MARKER).exists()
}

/// Returns `true` if the target directory already contains a database,
/// meaning the user has already run the new version at least once.
fn target_has_data(target_dir: &Path) -> bool {
    target_dir.join("library.db").exists()
}

/// Move a single file or directory from `src` to `dst`.
///
/// Uses `fs::rename` first (fast, atomic on same filesystem).
/// Falls back to recursive copy + remove if rename fails (e.g. cross-device).
fn move_item(src: &Path, dst: &Path) -> std::io::Result<()> {
    // Ensure parent directory exists
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Try rename first (same filesystem = instant)
    match std::fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(_) => {
            // Fallback: recursive copy then remove
            if src.is_dir() {
                copy_dir_recursive(src, dst)?;
                std::fs::remove_dir_all(src)?;
            } else {
                std::fs::copy(src, dst)?;
                std::fs::remove_file(src)?;
            }
            Ok(())
        }
    }
}

/// Recursively copy a directory tree.
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// Write a marker file in the legacy directory to prevent re-migration.
fn write_migration_marker(legacy_dir: &Path) {
    let marker = legacy_dir.join(MIGRATION_MARKER);
    let content = format!(
        "Data migrated to Tauri app_local_data_dir on {}.\n\
         This folder is no longer used by Omnis and can be safely deleted.",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
    );
    if let Err(e) = std::fs::write(&marker, content) {
        warn!("Failed to write migration marker: {}", e);
    }
}

/// Run the legacy data migration.
///
/// This function is **idempotent**: it is safe to call on every startup.
/// It will only perform work if:
/// - The legacy `OmnisGameLibrary` folder exists
/// - It has NOT been previously migrated (no `_MIGRATED.txt` marker)
/// - The target directory does NOT already contain a `library.db`
///
/// Call this **before** opening the database.
pub fn migrate_legacy_data(target_dir: &Path) {
    let legacy_dir = match legacy_data_dir() {
        Some(dir) => dir,
        None => {
            info!("No legacy data directory found, skipping migration");
            return;
        }
    };

    // Same directory? Nothing to do (shouldn't happen, but guard against it)
    if legacy_dir == target_dir {
        info!("Legacy and target directories are the same, skipping migration");
        return;
    }

    if is_already_migrated(&legacy_dir) {
        info!("Legacy data directory already migrated, skipping");
        return;
    }

    if target_has_data(target_dir) {
        info!(
            "Target directory already contains data, marking legacy as migrated without moving files"
        );
        write_migration_marker(&legacy_dir);
        return;
    }

    info!(
        "Migrating data from legacy directory: {} -> {}",
        legacy_dir.display(),
        target_dir.display()
    );

    // Ensure target directory exists
    if let Err(e) = std::fs::create_dir_all(target_dir) {
        error!("Failed to create target directory: {}", e);
        return;
    }

    let mut migrated_count = 0;
    let mut error_count = 0;

    for item_name in MIGRATION_ITEMS {
        let src = legacy_dir.join(item_name);
        if !src.exists() {
            continue;
        }

        let dst = target_dir.join(item_name);
        if dst.exists() {
            info!("Skipping '{}': already exists in target", item_name);
            continue;
        }

        info!("Migrating '{}'...", item_name);
        match move_item(&src, &dst) {
            Ok(()) => {
                info!("Successfully migrated '{}'", item_name);
                migrated_count += 1;
            }
            Err(e) => {
                error!("Failed to migrate '{}': {}", item_name, e);
                error_count += 1;
            }
        }
    }

    info!(
        "Migration complete: {} items moved, {} errors",
        migrated_count, error_count
    );

    write_migration_marker(&legacy_dir);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_is_already_migrated() {
        let dir = TempDir::new().unwrap();
        assert!(!is_already_migrated(dir.path()));

        fs::write(dir.path().join(MIGRATION_MARKER), "done").unwrap();
        assert!(is_already_migrated(dir.path()));
    }

    #[test]
    fn test_target_has_data() {
        let dir = TempDir::new().unwrap();
        assert!(!target_has_data(dir.path()));

        fs::write(dir.path().join("library.db"), b"sqlite").unwrap();
        assert!(target_has_data(dir.path()));
    }

    #[test]
    fn test_move_item_file() {
        let src_dir = TempDir::new().unwrap();
        let dst_dir = TempDir::new().unwrap();

        let src = src_dir.path().join("test.db");
        let dst = dst_dir.path().join("test.db");
        fs::write(&src, b"database content").unwrap();

        move_item(&src, &dst).unwrap();

        assert!(!src.exists());
        assert!(dst.exists());
        assert_eq!(fs::read(&dst).unwrap(), b"database content");
    }

    #[test]
    fn test_move_item_directory() {
        let src_dir = TempDir::new().unwrap();
        let dst_dir = TempDir::new().unwrap();

        let src = src_dir.path().join("cache");
        let dst = dst_dir.path().join("cache");
        fs::create_dir_all(src.join("covers")).unwrap();
        fs::write(src.join("covers").join("img.jpg"), b"image").unwrap();

        move_item(&src, &dst).unwrap();

        assert!(!src.exists());
        assert!(dst.join("covers").join("img.jpg").exists());
        assert_eq!(
            fs::read(dst.join("covers").join("img.jpg")).unwrap(),
            b"image"
        );
    }

    #[test]
    fn test_copy_dir_recursive() {
        let src_dir = TempDir::new().unwrap();
        let dst_dir = TempDir::new().unwrap();

        let src = src_dir.path().join("data");
        let dst = dst_dir.path().join("data");

        fs::create_dir_all(src.join("sub")).unwrap();
        fs::write(src.join("a.txt"), b"aaa").unwrap();
        fs::write(src.join("sub").join("b.txt"), b"bbb").unwrap();

        copy_dir_recursive(&src, &dst).unwrap();

        assert!(dst.join("a.txt").exists());
        assert!(dst.join("sub").join("b.txt").exists());
        assert_eq!(fs::read(dst.join("a.txt")).unwrap(), b"aaa");
        assert_eq!(fs::read(dst.join("sub").join("b.txt")).unwrap(), b"bbb");
    }
}
