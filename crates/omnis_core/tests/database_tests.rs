use chrono::Utc;
use omnis_core::db::Database;
use omnis_sdk::{
    CustomLink, DiscoveredGame, GameMetadataPatch, GameUpdateDto, LaunchConfiguration,
};
use std::path::PathBuf;
use std::time::Instant;
use uuid::Uuid;

#[test]
fn test_batch_ingest_and_query_performance() {
    let db = Database::open_in_memory().expect("Failed to open DB");

    // Generate 5,000 synthetic games
    let mut sample_batch = Vec::with_capacity(5000);
    for i in 0..5000 {
        sample_batch.push(DiscoveredGame {
            library_id: "steam".to_string(),
            external_id: format!("app_{}", i),
            title: format!("Game Title {}", i),
            install_dir: Some(PathBuf::from(format!("C:\\Games\\Title_{}", i))),
            is_installed: i % 2 == 0,
            play_action: None,
            playtime_seconds: (i * 60) as u64,
            play_count: (i % 10) as u32,
            last_activity: Some(Utc::now()),
            cover_image_path: None,
            background_image_path: None,
        });
    }

    let start_insert = Instant::now();
    let count = db
        .ingest_discovered_batch(&sample_batch)
        .expect("Failed batch insert");
    let insert_duration = start_insert.elapsed();

    assert_eq!(count, 5000);
    println!(
        "-> Inserted 5,000 games in {:.2}ms ({:.0} games/sec)",
        insert_duration.as_secs_f64() * 1000.0,
        5000.0 / insert_duration.as_secs_f64()
    );

    let start_query = Instant::now();
    let all_games = db.get_all_games().expect("Failed to get all games");
    let query_duration = start_query.elapsed();

    assert_eq!(all_games.len(), 5000);
    println!(
        "-> Fetched 5,000 games sorted in {:.2}ms",
        query_duration.as_secs_f64() * 1000.0
    );

    // Verification: Query 5,000 games must be fast
    assert!(query_duration.as_millis() < 250);
}

#[test]
fn test_seed_and_metadata_patch() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    let seeded = db.seed_sample_games().expect("Failed to seed games");
    assert!(seeded > 0);

    let games = db.get_all_games().expect("Failed to get games");
    assert_eq!(games.len(), seeded);

    let target_game = &games[0];
    let patch = GameMetadataPatch {
        description: Some("Test description".to_string()),
        release_date: Some("2020-12-10".to_string()),
        cover_url: Some("/cache/covers/test.jpg".to_string()),
        background_url: Some("/cache/backgrounds/test.jpg".to_string()),
        icon_url: None,
        critic_score: Some(92),
        community_score: Some(94),
        genres: vec!["GDR".to_string(), "Azione".to_string()],
        developers: vec!["CD PROJEKT RED".to_string()],
        publishers: vec!["CD PROJEKT".to_string()],
        tags: vec![],
        features: vec!["Single-player".to_string(), "Achievements".to_string()],
        extra_metadata: None,
        ..Default::default()
    };

    let updated = db
        .apply_metadata_patch(target_game.id, &patch)
        .expect("Failed to apply patch");
    assert!(updated);

    let fetched = db
        .get_game_by_id(target_game.id)
        .expect("Failed query")
        .expect("Game not found");
    assert_eq!(fetched.critic_score, Some(92));
    assert_eq!(fetched.description.as_deref(), Some("Test description"));
    assert_eq!(
        fetched.cover_image_path.as_deref(),
        Some("/cache/covers/test.jpg")
    );
    assert_eq!(fetched.genres, vec!["RPG", "Action"]);
    assert_eq!(fetched.features, vec!["Single-player", "Achievements"]);
    assert_eq!(fetched.developers, vec!["CD PROJEKT RED"]);
    assert_eq!(fetched.publishers, vec!["CD PROJEKT"]);
}

#[test]
fn test_update_game_extended_metadata_and_json_fields() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    db.seed_sample_games().expect("Failed to seed games");

    let games = db.get_all_games().expect("Failed to get games");
    let target = &games[0];
    // Default completion status from SQLite table default
    assert_eq!(target.completion_status.as_deref(), Some("NotPlayed"));
    assert_eq!(target.play_actions, Vec::<LaunchConfiguration>::new());
    assert_eq!(target.custom_links, Vec::<CustomLink>::new());

    let update_dto = GameUpdateDto {
        id: target.id,
        title: "Cyberpunk 2077: Phantom Liberty".to_string(),
        sorting_title: Some("cyberpunk 2077 phantom liberty".to_string()),
        release_date: Some("2023-09-26".to_string()),
        description: Some("Spy-thriller adventure expansion".to_string()),
        user_score: Some(95),
        critic_score: Some(89),
        community_score: Some(91),
        series: Some("Cyberpunk".to_string()),
        age_rating: Some("M - Mature 17+".to_string()),
        completion_status: Some("Completed".to_string()),
        user_notes: Some("Incredible expansion and soundtrack".to_string()),
        genres: vec!["RPG".to_string(), "Sci-Fi".to_string()],
        developers: vec!["CD PROJEKT RED".to_string()],
        publishers: vec!["CD PROJEKT".to_string()],
        tags: vec!["Cyberpunk".to_string(), "Story Rich".to_string()],
        features: vec!["Single-player".to_string(), "Ray Tracing".to_string()],
        cover_image_path: Some("/cache/covers/cp2077_pl.jpg".to_string()),
        background_image_path: Some("/cache/backgrounds/cp2077_pl.jpg".to_string()),
        icon_image_path: Some("/cache/icons/cp2077_pl.ico".to_string()),
        play_actions: vec![LaunchConfiguration {
            executable: "bin/x64/Cyberpunk2077.exe".to_string(),
            arguments: vec!["--launcher-skip".to_string()],
            working_dir: Some(PathBuf::from("C:\\Games\\Cyberpunk 2077")),
            tracking_mode: omnis_sdk::ProcessTrackingMode::KernelJobObject,
        }],
        use_library_integration: true,
        custom_links: vec![CustomLink {
            title: "Official Wiki".to_string(),
            url: "https://cyberpunk.fandom.com".to_string(),
        }],
        extra_metadata: None,
    };

    let updated_game = db.update_game(&update_dto).expect("Failed to update game");
    assert_eq!(updated_game.title, "Cyberpunk 2077: Phantom Liberty");
    assert_eq!(updated_game.sorting_title, "cyberpunk 2077 phantom liberty");
    assert_eq!(updated_game.series.as_deref(), Some("Cyberpunk"));
    assert_eq!(updated_game.age_rating.as_deref(), Some("M - Mature 17+"));
    assert_eq!(updated_game.completion_status.as_deref(), Some("Completed"));
    assert_eq!(
        updated_game.completion_status_enum(),
        Some(omnis_sdk::CompletionStatus::Completed)
    );
    assert_eq!(
        updated_game.user_notes.as_deref(),
        Some("Incredible expansion and soundtrack")
    );
    assert_eq!(updated_game.genres, vec!["RPG", "Sci-Fi"]);
    assert_eq!(updated_game.developers, vec!["CD PROJEKT RED"]);
    assert_eq!(updated_game.publishers, vec!["CD PROJEKT"]);
    assert_eq!(updated_game.tags, vec!["Cyberpunk", "Story Rich"]);
    assert_eq!(updated_game.play_actions.len(), 1);
    assert_eq!(
        updated_game.play_actions[0].executable,
        "bin/x64/Cyberpunk2077.exe"
    );
    assert_eq!(updated_game.custom_links.len(), 1);
    assert_eq!(updated_game.custom_links[0].title, "Official Wiki");

    // Verify refetched game via get_game_by_id
    let refetched = db
        .get_game_by_id(target.id)
        .expect("Query failed")
        .expect("Game not found");
    assert_eq!(refetched, updated_game);

    // Verify get_all_games returns updated state
    let all_games = db.get_all_games().expect("Failed to fetch all");
    let found = all_games.iter().find(|g| g.id == target.id).unwrap();
    assert_eq!(found.completion_status.as_deref(), Some("Completed"));
    assert_eq!(found.custom_links.len(), 1);
    assert_eq!(found.play_actions.len(), 1);
}

