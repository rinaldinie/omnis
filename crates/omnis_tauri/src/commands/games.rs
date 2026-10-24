use crate::types::{game_to_dto, AppState, GameDto};
use omnis_core::{GameLauncher, LibraryCounts};
use omnis_plugin_epic::EpicLibraryPlugin;
use omnis_sdk::{Game, LaunchConfiguration, LibraryPlugin, PluginEvent, ProcessTrackingMode};
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
    let current_session = state.active_game_manager.get_running().await;
    let killed = state.active_game_manager.kill_running().await?;
    if killed || current_session.is_some() {
        if let Some(session) = current_session {
            use tauri::Emitter;
            let _ = app_handle.emit(
                "game-stopped",
                serde_json::json!({
                    "session_id": session.session_id,
                    "game_id": session.game_id,
                    "duration_seconds": session.elapsed_seconds,
                }),
            );
        }
        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub async fn launch_game(
    game_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    if state.active_game_manager.get_running().await.is_some() {
        return Err("Un altro gioco è già in esecuzione".to_string());
    }

    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    let is_installed = game.is_installed;
    let install_dir = game.install_dir.clone();
    let title = game.title.clone();
    let started_at = chrono::Utc::now();

    if !is_installed {
        // Native store installation launch protocol
        let install_uri = match game.library_id.as_str() {
            "steam" => format!("steam://install/{}", game.external_id),
            "epic" => format!("com.epicgames.launcher://apps/{}?action=install", game.external_id),
            "gog" => format!("goggalaxy://openGameView/{}", game.external_id),
            "xbox" => format!("ms-windows-store://pdp/?ProductId={}", game.external_id),
            _ => format!("steam://install/{}", game.external_id),
        };

        let mut cmd = tokio::process::Command::new(if cfg!(windows) { "cmd.exe" } else { "xdg-open" });
        if cfg!(windows) {
            cmd.args(["/c", "start", "", &install_uri]);
        } else {
            cmd.arg(&install_uri);
        }

        let _ = cmd.spawn().map_err(|e| e.to_string())?;
        return Ok(0);
    }

    let config = if let Some(play_action) = game.play_actions.into_iter().next() {
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
                vec!["/c".to_string(), "start".to_string(), "".to_string(), play_uri]
            } else {
                vec![play_uri]
            },
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }
    };

    let session_id = Uuid::new_v4();
    let session_id_str = session_id.to_string();

    // Imposta subito la sessione attiva nello stato Launching (Requirement A6, B3)
    state
        .active_game_manager
        .set_launching(session_id, id.to_string(), title.clone())
        .await;

    // Registra inizio sessione a DB (Requirement B1)
    if is_installed {
        let _ = state.db.start_play_session(session_id, id, started_at);
    }

    // Salva lo stato della finestra e configurazione display prima del lancio (Requirement C2)
    let mut was_fullscreen = false;
    let mut prev_size = None;
    let mut prev_pos = None;
    if let Some(window) = app_handle.get_webview_window("main") {
        was_fullscreen = window.is_fullscreen().unwrap_or(false);
        prev_size = window.outer_size().ok();
        prev_pos = window.outer_position().ok();
        // Concede autorizzazione foreground in anticipo (Requirement C1)
        omnis_core::launcher::allow_set_foreground_window();
        let _ = window.minimize();
    }

    // Emette l'evento Tauri "game-started" con session_id e stato launching (Requirement B3)
    use tauri::Emitter;
    let _ = app_handle.emit(
        "game-started",
        serde_json::json!({
            "session_id": session_id_str,
            "game_id": id.to_string(),
            "title": title.clone(),
            "state": "launching",
            "started_at": started_at.to_rfc3339(),
        }),
    );

    // Spawna il monitoraggio asincrono in background
    let active_mgr = state.active_game_manager.clone();
    let db = state.db.clone();
    let app_handle_clone = app_handle.clone();
    let game_id_str = id.to_string();

    let track_task = tokio::spawn(async move {
        // Task di persistenza incrementale ogni ~60s (Requirement B1)
        let is_running = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));
        let is_running_cp = is_running.clone();
        let db_cp = db.clone();
        let active_mgr_cp = active_mgr.clone();
        let sid_cp = session_id_str.clone();

        tokio::spawn(async move {
            while is_running_cp.load(std::sync::atomic::Ordering::SeqCst) {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                if !is_running_cp.load(std::sync::atomic::Ordering::SeqCst) {
                    break;
                }
                let now = chrono::Utc::now();
                if is_installed {
                    let _ = db_cp.checkpoint_play_session(session_id, id, 60, now);
                }
                active_mgr_cp.add_elapsed(&sid_cp, 60).await;
            }
        });

        let active_mgr_for_pid = active_mgr.clone();
        let app_for_pid = app_handle_clone.clone();
        let sid_for_pid = session_id_str.clone();
        let gid_for_pid = id.to_string();

        let track_res = GameLauncher::launch_and_track(
            id,
            config,
            install_dir,
            move |pid| {
                let mgr = active_mgr_for_pid.clone();
                let app = app_for_pid.clone();
                tokio::spawn(async move {
                    mgr.set_running(&sid_for_pid, pid).await;
                    let _ = app.emit(
                        "game-status-changed",
                        serde_json::json!({
                            "session_id": sid_for_pid,
                            "game_id": gid_for_pid,
                            "state": "running",
                            "pid": pid,
                        }),
                    );

                    // Ensure Omnis window is minimized when game process starts
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.minimize();
                    }

                    // Actively bring the game's main window to the foreground
                    if pid > 0 {
                        omnis_core::launcher::bring_process_to_foreground_async(pid, 8).await;
                    }
                });
            },
        )
        .await;

        is_running.store(false, std::sync::atomic::Ordering::SeqCst);
        let ended_at = chrono::Utc::now();
        active_mgr.set_stopping(&session_id_str).await;

        let duration = match track_res {
            Ok(d) if d > 0 => d,
            Ok(_) => (ended_at - started_at).num_seconds().max(0) as u64,
            Err(err) => {
                tracing::warn!("Errore durante il tracking del processo {}: {}", game_id_str, err);
                (ended_at - started_at).num_seconds().max(0) as u64
            }
        };

        if is_installed {
            let _ = db.finish_play_session(session_id, id, duration, started_at, ended_at);
        }

        active_mgr.clear_running().await;

        // Ripristina la finestra principale al termine del gioco (Requirement C1 & C2)
        // Se la durata è 0 (es. avvio non tracciabile o errore immediato), non forziamo unminimize immediato
        if duration > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(350)).await;

            if let Some(window) = app_handle_clone.get_webview_window("main") {
                // Concede autorizzazione foreground per bypassare i blocchi di Windows (C1)
                omnis_core::launcher::allow_set_foreground_window();

                // Sequenza di ripristino robusta: unminimize -> show -> set_focus
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();

                // Gestione risoluzione e multi-monitor: se era fullscreen riapplica con breve ritardo (C2)
                if was_fullscreen {
                    tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                    let _ = window.set_fullscreen(true);
                } else {
                    if let Some(pos) = prev_pos {
                        let _ = window.set_position(tauri::Position::Physical(pos));
                    }
                    if let Some(sz) = prev_size {
                        let _ = window.set_size(tauri::Size::Physical(sz));
                    }
                }
            }
        }

        let _ = app_handle_clone.emit(
            "game-stopped",
            serde_json::json!({
                "session_id": session_id_str,
                "game_id": game_id_str,
                "duration_seconds": duration,
            }),
        );
        let _ = app_handle_clone.emit("library-updated", ());
    });

    state
        .active_game_manager
        .set_abort_handle(track_task.abort_handle())
        .await;

    Ok(0)
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
            if cfg!(windows) {
                let _ = tokio::process::Command::new("cmd.exe")
                    .args(["/c", "start", &uri])
                    .spawn();
            } else {
                let _ = tokio::process::Command::new("xdg-open")
                    .arg(&uri)
                    .spawn();
            }
        }
        "epic" => {
            let uri = format!("com.epicgames.launcher://apps/{}?action=uninstall", external_id);
            if cfg!(windows) {
                let _ = tokio::process::Command::new("cmd.exe")
                    .args(["/c", "start", &uri])
                    .spawn();
            } else {
                let _ = tokio::process::Command::new("xdg-open")
                    .arg(&uri)
                    .spawn();
            }
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
                if cfg!(windows) {
                    let _ = tokio::process::Command::new("cmd.exe")
                        .args(["/c", "start", &uri])
                        .spawn();
                } else {
                    let _ = tokio::process::Command::new("xdg-open")
                        .arg(&uri)
                        .spawn();
                }
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
            if cfg!(windows) {
                let _ = tokio::process::Command::new("cmd.exe")
                    .args(["/c", "start", &uri])
                    .spawn();
            } else {
                let _ = tokio::process::Command::new("xdg-open")
                    .arg(&uri)
                    .spawn();
            }
            Ok(())
        }
        "epic" => {
            let uri = format!("com.epicgames.launcher://apps/{}?action=verify", game.external_id);
            if cfg!(windows) {
                let _ = tokio::process::Command::new("cmd.exe")
                    .args(["/c", "start", &uri])
                    .spawn();
            } else {
                let _ = tokio::process::Command::new("xdg-open")
                    .arg(&uri)
                    .spawn();
            }
            Ok(())
        }
        "gog" => {
            let uri = format!("goggalaxy://openGameView/{}", game.external_id);
            if cfg!(windows) {
                let _ = tokio::process::Command::new("cmd.exe")
                    .args(["/c", "start", &uri])
                    .spawn();
            } else {
                let _ = tokio::process::Command::new("xdg-open")
                    .arg(&uri)
                    .spawn();
            }
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
