use crate::launcher_service::GameLaunchCoordinator;
use crate::types::{game_to_dto, AppState, GameDto};
use omnis_core::LibraryCounts;
use omnis_plugin_epic::EpicLibraryPlugin;
use omnis_sdk::constants::events;
use omnis_sdk::{Game, LaunchConfiguration, LibraryPlugin, PluginEvent, ProcessTrackingMode};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct AddCustomGamePayload {
    pub title: String,
    pub executable_path: String,
    pub arguments: Vec<String>,
    pub working_dir: Option<String>,
    pub cover_image_path: Option<String>,
}

#[tauri::command]
pub async fn get_games(state: State<'_, AppState>) -> Result<Vec<GameDto>, String> {
    let games = state.db.get_all_games().map_err(|e| e.to_string())?;
    let cache = &state.image_cache;
    Ok(games.into_iter().map(|g| game_to_dto(g, cache)).collect())
}

#[tauri::command]
pub async fn get_game(game_id: String, state: State<'_, AppState>) -> Result<Game, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())
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
pub async fn sync_library(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    state
        .host
        .dispatch_event(
            None,
            PluginEvent::SyncRequested {
                library_id: "all".to_string(),
                force_full: false,
            },
        )
        .await;

    // Scan Epic Games Store library
    let epic_plugin = EpicLibraryPlugin::new();
    match epic_plugin.scan().await {
        Ok(epic_games) => {
            if !epic_games.is_empty() {
                let _ = state.db.ingest_discovered_batch(&epic_games);
            }
        }
        Err(err) => {
            tracing::warn!("Failed scanning Epic Games Store: {}", err);
        }
    }

    // Sync connected cloud store accounts (GOG, Xbox, etc.)
    let _ = state.store_account_manager.sync_all_connected(&app_handle).await;

    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    state.db.count_games().map_err(|e| e.to_string())
}

/// Result of a per-store installation detection check, used by the onboarding wizard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreDetectionResult {
    pub id: String,
    pub name: String,
    pub detected: bool,
    pub requires_login: bool,
    pub icon: String,
}

/// Detect which game stores are installed on the system without performing any import.
/// Used by the first-launch onboarding wizard to pre-populate the store selection list.
#[tauri::command]
pub async fn detect_stores() -> Vec<StoreDetectionResult> {
    let mut results = Vec::new();

    // Steam: detect via VDF library folders scan
    let steam_detected = omnis_plugin_steam::vdf_parser::detect_steam_installation().is_some();
    results.push(StoreDetectionResult {
        id: "steam".to_string(),
        name: "Steam".to_string(),
        detected: steam_detected,
        requires_login: false,
        icon: "steam".to_string(),
    });

    // Epic Games Store: detect via default manifests directory
    let epic_plugin = EpicLibraryPlugin::new();
    let epic_detected = epic_plugin.detect_manifests_dir().exists();
    results.push(StoreDetectionResult {
        id: "epic".to_string(),
        name: "Epic Games Store".to_string(),
        detected: epic_detected,
        requires_login: false,
        icon: "epic".to_string(),
    });

    // GOG Galaxy: detect via standard installation paths on Windows
    #[cfg(target_os = "windows")]
    let gog_detected = [
        std::path::Path::new("C:\\ProgramData\\GOG.com\\Galaxy\\storage"),
        std::path::Path::new("C:\\Program Files (x86)\\GOG Galaxy"),
    ]
    .iter()
    .any(|p| p.exists());
    #[cfg(not(target_os = "windows"))]
    let gog_detected = false;

    results.push(StoreDetectionResult {
        id: "gog".to_string(),
        name: "GOG Galaxy".to_string(),
        detected: gog_detected,
        requires_login: true,
        icon: "gog".to_string(),
    });

    // Xbox Game Pass: detect via UWP app package directory
    #[cfg(target_os = "windows")]
    let xbox_detected = std::env::var("LOCALAPPDATA")
        .map(|local| {
            let packages = std::path::Path::new(&local).join("Packages");
            packages.join("Microsoft.GamingApp_8wekyb3d8bbwe").exists()
                || packages.join("Microsoft.XboxApp_8wekyb3d8bbwe").exists()
        })
        .unwrap_or(false);
    #[cfg(not(target_os = "windows"))]
    let xbox_detected = false;

    results.push(StoreDetectionResult {
        id: "xbox".to_string(),
        name: "Xbox Game Pass".to_string(),
        detected: xbox_detected,
        requires_login: true,
        icon: "xbox".to_string(),
    });

    results
}

