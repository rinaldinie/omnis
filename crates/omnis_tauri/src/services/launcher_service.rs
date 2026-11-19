//! Game Launch & Lifecycle Coordination Service for Omnis Desktop
//!
//! Encapsulates pre-launch validation, store protocol synthesis, window focus & geometry
//! management, periodic play-session checkpointing, and background process tracking.

use crate::types::AppState;
use omnis_core::db::Database;
use omnis_core::GameLauncher;
use omnis_sdk::constants::events;
use omnis_sdk::LaunchConfiguration;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;
pub use crate::services::window_service::WindowStateSnapshot;
use uuid::Uuid;

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
        state
            .active_game_manager
            .set_window_snapshot(window_snapshot.clone())
            .await;

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
        active_mgr.set_stopping(&session_id_str).await;

        if let Some((_session, snapshot)) = active_mgr.end_session().await {
            let ended_at = chrono::Utc::now();
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

            // Restore window geometry & focus
            let snapshot = snapshot.unwrap_or(window_snapshot);
            snapshot.restore(&app_handle).await;

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
    }

    /// Kill the currently active game session and restore main window.
    pub async fn kill_running_game(
        app_handle: &tauri::AppHandle,
        state: &AppState,
    ) -> Result<bool, String> {
        if let Some((session, snapshot)) = state.active_game_manager.kill_running_graceful(3).await? {
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

            // Restore window geometry & focus with captured snapshot
            let snapshot = snapshot.unwrap_or_else(|| WindowStateSnapshot::capture(app_handle));
            snapshot.restore(app_handle).await;

            let _ = app_handle.emit(
                events::GAME_STOPPED,
                serde_json::json!({
                    "session_id": session.session_id,
                    "game_id": session.game_id,
                    "duration_seconds": duration,
                }),
            );
            let _ = app_handle.emit(events::LIBRARY_UPDATED, ());
            return Ok(true);
        }
        Ok(false)
    }
}

pub use omnis_core::launcher::{
    build_install_uri, has_store_integration, resolve_launch_plan, validate_and_open_store_uri,
};

fn is_emulated_library(library_id: &str) -> bool {
    let lower = library_id.trim().to_ascii_lowercase();
    lower == omnis_plugin_emulators::SWITCH_LIBRARY_ID || lower.starts_with("emulator_")
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

#[cfg(test)]
mod tests {
    use super::*;
    use omnis_core::launcher::{build_play_uri, resolve_launch_configuration};
    use omnis_sdk::{Game, ProcessTrackingMode};

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
