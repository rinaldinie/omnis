use crate::types::AppState;
use tauri::{Emitter, State};

#[tauri::command]
pub async fn start_store_login(
    store_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.store_account_manager.start_login(&app_handle, &store_id)
}

#[tauri::command]
pub async fn get_store_accounts(
    state: State<'_, AppState>,
) -> Result<Vec<omnis_sdk::models::StoreAccountDto>, String> {
    state.store_account_manager.get_store_accounts().await
}

#[tauri::command]
pub async fn disconnect_store_account(
    store_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.store_account_manager.delete_session(&store_id)?;
    let _ = app_handle.emit("store-account-disconnected", serde_json::json!({ "store_id": store_id }));
    Ok(())
}

#[tauri::command]
pub async fn sync_store_library(
    store_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    if let Some(id) = store_id {
        state.store_account_manager.sync_store(&app_handle, &id).await
    } else {
        state.store_account_manager.sync_all_connected(&app_handle).await
    }
}

#[tauri::command]
pub fn get_vault_status(state: State<'_, AppState>) -> Result<omnis_core::VaultStatus, String> {
    let is_fb = state.store_account_manager.is_fallback();
    Ok(omnis_core::VaultStatus {
        is_fallback: is_fb,
        warning: if is_fb {
            Some("Archiviazione sicura di sistema (Keyring) non disponibile. Chiave master salvata in file locale protetto (chmod 0600).".to_string())
        } else {
            None
        },
    })
}
