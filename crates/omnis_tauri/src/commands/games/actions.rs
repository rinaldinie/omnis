use crate::services::GameLaunchCoordinator;
use crate::types::{game_to_dto, AppState, GameDto};
use omnis_sdk::constants::events;
use omnis_sdk::{LaunchConfiguration, ProcessTrackingMode};
use serde::Deserialize;
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
pub async fn add_custom_game(
    mut payload: AddCustomGamePayload,
    state: State<'_, AppState>,
) -> Result<GameDto, String> {
    let raw_path = payload.executable_path.trim().to_string();
    if raw_path.to_lowercase().ends_with(".lnk") {
        let path_clone = raw_path.clone();
        if let Ok(Ok(resolved)) = tokio::task::spawn_blocking(move || {
            omnis_core::os::resolve_executable_path_sync(&path_clone)
        })
        .await
        {
            payload.executable_path = resolved.executable_path;
            if payload.arguments.is_empty() && !resolved.arguments.is_empty() {
                payload.arguments = resolved.arguments;
            }
            if payload.working_dir.is_none() && resolved.working_dir.is_some() {
                payload.working_dir = resolved.working_dir;
            }
        }
    }

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

    let game = state
        .db
        .insert_custom_game(
            id,
            &payload.title,
            &sorting_title,
            install_dir,
            vec![launch_config],
            payload.cover_image_path,
        )
        .map_err(|e| e.to_string())?;
    state.media_scope.allow_game_media(&game);
    Ok(game_to_dto(game))
}

#[tauri::command]
pub async fn get_running_game(
    state: State<'_, AppState>,
) -> Result<Option<crate::services::ActiveGameSession>, String> {
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
    } else if let Some(first_action) = if !game.use_library_integration {
        game.play_actions.first()
    } else {
        game.library_play_action
            .as_ref()
            .or_else(|| game.play_actions.first())
    } {
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

    crate::store::StorePlatformDispatcher::trigger_uninstall(&game)?;

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

    let desktop_dir = crate::store::get_desktop_dir()
        .ok_or_else(|| "Impossibile individuare la cartella Desktop dell'utente.".to_string())?;

    let path = crate::store::StorePlatformDispatcher::create_desktop_shortcut(&game, &desktop_dir)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn verify_game_files(game_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    crate::store::StorePlatformDispatcher::trigger_verify(&game.library_id, &game.external_id)
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

#[tauri::command]
pub async fn allow_media_file(path: String, state: State<'_, AppState>) -> Result<bool, String> {
    state.media_scope.allow_media_file(&path);
    Ok(true)
}