#[test]
fn test_migration_idempotency_and_defaults() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    // Running migrate multiple times must succeed without error
    db.migrate().expect("Second migration failed");
    db.migrate().expect("Third migration failed");

    let user_ver: i32 = db
        .conn()
        .query_row("PRAGMA user_version;", [], |r| r.get(0))
        .expect("Query user_version failed");
    assert_eq!(user_ver, omnis_core::db::migrations::CURRENT_SCHEMA_VERSION);

    let single = DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "999999".to_string(),
        title: "Test Idempotent Game".to_string(),
        install_dir: None,
        is_installed: false,
        play_action: None,
        playtime_seconds: 0,
        play_count: 0,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
    };
    db.ingest_discovered_batch(&[single])
        .expect("Ingest failed");

    let games = db.get_all_games().expect("Query failed");
    assert_eq!(games.len(), 1);
    let g = &games[0];
    assert_eq!(g.completion_status.as_deref(), Some("NotPlayed"));
    assert_eq!(g.play_actions, Vec::<LaunchConfiguration>::new());
    assert_eq!(g.custom_links, Vec::<CustomLink>::new());
    assert_eq!(g.series, None);
    assert_eq!(g.age_rating, None);
    assert_eq!(g.user_notes, None);
}

#[test]
fn test_search_games() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    db.seed_sample_games().expect("Failed to seed games");

    let games = db.get_all_games().expect("Failed to get games");
    let target = &games[0];

    // Update target with custom series and notes
    let update_dto = GameUpdateDto {
        id: target.id,
        title: target.title.clone(),
        sorting_title: Some(target.sorting_title.clone()),
        release_date: None,
        description: None,
        user_score: None,
        critic_score: None,
        community_score: None,
        series: Some("NeonUniverse".to_string()),
        age_rating: None,
        completion_status: Some("Playing".to_string()),
        user_notes: Some("SecretNoteKeyword".to_string()),
        genres: vec!["Cybernetic".to_string()],
        developers: vec![],
        publishers: vec![],
        tags: vec![],
        features: vec![],
        cover_image_path: None,
        background_image_path: None,
        icon_image_path: None,
        play_actions: vec![],
        use_library_integration: true,
        custom_links: vec![],
        extra_metadata: None,
    };
    db.update_game(&update_dto).expect("Update failed");

    // Search by series
    let results = db.search_games("NeonUniverse").expect("Search failed");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, target.id);

    // Search by note
    let results = db.search_games("SecretNoteKeyword").expect("Search failed");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, target.id);

    // Search by genre
    let results = db.search_games("Cybernetic").expect("Search failed");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, target.id);

    // Search non-existent
    let results = db
        .search_games("NonExistentTermXYZ")
        .expect("Search failed");
    assert_eq!(results.len(), 0);
}

#[test]
fn test_update_nonexistent_game_returns_error() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    let non_existent = GameUpdateDto {
        id: Uuid::new_v4(),
        title: "Ghost Game".to_string(),
        sorting_title: None,
        release_date: None,
        description: None,
        user_score: None,
        critic_score: None,
        community_score: None,
        series: None,
        age_rating: None,
        completion_status: None,
        user_notes: None,
        genres: vec![],
        developers: vec![],
        publishers: vec![],
        tags: vec![],
        features: vec![],
        cover_image_path: None,
        background_image_path: None,
        icon_image_path: None,
        play_actions: vec![],
        use_library_integration: true,
        custom_links: vec![],
        extra_metadata: None,
    };

    let result = db.update_game(&non_existent);
    assert!(result.is_err());
}

