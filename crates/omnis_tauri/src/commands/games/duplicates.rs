use super::catalog::game_to_enriched_dto;
use crate::types::{game_to_dto, AppState, GameDto};
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn get_duplicate_hider_config(
    state: State<'_, AppState>,
) -> Result<omnis_sdk::DuplicateHiderConfig, String> {
    state
        .db
        .get_duplicate_hider_config()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_duplicate_hider_config(
    config: omnis_sdk::DuplicateHiderConfig,
    state: State<'_, AppState>,
) -> Result<omnis_sdk::DuplicateHiderStats, String> {
    state
        .db
        .save_duplicate_hider_config(&config)
        .map_err(|e| e.to_string())?;
    state.db.recompute_duplicates().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apply_duplicate_hider(
    state: State<'_, AppState>,
) -> Result<omnis_sdk::DuplicateHiderStats, String> {
    state.db.recompute_duplicates().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_game_hidden(
    game_id: String,
    is_hidden: bool,
    state: State<'_, AppState>,
) -> Result<GameDto, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| format!("Invalid UUID: {}", e))?;
    let updated = state
        .db
        .set_game_hidden(id, is_hidden)
        .map_err(|e| e.to_string())?;
    Ok(game_to_enriched_dto(&state, updated))
}

#[tauri::command]
pub async fn set_game_favorite(
    game_id: String,
    is_favorite: bool,
    state: State<'_, AppState>,
) -> Result<GameDto, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| format!("Invalid UUID: {}", e))?;
    let updated = state
        .db
        .set_game_favorite(id, is_favorite)
        .map_err(|e| e.to_string())?;
    Ok(game_to_enriched_dto(&state, updated))
}

#[tauri::command]
pub async fn promote_duplicate_copy(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<GameDto>, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| format!("Invalid UUID: {}", e))?;
    let games = state
        .db
        .promote_duplicate_copy(id)
        .map_err(|e| e.to_string())?;
    let mut dtos: Vec<GameDto> = games
        .into_iter()
        .map(|g| {
            state.media_scope.allow_game_media(&g);
            game_to_dto(g)
        })
        .collect();
    crate::types::populate_other_copies(&mut dtos);
    Ok(dtos)
}
