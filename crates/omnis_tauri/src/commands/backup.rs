use crate::types::AppState;
use omnis_core::{
    calculate_next_backup_utc, BackupFrequency, BackupOptions, BackupScheduleConfig,
};
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

/// DTO representing automated backup schedule settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupScheduleConfigDto {
    pub frequency: String,
    pub destination_dir: Option<String>,
    pub max_rotations: usize,
    pub last_backup_utc: Option<String>,
    pub next_backup_utc: Option<String>,
    pub include_artwork: bool,
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
    keep_last: Option<usize>,
    state: State<'_, AppState>,
) -> Result<BackupResultDto, String> {
    let db = state.db.clone();
    let app_dir = state.app_dir.clone();
    let dest_buf = PathBuf::from(destination_dir);

    let effective_keep_last = match keep_last {
        Some(k) => k.clamp(1, 10),
        None => db
            .get_backup_schedule()
            .map(|s| s.clamped_max_rotations())
            .unwrap_or(10),
    };

    tokio::task::spawn_blocking(move || {
        let options = BackupOptions {
            destination_dir: dest_buf,
            include_artwork,
            keep_last: Some(effective_keep_last),
        };

        let res = omnis_core::create_backup(&db, &app_dir, &options)
            .map_err(|e| e.to_string())?;

        let _ = db.record_backup_completed(&res.timestamp);

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

/// Retrieves current backup schedule settings and computed next run timestamp
#[tauri::command]
pub async fn get_backup_schedule(
    state: State<'_, AppState>,
) -> Result<BackupScheduleConfigDto, String> {
    let config = state.db.get_backup_schedule().map_err(|e| e.to_string())?;
    let next_backup_utc = calculate_next_backup_utc(
        config.last_backup_utc.as_deref(),
        &config.frequency,
        chrono::Utc::now(),
    );

    Ok(BackupScheduleConfigDto {
        frequency: config.frequency.as_str().to_string(),
        destination_dir: config
            .destination_dir
            .as_ref()
            .map(|p| p.to_string_lossy().to_string()),
        max_rotations: config.clamped_max_rotations(),
        last_backup_utc: config.last_backup_utc,
        next_backup_utc,
        include_artwork: config.include_artwork,
    })
}

/// Saves updated backup schedule configuration and returns updated settings with next run time
#[tauri::command]
pub async fn save_backup_schedule(
    config: BackupScheduleConfigDto,
    state: State<'_, AppState>,
) -> Result<BackupScheduleConfigDto, String> {
    let frequency = BackupFrequency::from_str_name(&config.frequency);
    let destination_dir = config
        .destination_dir
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    let clamped_rotations = config.max_rotations.clamp(1, 10);

    let current = state.db.get_backup_schedule().unwrap_or_default();
    let last_backup_utc = config.last_backup_utc.or(current.last_backup_utc);
    let now = chrono::Utc::now();

    let schedule_config = BackupScheduleConfig {
        frequency,
        destination_dir: destination_dir.clone(),
        max_rotations: clamped_rotations,
        last_backup_utc: last_backup_utc.clone(),
        include_artwork: config.include_artwork,
        updated_at: now.to_rfc3339(),
    };

    state
        .db
        .save_backup_schedule(&schedule_config)
        .map_err(|e| e.to_string())?;

    let next_backup_utc = calculate_next_backup_utc(
        last_backup_utc.as_deref(),
        &frequency,
        now,
    );

    Ok(BackupScheduleConfigDto {
        frequency: frequency.as_str().to_string(),
        destination_dir: destination_dir.map(|p| p.to_string_lossy().to_string()),
        max_rotations: clamped_rotations,
        last_backup_utc,
        next_backup_utc,
        include_artwork: config.include_artwork,
    })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backup_schedule_config_dto_serde() {
        let dto = BackupScheduleConfigDto {
            frequency: "daily".to_string(),
            destination_dir: Some("/backups".to_string()),
            max_rotations: 5,
            last_backup_utc: Some("2026-11-01T10:00:00Z".to_string()),
            next_backup_utc: Some("2026-11-02T10:00:00Z".to_string()),
            include_artwork: true,
        };

        let json = serde_json::to_string(&dto).expect("Serialization failed");
        let decoded: BackupScheduleConfigDto =
            serde_json::from_str(&json).expect("Deserialization failed");

        assert_eq!(decoded.frequency, "daily");
        assert_eq!(decoded.destination_dir, Some("/backups".to_string()));
        assert_eq!(decoded.max_rotations, 5);
        assert_eq!(decoded.last_backup_utc, Some("2026-11-01T10:00:00Z".to_string()));
        assert_eq!(decoded.next_backup_utc, Some("2026-11-02T10:00:00Z".to_string()));
        assert!(decoded.include_artwork);
    }

    #[test]
    fn test_backup_frequency_mapping() {
        assert_eq!(BackupFrequency::from_str_name("daily"), BackupFrequency::Daily);
        assert_eq!(BackupFrequency::from_str_name("Weekly"), BackupFrequency::Weekly);
        assert_eq!(BackupFrequency::from_str_name("MONTHLY"), BackupFrequency::Monthly);
        assert_eq!(BackupFrequency::from_str_name("disabled"), BackupFrequency::Disabled);
        assert_eq!(BackupFrequency::from_str_name("other"), BackupFrequency::Disabled);
    }
}