#[tauri::command]
pub async fn add_custom_game(
    payload: AddCustomGamePayload,
    state: State<'_, AppState>,
) -> Result<Game, String> {
    let id = Uuid::new_v4();
    let sorting_title = payload.title.to_lowercase();
    let exe_path = PathBuf::from(&payload.executable_path);

    let launch_config = LaunchConfiguration {
        executable: payload.executable_path.clone(),
        arguments: payload.arguments,
        working_dir: payload
            .working_dir
            .map(PathBuf::from)
            .or_else(|| exe_path.parent().map(|p| p.to_path_buf())),
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    };

    let install_dir = exe_path.parent().map(|p| p.to_path_buf());

    state
        .db
        .insert_custom_game(
            id,
            &payload.title,
            &sorting_title,
            install_dir,
            vec![launch_config],
            payload.cover_image_path,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_game_metadata(
    game_update: omnis_sdk::GameUpdateDto,
    state: State<'_, AppState>,
) -> Result<Game, String> {
    let updated = state.db.update_game(&game_update).map_err(|e| e.to_string())?;
    if let Some(ref p) = updated.cover_image_path {
        state.image_cache.invalidate(p);
    }
    if let Some(ref p) = updated.background_image_path {
        state.image_cache.invalidate(p);
    }
    Ok(updated)
}

#[tauri::command]
pub async fn update_game_completion_status(
    game_id: String,
    status: String,
    state: State<'_, AppState>,
) -> Result<Game, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| format!("Invalid UUID: {}", e))?;
    state
        .db
        .set_game_completion_status(id, &status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_running_game(
    state: State<'_, AppState>,
) -> Result<Option<crate::active_game::ActiveGameSession>, String> {
    Ok(state.active_game_manager.get_running().await)
}

#[tauri::command]
pub async fn kill_running_game(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    GameLaunchCoordinator::kill_running_game(&app_handle, &state).await
}

#[tauri::command]
pub async fn launch_game(
    game_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    GameLaunchCoordinator::launch_game(&app_handle, &state, &game_id).await
}

#[tauri::command]
pub async fn open_game_install_dir(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    let target_dir = if let Some(ref dir) = game.install_dir {
        Some(dir.clone())
    } else if let Some(first_action) = game.play_actions.first() {
        let p = PathBuf::from(&first_action.executable);
        p.parent().map(|parent| parent.to_path_buf())
    } else {
        None
    };

    if let Some(dir) = target_dir {
        if dir.exists() {
            crate::types::open_folder_in_os(&dir);
            return Ok(());
        }
    }

    Err("Cartella di installazione non trovata o non configurata per questo gioco.".to_string())
}

#[tauri::command]
pub async fn uninstall_game(
    game_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    crate::store_actions::StorePlatformDispatcher::trigger_uninstall(&game)?;

    // Mark as uninstalled in DB (Approach 1: retain stats/history, set is_installed = false)
    let _ = state.db.set_game_installed(id, false);

    // Notify UI
    use tauri::Emitter;
    let _ = app_handle.emit(events::GAME_UPDATED, id.to_string());
    let _ = app_handle.emit(events::LIBRARY_UPDATED, ());

    Ok(())
}

#[tauri::command]
pub async fn create_desktop_shortcut(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    let desktop_dir = crate::store_actions::get_desktop_dir()
        .ok_or_else(|| "Impossibile individuare la cartella Desktop dell'utente.".to_string())?;

    let path = crate::store_actions::StorePlatformDispatcher::create_desktop_shortcut(&game, &desktop_dir)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn verify_game_files(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    crate::store_actions::StorePlatformDispatcher::trigger_verify(&game.library_id, &game.external_id)
}

#[tauri::command]
pub async fn remove_game_from_library(
    game_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let deleted = state.db.delete_game(id).map_err(|e| e.to_string())?;
    if deleted {
        use tauri::Emitter;
        let _ = app_handle.emit(events::GAME_DELETED, game_id);
        let _ = app_handle.emit(events::LIBRARY_UPDATED, ());
    }
    Ok(deleted)
}
