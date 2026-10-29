use omnis_core::StatsRepository;
use omnis_sdk::{GameStatsDto, GlobalStatsDto};
use tauri::State;
use uuid::Uuid;

use crate::types::AppState;

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
