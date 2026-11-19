use crate::types::AppState;
use omnis_sdk::PluginEvent;
use std::collections::HashSet;
use tauri::State;

#[tauri::command]
pub async fn sync_library(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let connected: HashSet<String> = state
        .store_account_manager
        .get_store_accounts()
        .await
        .unwrap_or_default()
        .into_iter()
        .filter(|a| a.is_connected)
        .map(|a| a.store_id)
        .collect();

    // 1. Dispatch local manifest scan only for libraries/plugins NOT connected to cloud accounts
    state
        .host
        .dispatch_event_filtered_and_wait(
            |plugin_id| !connected.contains(plugin_id),
            PluginEvent::SyncRequested {
                library_id: "all".to_string(),
                force_full: false,
            },
        )
        .await;

    // 2. Sync connected cloud store accounts (GOG, Xbox, Steam, Epic, etc.)
    // Each connected store performs its remote fetch, local manifest scan, and a single merged DB ingestion
    let _ = state
        .store_account_manager
        .sync_all_connected(&app_handle)
        .await;

    let _ = state.db.recompute_duplicates();

    state.db.count_games().map_err(|e| e.to_string())
}

/// Library sources the first-run wizard can import from.
const IMPORTABLE_LIBRARIES: &[&str] = &["steam", "epic", "gog", "amazon", "xbox", "switch"];

/// Keeps known library ids only, lower-cased and without duplicates, in input order.
pub(crate) fn normalize_library_ids(ids: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for id in ids {
        let id = id.trim().to_lowercase();
        if IMPORTABLE_LIBRARIES.contains(&id.as_str()) && !out.contains(&id) {
            out.push(id);
        }
    }
    out
}

/// Synchronizes only the given libraries (local scan, plus the store account when one is
/// connected). Used by the first-run wizard so unticked sources are not imported.
#[tauri::command]
pub async fn sync_selected_libraries(
    library_ids: Vec<String>,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let ids = normalize_library_ids(&library_ids);
    let connected: HashSet<String> = state
        .store_account_manager
        .get_store_accounts()
        .await
        .unwrap_or_default()
        .into_iter()
        .filter(|a| a.is_connected)
        .map(|a| a.store_id)
        .collect();

    for id in &ids {
        if connected.contains(id) {
            // Connected store: sync_store handles both remote catalog and local installations with a single merge & ingestion
            if let Err(e) = state
                .store_account_manager
                .sync_store(&app_handle, id)
                .await
            {
                tracing::warn!("Cloud sync failed for {}: {}", id, e);
            }
        } else {
            // Unconnected library: dispatch local scan to ReactivePlugin
            state
                .host
                .dispatch_event_and_wait(
                    None,
                    PluginEvent::SyncRequested {
                        library_id: id.clone(),
                        force_full: false,
                    },
                )
                .await;
        }
    }

    let _ = state.db.recompute_duplicates();
    state.db.count_games().map_err(|e| e.to_string())
}

/// File in the app data folder recording that the first-run wizard was completed or
/// skipped. Kept next to the library database (not in WebView storage) so every data
/// folder, portable ones included, has its own first-run state.
const ONBOARDING_FILE: &str = "onboarding.json";

pub(crate) fn read_onboarding_completed(app_dir: &std::path::Path) -> bool {
    std::fs::read_to_string(app_dir.join(ONBOARDING_FILE))
        .ok()
        .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
        .and_then(|v| v.get("completed").and_then(|c| c.as_bool()))
        .unwrap_or(false)
}

pub(crate) fn write_onboarding_completed(
    app_dir: &std::path::Path,
    completed: bool,
) -> std::io::Result<()> {
    std::fs::create_dir_all(app_dir)?;
    std::fs::write(
        app_dir.join(ONBOARDING_FILE),
        serde_json::json!({ "completed": completed }).to_string(),
    )
}

#[tauri::command]
pub async fn get_onboarding_completed(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(read_onboarding_completed(&state.app_dir))
}

#[tauri::command]
pub async fn set_onboarding_completed(
    completed: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    write_onboarding_completed(&state.app_dir, completed).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn library_ids_are_filtered_lowercased_and_deduplicated() {
        let ids = vec![
            "Steam".to_string(),
            " switch ".to_string(),
            "steam".to_string(),
            "amazon".to_string(),
            "unknown_store".to_string(),
            "".to_string(),
            "EPIC".to_string(),
        ];
        assert_eq!(
            normalize_library_ids(&ids),
            vec!["steam", "switch", "amazon", "epic"]
        );
        assert!(normalize_library_ids(&["all".to_string()]).is_empty());
    }

    #[test]
    fn onboarding_flag_lives_in_the_data_folder() {
        let dir = std::env::temp_dir().join(format!("omnis_onboarding_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        assert!(!read_onboarding_completed(&dir));
        write_onboarding_completed(&dir, true).unwrap();
        assert!(read_onboarding_completed(&dir));
        write_onboarding_completed(&dir, false).unwrap();
        assert!(!read_onboarding_completed(&dir));

        std::fs::write(dir.join(ONBOARDING_FILE), "not json").unwrap();
        assert!(!read_onboarding_completed(&dir));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