#[test]
fn test_library_counts_aggregation() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    let samples = vec![
        DiscoveredGame {
            library_id: "steam".to_string(),
            external_id: "s1".to_string(),
            title: "Steam Game".to_string(),
            install_dir: Some(PathBuf::from("C:\\Steam\\g1")),
            is_installed: true,
            play_action: None,
            playtime_seconds: 3600,
            play_count: 5,
            last_activity: Some(Utc::now()),
            cover_image_path: None,
            background_image_path: None,
        },
        DiscoveredGame {
            library_id: "gog".to_string(),
            external_id: "g1".to_string(),
            title: "GOG Game".to_string(),
            install_dir: None,
            is_installed: false,
            play_action: None,
            playtime_seconds: 0,
            play_count: 0,
            last_activity: None,
            cover_image_path: None,
            background_image_path: None,
        },
        DiscoveredGame {
            library_id: "epic".to_string(),
            external_id: "e1".to_string(),
            title: "Epic Game".to_string(),
            install_dir: None,
            is_installed: false,
            play_action: None,
            playtime_seconds: 0,
            play_count: 0,
            last_activity: None,
            cover_image_path: None,
            background_image_path: None,
        },
        DiscoveredGame {
            library_id: "xbox".to_string(),
            external_id: "x1".to_string(),
            title: "Xbox Title".to_string(),
            install_dir: None,
            is_installed: false,
            play_action: None,
            playtime_seconds: 1200,
            play_count: 2,
            last_activity: None,
            cover_image_path: None,
            background_image_path: None,
        },
    ];

    db.ingest_discovered_batch(&samples).expect("Ingest failed");
    let counts = db.get_library_counts().expect("get_library_counts failed");

    assert_eq!(counts.total, 4);
    assert_eq!(counts.installed, 1);
    assert_eq!(counts.steam, 1);
    assert_eq!(counts.gog, 1);
    assert_eq!(counts.epic, 1);
    assert_eq!(counts.xbox, 1);
    assert_eq!(counts.recent, 1); // 1 game with last_activity IS NOT NULL
}

#[test]
fn test_game_sessions_persistence_and_query() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    db.migrate().expect("Failed to run migrations");

    let game_id = Uuid::new_v4();
    let game = db
        .insert_custom_game(
            game_id,
            "Session Test Game",
            "session test game",
            None,
            vec![],
            None,
        )
        .expect("Failed to insert game");
    assert_eq!(game.playtime_seconds, 0);
    assert_eq!(game.play_count, 0);

    let now = Utc::now();
    let s1_start = now - chrono::Duration::hours(2);
    let s1_end = s1_start + chrono::Duration::minutes(30);
    let s1_duration = 1800; // 30 minutes

    let s2_start = now - chrono::Duration::minutes(15);
    let s2_end = now;
    let s2_duration = 900; // 15 minutes

    let session1 = db
        .record_play_session(game_id, s1_duration, s1_start, s1_end)
        .expect("Failed to record session 1");
    assert_eq!(session1.game_id, game_id);
    assert_eq!(session1.duration_seconds, s1_duration);

    let session2 = db
        .record_play_session(game_id, s2_duration, s2_start, s2_end)
        .expect("Failed to record session 2");
    assert_eq!(session2.game_id, game_id);
    assert_eq!(session2.duration_seconds, s2_duration);

    let sessions = db
        .get_game_sessions(game_id)
        .expect("Failed to retrieve game sessions");
    assert_eq!(sessions.len(), 2);
    // Ordered by started_at DESC: session2 was started more recently than session1
    assert_eq!(sessions[0].id, session2.id);
    assert_eq!(sessions[1].id, session1.id);
    assert!(sessions[0].started_at >= sessions[1].started_at);

    let updated_game = db
        .get_game_by_id(game_id)
        .expect("Failed to query game")
        .expect("Game not found");
    assert_eq!(updated_game.playtime_seconds, s1_duration + s2_duration);
    assert_eq!(updated_game.play_count, 2);
}

#[test]
fn test_start_and_cancel_play_session_lifecycle() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    db.migrate().expect("Failed to run migrations");

    let game_id = Uuid::new_v4();
    let game = db
        .insert_custom_game(
            game_id,
            "Cancel Session Game",
            "cancel session game",
            None,
            vec![],
            None,
        )
        .expect("Failed to insert game");
    assert_eq!(game.playtime_seconds, 0);
    assert_eq!(game.play_count, 0);
    assert_eq!(game.completion_status.as_deref(), Some("NotPlayed"));

    let session_id = Uuid::new_v4();
    let start_time = Utc::now();

    // 1. Simulate starting a session (prior to process detection)
    db.start_play_session(session_id, game_id, start_time)
        .expect("Failed to start session");

    let mid_game = db
        .get_game_by_id(game_id)
        .expect("Query failed")
        .expect("Not found");
    assert_eq!(mid_game.play_count, 1);
    assert_eq!(mid_game.completion_status.as_deref(), Some("Playing"));

    let active_sessions = db
        .get_game_sessions(game_id)
        .expect("Query sessions failed");
    assert_eq!(active_sessions.len(), 1);

    // 2. Simulate process launch failure: cancel the session
    db.cancel_play_session(session_id, game_id)
        .expect("Failed to cancel session");

    let after_cancel_game = db
        .get_game_by_id(game_id)
        .expect("Query failed")
        .expect("Not found");
    assert_eq!(after_cancel_game.play_count, 0);
    assert_eq!(after_cancel_game.playtime_seconds, 0);
    assert_eq!(
        after_cancel_game.completion_status.as_deref(),
        Some("NotPlayed")
    );

    let final_sessions = db
        .get_game_sessions(game_id)
        .expect("Query sessions failed");
    assert_eq!(final_sessions.len(), 0);
}

#[test]
fn test_cancel_play_session_reverts_checkpointed_playtime() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    db.migrate().expect("Failed to run migrations");

    let game_id = Uuid::new_v4();
    db.insert_custom_game(
        game_id,
        "Checkpoint Cancel Game",
        "checkpoint cancel game",
        None,
        vec![],
        None,
    )
    .expect("Failed to insert game");

    let session_id = Uuid::new_v4();
    let start_time = Utc::now();
    db.start_play_session(session_id, game_id, start_time)
        .expect("Failed to start session");
    db.checkpoint_play_session(session_id, game_id, 60, start_time + chrono::Duration::seconds(60))
        .expect("Failed to checkpoint session");

    db.cancel_play_session(session_id, game_id)
        .expect("Failed to cancel session");

    let after_cancel_game = db
        .get_game_by_id(game_id)
        .expect("Query failed")
        .expect("Not found");
    assert_eq!(after_cancel_game.play_count, 0);
    assert_eq!(after_cancel_game.playtime_seconds, 0);
    assert_eq!(
        after_cancel_game.completion_status.as_deref(),
        Some("NotPlayed")
    );
    assert!(db
        .get_game_sessions(game_id)
        .expect("Query sessions failed")
        .is_empty());
}

