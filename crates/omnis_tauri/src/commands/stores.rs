use crate::types::AppState;
use omnis_sdk::models::StoreSyncProgressPayload;
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
    let manager = state.store_account_manager.clone();
    let app = app_handle.clone();
    let sid = store_id.clone();

    // Spawn in background Tokio runtime task so closing modals never interrupts sync
    tauri::async_runtime::spawn(async move {
        if let Some(ref id) = sid {
            if let Err(e) = manager.sync_store(&app, id).await {
                tracing::warn!("Background sync error for store {}: {}", id, e);
                let _ = app.emit(
                    "store-sync-progress",
                    StoreSyncProgressPayload {
                        store_id: id.clone(),
                        current: 0,
                        total: 0,
                        status: "error".to_string(),
                        message: Some(format!("Errore di sincronizzazione: {}", e)),
                    },
                );
            }
        } else {
            if let Err(e) = manager.sync_all_connected(&app).await {
                tracing::warn!("Background sync error for all stores: {}", e);
                let _ = app.emit(
                    "store-sync-progress",
                    StoreSyncProgressPayload {
                        store_id: "all".to_string(),
                        current: 0,
                        total: 0,
                        status: "error".to_string(),
                        message: Some(format!("Errore di sincronizzazione account: {}", e)),
                    },
                );
            }
        }
    });

    Ok(0)
}

#[tauri::command]
pub async fn save_store_api_key(
    store_id: String,
    api_key: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.store_account_manager.set_api_key(&store_id, &api_key)?;
    let _ = app_handle.emit(
        "store-account-connected",
        serde_json::json!({ "store_id": store_id }),
    );
    Ok(())
}

#[tauri::command]
pub async fn save_store_integration_settings(
    settings: crate::store_manager::StoreIntegrationSettingsDto,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let store_id = settings.store_id.clone();
    state
        .store_account_manager
        .save_integration_settings(&settings)?;
    let _ = app_handle.emit(
        "store-settings-updated",
        serde_json::json!({ "store_id": store_id }),
    );
    let _ = app_handle.emit(
        "store-account-connected",
        serde_json::json!({ "store_id": store_id }),
    );
    Ok(())
}

#[tauri::command]
pub async fn get_store_integration_settings(
    store_id: String,
    state: State<'_, AppState>,
) -> Result<crate::store_manager::StoreIntegrationSettingsDto, String> {
    state
        .store_account_manager
        .get_integration_settings(&store_id)
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
