use crate::launcher_service::{validate_and_open_store_uri, GameLaunchCoordinator};
use crate::types::{game_to_dto, AppState, GameDto};
use omnis_core::LibraryCounts;
use omnis_plugin_epic::EpicLibraryPlugin;
use omnis_sdk::{Game, LaunchConfiguration, LibraryPlugin, PluginEvent};
use serde::Deserialize;
use std::path::PathBuf;
use tauri::{Manager, State};
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

fn get_desktop_dir() -> Option<PathBuf> {
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(userprofile).join("Desktop");
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(onedrive) = std::env::var("OneDrive") {
        let p = PathBuf::from(onedrive).join("Desktop");
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let p = PathBuf::from(home).join("Desktop");
        if p.exists() {
            return Some(p);
        }
    }
    None
}

fn sanitize_shortcut_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | '?' | '%' | '*' | ':' | '|' | '"' | '<' | '>' => '_',
            _ => c,
        })
        .collect();
    let trimmed = sanitized.trim();
    if trimmed.is_empty() {
        "Game".to_string()
    } else {
        trimmed.to_string()
    }
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

    // Determine uninstall command based on platform/library
    let library_id = game.library_id.as_str();
    let external_id = &game.external_id;

    match library_id {
        "steam" => {
            let uri = format!("steam://uninstall/{}", external_id);
            validate_and_open_store_uri(&uri)?;
        }
        "epic" => {
            let uri = format!("com.epicgames.launcher://apps/{}?action=uninstall", external_id);
            validate_and_open_store_uri(&uri)?;
        }
        "gog" => {
            let mut launched_uninstaller = false;
            if let Some(ref dir) = game.install_dir {
                let uninstaller = dir.join("unins000.exe");
                if uninstaller.exists() {
                    let _ = tokio::process::Command::new(&uninstaller).spawn();
                    launched_uninstaller = true;
                }
            }
            if !launched_uninstaller {
                let uri = format!("goggalaxy://openGameView/{}", external_id);
                validate_and_open_store_uri(&uri)?;
            }
        }
        _ => {
            let mut launched_uninstaller = false;
            if let Some(ref dir) = game.install_dir {
                for candidate in ["unins000.exe", "uninstall.exe", "Uninstall.exe"] {
                    let uninstaller = dir.join(candidate);
                    if uninstaller.exists() {
                        let _ = tokio::process::Command::new(&uninstaller).spawn();
                        launched_uninstaller = true;
                        break;
                    }
                }
                if !launched_uninstaller && dir.exists() {
                    crate::types::open_folder_in_os(dir);
                }
            }
        }
    }

    // Mark as uninstalled in DB (Approach 1: retain stats/history, set is_installed = false)
    let _ = state.db.set_game_installed(id, false);

    // Notify UI
    use tauri::Emitter;
    let _ = app_handle.emit("game-updated", id.to_string());
    let _ = app_handle.emit("library-updated", ());

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

    let desktop_dir = get_desktop_dir()
        .ok_or_else(|| "Impossibile individuare la cartella Desktop dell'utente.".to_string())?;

    let safe_title = sanitize_shortcut_name(&game.title);
    let shortcut_path = desktop_dir.join(format!("{}.url", safe_title));

    let launch_url = match game.library_id.as_str() {
        "steam" => format!("steam://rungameid/{}", game.external_id),
        "epic" => format!("com.epicgames.launcher://apps/{}?action=launch", game.external_id),
        "gog" => format!("goggalaxy://openGameView/{}", game.external_id),
        _ => {
            if let Some(action) = game.play_actions.first() {
                format!("file:///{}", action.executable.replace('\\', "/"))
            } else {
                format!("omnis://launch/{}", game.id)
            }
        }
    };

    let icon_line = if let Some(ref icon) = game.icon_image_path {
        format!("\nIconIndex=0\nIconFile={}", icon)
    } else if let Some(ref cover) = game.cover_image_path {
        format!("\nIconIndex=0\nIconFile={}", cover)
    } else if let Some(action) = game.play_actions.first() {
        format!("\nIconIndex=0\nIconFile={}", action.executable)
    } else {
        String::new()
    };

    let content = format!("[InternetShortcut]\nURL={}{}\n", launch_url, icon_line);
    std::fs::write(&shortcut_path, content).map_err(|e| e.to_string())?;

    Ok(shortcut_path.to_string_lossy().to_string())
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

    match game.library_id.as_str() {
        "steam" => {
            let uri = format!("steam://validate/{}", game.external_id);
            validate_and_open_store_uri(&uri)?;
            Ok(())
        }
        "epic" => {
            let uri = format!("com.epicgames.launcher://apps/{}?action=verify", game.external_id);
            validate_and_open_store_uri(&uri)?;
            Ok(())
        }
        "gog" => {
            let uri = format!("goggalaxy://openGameView/{}", game.external_id);
            validate_and_open_store_uri(&uri)?;
            Ok(())
        }
        _ => Err("La verifica automatica dei file è supportata solo per Steam ed Epic Games.".to_string()),
    }
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
        let _ = app_handle.emit("game-deleted", game_id);
        let _ = app_handle.emit("library-updated", ());
    }
    Ok(deleted)
}
