use crate::types::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_game_trailer_url(
    game_id: String,
    library_id: String,
    external_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    crate::trailer_service::GameTrailerResolver::resolve(&state, &game_id, &library_id, &external_id).await
}
