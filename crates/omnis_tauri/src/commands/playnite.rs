use crate::types::AppState;
use omnis_core::{PlayniteBackupImportOptions, PlayniteBackupInspection, PlayniteImportStats};
use omnis_sdk::constants::{events, storage};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{Emitter, State};

/// Payload emitted over Tauri event stream during Playnite backup import.
#[derive(Debug, Clone, Serialize)]
pub struct PlayniteImportProgressPayload {
    pub current: usize,
    pub total: usize,
    pub message: String,
}

/// Inspects a Playnite backup ZIP archive without mutating the database or filesystem.
/// Returns match summary and statistics against existing Omnis games.
#[tauri::command]
pub async fn inspect_playnite_backup(
    zip_path: String,
    state: State<'_, AppState>,
) -> Result<PlayniteBackupInspection, String> {
    let db = state.db.clone();
    let path = PathBuf::from(zip_path);

    tokio::task::spawn_blocking(move || {
        db.inspect_playnite_backup(&path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Executes Playnite backup import into Omnis library with progress streaming.
/// Updates playtime, play count, favorites, last activity, completion status,
/// and selectively extracts cover/background image assets.
#[tauri::command]
pub async fn execute_playnite_import(
    zip_path: String,
    mut options: PlayniteBackupImportOptions,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<PlayniteImportStats, String> {
    // Resolve image cache directory if not explicitly provided
    if options.image_cache_dir.is_none() {
        let cache_dir = if state.app_dir.as_os_str().is_empty() {
            crate::migration::resolve_app_dir(None)
                .0
                .join(storage::CACHE_DIR)
        } else {
            state.app_dir.join(storage::CACHE_DIR)
        };
        options.image_cache_dir = Some(cache_dir);
    }

    let db = state.db.clone();
    let path = PathBuf::from(zip_path);
    let handle = app_handle.clone();

    let stats = tokio::task::spawn_blocking(move || {
        let mut last_emitted = 0;
        db.import_playnite_backup(&path, &options, |current, total, message| {
            let is_first = current == 1;
            let is_last = current >= total;
            let is_milestone = current.saturating_sub(last_emitted) >= 10;
            if is_first || is_last || is_milestone {
                last_emitted = current;
                let _ = handle.emit(
                    "playnite://import-progress",
                    PlayniteImportProgressPayload {
                        current,
                        total,
                        message: message.to_string(),
                    },
                );
            }
        })
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    // Invalidate in-memory image cache if any new images were extracted
    if stats.images_cached > 0 {
        state.image_cache.clear();
    }

    // Notify UI if games were merged or created
    if stats.games_merged > 0 || stats.games_created > 0 {
        let _ = app_handle.emit(events::LIBRARY_UPDATED, ());
    }

    Ok(stats)
}

/// Opens native file dialog to pick a Playnite backup ZIP archive.
#[tauri::command]
pub async fn pick_playnite_backup_file() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let file = rfd::FileDialog::new()
            .set_title("Seleziona backup Playnite (.zip)")
            .add_filter("Archivio Playnite (*.zip)", &["zip"])
            .pick_file();
        Ok(file.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

