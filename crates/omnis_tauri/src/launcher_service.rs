//! Game Launch & Lifecycle Coordination Service for Omnis Desktop
//!
//! Encapsulates pre-launch validation, store protocol synthesis, window focus & geometry
//! management, periodic play-session checkpointing, and background process tracking.

use crate::types::AppState;
use omnis_core::db::{Database, SessionRepository};
use omnis_core::GameLauncher;
use omnis_sdk::constants::events;
use omnis_sdk::{Game, LaunchConfiguration, ProcessTrackingMode};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use uuid::Uuid;

/// Saved window state prior to game launch to restore geometry and fullscreen upon exit.
#[derive(Debug, Clone, Default)]
pub struct WindowStateSnapshot {
    pub was_fullscreen: bool,
    pub prev_size: Option<tauri::PhysicalSize<u32>>,
    pub prev_pos: Option<tauri::PhysicalPosition<i32>>,
}

impl WindowStateSnapshot {
    /// Captures the current window state and minimizes it in preparation for game launch.
    pub fn capture_and_minimize(app_handle: &tauri::AppHandle) -> Self {
        let mut snapshot = Self::default();
        if let Some(window) = app_handle.get_webview_window("main") {
            snapshot.was_fullscreen = window.is_fullscreen().unwrap_or(false);
            snapshot.prev_size = window.outer_size().ok();
            snapshot.prev_pos = window.outer_position().ok();

            // Grant foreground permission in advance to bypass OS restrictions
            omnis_core::launcher::allow_set_foreground_window();
            let _ = window.minimize();
        }
        snapshot
    }

    /// Restores window geometry, focus, and fullscreen status after a game terminates.
    pub async fn restore(&self, app_handle: &tauri::AppHandle, duration_seconds: u64) {
        if duration_seconds == 0 {
            return;
        }

        tokio::time::sleep(std::time::Duration::from_millis(350)).await;

        if let Some(window) = app_handle.get_webview_window("main") {
            omnis_core::launcher::allow_set_foreground_window();

            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();

            if self.was_fullscreen {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                let _ = window.set_fullscreen(true);
            } else {
                if let Some(pos) = self.prev_pos {
                    let _ = window.set_position(tauri::Position::Physical(pos));
                }
                if let Some(sz) = self.prev_size {
                    let _ = window.set_size(tauri::Size::Physical(sz));
                }
            }
        }
    }
}

/// Service coordinator for launching, tracking, and terminating game processes.
pub struct GameLaunchCoordinator;

impl GameLaunchCoordinator {
    /// Primary orchestrator for launching a game by ID.
    pub async fn launch_game(
        app_handle: &tauri::AppHandle,
        state: &AppState,
        game_id: &str,
    ) -> Result<u64, String> {
        if state.active_game_manager.get_running().await.is_some() {
            return Err("Un altro gioco è già in esecuzione".to_string());
        }

        let id = Uuid::parse_str(game_id).map_err(|e| e.to_string())?;
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
            let install_uri = build_install_uri(&game.library_id, &game.external_id);
            validate_and_open_store_uri(&install_uri)?;
            return Ok(0);
        }

        let config = resolve_launch_configuration(&game);
        let session_id = Uuid::new_v4();
        let session_id_str = session_id.to_string();

        // Register session in memory as Launching
        state
            .active_game_manager
            .set_launching(session_id, id.to_string(), title.clone())
            .await;

        // Record start session in database
        let _ = state.db.start_play_session(session_id, id, started_at);

        // Capture window state & minimize
        let window_snapshot = WindowStateSnapshot::capture_and_minimize(app_handle);

        // Emit game-started event
        let _ = app_handle.emit(
            events::GAME_STARTED,
            serde_json::json!({
                "session_id": session_id_str,
                "game_id": id.to_string(),
                "title": title.clone(),
                "state": "launching",
                "started_at": started_at.to_rfc3339(),
            }),
        );

        // Spawn background tracking & periodic checkpointing task
        let active_mgr = state.active_game_manager.clone();
        let db = state.db.clone();
        let app_handle_clone = app_handle.clone();
        let game_id_str = id.to_string();

