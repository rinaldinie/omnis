use chrono::{Duration, Utc};
use omnis_core::db::Database;
use omnis_core::StatsRepository;
use omnis_sdk::DiscoveredGame;
use rusqlite::params;
use std::path::PathBuf;

#[test]
fn test_global_statistics_and_game_metrics() {
    let db = Database::open_in_memory().expect("Failed to open DB");

    // 1. Create two test games
    let games = vec![
        DiscoveredGame {
            library_id: "steam".to_string(),
            external_id: "steam_101".to_string(),
            title: "Witcher 3".to_string(),
            install_dir: Some(PathBuf::from("C:\\Games\\Witcher3")),
            is_installed: true,
            play_action: None,
            playtime_seconds: 7200,
            play_count: 2,
            last_activity: Some(Utc::now()),
            cover_image_path: None,
            background_image_path: None,
        },
        DiscoveredGame {
            library_id: "gog".to_string(),
            external_id: "gog_202".to_string(),
            title: "Cyberpunk 2077".to_string(),
            install_dir: Some(PathBuf::from("C:\\Games\\Cyberpunk")),
            is_installed: true,
            play_action: None,
            playtime_seconds: 3600,
            play_count: 1,
            last_activity: Some(Utc::now()),
            cover_image_path: None,
            background_image_path: None,
        },
    ];

    db.ingest_discovered_batch(&games).expect("Failed to ingest games");

    let all_games = db.get_all_games().expect("Failed to get all games");
    assert_eq!(all_games.len(), 2);
    let g1 = all_games.iter().find(|g| g.title == "Witcher 3").unwrap();
    let g2 = all_games.iter().find(|g| g.title == "Cyberpunk 2077").unwrap();

    // Set genres and completion status directly in db for g1 and g2
    {
        let conn = db.writer();
        conn.execute(
            "UPDATE games SET genres = ?1, completion_status = ?2 WHERE id = ?3",
            params!["RPG, Action", "Completed", g1.id.to_string()],
        )
        .expect("Failed to update g1");

        conn.execute(
            "UPDATE games SET genres = ?1, completion_status = ?2 WHERE id = ?3",
            params!["RPG, Sci-Fi", "NotPlayed", g2.id.to_string()],
        )
        .expect("Failed to update g2");
    }

    // 2. Record play sessions for g1
    let now = Utc::now();
    let session1_duration = 3600; // 1 hour
    let session2_duration = 7200; // 2 hours

    db.record_play_session(
        g1.id,
        session1_duration,
        now - Duration::hours(3),
        now - Duration::hours(2),
    )
    .expect("Failed to record session 1");

    db.record_play_session(
        g1.id,
        session2_duration,
        now - Duration::hours(1),
        now,
    )
    .expect("Failed to record session 2");

    // 3. Test Game-level Statistics
    let game_stats = db.get_game_statistics(g1.id).expect("Failed to get game statistics");
    assert_eq!(game_stats.average_session_seconds, 5400); // (3600 + 7200) / 2
    assert_eq!(game_stats.longest_session_seconds, 7200);
    assert_eq!(game_stats.last_4_weeks_bars.len(), 4);
    // Current week should have 10800s (3600 + 7200)
    let current_week = &game_stats.last_4_weeks_bars[3];
    assert_eq!(current_week.duration_seconds, 10800);

    // 4. Test Global Statistics
    let global_stats = db
        .get_global_statistics(Some(now.format("%Y").to_string().parse().unwrap()))
        .expect("Failed to get global statistics");

    assert_eq!(global_stats.total_playtime_year_seconds, 10800);
    assert!(!global_stats.activity_heatmap.is_empty());
    let today_activity = &global_stats.activity_heatmap[0];
    assert_eq!(today_activity.count_sessions, 2);
    assert_eq!(today_activity.sessions.len(), 2);
    assert_eq!(today_activity.sessions[0].game_title, "Witcher 3");
    assert_eq!(today_activity.sessions[0].library_id.as_deref(), Some("steam"));
    assert_eq!(today_activity.sessions[0].duration_seconds, 3600);
    assert_eq!(today_activity.sessions[1].duration_seconds, 7200);

    // Test get_day_sessions directly
    let day_sessions = db
        .get_day_sessions(&today_activity.date)
        .expect("Failed to get day sessions");
    assert_eq!(day_sessions.len(), 2);
    assert_eq!(day_sessions[0].game_title, "Witcher 3");
    
    // Check backlog summary: 1 completed out of 2 total -> 50%
    assert_eq!(global_stats.backlog_summary.total_games, 2);
    assert_eq!(global_stats.backlog_summary.completed_count, 1);
    assert_eq!(global_stats.backlog_summary.in_progress_count, 1);
    assert_eq!(global_stats.backlog_summary.not_played_count, 0);
    assert!((global_stats.backlog_summary.completion_percentage - 50.0).abs() < 0.1);

    // Lifetime playtime across all games (g1: 7200 + 3600 + 7200 + g2: 3600 = 21600)
    assert_eq!(global_stats.total_playtime_lifetime_seconds, 21600);
    assert!(!global_stats.available_years.is_empty());

    // Check store distribution contains steam and gog
    assert!(!global_stats.store_distribution.is_empty());

    // Check genre distribution contains RPG
    let rpg_genre = global_stats.genre_distribution.iter().find(|g| g.name == "RPG");
    assert!(rpg_genre.is_some());

    // 5. Test Reset Statistics (clear sessions only)
    db.reset_statistics(false).expect("Failed to reset sessions");
    let after_reset = db
        .get_global_statistics(Some(now.format("%Y").to_string().parse().unwrap()))
        .expect("Failed to get global stats after reset");
    assert_eq!(after_reset.activity_heatmap.len(), 0);

    // 6. Test Reset Statistics with playtime
    db.reset_statistics(true).expect("Failed to reset playtime");
    let after_full_reset = db
        .get_global_statistics(Some(now.format("%Y").to_string().parse().unwrap()))
        .expect("Failed to get global stats after full reset");
    assert_eq!(after_full_reset.total_playtime_lifetime_seconds, 0);
}