#[test]
fn test_achievements_upsert_and_summary() {
    let db = Database::open_in_memory().expect("Failed to open DB");

    // First create the parent game record (enforcing foreign key)
    let sample = DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "730".to_string(),
        title: "CS:GO".to_string(),
        install_dir: None,
        is_installed: true,
        play_action: None,
        playtime_seconds: 1200,
        play_count: 5,
        last_activity: Some(Utc::now()),
        cover_image_path: None,
        background_image_path: None,
    };
    db.ingest_discovered_batch(&[sample])
        .expect("Failed ingest");
    let games = db.get_all_games().unwrap();
    let real_game_id = games[0].id;

    let achievements = vec![
        omnis_sdk::Achievement {
            id: format!("steam_{}_ach_1", real_game_id),
            game_id: real_game_id,
            api_name: "ach_1".to_string(),
            display_name: "First Blood".to_string(),
            description: Some("Get your first kill".to_string()),
            icon_unlocked_url: "https://example.com/icon1.png".to_string(),
            icon_locked_url: Some("https://example.com/icon1_gray.png".to_string()),
            local_icon_path: None,
            is_unlocked: true,
            unlock_time: Some(Utc::now()),
            rarity_percentage: Some(85.5),
            points: Some(10),
            is_hidden: false,
        },
        omnis_sdk::Achievement {
            id: format!("steam_{}_ach_2", real_game_id),
            game_id: real_game_id,
            api_name: "ach_2".to_string(),
            display_name: "Master of War".to_string(),
            description: Some("Win 100 matches".to_string()),
            icon_unlocked_url: "https://example.com/icon2.png".to_string(),
            icon_locked_url: Some("https://example.com/icon2_gray.png".to_string()),
            local_icon_path: None,
            is_unlocked: false,
            unlock_time: None,
            rarity_percentage: Some(4.2),
            points: Some(50),
            is_hidden: true,
        },
    ];

    db.upsert_achievements(real_game_id, &achievements)
        .expect("Failed to upsert achievements");

    let summary = db
        .get_game_achievements(real_game_id)
        .expect("Failed to get summary");

    assert_eq!(summary.total_count, 2);
    assert_eq!(summary.unlocked_count, 1);
    assert_eq!(summary.total_points, 60);
    assert_eq!(summary.earned_points, 10);
    assert!((summary.completion_percentage - 50.0).abs() < f32::EPSILON);
    assert_eq!(summary.achievements.len(), 2);

    // Test updating local icon path
    db.update_achievement_local_icon(
        &format!("steam_{}_ach_1", real_game_id),
        "C:\\cache\\ach_1.png",
    )
    .expect("Failed to update local icon path");

    let summary2 = db.get_game_achievements(real_game_id).unwrap();
    let ach1 = summary2
        .achievements
        .iter()
        .find(|a| a.api_name == "ach_1")
        .unwrap();
    assert_eq!(
        ach1.local_icon_path.as_deref(),
        Some("C:\\cache\\ach_1.png")
    );
}

#[test]
fn test_concurrent_reader_during_writer() {
    let temp_dir = std::env::temp_dir().join(format!("omnis_wal_test_{}", Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&temp_dir);
    let db_path = temp_dir.join("library.db");

    let db = std::sync::Arc::new(Database::open(&db_path).expect("Failed to open disk DB"));
    db.seed_sample_games()
        .expect("Failed to seed initial starter games");
    let initial_count = db.count_games().expect("Failed to count");
    assert!(initial_count > 0);

    let db_writer = db.clone();
    let (tx_started, rx_started) = std::sync::mpsc::channel();
    let (tx_continue, rx_continue) = std::sync::mpsc::channel();

    let writer_handle = std::thread::spawn(move || {
        let mut conn = db_writer.writer();
        let tx = conn.transaction().expect("Failed to start transaction");
        let new_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        tx.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, added_timestamp, modified_timestamp)
             VALUES (?1, 'custom', ?1, 'Concurrent Game', 'concurrent game', ?2, ?2)",
            rusqlite::params![new_id, now],
        ).expect("Insert in tx failed");

        tx_started.send(()).unwrap();
        // Wait until main thread performs concurrent read
        rx_continue.recv().unwrap();
        tx.commit().expect("Commit failed");
    });

    // Wait until background writer holds transaction
    rx_started.recv().unwrap();

    // Reader connection can read simultaneously without blocking!
    let games_during_tx = db
        .get_all_games()
        .expect("Reader must succeed during write transaction");
    assert_eq!(games_during_tx.len(), initial_count);

    let counts_during_tx = db
        .get_library_counts()
        .expect("Reader counts must succeed during write transaction");
    assert_eq!(counts_during_tx.total, initial_count);

    // Let writer commit
    tx_continue.send(()).unwrap();
    writer_handle.join().unwrap();

    // After commit, reader sees the new game
    let games_after_commit = db
        .get_all_games()
        .expect("Reader must succeed after commit");
    assert_eq!(games_after_commit.len(), initial_count + 1);

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_get_games_paginated() {
    let db = Database::open_in_memory().expect("Failed to open db");

    for i in 0..10 {
        let title = format!("Game {:02}", i);
        let id = Uuid::new_v4();
        db.insert_custom_game(id, &title, &title, None, vec![], None)
            .expect("Failed to insert game");
    }

    let page1 = db.get_games_paginated(4, 0).expect("Page 1 failed");
    assert_eq!(page1.len(), 4);
    assert_eq!(page1[0].title, "Game 00");
    assert_eq!(page1[3].title, "Game 03");

    let page2 = db.get_games_paginated(4, 4).expect("Page 2 failed");
    assert_eq!(page2.len(), 4);
    assert_eq!(page2[0].title, "Game 04");
    assert_eq!(page2[3].title, "Game 07");

    let page3 = db.get_games_paginated(4, 8).expect("Page 3 failed");
    assert_eq!(page3.len(), 2);
    assert_eq!(page3[0].title, "Game 08");
    assert_eq!(page3[1].title, "Game 09");
}

