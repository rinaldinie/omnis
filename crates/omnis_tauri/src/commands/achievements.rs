//! Tauri IPC commands for game achievements and icon caching

use crate::types::AppState;
use omnis_sdk::{AchievementsSyncStatus, GameAchievementsSummary};
use tauri::State;
use tracing::debug;
use uuid::Uuid;

#[tauri::command]
pub async fn get_game_achievements(
    game_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<GameAchievementsSummary, String> {
    let gid = Uuid::parse_str(&game_id).map_err(|e| format!("Invalid game ID: {e}"))?;

    let summary = state
        .db
        .get_game_achievements(gid)
        .map_err(|e| format!("Database error: {e}"))?;

    if summary.total_count > 0 || summary.sync_status == AchievementsSyncStatus::None {
        return Ok(summary);
    }

    // Trigger asynchronous background sync if never synced to avoid freezing IPC / UI
    let db = state.db.clone();
    let store_account_manager = state.store_account_manager.clone();
    let app_dir = state.app_dir.clone();
    let achievement_service = state.achievement_service.clone();

    tokio::spawn(async move {
        match achievement_service
            .sync_game_achievements(&db, &store_account_manager, &app_dir, gid)
            .await
        {
            Ok(refreshed) => {
                if refreshed.total_count > 0
                    || refreshed.sync_status == AchievementsSyncStatus::None
                {
                    use omnis_sdk::constants::events;
                    use tauri::Emitter;
                    let _ = app_handle.emit(
                        events::ACHIEVEMENTS_UPDATED,
                        serde_json::json!({ "game_id": gid.to_string() }),
                    );
                }
            }
            Err(e) => {
                debug!("Automatic achievements sync skipped or failed for {gid}: {e}");
            }
        }
    });

    Ok(summary)
}

#[tauri::command]
pub async fn refresh_game_achievements(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<GameAchievementsSummary, String> {
    let gid = Uuid::parse_str(&game_id).map_err(|e| format!("Invalid game ID: {e}"))?;

    state
        .achievement_service
        .sync_game_achievements(&state.db, &state.store_account_manager, &state.app_dir, gid)
        .await
}

/// Starts the library-wide achievement sync in the background and returns immediately.
/// Progress is reported through `achievement-sync-progress` events.
#[tauri::command]
pub async fn start_library_achievement_sync(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn(crate::services::run_library_sync(app));
    Ok(())
}

#[tauri::command]
pub fn set_sync_achievements_on_game_exit(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .sync_achievements_on_game_exit
        .store(enabled, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}
