use crate::types::AppState;
use omnis_core::BackupOptions;
use omnis_sdk::constants::events;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{Emitter, State};

/// DTO returning metadata of created backup archive
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupResultDto {
    pub backup_path: String,
    pub file_size_bytes: u64,
    pub total_games: usize,
    pub artwork_included: bool,
    pub timestamp: String,
}

/// DTO inspecting an archive prior to restoration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInspectionDto {
    pub format_version: u32,
    pub created_at_utc: String,
    pub omnis_version: String,
    pub schema_version: u32,
    pub hostname: String,
    pub include_artwork: bool,
    pub total_games: usize,
    pub backup_size_bytes: u64,
    pub has_database: bool,
    pub has_settings: bool,
    pub has_artwork: bool,
    pub custom_themes_count: usize,
}

/// Opens native folder picker to select backup target directory
#[tauri::command]
pub async fn pick_backup_destination_folder() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let dir = rfd::FileDialog::new()
            .set_title("Seleziona cartella dove salvare il backup (.zip)")
            .pick_folder();
        Ok(dir.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Opens native file picker to select a `.zip` archive to restore
#[tauri::command]
pub async fn pick_backup_file_to_restore() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let file = rfd::FileDialog::new()
            .set_title("Seleziona file di ripristino Omnis (.zip)")
            .add_filter("Archivio Backup Omnis (*.zip)", &["zip"])
            .pick_file();
        Ok(file.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Creates a new hot backup snapshot bundled into `.zip`
#[tauri::command]
pub async fn create_backup(
    destination_dir: String,
    include_artwork: bool,
    state: State<'_, AppState>,
) -> Result<BackupResultDto, String> {
    let db = state.db.clone();
    let app_dir = state.app_dir.clone();
    let dest_buf = PathBuf::from(destination_dir);

    tokio::task::spawn_blocking(move || {
        let options = BackupOptions {
            destination_dir: dest_buf,
            include_artwork,
            keep_last: Some(5),
        };

        let res = omnis_core::create_backup(&db, &app_dir, &options)
            .map_err(|e| e.to_string())?;

        Ok(BackupResultDto {
            backup_path: res.backup_path.to_string_lossy().to_string(),
            file_size_bytes: res.file_size_bytes,
            total_games: res.total_games,
            artwork_included: res.artwork_included,
            timestamp: res.timestamp,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Inspects a backup archive file before restoring
#[tauri::command]
pub async fn inspect_backup(backup_file_path: String) -> Result<BackupInspectionDto, String> {
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&backup_file_path);
        let inspection = omnis_core::inspect_backup(path).map_err(|e| e.to_string())?;

        Ok(BackupInspectionDto {
            format_version: inspection.manifest.format_version,
            created_at_utc: inspection.manifest.created_at_utc,
            omnis_version: inspection.manifest.omnis_version,
            schema_version: inspection.manifest.schema_version,
            hostname: inspection.manifest.hostname,
            include_artwork: inspection.manifest.include_artwork,
            total_games: inspection.manifest.total_games,
            backup_size_bytes: inspection.manifest.backup_size_bytes,
            has_database: inspection.has_database,
            has_settings: inspection.has_settings,
            has_artwork: inspection.has_artwork,
            custom_themes_count: inspection.custom_themes_count,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Restores application database, settings, themes, and artwork from a `.zip` bundle
#[tauri::command]
pub async fn restore_backup(
    backup_file_path: String,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<bool, String> {
    let db = state.db.clone();
    let app_dir = state.app_dir.clone();
    let backup_path = PathBuf::from(backup_file_path);

    tokio::task::spawn_blocking(move || {
        omnis_core::restore_backup(&db, &app_dir, &backup_path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    // Clear memory image cache so restored artwork updates immediately
    state.image_cache.clear();

    // Broadcast library updated event across the app
    let _ = app_handle.emit(events::LIBRARY_UPDATED, ());

    Ok(true)
}
