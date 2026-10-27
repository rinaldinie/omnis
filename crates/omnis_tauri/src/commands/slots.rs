use crate::types::AppState;
use omnis_sdk::SlotWidget;
use tauri::State;

/// Retrieves and validates declarative plugin slot widgets for a given slot name
#[tauri::command]
pub async fn get_slot_widgets(
    slot_name: String,
    game_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<SlotWidget>, String> {
    Ok(crate::slot_resolver::SlotWidgetResolver::resolve_for_slot(&state, &slot_name, game_id.as_deref()).await)
}