        let track_task = tokio::spawn(async move {
            Self::run_tracking_lifecycle(
                app_handle_clone,
                active_mgr,
                db,
                id,
                game_id_str,
                session_id,
                session_id_str,
                config,
                install_dir,
                started_at,
                is_installed,
                window_snapshot,
            )
            .await;
        });

        state
            .active_game_manager
            .set_abort_handle(track_task.abort_handle())
            .await;

        Ok(0)
    }

    /// Background monitoring loop handling 60s periodic checkpoints and process exit reconciliation.
    async fn run_tracking_lifecycle(
        app_handle: tauri::AppHandle,
        active_mgr: crate::active_game::ActiveGameManager,
        db: Arc<Database>,
        id: Uuid,
        game_id_str: String,
        session_id: Uuid,
        session_id_str: String,
        config: LaunchConfiguration,
        install_dir: Option<PathBuf>,
        started_at: chrono::DateTime<chrono::Utc>,
        is_installed: bool,
        window_snapshot: WindowStateSnapshot,
    ) {
        let is_running = Arc::new(AtomicBool::new(true));
        let is_running_cp = is_running.clone();
        let db_cp = db.clone();
        let active_mgr_cp = active_mgr.clone();
        let sid_cp = session_id_str.clone();

        // 60-second periodic checkpoint loop
        tokio::spawn(async move {
            while is_running_cp.load(Ordering::SeqCst) {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                if !is_running_cp.load(Ordering::SeqCst) {
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
        let app_for_pid = app_handle.clone();
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
                        events::GAME_STATUS_CHANGED,
                        serde_json::json!({
                            "session_id": sid_for_pid,
                            "game_id": gid_for_pid,
                            "state": "running",
                            "pid": pid,
                        }),
                    );

                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.minimize();
                    }

                    if pid > 0 {
                        omnis_core::launcher::bring_process_to_foreground_async(pid, 8).await;
                    }
                });
            },
        )
        .await;

        is_running.store(false, Ordering::SeqCst);
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

        // Restore window geometry & focus
        window_snapshot.restore(&app_handle, duration).await;

        let _ = app_handle.emit(
            events::GAME_STOPPED,
            serde_json::json!({
                "session_id": session_id_str,
                "game_id": game_id_str,
                "duration_seconds": duration,
            }),
        );
        let _ = app_handle.emit(events::LIBRARY_UPDATED, ());
    }

    /// Kill the currently active game session and restore main window.
    pub async fn kill_running_game(
        app_handle: &tauri::AppHandle,
        state: &AppState,
    ) -> Result<bool, String> {
        let current_session = state.active_game_manager.get_running().await;
        let killed = state.active_game_manager.kill_running().await?;
        if killed || current_session.is_some() {
            if let Some(session) = current_session {
                let _ = app_handle.emit(
                    events::GAME_STOPPED,
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
}

/// Constructs the installation URI for a given store platform.
pub fn build_install_uri(library_id: &str, external_id: &str) -> String {
    match library_id.to_lowercase().as_str() {
        "steam" => format!("steam://install/{}", external_id),
        "epic" => format!("com.epicgames.launcher://apps/{}?action=install", external_id),
        "gog" => format!("goggalaxy://openGameView/{}", external_id),
        "xbox" => format!("ms-windows-store://pdp/?ProductId={}", external_id),
        _ => format!("steam://install/{}", external_id),
    }
}

/// Constructs the launch URI for a given store platform.
pub fn build_play_uri(library_id: &str, external_id: &str) -> String {
    match library_id.to_lowercase().as_str() {
        "steam" => format!("steam://rungameid/{}", external_id),
        "epic" => format!("com.epicgames.launcher://apps/{}?action=launch&silent=true", external_id),
        "gog" => format!("goggalaxy://openGameView/{}", external_id),
        "xbox" => format!("ms-windows-store://pdp/?ProductId={}", external_id),
        _ => format!("steam://rungameid/{}", external_id),
    }
}

/// Resolves the launch configuration for a game, creating default store protocol launcher if none configured.
pub fn resolve_launch_configuration(game: &Game) -> LaunchConfiguration {
    if let Some(play_action) = game.play_actions.first().cloned() {
        return play_action;
    }

    let play_uri = build_play_uri(&game.library_id, &game.external_id);

    LaunchConfiguration {
        executable: if cfg!(windows) {
            "rundll32.exe".to_string()
        } else if cfg!(target_os = "macos") {
            "open".to_string()
        } else {
            "xdg-open".to_string()
        },
        arguments: if cfg!(windows) {
            vec!["url.dll,FileProtocolHandler".to_string(), play_uri]
        } else {
            vec![play_uri]
        },
        working_dir: None,
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    }
}

/// Validates that a store URI conforms to authorized scheme whitelist and contains no malicious command injection characters.
pub fn validate_and_open_store_uri(uri: &str) -> Result<(), String> {
    let allowed_schemes = [
        "steam://",
        "com.epicgames.launcher://",
        "goggalaxy://",
        "ms-windows-store://",
    ];
    if !allowed_schemes.iter().any(|scheme| uri.starts_with(scheme)) {
        return Err("Protocollo URI non autorizzato".to_string());
    }
    if uri.chars().any(|c| c.is_control() || "&|<>^%\"' \r\n\t".contains(c)) {
        return Err("URI contiene caratteri non consentiti".to_string());
    }

    #[cfg(windows)]
    {
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", uri])
            .spawn()
            .map_err(|e| format!("Impossibile aprire il protocollo: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(uri)
            .spawn()
            .map_err(|e| format!("Impossibile aprire il protocollo: {}", e))?;
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(uri)
            .spawn()
            .map_err(|e| format!("Impossibile aprire il protocollo: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_install_uri() {
        assert_eq!(build_install_uri("steam", "730"), "steam://install/730");
        assert_eq!(
            build_install_uri("epic", "Fortnite"),
            "com.epicgames.launcher://apps/Fortnite?action=install"
        );
        assert_eq!(
            build_install_uri("gog", "1207658924"),
            "goggalaxy://openGameView/1207658924"
        );
        assert_eq!(
            build_install_uri("xbox", "9NBLGGGZ5155"),
            "ms-windows-store://pdp/?ProductId=9NBLGGGZ5155"
        );
    }

    #[test]
    fn test_build_play_uri() {
        assert_eq!(build_play_uri("steam", "400"), "steam://rungameid/400");
        assert_eq!(
            build_play_uri("epic", "Sugar"),
            "com.epicgames.launcher://apps/Sugar?action=launch&silent=true"
        );
        assert_eq!(
            build_play_uri("gog", "1207658924"),
            "goggalaxy://openGameView/1207658924"
        );
        assert_eq!(
            build_play_uri("xbox", "9NBLGGGZ5155"),
            "ms-windows-store://pdp/?ProductId=9NBLGGGZ5155"
        );
    }

    #[test]
    fn test_validate_store_uri_valid() {
        let allowed = [
            "steam://rungameid/400",
            "com.epicgames.launcher://apps/Sugar?action=launch",
            "goggalaxy://openGameView/1207658924",
            "ms-windows-store://pdp/?ProductId=9NBLGGGZ5155",
        ];
        for u in allowed {
            assert!(
                u.starts_with("steam://")
                    || u.starts_with("com.epicgames")
                    || u.starts_with("goggalaxy")
                    || u.starts_with("ms-windows-store")
            );
        }
    }

    #[test]
    fn test_validate_store_uri_rejected_schemes() {
        assert!(validate_and_open_store_uri("http://evil.com").is_err());
        assert!(validate_and_open_store_uri("file:///etc/passwd").is_err());
        assert!(validate_and_open_store_uri("powershell.exe").is_err());
    }

    #[test]
    fn test_validate_store_uri_injection_chars() {
        assert!(validate_and_open_store_uri("steam://install/730&calc.exe").is_err());
        assert!(validate_and_open_store_uri("steam://install/730|calc.exe").is_err());
        assert!(validate_and_open_store_uri("steam://install/730;calc.exe").is_err());
        assert!(validate_and_open_store_uri("steam://install/730\ncalc.exe").is_err());
    }
}
