use omnis_core::StatsRepository;
use omnis_sdk::{DaySessionDto, GameStatsDto, GlobalStatsDto};
use tauri::State;
use uuid::Uuid;

use crate::types::AppState;

/// Retrieve detailed session records for a single calendar day (YYYY-MM-DD)
#[tauri::command]
pub async fn get_day_sessions(
    date: String,
    state: State<'_, AppState>,
) -> Result<Vec<DaySessionDto>, String> {
    state
        .db
        .get_day_sessions(&date)
        .map_err(|e| e.to_string())
}

/// Retrieve aggregated global statistics across all library games and sessions
#[tauri::command]
pub async fn get_global_statistics(
    year: Option<i32>,
    state: State<'_, AppState>,
) -> Result<GlobalStatsDto, String> {
    state
        .db
        .get_global_statistics(year)
        .map_err(|e| e.to_string())
}

/// Retrieve detailed session analytics and 4-week bar chart for a single game
#[tauri::command]
pub async fn get_game_statistics(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<GameStatsDto, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| format!("Invalid game ID: {}", e))?;
    state
        .db
        .get_game_statistics(id)
        .map_err(|e| e.to_string())
}

/// Reset game session history and optionally zero out playtime across all library games
#[tauri::command]
pub async fn reset_statistics(
    reset_playtime: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .reset_statistics(reset_playtime)
        .map_err(|e| e.to_string())
}

/// Synchronize unrecorded local Steam sessions from gameprocess_log.txt into the database
#[tauri::command]
pub async fn sync_steam_sessions(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<usize, String> {
    let db = state.db.clone();
    let count = tokio::task::spawn_blocking(move || {
        crate::steam_sync::sync_local_steam_sessions(&db).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    if count > 0 {
        use tauri::Emitter;
        let _ = app_handle.emit(omnis_sdk::constants::events::LIBRARY_UPDATED, ());
    }
    Ok(count)
}
