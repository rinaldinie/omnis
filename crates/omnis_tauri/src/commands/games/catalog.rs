use crate::types::{game_summary_to_dto, game_to_dto, AppState, GameDto};
use omnis_core::LibraryCounts;
use omnis_sdk::Game;
use tauri::State;
use uuid::Uuid;

/// Helper to convert a `Game` into an enriched `GameDto`, resolving `other_copies`
/// in $O(1)$ via the duplicate group index rather than scanning the entire database.
pub fn game_to_enriched_dto(state: &AppState, game: Game) -> GameDto {
    state.media_scope.allow_game_media(&game);
    let group_id = game.duplicate_group_id.clone();
    let mut dto = game_to_dto(game);
    if let Some(ref group_id) = group_id {
        if let Ok(group_games) = state.db.get_games_by_duplicate_group(group_id) {
            let mut group_dtos: Vec<GameDto> = group_games
                .into_iter()
                .map(game_to_dto)
                .collect();
            crate::types::populate_other_copies(&mut group_dtos);
            if let Some(populated) = group_dtos.into_iter().find(|d| d.id == dto.id) {
                dto.other_copies = populated.other_copies;
            }
        }
    }
    dto
}

#[tauri::command]
pub async fn get_games(state: State<'_, AppState>) -> Result<Vec<GameDto>, String> {
    let games = state.db.get_all_games().map_err(|e| e.to_string())?;
    state.media_scope.allow_media_paths(games.iter().flat_map(|g| {
        [
            g.cover_image_path.as_deref(),
            g.background_image_path.as_deref(),
            g.icon_image_path.as_deref(),
        ]
        .into_iter()
        .flatten()
    }));
    let mut dtos: Vec<GameDto> = games.into_iter().map(game_to_dto).collect();
    crate::types::populate_other_copies(&mut dtos);
    Ok(dtos)
}

#[tauri::command]
pub async fn get_games_summary(state: State<'_, AppState>) -> Result<Vec<GameDto>, String> {
    let summaries = state
        .db
        .get_all_game_summaries()
        .map_err(|e| e.to_string())?;
    state.media_scope.allow_media_paths(summaries.iter().flat_map(|g| {
        [
            g.cover_image_path.as_deref(),
            g.background_image_path.as_deref(),
            g.icon_image_path.as_deref(),
        ]
        .into_iter()
        .flatten()
    }));
    let mut dtos: Vec<GameDto> = summaries.into_iter().map(game_summary_to_dto).collect();
    crate::types::populate_other_copies(&mut dtos);
    Ok(dtos)
}

#[tauri::command]
pub async fn get_games_paginated(
    limit: usize,
    offset: usize,
    state: State<'_, AppState>,
) -> Result<Vec<GameDto>, String> {
    let games = state
        .db
        .get_games_paginated(limit, offset)
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

#[tauri::command]
pub async fn get_game(game_id: String, state: State<'_, AppState>) -> Result<GameDto, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;
    Ok(game_to_enriched_dto(&state, game))
}

#[tauri::command]
pub async fn get_counts(state: State<'_, AppState>) -> Result<LibraryCounts, String> {
    state.db.get_library_counts().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_library(state: State<'_, AppState>) -> Result<usize, String> {
    state.db.clear_all_games().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_game_metadata(
    game_update: omnis_sdk::GameUpdateDto,
    state: State<'_, AppState>,
) -> Result<GameDto, String> {
    let updated = state
        .db
        .update_game(&game_update)
        .map_err(|e| e.to_string())?;
    Ok(game_to_enriched_dto(&state, updated))
}

#[tauri::command]
pub async fn update_game_completion_status(
    game_id: String,
    status: Option<String>,
    completion_status: Option<String>,
    state: State<'_, AppState>,
) -> Result<GameDto, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| format!("Invalid UUID: {}", e))?;
    let status_val = status
        .or(completion_status)
        .unwrap_or_else(|| "NotPlayed".to_string());
    let game = state
        .db
        .set_game_completion_status(id, &status_val)
        .map_err(|e| e.to_string())?;
    Ok(game_to_enriched_dto(&state, game))
}