#[test]
fn test_ingest_external_sessions_idempotency_and_metrics() {
    use omnis_sdk::ExternalSessionDto;

    let db = Database::open_in_memory().expect("Failed to open DB");

    // Pre-populate with Steam game "Prince of Persia The Lost Crown" (appid: 2751000)
    let games = vec![DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "2751000".to_string(),
        title: "Prince of Persia The Lost Crown".to_string(),
        install_dir: Some(PathBuf::from("D:\\SteamLibrary\\steamapps\\common\\Prince of Persia The Lost Crown")),
        is_installed: true,
        play_action: None,
        playtime_seconds: 3600,
        play_count: 1,
        last_activity: Some(Utc::now() - Duration::days(10)),
        cover_image_path: None,
        background_image_path: None,
    }];

    db.ingest_discovered_batch(&games).expect("Failed to ingest games");

    let sample_sessions = vec![
        ExternalSessionDto {
            external_id: "2751000".to_string(),
            started_at: "2026-10-27T19:58:27Z".to_string(),
            ended_at: "2026-10-27T22:33:52Z".to_string(),
            duration_seconds: 9325,
        },
        ExternalSessionDto {
            external_id: "9999999".to_string(), // Unowned/untracked game
            started_at: "2026-10-28T21:58:39Z".to_string(),
            ended_at: "2026-10-28T22:20:20Z".to_string(),
            duration_seconds: 1301,
        },
    ];

    // 1. Initial ingest: should import 1 session for 2751000 and skip 9999999
    let added = db.ingest_external_sessions("steam", &sample_sessions).expect("Ingest failed");
    assert_eq!(added, 1, "Must import 1 session for Prince of Persia");

    // Verify session in database
    let all_games = db.get_all_games().unwrap();
    let pop = all_games.iter().find(|g| g.external_id == "2751000").unwrap();
    assert!(pop.playtime_seconds >= 9325, "Playtime must be updated to at least the session duration (9325s)");
    assert_eq!(pop.play_count, 1);

    // Verify game statistics shows session metrics
    let game_stats = db.get_game_statistics(pop.id).unwrap();
    assert_eq!(game_stats.longest_session_seconds, 9325);
    assert_eq!(game_stats.average_session_seconds, 9325);

    // 2. Second ingest: must be strictly idempotent (0 duplicate sessions added)
    let added_second = db.ingest_external_sessions("steam", &sample_sessions).expect("Second ingest failed");
    assert_eq!(added_second, 0, "Second ingest must be idempotent and add 0 duplicate sessions");
}
