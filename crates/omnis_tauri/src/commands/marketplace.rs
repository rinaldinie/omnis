use crate::types::AppState;
use omnis_core::{MarketplaceCatalog, ProviderInfo};
use tauri::State;

#[tauri::command]
pub async fn get_marketplace_catalog(
    state: State<'_, AppState>,
) -> Result<MarketplaceCatalog, String> {
    state.marketplace.get_catalog(None).await
}

#[tauri::command]
pub async fn install_marketplace_plugin(
    plugin_id: String,
    state: State<'_, AppState>,
) -> Result<ProviderInfo, String> {
    state
        .marketplace
        .install_plugin(&plugin_id, &state.downloader)
        .await
}

#[tauri::command]
pub async fn uninstall_marketplace_plugin(
    plugin_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .marketplace
        .uninstall_plugin(&plugin_id, &state.downloader)
        .await
}
