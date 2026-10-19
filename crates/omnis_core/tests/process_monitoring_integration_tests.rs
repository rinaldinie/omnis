//! Process Monitoring & Game Session Integration Tests
//!
//! Validates:
//! - Test 1 (`test_game_sessions_aggregation_and_ordering`):
//!   SQLite database in-memory initialization, game session recording, aggregate playtime and play count,
//!   last activity timestamp tracking, and session ordering (newest first).
//! - Test 2 (`test_process_launcher_echo_and_exit`):
//!   Cross-platform process launch and tracking via `GameLauncher::launch_and_track`,
//!   validating that `on_started` is called with a valid PID (> 0) and the execution finishes with `Ok(duration)`.
//! - Test 3 (`test_kill_process_safety`):
//!   Safety verification of `kill_process` against non-existent and invalid PIDs,
//!   ensuring graceful error/result handling without panics or runtime crashes.

use chrono::Utc;
use omnis_core::db::Database;
use omnis_core::launcher::{kill_process, GameLauncher};
use omnis_sdk::{DiscoveredGame, LaunchConfiguration, ProcessTrackingMode};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use uuid::Uuid;

/// Test 1: Verifies SQLite game session recording, aggregation, and DESC ordering.
#[test]
fn test_game_sessions_aggregation_and_ordering() {
    // 1. Initialize SQLite database in memory and run migrations
    let db = Database::new_in_memory().expect("Failed to initialize in-memory database");
    db.migrate().expect("Failed to run database migrations");

    // 2. Insert test game (Cyberpunk 2077)
    let discovered = DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "1091500".to_string(),
        title: "Cyberpunk 2077".to_string(),
        install_dir: None,
        is_installed: true,
        play_action: None,
        playtime_seconds: 0,
        play_count: 0,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
    };
    let count = db
        .ingest_discovered_batch(&[discovered])
        .expect("Failed to ingest test game");
    assert_eq!(count, 1, "Expected 1 game to be ingested");

    // 3. Verify initial playtime_seconds == 0 and play_count == 0
    let games = db.get_all_games().expect("Failed to fetch games");
    assert_eq!(games.len(), 1);
    let game = &games[0];
    assert_eq!(game.library_id, "steam");
    assert_eq!(game.external_id, "1091500");
    assert_eq!(game.title, "Cyberpunk 2077");
    assert_eq!(game.playtime_seconds, 0);
    assert_eq!(game.play_count, 0);
    assert!(game.last_activity.is_none());

    let game_id = game.id;

    // 4. Record first session of 1800 seconds (30 minutes)
    let base_time = Utc::now() - chrono::Duration::hours(3);
    let s1_start = base_time;
    let s1_end = s1_start + chrono::Duration::seconds(1800);
    let s1_duration: u64 = 1800;

    let session1 = db
        .record_play_session(game_id, s1_duration, s1_start, s1_end)
        .expect("Failed to record first play session");
    assert_eq!(session1.game_id, game_id);
    assert_eq!(session1.duration_seconds, s1_duration);

    // 5. Record second session of 3600 seconds (60 minutes) occurring later
    let s2_start = s1_end + chrono::Duration::minutes(30);
    let s2_end = s2_start + chrono::Duration::seconds(3600);
    let s2_duration: u64 = 3600;

    let session2 = db
        .record_play_session(game_id, s2_duration, s2_start, s2_end)
        .expect("Failed to record second play session");
    assert_eq!(session2.game_id, game_id);
    assert_eq!(session2.duration_seconds, s2_duration);

    // 6. Reload game from DB and verify aggregated values
    let reloaded_game = db
        .get_game_by_id(game_id)
        .expect("Failed to query game from database")
        .expect("Game Cyberpunk 2077 not found in database");

    assert_eq!(
        reloaded_game.playtime_seconds, 5400,
        "Total playtime should be 1800 + 3600 = 5400 seconds"
    );
    assert_eq!(
        reloaded_game.play_count, 2,
        "Play count should be incremented to 2"
    );
    assert!(
        reloaded_game.last_activity.is_some(),
        "Last activity should be populated"
    );
    let last_act = reloaded_game.last_activity.unwrap();
    assert_eq!(
        last_act.timestamp(),
        s2_end.timestamp(),
        "Last activity timestamp should match session 2 ended_at"
    );

    // 7. Call db.get_game_sessions(game.id) and verify count and ordering
    let sessions = db
        .get_game_sessions(game_id)
        .expect("Failed to retrieve game sessions");
    assert_eq!(sessions.len(), 2, "Expected exactly 2 game sessions");

    // Ordered by started_at DESC: first session returned must be the newest (session2)
    assert_eq!(
        sessions[0].id, session2.id,
        "Most recent session should be first"
    );
    assert_eq!(sessions[0].duration_seconds, 3600);
    assert_eq!(
        sessions[1].id, session1.id,
        "Earlier session should be second"
    );
    assert_eq!(sessions[1].duration_seconds, 1800);
    assert!(
        sessions[0].started_at > sessions[1].started_at,
        "Sessions must be sorted in descending order of started_at"
    );
}

/// Test 2: Verifies GameLauncher::launch_and_track with a cross-platform command.
#[tokio::test]
async fn test_process_launcher_echo_and_exit() {
    let config = if cfg!(windows) {
        LaunchConfiguration {
            executable: "cmd.exe".to_string(),
            arguments: vec!["/c".to_string(), "exit".to_string(), "0".to_string()],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }
    } else {
        LaunchConfiguration {
            executable: "sh".to_string(),
            arguments: vec!["-c".to_string(), "exit 0".to_string()],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }
    };

    let started_pid = Arc::new(AtomicU32::new(0));
    let pid_clone = started_pid.clone();
    let game_id = Uuid::new_v4();

    let result = GameLauncher::launch_and_track(
        game_id,
        config,
        None,
        move |pid| {
            pid_clone.store(pid, Ordering::SeqCst);
        },
    )
    .await;

    assert!(
        result.is_ok(),
        "Expected launch_and_track to succeed, got: {:?}",
        result
    );
    let duration = result.unwrap();
    let pid = started_pid.load(Ordering::SeqCst);

    assert!(
        pid > 0,
        "Expected on_started closure to be invoked with a valid PID > 0, got {}",
        pid
    );
    println!(
        "Launch and track succeeded with PID: {} and tracked duration: {}s",
        pid, duration
    );
}

/// Test 3: Verifies kill_process safety when given non-existent or invalid PIDs.
#[test]
fn test_kill_process_safety() {
    // Test kill_process with a non-existent PID (e.g. 999999)
    let result = kill_process(999_999);
    // Verifies that it safely handles the non-existent process returning Ok or Err without panic or crash
    match result {
        Ok(()) => {
            // Process does not exist, treated safely as terminated/non-running
        }
        Err(err) => {
            assert!(!err.is_empty(), "Error message should not be empty");
        }
    }

    // Also test GameLauncher::kill_process wrapper method
    let gl_result = GameLauncher::kill_process(999_998);
    match gl_result {
        Ok(()) => {}
        Err(err) => {
            assert!(!err.is_empty(), "Error message should not be empty");
        }
    }

    // Verify invalid PID 0 returns an Err explicitly
    let zero_res = kill_process(0);
    assert!(
        zero_res.is_err(),
        "kill_process with PID 0 should return Err"
    );
}