#[test]
fn test_achievements_sync_status_persistence() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    let sample = DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "400".to_string(),
        title: "Portal".to_string(),
        install_dir: None,
        is_installed: true,
        play_action: None,
        playtime_seconds: 600,
        play_count: 1,
        last_activity: Some(Utc::now()),
        cover_image_path: None,
        background_image_path: None,
    };
    db.ingest_discovered_batch(&[sample])
        .expect("Failed ingest");
    let game_id = db.get_all_games().unwrap()[0].id;

    // Newly ingested game starts as Unknown
    assert_eq!(
        db.get_game_by_id(game_id)
            .unwrap()
            .unwrap()
            .achievements_sync_status,
        omnis_sdk::AchievementsSyncStatus::Unknown
    );
    assert_eq!(
        db.get_game_achievements(game_id).unwrap().sync_status,
        omnis_sdk::AchievementsSyncStatus::Unknown
    );

    // Successful empty sync marks game as None
    db.upsert_achievements(game_id, &[])
        .expect("Failed empty upsert");
    assert_eq!(
        db.get_game_by_id(game_id)
            .unwrap()
            .unwrap()
            .achievements_sync_status,
        omnis_sdk::AchievementsSyncStatus::None
    );
    assert_eq!(
        db.get_game_achievements(game_id).unwrap().sync_status,
        omnis_sdk::AchievementsSyncStatus::None
    );

    // Subsequent sync finding achievements transitions to Available
    let ach = omnis_sdk::Achievement {
        id: format!("steam_{}_ach_1", game_id),
        game_id,
        api_name: "ach_1".to_string(),
        display_name: "Test".to_string(),
        description: None,
        icon_unlocked_url: "https://example.com/1.png".to_string(),
        icon_locked_url: None,
        local_icon_path: None,
        is_unlocked: false,
        unlock_time: None,
        rarity_percentage: None,
        points: None,
        is_hidden: false,
    };
    db.upsert_achievements(game_id, &[ach])
        .expect("Failed non-empty upsert");
    assert_eq!(
        db.get_game_by_id(game_id)
            .unwrap()
            .unwrap()
            .achievements_sync_status,
        omnis_sdk::AchievementsSyncStatus::Available
    );
    assert_eq!(
        db.get_game_achievements(game_id).unwrap().sync_status,
        omnis_sdk::AchievementsSyncStatus::Available
    );
}

