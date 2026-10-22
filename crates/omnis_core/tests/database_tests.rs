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
    let count = db.ingest_discovered_batch(&sample_batch).expect("Failed batch insert");
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
    };

    let updated = db.apply_metadata_patch(target_game.id, &patch).expect("Failed to apply patch");
    assert!(updated);

    let fetched = db.get_game_by_id(target_game.id).expect("Failed query").expect("Game not found");
    assert_eq!(fetched.critic_score, Some(92));
    assert_eq!(fetched.description.as_deref(), Some("Test description"));
    assert_eq!(fetched.cover_image_path.as_deref(), Some("/cache/covers/test.jpg"));
    assert_eq!(fetched.genres, vec!["GDR", "Azione"]);
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
    db.ingest_discovered_batch(&[single]).expect("Ingest failed");

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
    let results = db.search_games("NonExistentTermXYZ").expect("Search failed");
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
    assert_eq!(counts.recent, 2); // 2 games with playtime_seconds > 0
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
    assert_eq!(
        updated_game.playtime_seconds,
        s1_duration + s2_duration
    );
    assert_eq!(updated_game.play_count, 2);
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
    db.ingest_discovered_batch(&[sample]).expect("Failed ingest");
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
    assert_eq!(ach1.local_icon_path.as_deref(), Some("C:\\cache\\ach_1.png"));
}


