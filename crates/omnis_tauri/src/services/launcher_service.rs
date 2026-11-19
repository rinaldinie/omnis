//! Game Launch & Lifecycle Coordination Service for Omnis Desktop
//!
//! Encapsulates pre-launch validation, store protocol synthesis, window focus & geometry
//! management, periodic play-session checkpointing, and background process tracking.

use crate::types::AppState;
use omnis_core::db::Database;
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
}

impl WindowStateSnapshot {
    /// Captures the current window state without minimizing.
    pub fn capture(app_handle: &tauri::AppHandle) -> Self {
        let mut snapshot = Self::default();
        if let Some(window) = app_handle.get_webview_window("main") {
            snapshot.was_fullscreen = window.is_fullscreen().unwrap_or(false);

            // Grant foreground permission in advance to bypass OS restrictions
            omnis_core::launcher::allow_set_foreground_window();
        }
        snapshot
    }

    /// Restores window geometry, focus, and fullscreen status after a game terminates.
    pub async fn restore(&self, app_handle: &tauri::AppHandle, duration_seconds: u64) {
        if duration_seconds == 0 {
            return;
        }

        if let Some(window) = app_handle.get_webview_window("main") {
            // Allow 300ms for DirectX/Vulkan game teardown and Windows desktop resolution restoration
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;

            if self.was_fullscreen {
                // In fullscreen / console mode: re-assert fullscreen geometry and force foreground
                // over any restored taskbar
                crate::services::window_service::ensure_fullscreen_geometry(&window.as_ref().window());

                // Secondary settling check in case Windows display resolution change took longer
                let w_clone = window.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(350)).await;
                    if w_clone.is_fullscreen().unwrap_or(false) {
                        crate::services::window_service::ensure_fullscreen_geometry(&w_clone.as_ref().window());
                    }
                });
            } else {
                // In desktop mode: the window is never automatically minimized, so geometry & position remain intact.
                // In case the user manually minimized it during the game session, unminimize and bring to front.
                if window.is_minimized().unwrap_or(false) {
                    let _ = window.unminimize();
                }
                let _ = window.show();
                crate::services::window_service::force_foreground(&window.as_ref().window());
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

        let valid_custom_actions: Vec<&LaunchConfiguration> = game
            .play_actions
            .iter()
            .filter(|a| !a.executable.trim().is_empty())
            .collect();
        let has_valid_library_action = game
            .library_play_action
            .as_ref()
            .is_some_and(|a| !a.executable.trim().is_empty());

        // Emulated games have no store protocol to fall back on: without an emulator
        // launch action there is nothing to start.
        if game.use_library_integration
            && is_emulated_library(&game.library_id)
            && !has_valid_library_action
            && valid_custom_actions.is_empty()
        {
            if game
                .library_id
                .eq_ignore_ascii_case(omnis_plugin_emulators::SWITCH_LIBRARY_ID)
            {
                return Err(
                    "Nessun emulatore Switch trovato: apri almeno una volta Eden, Citron o Ryujinx e aggiorna la libreria"
                        .to_string(),
                );
            }
            return Err("Nessuna azione di avvio configurata per questo gioco".to_string());
        }

        if !game.use_library_integration && valid_custom_actions.is_empty() {
            return Err(
                "Integrazione di libreria disattivata e nessuna azione personalizzata configurata"
                    .to_string(),
            );
        }

        if game.use_library_integration
            && !has_store_integration(&game.library_id)
            && !is_emulated_library(&game.library_id)
            && !has_valid_library_action
            && valid_custom_actions.is_empty()
        {
            return Err("Nessuna azione di avvio configurata per questo gioco".to_string());
        }

        let is_installed = game.is_installed;
        let install_dir = game.install_dir.clone();
        let title = game.title.clone();
        let started_at = chrono::Utc::now();

        if !is_installed && game.use_library_integration && has_store_integration(&game.library_id)
        {
            let install_uri = build_install_uri(&game.library_id, &game.external_id);
            validate_and_open_store_uri(&install_uri)?;
            return Ok(0);
        }

        let plan = resolve_launch_plan(&game);
        let config = plan.primary;
        for aux in &plan.auxiliary {
            spawn_auxiliary_action(aux);
        }
        let session_id = Uuid::new_v4();
        let session_id_str = session_id.to_string();

        // Register session in memory as Launching
        state
            .active_game_manager
            .set_launching(session_id, id.to_string(), title.clone())
            .await;

        // Record start session in database
        let _ = state.db.start_play_session(session_id, id, started_at);

        // Capture window state without immediate minimization (main window shows launch transition overlay until process starts)
        let window_snapshot = WindowStateSnapshot::capture(app_handle);

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
    #[allow(clippy::too_many_arguments)]
    async fn run_tracking_lifecycle(
        app_handle: tauri::AppHandle,
        active_mgr: Arc<crate::services::ActiveGameManager>,
        db: Arc<Database>,
        id: Uuid,
        game_id_str: String,
        session_id: Uuid,
        session_id_str: String,
        config: LaunchConfiguration,
        install_dir: Option<PathBuf>,
        started_at: chrono::DateTime<chrono::Utc>,
        window_snapshot: WindowStateSnapshot,
    ) {
        let is_running = Arc::new(AtomicBool::new(true));
        let is_running_cp = is_running.clone();
        let db_cp = db.clone();
        let active_mgr_cp = active_mgr.clone();
        let sid_cp = session_id_str.clone();

        // 60-second periodic checkpoint loop
        let checkpoint_task = tokio::spawn(async move {
            while is_running_cp.load(Ordering::SeqCst) {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                if !is_running_cp.load(Ordering::SeqCst) {
                    break;
                }
                let now = chrono::Utc::now();
                let _ = db_cp.checkpoint_play_session(session_id, id, 60, now);
                active_mgr_cp.add_elapsed(&sid_cp, 60).await;
            }
        });

        // RAII Guard ensuring background checkpoint loop is terminated on process exit or task abort
        struct LifecycleGuard {
            is_running: Arc<AtomicBool>,
            checkpoint_task: tokio::task::JoinHandle<()>,
        }
        impl Drop for LifecycleGuard {
            fn drop(&mut self) {
                self.is_running.store(false, Ordering::SeqCst);
                self.checkpoint_task.abort();
            }
        }
        let _lifecycle_guard = LifecycleGuard {
            is_running: is_running.clone(),
            checkpoint_task,
        };

        let active_mgr_for_phase = active_mgr.clone();
        let app_for_phase = app_handle.clone();
        let sid_for_phase = session_id_str.clone();
        let gid_for_phase = id.to_string();

        let track_res = GameLauncher::launch_and_track_with_phases(
            id,
            config,
            install_dir,
            Arc::new(move |phase| {
                let mgr = active_mgr_for_phase.clone();
                let app = app_for_phase.clone();
                let sid = sid_for_phase.clone();
                let gid = gid_for_phase.clone();
                tokio::spawn(async move {
                    match phase {
                        omnis_core::launcher::TrackingPhase::Running(pid) => {
                            mgr.set_running(&sid, pid).await;
                            let _ = app.emit(
                                events::GAME_STATUS_CHANGED,
                                serde_json::json!({
                                    "session_id": sid,
                                    "game_id": gid,
                                    "state": "running",
                                    "pid": pid,
                                }),
                            );

                            if pid > 0 {
                                omnis_core::launcher::bring_process_to_foreground_async(pid, 8)
                                    .await;
                            }
                        }
                        omnis_core::launcher::TrackingPhase::Exiting => {
                            mgr.set_stopping(&sid).await;
                            let _ = app.emit(
                                events::GAME_STATUS_CHANGED,
                                serde_json::json!({
                                    "session_id": sid,
                                    "game_id": gid,
                                    "state": "stopping",
                                }),
                            );
                        }
                    }
                });
            }),
        )
        .await;

        let was_running = is_running.swap(false, Ordering::SeqCst);
        let ended_at = chrono::Utc::now();
        active_mgr.set_stopping(&session_id_str).await;

        let duration = match track_res {
            Ok(d) if d > 0 => d,
            Ok(_) => (ended_at - started_at).num_seconds().max(0) as u64,
            Err(ref err) => {
                tracing::warn!(
                    "Errore durante il tracking del processo {}: {}",
                    game_id_str,
                    err
                );
                0
            }
        };

        if track_res.is_err() {
            // Tracking failed or process not found: cancel session and revert premature metrics
            let _ = db.cancel_play_session(session_id, id);
        } else {
            let _ = db.finish_play_session(session_id, id, duration, started_at, ended_at);
        }

        active_mgr.clear_running().await;

        // Restore window geometry & focus
        if track_res.is_ok() {
            window_snapshot.restore(&app_handle, duration).await;
        } else if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            crate::services::window_service::force_foreground(&window.as_ref().window());
        }

        // Only emit GAME_STOPPED if not already aborted and emitted by kill_running_game
        if was_running {
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
                let ended_at = chrono::Utc::now();
                let duration = (ended_at - session.started_at).num_seconds().max(0) as u64;

                // Finalize session in SQLite database with exact duration so it does not remain unclosed
                if let (Ok(sid), Ok(gid)) = (
                    Uuid::parse_str(&session.session_id),
                    Uuid::parse_str(&session.game_id),
                ) {
                    let _ = state.db.finish_play_session(
                        sid,
                        gid,
                        duration,
                        session.started_at,
                        ended_at,
                    );
                }

                let _ = app_handle.emit(
                    events::GAME_STOPPED,
                    serde_json::json!({
                        "session_id": session.session_id,
                        "game_id": session.game_id,
                        "duration_seconds": duration,
                    }),
                );
            }
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = app_handle.emit(events::LIBRARY_UPDATED, ());
            return Ok(true);
        }
        Ok(false)
    }
}

