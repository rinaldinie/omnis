//! Tauri IPC commands for game achievements and icon caching

use crate::types::AppState;
use omnis_sdk::GameAchievementsSummary;
use tauri::State;
use tracing::debug;
use uuid::Uuid;

#[tauri::command]
pub async fn get_game_achievements(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<GameAchievementsSummary, String> {
    let gid = Uuid::parse_str(&game_id).map_err(|e| format!("Invalid game ID: {e}"))?;

    let summary = state
        .db
        .get_game_achievements(gid)
        .map_err(|e| format!("Database error: {e}"))?;

    if summary.total_count > 0 {
        return Ok(summary);
    }

    // Attempt automatic refresh if never synced
    match state
        .achievement_service
        .sync_game_achievements(&state.db, &state.store_account_manager, &state.app_dir, gid)
        .await
    {
        Ok(refreshed) => Ok(refreshed),
        Err(e) => {
            debug!("Automatic achievements sync skipped or failed for {game_id}: {e}");
            Ok(summary)
        }
    }
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
