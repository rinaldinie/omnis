//! Background scheduler worker for automated Omnis library backups

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tracing::{info, warn};

use omnis_core::{
    create_backup, is_backup_due, BackupOptions, Database,
};

use crate::commands::BackupResultDto;

/// Spawns the background backup scheduler task in the Tauri runtime
pub fn spawn_backup_scheduler(
    db: Arc<Database>,
    app_dir: PathBuf,
    app_handle: tauri::AppHandle,
) {
    tauri::async_runtime::spawn(async move {
        // Initial delay after startup
        tokio::time::sleep(Duration::from_secs(10)).await;

        loop {
            match db.get_backup_schedule() {
                Ok(config) => {
                    let now = chrono::Utc::now();
                    if is_backup_due(&config, now) {
                        if let Some(dest) = config.destination_dir.as_ref().filter(|p| !p.as_os_str().is_empty()) {
                            let dest_path = dest.clone();
                            let include_artwork = config.include_artwork;
                            let keep_last = Some(config.clamped_max_rotations());

                            let db_task = db.clone();
                            let app_dir_task = app_dir.clone();

                            let backup_result = tokio::task::spawn_blocking(move || {
                                let options = BackupOptions {
                                    destination_dir: dest_path,
                                    include_artwork,
                                    keep_last,
                                };
                                create_backup(&db_task, &app_dir_task, &options)
                            })
                            .await;

                            match backup_result {
                                Ok(Ok(res)) => {
                                    if let Err(e) = db.record_backup_completed(&res.timestamp) {
                                        warn!("Failed to record backup completion in database: {}", e);
                                    }

                                    info!(
                                        "Automatic scheduled backup successfully completed: {} (size: {} bytes, total games: {})",
                                        res.backup_path.display(),
                                        res.file_size_bytes,
                                        res.total_games
                                    );

                                    let dto = BackupResultDto {
                                        backup_path: res.backup_path.to_string_lossy().to_string(),
                                        file_size_bytes: res.file_size_bytes,
                                        total_games: res.total_games,
                                        artwork_included: res.artwork_included,
                                        timestamp: res.timestamp,
                                    };

                                    if let Err(e) = app_handle.emit("omnis://backup-completed", &dto) {
                                        warn!("Failed to emit omnis://backup-completed event: {}", e);
                                    }
                                }
                                Ok(Err(e)) => {
                                    warn!("Automatic scheduled backup failed: {}", e);
                                }
                                Err(e) => {
                                    warn!("Automatic scheduled backup task panicked or cancelled: {}", e);
                                }
                            }
                        } else {
                            warn!("Automatic backup scheduled is due, but destination directory is not configured or empty");
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to fetch backup schedule configuration: {}", e);
                }
            }

            // Periodic interval: check every 30 minutes
            tokio::time::sleep(Duration::from_secs(1800)).await;
        }
    });
}