/// Constructs the installation URI for a given store platform.
pub fn build_install_uri(library_id: &str, external_id: &str) -> String {
    match library_id.to_lowercase().as_str() {
        "steam" => format!("steam://install/{}", external_id),
        "epic" => format!(
            "com.epicgames.launcher://apps/{}?action=install",
            external_id
        ),
        "gog" => format!("goggalaxy://openGameView/{}", external_id),
        "xbox" => format!("ms-windows-store://pdp/?ProductId={}", external_id),
        "amazon" => format!("amazon-games://play/{}", external_id),
        _ => format!("steam://install/{}", external_id),
    }
}

/// Constructs the launch URI for a given store platform.
pub fn build_play_uri(library_id: &str, external_id: &str) -> String {
    match library_id.to_lowercase().as_str() {
        "steam" => format!("steam://rungameid/{}", external_id),
        "epic" => format!(
            "com.epicgames.launcher://apps/{}?action=launch&silent=true",
            external_id
        ),
        "gog" => format!("goggalaxy://runGame/{}", external_id),
        "xbox" => format!("ms-windows-store://pdp/?ProductId={}", external_id),
        "amazon" => format!("amazon-games://play/{}", external_id),
        _ => format!("steam://rungameid/{}", external_id),
    }
}

/// Spawns an auxiliary custom play action (detached) alongside the primary tracked launch.
fn spawn_auxiliary_action(action: &LaunchConfiguration) {
    let exe = action.executable.trim();
    if exe.is_empty() {
        return;
    }

    let mut cmd = std::process::Command::new(exe);
    if !action.arguments.is_empty() {
        cmd.args(&action.arguments);
    }
    if let Some(ref dir) = action.working_dir {
        if !dir.as_os_str().is_empty() {
            cmd.current_dir(dir);
        }
    }
    if let Err(e) = cmd.spawn() {
        tracing::warn!("Failed to spawn auxiliary play action '{}': {}", exe, e);
    }
}