#[test]
fn test_genre_normalization_on_write_and_v9_migration() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    db.seed_sample_games().expect("Failed to seed games");
    let games = db.get_all_games().expect("Failed to get games");
    let g1 = games[0].id;
    let g2 = games[1].id;

    // 1. Metadata patch normalizes and deduplicates mixed localized/store genres
    let patch = GameMetadataPatch {
        genres: vec![
            "Action".to_string(),
            "Azione".to_string(),
            "Role-playing (RPG)".to_string(),
            "GDR".to_string(),
            "Point-and-click".to_string(),
            "Punta e clicca".to_string(),
        ],
        ..Default::default()
    };
    db.apply_metadata_patch(g1, &patch)
        .expect("Failed to apply patch");

    let fetched1 = db.get_game_by_id(g1).unwrap().unwrap();
    assert_eq!(fetched1.genres, vec!["Action", "RPG", "Point & Click"]);

    // Verify raw SQL column is also normalized on disk
    let raw_g1: String = db
        .reader()
        .query_row(
            "SELECT genres FROM games WHERE id = ?1",
            rusqlite::params![g1.to_string()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(raw_g1, "Action, RPG, Point & Click");

    // 2. Manual update_game normalizes and deduplicates genres
    let mut update_dto = GameUpdateDto {
        id: g2,
        title: games[1].title.clone(),
        sorting_title: Some(games[1].sorting_title.clone()),
        release_date: games[1].release_date.clone(),
        description: games[1].description.clone(),
        user_score: games[1].user_score,
        critic_score: games[1].critic_score,
        community_score: games[1].community_score,
        series: games[1].series.clone(),
        age_rating: games[1].age_rating.clone(),
        completion_status: games[1].completion_status.clone(),
        user_notes: games[1].user_notes.clone(),
        genres: vec![
            "Simulazione".to_string(),
            "Simulator".to_string(),
            "metroidvania".to_string(),
            "Metroidvania".to_string(),
        ],
        developers: games[1].developers.clone(),
        publishers: games[1].publishers.clone(),
        tags: games[1].tags.clone(),
        features: games[1].features.clone(),
        cover_image_path: games[1].cover_image_path.clone(),
        background_image_path: games[1].background_image_path.clone(),
        icon_image_path: games[1].icon_image_path.clone(),
        play_actions: games[1].play_actions.clone(),
        use_library_integration: games[1].use_library_integration,
        custom_links: games[1].custom_links.clone(),
        extra_metadata: games[1].extra_metadata.clone(),
    };
    let updated2 = db.update_game(&update_dto).expect("Failed to update game");
    assert_eq!(updated2.genres, vec!["Simulation", "Metroidvania"]);

    // 3. Simulate pre-v9 database rows with unnormalized/JSON/duplicate genres and run v9 migration
    {
        let conn = db.writer();
        conn.execute(
            "UPDATE games SET genres = ?1 WHERE id = ?2",
            rusqlite::params!["Azione, Action, Giochi di ruolo, Role-Playing", g1.to_string()],
        )
        .unwrap();
        conn.execute(
            "UPDATE games SET genres = ?1 WHERE id = ?2",
            rusqlite::params![r#"["Corse", "Racing", "Accesso anticipato"]"#, g2.to_string()],
        )
        .unwrap();
        conn.execute_batch("PRAGMA user_version = 8;").unwrap();
    }

    db.migrate().expect("Migration v9 failed");

    let raw_after_g1: String = db
        .reader()
        .query_row(
            "SELECT genres FROM games WHERE id = ?1",
            rusqlite::params![g1.to_string()],
            |r| r.get(0),
        )
        .unwrap();
    let raw_after_g2: String = db
        .reader()
        .query_row(
            "SELECT genres FROM games WHERE id = ?1",
            rusqlite::params![g2.to_string()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(raw_after_g1, "Action, RPG");
    assert_eq!(raw_after_g2, "Racing, Early Access");

    // Empty/whitespace genres in update_game clear column to NULL
    update_dto.genres = vec!["   ".to_string()];
    let cleared = db.update_game(&update_dto).unwrap();
    assert!(cleared.genres.is_empty());
}

#[test]
fn test_v6_and_v10_migrations_separate_installed_store_actions_from_custom_actions() {
    use omnis_sdk::ProcessTrackingMode;
    use rusqlite::Connection;

    let path = std::env::temp_dir().join(format!("omnis_v6_migration_test_{}.db", Uuid::new_v4()));

    // Part 1: Simulate a pre-v6 (v5) database with installed Steam, GOG, Amazon, Xbox, and Custom games
    {
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "
            CREATE TABLE games (
                id TEXT PRIMARY KEY NOT NULL,
                library_id TEXT NOT NULL,
                external_id TEXT NOT NULL,
                title TEXT NOT NULL COLLATE NOCASE,
                sorting_title TEXT NOT NULL COLLATE NOCASE,
                install_dir TEXT,
                is_installed INTEGER NOT NULL DEFAULT 0,
                playtime_seconds INTEGER NOT NULL DEFAULT 0,
                play_count INTEGER NOT NULL DEFAULT 0,
                last_activity TEXT,
                release_date TEXT,
                user_score INTEGER,
                critic_score INTEGER,
                community_score INTEGER,
                description TEXT,
                cover_image_path TEXT,
                background_image_path TEXT,
                icon_image_path TEXT,
                genres TEXT,
                developers TEXT,
                publishers TEXT,
                tags TEXT,
                features TEXT,
                series TEXT,
                age_rating TEXT,
                completion_status TEXT DEFAULT 'NotPlayed',
                user_notes TEXT,
                custom_links TEXT,
                play_actions TEXT,
                extra_metadata TEXT,
                added_timestamp TEXT NOT NULL,
                modified_timestamp TEXT NOT NULL,
                is_hidden INTEGER NOT NULL DEFAULT 0,
                hidden_by_duplicate_hider INTEGER NOT NULL DEFAULT 0,
                duplicate_group_id TEXT,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                name TEXT GENERATED ALWAYS AS (title) VIRTUAL
            );
            CREATE UNIQUE INDEX idx_games_library_external ON games(library_id, external_id);
            CREATE TABLE game_achievements (
                id TEXT PRIMARY KEY NOT NULL,
                game_id TEXT NOT NULL,
                api_name TEXT NOT NULL,
                display_name TEXT NOT NULL
            );
            PRAGMA user_version = 5;
            ",
        )
        .unwrap();

        let steam_cmd = serde_json::to_string(&vec![LaunchConfiguration {
            executable: "cmd.exe".to_string(),
            arguments: vec![
                "/c".to_string(),
                "start".to_string(),
                "".to_string(),
                "steam://rungameid/620".to_string(),
            ],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }])
        .unwrap();
        let gog_exe = serde_json::to_string(&vec![LaunchConfiguration {
            executable: r"C:\GOG Games\Witcher 3\bin\x64\witcher3.exe".to_string(),
            arguments: vec![],
            working_dir: Some(PathBuf::from(r"C:\GOG Games\Witcher 3\bin\x64")),
            tracking_mode: ProcessTrackingMode::ProcessName("witcher3.exe".to_string()),
        }])
        .unwrap();
        let xbox_uri = serde_json::to_string(&vec![LaunchConfiguration {
            executable: "ms-windows-store://pdp/?ProductId=9NXQXX31PRSF".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }])
        .unwrap();
        let amazon_uri = serde_json::to_string(&vec![LaunchConfiguration {
            executable: "amazon-games://play/amzn1.adg.product.123".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }])
        .unwrap();
        let custom_exe = serde_json::to_string(&vec![LaunchConfiguration {
            executable: r"C:\Games\MyCustom\game.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }])
        .unwrap();

        let now = chrono::Utc::now().to_rfc3339();
        for (id, lib, ext, dir, pa) in [
            (Uuid::new_v4().to_string(), "steam", "620", Some(r"C:\Steam\Portal 2"), steam_cmd),
            (Uuid::new_v4().to_string(), "gog", "1207658924", Some(r"C:\GOG Games\Witcher 3"), gog_exe),
            (Uuid::new_v4().to_string(), "xbox", "192837", None, xbox_uri),
            (Uuid::new_v4().to_string(), "amazon", "amzn1.adg.product.123", None, amazon_uri),
            (Uuid::new_v4().to_string(), "custom", "custom-1", None, custom_exe),
        ] {
            conn.execute(
                "INSERT INTO games (id, library_id, external_id, title, sorting_title, install_dir, is_installed, play_actions, added_timestamp, modified_timestamp)
                 VALUES (?1, ?2, ?3, ?3, ?3, ?4, 1, ?5, ?6, ?6)",
                rusqlite::params![id, lib, ext, dir, pa, now],
            )
            .unwrap();
        }
    }

    let db = Database::open(&path).expect("Migration from v5 should succeed");
    let games = db.get_all_games().unwrap();

    let steam = games.iter().find(|g| g.library_id == "steam").unwrap();
    assert!(steam.play_actions.is_empty(), "Steam store cmd must be removed from play_actions");
    assert_eq!(steam.library_play_action.as_ref().unwrap().executable, "cmd.exe");

    let gog = games.iter().find(|g| g.library_id == "gog").unwrap();
    assert!(gog.play_actions.is_empty(), "GOG exe must be removed from play_actions");
    assert_eq!(
        gog.library_play_action.as_ref().unwrap().executable,
        r"C:\GOG Games\Witcher 3\bin\x64\witcher3.exe"
    );

    let xbox = games.iter().find(|g| g.library_id == "xbox").unwrap();
    assert!(xbox.play_actions.is_empty());
    assert!(xbox
        .library_play_action
        .as_ref()
        .unwrap()
        .executable
        .starts_with("ms-windows-store://"));

    let amazon = games.iter().find(|g| g.library_id == "amazon").unwrap();
    assert!(amazon.play_actions.is_empty());
    assert!(amazon
        .library_play_action
        .as_ref()
        .unwrap()
        .executable
        .starts_with("amazon-games://"));

    let custom = games.iter().find(|g| g.library_id == "custom").unwrap();
    assert_eq!(custom.play_actions.len(), 1);
    assert!(custom.library_play_action.is_none());

    drop(db);
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(format!("{}-wal", path.display()));
    let _ = std::fs::remove_file(format!("{}-shm", path.display()));
}

#[test]
fn test_v10_migration_repairs_v9_dbs_with_leftover_store_actions_without_touching_custom_trainers() {
    use omnis_sdk::ProcessTrackingMode;

    let db = Database::new_in_memory().expect("open in-memory db");
    let now = chrono::Utc::now().to_rfc3339();

    let steam_synced_dup_id = Uuid::new_v4();
    let steam_synced_with_trainer_id = Uuid::new_v4();
    let gog_synced_dup_id = Uuid::new_v4();
    let gog_unsynced_id = Uuid::new_v4();
    let steam_trainer_only_id = Uuid::new_v4();

    let steam_cmd = LaunchConfiguration {
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
        executable: r"C:\Tools\trainer.exe".to_string(),
        arguments: vec![],
        working_dir: None,
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    };
    let gog_exe = LaunchConfiguration {
        executable: r"C:\GOG Games\Cyberpunk\bin\x64\Cyberpunk2077.exe".to_string(),
        arguments: vec![],
        working_dir: Some(PathBuf::from(r"C:\GOG Games\Cyberpunk\bin\x64")),
        tracking_mode: ProcessTrackingMode::ProcessName("Cyberpunk2077.exe".to_string()),
    };

    {
        let conn = db.writer();
        // 1. Steam synced on v0.24.1: library_play_action = steam_cmd AND play_actions = [steam_cmd]
        conn.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, is_installed, play_actions, library_play_action, added_timestamp, modified_timestamp)
             VALUES (?1, 'steam', '620', 'Portal 2', 'portal 2', 1, ?2, ?3, ?4, ?4)",
            rusqlite::params![
                steam_synced_dup_id.to_string(),
                serde_json::to_string(&vec![steam_cmd.clone()]).unwrap(),
                serde_json::to_string(&steam_cmd).unwrap(),
                now
            ],
        )
        .unwrap();

        // 2. Steam synced on v0.24.1 with user trainer: library_play_action = steam_cmd, play_actions = [steam_cmd, trainer]
        conn.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, is_installed, play_actions, library_play_action, added_timestamp, modified_timestamp)
             VALUES (?1, 'steam', '400', 'Portal', 'portal', 1, ?2, ?3, ?4, ?4)",
            rusqlite::params![
                steam_synced_with_trainer_id.to_string(),
                serde_json::to_string(&vec![steam_cmd.clone(), trainer.clone()]).unwrap(),
                serde_json::to_string(&steam_cmd).unwrap(),
                now
            ],
        )
        .unwrap();

        // 3. GOG synced on v0.24.1: library_play_action = gog_exe AND play_actions = [gog_exe]
        conn.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, install_dir, is_installed, play_actions, library_play_action, added_timestamp, modified_timestamp)
             VALUES (?1, 'gog', '100', 'Cyberpunk', 'cyberpunk', ?2, 1, ?3, ?4, ?5, ?5)",
            rusqlite::params![
                gog_synced_dup_id.to_string(),
                r"C:\GOG Games\Cyberpunk",
                serde_json::to_string(&vec![gog_exe.clone()]).unwrap(),
                serde_json::to_string(&gog_exe).unwrap(),
                now
            ],
        )
        .unwrap();

        // 4. GOG upgraded to v9, not re-synced yet: library_play_action = NULL, play_actions = [gog_exe]
        conn.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, install_dir, is_installed, play_actions, library_play_action, added_timestamp, modified_timestamp)
             VALUES (?1, 'gog', '101', 'Cyberpunk 2', 'cyberpunk 2', ?2, 1, ?3, NULL, ?4, ?4)",
            rusqlite::params![
                gog_unsynced_id.to_string(),
                r"C:\GOG Games\Cyberpunk",
                serde_json::to_string(&vec![gog_exe.clone()]).unwrap(),
                now
            ],
        )
        .unwrap();

        // 5. Steam game without library_play_action where user added only a custom trainer (Bug b setup)
        conn.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, is_installed, play_actions, library_play_action, added_timestamp, modified_timestamp)
             VALUES (?1, 'steam', '730', 'CS2', 'cs2', 1, ?2, NULL, ?3, ?3)",
            rusqlite::params![
                steam_trainer_only_id.to_string(),
                serde_json::to_string(&vec![trainer.clone()]).unwrap(),
                now
            ],
        )
        .unwrap();

        conn.execute_batch("PRAGMA user_version = 9;").unwrap();
    }

    db.migrate().expect("Migration v10 failed");

    let g1 = db.get_game_by_id(steam_synced_dup_id).unwrap().unwrap();
    assert!(g1.play_actions.is_empty());
    assert_eq!(g1.library_play_action, Some(steam_cmd.clone()));

    let g2 = db.get_game_by_id(steam_synced_with_trainer_id).unwrap().unwrap();
    assert_eq!(g2.play_actions, vec![trainer.clone()]);
    assert_eq!(g2.library_play_action, Some(steam_cmd));

    let g3 = db.get_game_by_id(gog_synced_dup_id).unwrap().unwrap();
    assert!(g3.play_actions.is_empty());
    assert_eq!(g3.library_play_action, Some(gog_exe.clone()));

    let g4 = db.get_game_by_id(gog_unsynced_id).unwrap().unwrap();
    assert!(g4.play_actions.is_empty());
    assert_eq!(g4.library_play_action, Some(gog_exe));

    let g5 = db.get_game_by_id(steam_trainer_only_id).unwrap().unwrap();
    assert!(g5.library_play_action.is_none());
    assert_eq!(g5.play_actions, vec![trainer]);
}

