//! Application Data Directory Resolver & Migration
//!
//! Follows the Playnite / VS Code model:
//! 1. Portable Mode: if a `data/` folder (or `portable.txt` marker) exists next to
//!    the running executable, all application data (DB, cache, plugins, themes) is stored there.
//! 2. Installed Mode: canonical roaming or local application data directory
//!    - Windows: `%APPDATA%\Omnis Game Library\`
//!    - Non-Windows / Fallback: Tauri `app_data_dir` or `./data`
//!
//! Automatically migrates legacy directories (`OmnisGameLibrary`, `com.omnis.gamelibrary`)
//! to the resolved target on startup.

use std::path::{Path, PathBuf};
use tracing::{info, error};

const MIGRATION_MARKER: &str = "_MIGRATED.txt";

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

/// Resolves the application data directory.
///
/// If running in portable mode (a `data` subfolder or `portable.txt` exists alongside `omnis.exe`),
/// returns `<exe_dir>/data`.
///
/// Otherwise, returns the canonical user data directory (`%APPDATA%\Omnis Game Library` on Windows).
pub fn resolve_app_dir(tauri_fallback: Option<PathBuf>) -> (PathBuf, bool) {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let local_data = exe_dir.join("data");
            let marker = exe_dir.join("portable.txt");
            if local_data.is_dir() || marker.exists() {
                let _ = std::fs::create_dir_all(&local_data);
                return (local_data, true);
            }
        }
    }

    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let canonical = PathBuf::from(appdata).join("Omnis Game Library");
            return (canonical, false);
        }
    }

    if let Some(fallback) = tauri_fallback {
        (fallback, false)
    } else {
        (PathBuf::from("./data"), false)
    }
}

/// Discovers existing legacy data directories to migrate from, ordered by recency.
fn discover_legacy_directories(target_dir: &Path) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(windows)]
    {
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            // Tauri v2 bundle identifier dir
            candidates.push(PathBuf::from(&local_appdata).join("com.omnis.gamelibrary"));
            // Custom initial unspaced dir
            candidates.push(PathBuf::from(&local_appdata).join("OmnisGameLibrary"));
        }
    }

    candidates
        .into_iter()
        .filter(|dir| dir.is_dir() && dir != target_dir && !dir.join(MIGRATION_MARKER).exists())
        .collect()
}

/// Move a single file or directory from `src` to `dst`.
fn move_item(src: &Path, dst: &Path) -> std::io::Result<()> {
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }

    match std::fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(_) => {
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

fn write_migration_marker(legacy_dir: &Path, target_dir: &Path) {
    let marker = legacy_dir.join(MIGRATION_MARKER);
    let content = format!(
        "Data migrated to '{}' on {}.\n\
         This folder is no longer used by Omnis and can be safely deleted.",
        target_dir.display(),
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
    );
    let _ = std::fs::write(&marker, content);
}

/// Migrates any legacy directories into `target_dir` if target does not already contain a database.
pub fn migrate_all_legacy_data(target_dir: &Path) {
    let legacy_dirs = discover_legacy_directories(target_dir);
    if legacy_dirs.is_empty() {
        return;
    }

    let target_has_db = target_dir.join("library.db").exists();

    for legacy_dir in legacy_dirs {
        if target_has_db {
            info!(
                "Target directory already contains library.db, marking {} as migrated",
                legacy_dir.display()
            );
            write_migration_marker(&legacy_dir, target_dir);
            continue;
        }

        info!(
            "Migrating legacy data from {} -> {}",
            legacy_dir.display(),
            target_dir.display()
        );

        if let Err(e) = std::fs::create_dir_all(target_dir) {
            error!("Failed to create target directory {}: {}", target_dir.display(), e);
            return;
        }

        for item_name in MIGRATION_ITEMS {
            let src = legacy_dir.join(item_name);
            if !src.exists() {
                continue;
            }
            let dst = target_dir.join(item_name);
            if dst.exists() {
                continue;
            }
            if let Err(e) = move_item(&src, &dst) {
                error!("Failed to migrate '{}': {}", item_name, e);
            }
        }

        write_migration_marker(&legacy_dir, target_dir);
    }
}