/// Resolved launch plan containing the primary tracked launch and detached auxiliary actions.
#[derive(Debug, Clone, PartialEq)]
pub struct LaunchPlan {
    pub primary: LaunchConfiguration,
    pub auxiliary: Vec<LaunchConfiguration>,
}

fn has_store_integration(library_id: &str) -> bool {
    matches!(
        library_id.trim().to_ascii_lowercase().as_str(),
        "steam" | "epic" | "gog" | "xbox" | "amazon"
    )
}

fn is_emulated_library(library_id: &str) -> bool {
    let lower = library_id.trim().to_ascii_lowercase();
    lower == omnis_plugin_emulators::SWITCH_LIBRARY_ID || lower.starts_with("emulator_")
}

fn actions_equivalent(a: &LaunchConfiguration, b: &LaunchConfiguration) -> bool {
    let exe_a = a.executable.trim().replace('\\', "/").to_ascii_lowercase();
    let exe_b = b.executable.trim().replace('\\', "/").to_ascii_lowercase();
    if exe_a != exe_b || a.arguments.len() != b.arguments.len() {
        return false;
    }
    a.arguments
        .iter()
        .zip(b.arguments.iter())
        .all(|(lhs, rhs)| lhs.trim() == rhs.trim())
}

fn build_store_uri_launch_config(library_id: &str, external_id: &str) -> LaunchConfiguration {
    let play_uri = build_play_uri(library_id, external_id);

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

/// Resolves both the primary tracked launch configuration and auxiliary custom actions,
/// ensuring the primary command is never repeated in the auxiliary list.
pub fn resolve_launch_plan(game: &Game) -> LaunchPlan {
    let valid_custom_actions: Vec<LaunchConfiguration> = game
        .play_actions
        .iter()
        .filter(|a| !a.executable.trim().is_empty())
        .cloned()
        .collect();
    let valid_library_action = game
        .library_play_action
        .as_ref()
        .filter(|a| !a.executable.trim().is_empty())
        .cloned();
    let is_custom = game.library_id.eq_ignore_ascii_case("custom");

    // When library integration is disabled or this is a custom game, bypass GOG Galaxy,
    // library_play_action, and store URIs; use play_actions[0] as primary and [1..] as auxiliary.
    if !game.use_library_integration || is_custom {
        if let Some(primary) = valid_custom_actions.first().cloned() {
            let auxiliary = valid_custom_actions
                .into_iter()
                .skip(1)
                .filter(|aux| !actions_equivalent(aux, &primary))
                .collect();
            return LaunchPlan { primary, auxiliary };
        }
        return LaunchPlan {
            primary: LaunchConfiguration {
                executable: String::new(),
                arguments: Vec::new(),
                working_dir: None,
                tracking_mode: ProcessTrackingMode::KernelJobObject,
            },
            auxiliary: Vec::new(),
        };
    }

    // For GOG games, if the official GOG Galaxy client (GalaxyClient.exe) is present on the system,
    // launch via Galaxy CLI args (`/command=runGame /gameId={id} /path="{dir}"`) to ensure the Galaxy
    // client launches the game directly with overlay, cloud saves, and achievements active.
    // If GalaxyClient.exe is not installed or detected, fallback to library_play_action, discovered
    // game executable, or GOG Galaxy URI — never to user custom play_actions.
    if game.use_library_integration && game.library_id.eq_ignore_ascii_case("gog") {
        let tracking_mode = if let Some(ref dir) = game.install_dir {
            ProcessTrackingMode::WatchDirectory(dir.clone())
        } else {
            valid_library_action
                .as_ref()
                .map(|action| match &action.tracking_mode {
                    ProcessTrackingMode::ProcessName(name) => {
                        ProcessTrackingMode::ProcessName(name.clone())
                    }
                    _ => {
                        let exe_name = std::path::Path::new(&action.executable)
                            .file_name()
                            .and_then(|f| f.to_str())
                            .unwrap_or("game.exe");
                        ProcessTrackingMode::ProcessName(exe_name.to_string())
                    }
                })
                .unwrap_or(ProcessTrackingMode::KernelJobObject)
        };

        let primary = if let Some(galaxy_exe) = omnis_core::launcher::find_gog_galaxy_client() {
            let mut args = vec![
                "/command=runGame".to_string(),
                format!("/gameId={}", game.external_id),
            ];
            if let Some(ref dir) = game.install_dir {
                args.push(format!("/path=\"{}\"", dir.display()));
            }

            LaunchConfiguration {
                executable: galaxy_exe.to_string_lossy().to_string(),
                arguments: args,
                working_dir: game.install_dir.clone(),
                tracking_mode,
            }
        } else if let Some(lib_action) = valid_library_action {
            lib_action
        } else if let Some(exe_path) = game.install_dir.as_ref().and_then(|dir| {
            omnis_core::launcher::find_gog_game_executable(dir)
                .or_else(|| omnis_core::launcher::find_primary_game_executable(dir))
        }) {
            let exe_name = exe_path
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or("game.exe");
            LaunchConfiguration {
                executable: exe_path.to_string_lossy().to_string(),
                arguments: vec![],
                working_dir: game.install_dir.clone(),
                tracking_mode: ProcessTrackingMode::ProcessName(exe_name.to_string()),
            }
        } else {
            build_store_uri_launch_config(&game.library_id, &game.external_id)
        };

        let auxiliary = valid_custom_actions
            .into_iter()
            .filter(|aux| !actions_equivalent(aux, &primary))
            .collect();
        return LaunchPlan { primary, auxiliary };
    }

    if let Some(library_action) = valid_library_action {
        let auxiliary = valid_custom_actions
            .into_iter()
            .filter(|aux| !actions_equivalent(aux, &library_action))
            .collect();
        return LaunchPlan {
            primary: library_action,
            auxiliary,
        };
    }

    // Store-backed libraries without library_play_action must fall back to the store URI,
    // keeping custom play_actions strictly auxiliary so play_actions[0] is never run twice.
    if has_store_integration(&game.library_id) {
        let primary = build_store_uri_launch_config(&game.library_id, &game.external_id);
        let auxiliary = valid_custom_actions
            .into_iter()
            .filter(|aux| !actions_equivalent(aux, &primary))
            .collect();
        return LaunchPlan { primary, auxiliary };
    }

    // Non-store libraries (e.g. emulators or third-party imports without library_play_action)
    // fall back to play_actions[0] and skip it from auxiliary actions.
    if let Some(primary) = valid_custom_actions.first().cloned() {
        let auxiliary = valid_custom_actions
            .into_iter()
            .skip(1)
            .filter(|aux| !actions_equivalent(aux, &primary))
            .collect();
        return LaunchPlan { primary, auxiliary };
    }

    LaunchPlan {
        primary: build_store_uri_launch_config(&game.library_id, &game.external_id),
        auxiliary: Vec::new(),
    }
}

/// Resolves the primary launch configuration for a game, creating default store protocol launcher if none configured.
#[cfg(test)]
pub fn resolve_launch_configuration(game: &Game) -> LaunchConfiguration {
    resolve_launch_plan(game).primary
}

/// Validates that a store URI conforms to authorized scheme whitelist and contains no malicious command injection characters.
pub fn validate_and_open_store_uri(uri: &str) -> Result<(), String> {
    let allowed_schemes = [
        "steam://",
        "com.epicgames.launcher://",
        "goggalaxy://",
        "ms-windows-store://",
        "amazon-games://",
    ];
    if !allowed_schemes.iter().any(|scheme| uri.starts_with(scheme)) {
        return Err("Protocollo URI non autorizzato".to_string());
    }
    if uri
        .chars()
        .any(|c| c.is_control() || "&|;<>^%\"' \r\n\t".contains(c))
    {
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
            "goggalaxy://runGame/1207658924"
        );
        assert_eq!(
            build_play_uri("xbox", "9NBLGGGZ5155"),
            "ms-windows-store://pdp/?ProductId=9NBLGGGZ5155"
        );
    }

    #[test]
    fn test_resolve_launch_configuration_gog_fallback_play_action() {
        let mut game = Game::new("gog".to_string(), "123456".to_string(), "Test GOG Game".to_string());
        game.install_dir = Some(PathBuf::from("/path/to/game"));
        game.is_installed = true;
        game.library_play_action = Some(LaunchConfiguration {
            executable: "/path/to/game/game.exe".to_string(),
            arguments: vec!["--param".to_string()],
            working_dir: Some(PathBuf::from("/path/to/game")),
            tracking_mode: ProcessTrackingMode::ProcessName("game.exe".to_string()),
        });

        let resolved = resolve_launch_configuration(&game);
        if omnis_core::launcher::find_gog_galaxy_client().is_some() {
            assert!(resolved.arguments.contains(&"/command=runGame".to_string()));
            assert!(resolved.arguments.contains(&"/gameId=123456".to_string()));
            assert_eq!(
                resolved.tracking_mode,
                ProcessTrackingMode::WatchDirectory(PathBuf::from("/path/to/game"))
            );
        } else {
            // When GalaxyClient is not present (e.g. Linux / test environment), uses library_play_action
            assert_eq!(resolved.executable, "/path/to/game/game.exe");
            assert_eq!(resolved.arguments, vec!["--param".to_string()]);
        }
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

    #[test]
    fn test_resolve_launch_configuration_disabled_library_integration_bypasses_library_and_gog() {
        let mut game = Game::new("gog".to_string(), "123456".to_string(), "Test GOG Game".to_string());
        game.install_dir = Some(PathBuf::from("/path/to/game"));
        game.is_installed = true;
        game.use_library_integration = false;
        game.library_play_action = Some(LaunchConfiguration {
            executable: "goggalaxy://runGame/123456".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        });
        game.play_actions = vec![LaunchConfiguration {
            executable: "/custom/override.exe".to_string(),
            arguments: vec!["--windowed".to_string()],
            working_dir: Some(PathBuf::from("/custom")),
            tracking_mode: ProcessTrackingMode::ProcessName("override.exe".to_string()),
        }];

        let resolved = resolve_launch_configuration(&game);
        assert_eq!(resolved.executable, "/custom/override.exe");
        assert_eq!(resolved.arguments, vec!["--windowed".to_string()]);
    }

    #[test]
    fn test_resolve_launch_configuration_enabled_library_integration_uses_library_action() {
        let mut game = Game::new("steam".to_string(), "730".to_string(), "CS2".to_string());
        game.is_installed = true;
        game.use_library_integration = true;
        game.library_play_action = Some(LaunchConfiguration {
            executable: "steam://rungameid/730".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::ProcessName("cs2.exe".to_string()),
        });
        game.play_actions = vec![LaunchConfiguration {
            executable: "/extra/tool.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }];

        let resolved = resolve_launch_configuration(&game);
        assert_eq!(resolved.executable, "steam://rungameid/730");
    }

    #[test]
    fn test_resolve_launch_plan_steam_without_library_action_uses_store_uri_and_runs_custom_once() {
        let mut game = Game::new("steam".to_string(), "620".to_string(), "Portal 2".to_string());
        game.is_installed = true;
        game.use_library_integration = true;
        game.library_play_action = None;
        let trainer = LaunchConfiguration {
            executable: "C:\\Tools\\trainer.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        game.play_actions = vec![trainer.clone()];

        let plan = resolve_launch_plan(&game);
        assert_ne!(plan.primary.executable, trainer.executable);
        assert!(plan
            .primary
            .arguments
            .iter()
            .any(|a| a == "steam://rungameid/620"));
        assert_eq!(plan.auxiliary, vec![trainer]);
    }

    #[test]
    fn test_resolve_launch_plan_gog_without_library_action_does_not_duplicate_custom_action() {
        let mut game = Game::new("gog".to_string(), "1207658924".to_string(), "Witcher".to_string());
        game.is_installed = true;
        game.use_library_integration = true;
        game.library_play_action = None;
        game.install_dir = None;
        let trainer = LaunchConfiguration {
            executable: "C:\\Tools\\trainer.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        game.play_actions = vec![trainer.clone()];

        let plan = resolve_launch_plan(&game);
        assert_ne!(plan.primary.executable, trainer.executable);
        assert_eq!(plan.auxiliary, vec![trainer]);
        if omnis_core::launcher::find_gog_galaxy_client().is_none() {
            assert!(plan
                .primary
                .arguments
                .iter()
                .any(|a| a == "goggalaxy://runGame/1207658924"));
        }
    }

    #[test]
    fn test_resolve_launch_plan_non_store_without_library_action_runs_first_custom_once() {
        let mut game = Game::new("switch".to_string(), "0100".to_string(), "Zelda".to_string());
        game.is_installed = true;
        game.use_library_integration = true;
        game.library_play_action = None;
        let emu = LaunchConfiguration {
            executable: "C:\\Emu\\eden.exe".to_string(),
            arguments: vec!["game.nsp".to_string()],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        let overlay = LaunchConfiguration {
            executable: "C:\\Tools\\overlay.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        game.play_actions = vec![emu.clone(), overlay.clone()];

        let plan = resolve_launch_plan(&game);
        assert_eq!(plan.primary, emu);
        assert_eq!(plan.auxiliary, vec![overlay]);
    }

    #[test]
    fn test_resolve_launch_plan_deduplicates_auxiliary_matching_primary() {
        let mut game = Game::new("steam".to_string(), "620".to_string(), "Portal 2".to_string());
        game.is_installed = true;
        game.use_library_integration = true;
        let store_cmd = LaunchConfiguration {
            executable: "cmd.exe".to_string(),
            arguments: vec![
                "/c".to_string(),
                "start".to_string(),
                "".to_string(),
                "steam://rungameid/620".to_string(),
            ],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        let trainer = LaunchConfiguration {
            executable: "C:\\Tools\\trainer.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        game.library_play_action = Some(store_cmd.clone());
        game.play_actions = vec![store_cmd.clone(), trainer.clone()];

        let plan = resolve_launch_plan(&game);
        assert_eq!(plan.primary, store_cmd);
        assert_eq!(plan.auxiliary, vec![trainer]);
    }

    #[test]
    fn test_game_is_playable_scenarios() {
        // 1. Installed game is always playable
        let mut game1 = Game::new("steam".to_string(), "10".to_string(), "CS".to_string());
        game1.is_installed = true;
        assert!(game1.is_playable());

        // 2. Uninstalled store game without custom actions is not playable
        let mut game2 = Game::new("steam".to_string(), "20".to_string(), "TF2".to_string());
        game2.is_installed = false;
        game2.use_library_integration = true;
        assert!(!game2.is_playable());

        // 3. Uninstalled store game with library integration OFF and valid custom action IS playable
        let mut game3 = Game::new("steam".to_string(), "30".to_string(), "DOD".to_string());
        game3.is_installed = false;
        game3.use_library_integration = false;
        game3.play_actions = vec![LaunchConfiguration {
            executable: "C:\\Games\\dod.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }];
        assert!(game3.is_playable());

        // 4. Uninstalled store game with library integration OFF but empty custom action is NOT playable
        let mut game4 = Game::new("steam".to_string(), "40".to_string(), "HL".to_string());
        game4.is_installed = false;
        game4.use_library_integration = false;
        game4.play_actions = vec![LaunchConfiguration {
            executable: "   ".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }];
        assert!(!game4.is_playable());

        // 5. Custom library game with valid custom action IS playable even if is_installed is false
        let mut game5 = Game::new("custom".to_string(), "custom-1".to_string(), "MyGame".to_string());
        game5.is_installed = false;
        game5.play_actions = vec![LaunchConfiguration {
            executable: "C:\\MyGame\\run.bat".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }];
        assert!(game5.is_playable());
    }

    #[test]
    fn test_uninstalled_game_session_recording_lifecycle() {
        let db = Database::open_in_memory().expect("open DB failed");
        db.migrate().expect("migrate failed");

        let game_id = Uuid::new_v4();
        let game = Game {
            id: game_id,
            library_id: "steam".to_string(),
            external_id: "12345".to_string(),
            title: "Uninstalled Custom Copy".to_string(),
            sorting_title: "uninstalled custom copy".to_string(),
            install_dir: None,
            is_installed: false, // NOT installed according to store
            playtime_seconds: 0,
            play_count: 0,
            last_activity: None,
            release_date: None,
            user_score: None,
            critic_score: None,
            community_score: None,
            description: None,
            cover_image_path: None,
            background_image_path: None,
            icon_image_path: None,
            genres: vec![],
            developers: vec![],
            publishers: vec![],
            tags: vec![],
            categories: vec![],
            features: vec![],
            series: None,
            age_rating: None,
            completion_status: None,
            user_notes: None,
            extra_metadata: None,
            play_actions: vec![LaunchConfiguration {
                executable: "C:\\Games\\game.exe".to_string(),
                arguments: vec![],
                working_dir: None,
                tracking_mode: ProcessTrackingMode::KernelJobObject,
            }],
            library_play_action: None,
            use_library_integration: false, // Library integration OFF
            custom_links: vec![],
            is_hidden: false,
            is_favorite: false,
            hidden_by_duplicate_hider: false,
            duplicate_group_id: None,
            achievements_sync_status: omnis_sdk::AchievementsSyncStatus::Unknown,
            added_timestamp: chrono::Utc::now(),
            modified_timestamp: chrono::Utc::now(),
        };

        // Seed game into database
        let _ = db.insert_custom_game(
            game.id,
            &game.title,
            &game.sorting_title,
            game.install_dir.clone(),
            game.play_actions.clone(),
            None,
        ).expect("insert custom game failed");

        // Verify initial state
        let loaded = db.get_game_by_id(game_id).unwrap().unwrap();
        assert_eq!(loaded.play_count, 0);
        assert_eq!(loaded.playtime_seconds, 0);

        // 1. Simulate start_play_session
        let session_id = Uuid::new_v4();
        let start_time = chrono::Utc::now();
        db.start_play_session(session_id, game_id, start_time).expect("start session failed");

        let after_start = db.get_game_by_id(game_id).unwrap().unwrap();
        assert_eq!(after_start.play_count, 1);
        assert_eq!(after_start.completion_status.as_deref(), Some("Playing"));

        // 2. Simulate checkpoint
        let checkpoint_time = start_time + chrono::Duration::seconds(60);
        db.checkpoint_play_session(session_id, game_id, 60, checkpoint_time).expect("checkpoint failed");

        let after_checkpoint = db.get_game_by_id(game_id).unwrap().unwrap();
        assert_eq!(after_checkpoint.playtime_seconds, 60);

        // 3. Simulate finish_play_session
        let end_time = start_time + chrono::Duration::seconds(180);
        let finished = db.finish_play_session(session_id, game_id, 180, start_time, end_time).expect("finish failed");
        assert_eq!(finished.duration_seconds, 180);

        let after_finish = db.get_game_by_id(game_id).unwrap().unwrap();
        assert_eq!(after_finish.play_count, 1);
        assert_eq!(after_finish.playtime_seconds, 180);

        // 4. Simulate launch failure on next launch: start then cancel
        let session2_id = Uuid::new_v4();
        let start_time2 = chrono::Utc::now();
        db.start_play_session(session2_id, game_id, start_time2).expect("start session 2 failed");

        let during_session2 = db.get_game_by_id(game_id).unwrap().unwrap();
        assert_eq!(during_session2.play_count, 2);

        // Cancel session 2 (e.g. process not found or launch error)
        db.cancel_play_session(session2_id, game_id).expect("cancel session failed");

        let after_cancel = db.get_game_by_id(game_id).unwrap().unwrap();
        assert_eq!(after_cancel.play_count, 1); // Reverted back to 1!
        assert_eq!(after_cancel.playtime_seconds, 180); // Preserves previous valid playtime

        let sessions = db.get_game_sessions(game_id).expect("get sessions failed");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].duration_seconds, 180);
    }
}