#[test]
fn test_v11_migration_disables_library_integration_for_custom_games_only() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    let custom_id = Uuid::new_v4();
    let steam_id = Uuid::new_v4();

    {
        let conn = db.writer();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, is_installed, use_library_integration, added_timestamp, modified_timestamp)
             VALUES (?1, 'custom', ?1, 'Custom Game', 'custom game', 0, 1, ?2, ?2)",
            rusqlite::params![custom_id.to_string(), now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, is_installed, use_library_integration, added_timestamp, modified_timestamp)
             VALUES (?1, 'steam', '730', 'CS2', 'cs2', 0, 1, ?2, ?2)",
            rusqlite::params![steam_id.to_string(), now],
        )
        .unwrap();
        conn.execute_batch("PRAGMA user_version = 10;").unwrap();
    }

    db.migrate().expect("Migration v11 failed");

    let custom_game = db.get_game_by_id(custom_id).unwrap().unwrap();
    assert!(!custom_game.use_library_integration);
    assert!(!custom_game.is_installed);

    let steam_game = db.get_game_by_id(steam_id).unwrap().unwrap();
    assert!(steam_game.use_library_integration);
}

#[test]
fn test_v12_migration_scopes_fts_update_trigger_and_keeps_search_in_sync() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    let game_id = Uuid::new_v4();

    {
        let conn = db.writer();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, description, added_timestamp, modified_timestamp)
             VALUES (?1, 'steam', '999', 'Old Title', 'old title', 'Old description text', ?2, ?2)",
            rusqlite::params![game_id.to_string(), now],
        )
        .unwrap();
        conn.execute_batch(
            "
            DROP TRIGGER IF EXISTS games_au;
            CREATE TRIGGER games_au AFTER UPDATE ON games BEGIN
                INSERT INTO games_fts(games_fts, rowid, name, title, description) VALUES('delete', old.rowid, old.name, old.title, old.description);
                INSERT INTO games_fts(rowid, name, title, description) VALUES (new.rowid, new.name, new.title, new.description);
            END;
            PRAGMA user_version = 11;
            ",
        )
        .unwrap();
    }

    db.migrate().expect("Migration v12 failed");

    {
        let conn = db.reader();
        let trigger_sql: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'games_au';",
                [],
                |r| r.get(0),
            )
            .expect("games_au trigger missing");
        assert!(
            trigger_sql.contains("UPDATE OF title, description ON games"),
            "Unexpected trigger SQL: {trigger_sql}"
        );
    }

    let game = db.get_game_by_id(game_id).unwrap().unwrap();
    let mut update = omnis_sdk::GameUpdateDto {
        id: game.id,
        title: "Chrono Odyssey".to_string(),
        sorting_title: None,
        release_date: None,
        description: Some("Explore the ancient ruins of Aethelgard.".to_string()),
        user_score: None,
        critic_score: None,
        community_score: None,
        series: None,
        age_rating: None,
        completion_status: None,
        user_notes: None,
        genres: vec![],
        developers: vec![],
        publishers: vec![],
        tags: vec![],
        features: vec![],
        cover_image_path: None,
        background_image_path: None,
        icon_image_path: None,
        play_actions: vec![],
        use_library_integration: true,
        custom_links: vec![],
        extra_metadata: None,
    };
    db.update_game(&update).expect("Update failed");

    let fts_ids = db.search_games_fts("Aethelgard").unwrap();
    assert_eq!(fts_ids, vec![game_id]);
    assert!(db.search_games_fts("Old description").unwrap().is_empty());

    // Non-text update keeps FTS intact
    db.set_game_favorite(game_id, true).unwrap();
    assert_eq!(db.search_games_fts("Aethelgard").unwrap(), vec![game_id]);

    // Subsequent title update re-indexes FTS
    update.title = "Starfield Explorer".to_string();
    db.update_game(&update).unwrap();
    assert_eq!(db.search_games_fts("Starfield").unwrap(), vec![game_id]);
}

