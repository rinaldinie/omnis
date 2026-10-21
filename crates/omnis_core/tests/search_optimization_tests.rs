use omnis_core::search::FuzzyGameSearchIndex;
use omnis_core::Database;
use omnis_sdk::{DiscoveredGame, GameUpdateDto, LaunchConfiguration, ProcessTrackingMode};
use std::time::Instant;
use uuid::Uuid;

#[test]
fn test_fuzzy_search_matches_typos_nucleo() {
    let mut index = FuzzyGameSearchIndex::new();
    let id1 = Uuid::new_v4();
    let id2 = Uuid::new_v4();
    let id3 = Uuid::new_v4();

    index.insert_or_update(id1, "The Witcher 3: Wild Hunt");
    index.insert_or_update(id2, "Cyberpunk 2077");
    index.insert_or_update(id3, "Grand Theft Auto V");

    // Search with typo "witchr" (missing 'e')
    let results = index.search("witchr");
    assert!(!results.is_empty(), "Expected 'witchr' to match 'The Witcher 3'");
    assert_eq!(results[0].0, id1);

    // Search with typo "cberpnk"
    let results_cyber = index.search("cberpnk");
    assert!(!results_cyber.is_empty(), "Expected 'cberpnk' to match 'Cyberpunk 2077'");
    assert_eq!(results_cyber[0].0, id2);
}

#[test]
fn test_unified_search_fuzzy_and_fts5_trigram() {
    let db = Database::new_in_memory().expect("In-memory DB creation failed");
    db.migrate().expect("DB migration failed");

    // Game 1: The Witcher 3 with "Novigrad" only in description
    let disc1 = DiscoveredGame {
        library_id: "gog".to_string(),
        external_id: "witcher3".to_string(),
        title: "The Witcher 3: Wild Hunt".to_string(),
        install_dir: None,
        is_installed: true,
        playtime_seconds: 3600,
        play_count: 5,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
        play_action: Some(LaunchConfiguration {
            executable: "witcher3.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::ProcessName("witcher3.exe".to_string()),
        }),
    };

    // Game 2: Cyberpunk 2077 with "Arasaka" only in description
    let disc2 = DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "1091500".to_string(),
        title: "Cyberpunk 2077".to_string(),
        install_dir: None,
        is_installed: true,
        playtime_seconds: 7200,
        play_count: 10,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
        play_action: Some(LaunchConfiguration {
            executable: "cyberpunk2077.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::ProcessName("cyberpunk2077.exe".to_string()),
        }),
    };

    db.ingest_discovered_batch(&[disc1, disc2])
        .expect("Batch ingestion failed");

    // Fetch games from DB to update their descriptions
    let games = db.get_all_games().expect("Fetch all games failed");
    let witcher = games.iter().find(|g| g.title.contains("Witcher")).unwrap();
    let cyberpunk = games.iter().find(|g| g.title.contains("Cyberpunk")).unwrap();

    // Update descriptions
    let update_w = GameUpdateDto {
        id: witcher.id,
        title: witcher.title.clone(),
        sorting_title: None,
        release_date: None,
        description: Some("Geralt of Rivia roams the dangerous lands of Novigrad and Skellige.".to_string()),
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
    db.update_game(&update_w).expect("Update witcher failed");

    let update_c = GameUpdateDto {
        id: cyberpunk.id,
        title: cyberpunk.title.clone(),
        sorting_title: None,
        release_date: None,
        description: Some("Fight against the megacorporation Arasaka in the corrupt metropolis of Night City.".to_string()),
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
    db.update_game(&update_c).expect("Update cyberpunk failed");

    // 1. Verification criteria: Search "witchr" (typo) finds "The Witcher 3"
    let fuzzy_results = db.search_games("witchr").expect("Search 'witchr' failed");
    assert!(!fuzzy_results.is_empty(), "Searching 'witchr' must find 'The Witcher 3'");
    assert_eq!(fuzzy_results[0].id, witcher.id);

    // 2. Verification criteria: Search a word present ONLY in description ("Novigrad") returns correct game
    let desc_results_novigrad = db.search_games("Novigrad").expect("Search 'Novigrad' failed");
    assert!(!desc_results_novigrad.is_empty(), "Searching 'Novigrad' must find Witcher 3 via FTS5");
    assert_eq!(desc_results_novigrad[0].id, witcher.id);

    // 3. Verification criteria: Search a word present ONLY in description ("Arasaka") returns Cyberpunk 2077
    let desc_results_arasaka = db.search_games("Arasaka").expect("Search 'Arasaka' failed");
    assert!(!desc_results_arasaka.is_empty(), "Searching 'Arasaka' must find Cyberpunk via FTS5");
    assert_eq!(desc_results_arasaka[0].id, cyberpunk.id);
}

#[test]
fn test_fuzzy_search_performance_5000_games() {
    let mut index = FuzzyGameSearchIndex::with_capacity(5000);

    // Populate 5,000 distinct game titles
    for i in 0..5000 {
        let title = match i % 5 {
            0 => format!("Assassin's Creed: Brotherhood Part {}", i),
            1 => format!("Final Fantasy Remake Edition {}", i),
            2 => format!("The Legend of Zelda: Realm {}", i),
            3 => format!("Super Mario World Adventure {}", i),
            _ => format!("Call of Duty Modern Warfare Ops {}", i),
        };
        index.insert_or_update(Uuid::new_v4(), &title);
    }

    assert_eq!(index.len(), 5000);

    // Execute queries with typos and measure latency
    let queries = [
        "assasns cred",
        "fnal fant",
        "zelda relm",
        "mario advntr",
        "call dut warfar",
    ];

    let start = Instant::now();
    for query in &queries {
        let matches = index.search(query);
        assert!(!matches.is_empty(), "Query '{}' should match items", query);
    }
    let total_elapsed = start.elapsed();
    let avg_per_query = total_elapsed / (queries.len() as u32);

    println!(
        "5,000 games fuzzy search: total = {:?}, avg per query = {:?}",
        total_elapsed, avg_per_query
    );

    // Must be < 1 ms (1000 µs) in release mode; allow up to 25ms in unoptimized debug builds
    let threshold_micros = if cfg!(debug_assertions) { 25_000 } else { 1_000 };
    assert!(
        avg_per_query.as_micros() < threshold_micros,
        "Fuzzy search on 5000 games must run in under {:?}µs, got {:?}",
        threshold_micros,
        avg_per_query
    );
}
