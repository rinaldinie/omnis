use chrono::{Duration, Utc};
use omnis_core::db::Database;
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
    
    // Check backlog summary: 1 completed out of 2 total -> 50%
    assert_eq!(global_stats.backlog_summary.total_games, 2);
    assert_eq!(global_stats.backlog_summary.completed_count, 1);
    assert_eq!(global_stats.backlog_summary.not_played_count, 1);
    assert!((global_stats.backlog_summary.completion_percentage - 50.0).abs() < 0.1);

    // Check store distribution contains steam and gog
    assert!(!global_stats.store_distribution.is_empty());

    // Check genre distribution contains RPG
    let rpg_genre = global_stats.genre_distribution.iter().find(|g| g.name == "RPG");
    assert!(rpg_genre.is_some());
}