#[test]
fn test_sql_filtered_background_queries() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    let now = Utc::now();

    let games = vec![
        omnis_sdk::DiscoveredGame {
            library_id: "steam".to_string(),
            external_id: "1".to_string(),
            title: "Played Remote Steam".to_string(),
            install_dir: None,
            is_installed: true,
            play_action: None,
            playtime_seconds: 1200,
            play_count: 1,
            last_activity: Some(now),
            cover_image_path: Some("https://cdn.example.com/1.jpg".to_string()),
            background_image_path: None,
        },
        omnis_sdk::DiscoveredGame {
            library_id: "steam".to_string(),
            external_id: "2".to_string(),
            title: "Unplayed Local Steam".to_string(),
            install_dir: None,
            is_installed: false,
            play_action: None,
            playtime_seconds: 0,
            play_count: 0,
            last_activity: None,
            cover_image_path: Some("/cache/local.jpg".to_string()),
            background_image_path: None,
        },
        omnis_sdk::DiscoveredGame {
            library_id: "gog".to_string(),
            external_id: "3".to_string(),
            title: "Played Remote GOG".to_string(),
            install_dir: None,
            is_installed: false,
            play_action: None,
            playtime_seconds: 600,
            play_count: 1,
            last_activity: Some(now),
            cover_image_path: None,
            background_image_path: Some("http://cdn.example.com/3.jpg".to_string()),
        },
    ];
    assert_eq!(db.ingest_discovered_batch(&games).unwrap(), 3);
    assert_eq!(db.ingest_discovered_batch(&[]).unwrap(), 0);

    let ach_candidates = db.get_achievement_sync_candidates(&["steam"]).unwrap();
    assert_eq!(ach_candidates.len(), 1);
    assert_eq!(ach_candidates[0].external_id, "1");

    let remote_gog = db.get_games_with_remote_artwork("gog").unwrap();
    assert_eq!(remote_gog.len(), 1);
    assert_eq!(remote_gog[0].external_id, "3");

    let playable = db.get_playable_launch_candidates().unwrap();
    assert_eq!(playable.len(), 1);
    assert_eq!(playable[0].external_id, "1");

    let summaries = db.get_all_game_summaries().unwrap();
    assert_eq!(summaries.len(), 3);
    let first_summary = summaries.iter().find(|s| s.external_id == "1").unwrap();
    assert!(first_summary.is_playable);
    assert_eq!(first_summary.title, "Played Remote Steam");
}
