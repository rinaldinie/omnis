use crate::types::{game_to_dto, AppState, GameDto};
use omnis_core::{GameLauncher, LibraryCounts};
use omnis_plugin_epic::EpicLibraryPlugin;
use omnis_sdk::{Game, LaunchConfiguration, LibraryPlugin, PluginEvent, ProcessTrackingMode};
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
pub async fn launch_game(game_id: String, state: State<'_, AppState>) -> Result<u64, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    let is_installed = game.is_installed;
    let config = if !is_installed {
        // Native store installation launch protocol
        let install_uri = match game.library_id.as_str() {
            "steam" => format!("steam://install/{}", game.external_id),
            "epic" => format!("com.epicgames.launcher://apps/{}?action=install", game.external_id),
            "gog" => format!("goggalaxy://openGameView/{}", game.external_id),
            "xbox" => format!("ms-windows-store://pdp/?ProductId={}", game.external_id),
            _ => format!("steam://install/{}", game.external_id),
        };

        LaunchConfiguration {
            executable: if cfg!(windows) {
                "cmd.exe".to_string()
            } else {
                "xdg-open".to_string()
            },
            arguments: if cfg!(windows) {
                vec!["/c".to_string(), "start".to_string(), install_uri]
            } else {
                vec![install_uri]
            },
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }
    } else if let Some(play_action) = game.play_actions.into_iter().next() {
        play_action
    } else {
        // Default launch protocol for installed store games
        let play_uri = match game.library_id.as_str() {
            "steam" => format!("steam://rungameid/{}", game.external_id),
            "epic" => format!("com.epicgames.launcher://apps/{}?action=launch&silent=true", game.external_id),
            "gog" => format!("goggalaxy://openGameView/{}", game.external_id),
            "xbox" => format!("ms-windows-store://pdp/?ProductId={}", game.external_id),
            _ => format!("steam://rungameid/{}", game.external_id),
        };

        LaunchConfiguration {
            executable: if cfg!(windows) {
                "cmd.exe".to_string()
            } else {
                "xdg-open".to_string()
            },
            arguments: if cfg!(windows) {
                vec!["/c".to_string(), "start".to_string(), play_uri]
            } else {
                vec![play_uri]
            },
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }
    };

    let session_duration = GameLauncher::launch_and_track(id, config, |_| {})
        .await
        .map_err(|e| e.to_string())?;

    if is_installed {
        let _ = state.db.record_play_session(id, session_duration);
    }
    Ok(session_duration)
}
