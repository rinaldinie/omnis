//! Playnite Parity & Workspace Integration Test Suite
//!
//! Validates:
//! - Test 1: In-memory DB creation, migrations, and schema parity columns (`series`, `age_rating`, `completion_status`, `play_actions`, `custom_links`, `user_notes`).
//! - Test 2: Ingestion & updating via `GameUpdateDto` (series, 'Completed' status, scores, custom links, play actions) and persistence in SQLite.
//! - Test 3: Custom game insertion (`insert_custom_game`) with `library_id = "custom"`, `ProcessTrackingMode::KernelJobObject`, and verification in `get_all_games()`.
//! - Test 4: Epic Games Store manifest parsing (`EpicManifest`) and `DiscoveredGame` launch configuration URI generation (`com.epicgames.launcher://`).
//! - Test 5: Metadata candidate DTO serialization (`MetadataCandidateDto`) and database patch enrichment.

use omnis_core::{Database, MetadataCandidateDto, MetadataDownloader};
use omnis_plugin_epic::{EpicLibraryPlugin, EpicManifest};
use omnis_sdk::{
    CompletionStatus, CustomLink, DiscoveredGame, GameMetadataPatch, GameUpdateDto,
    LaunchConfiguration, ProcessTrackingMode,
};
use std::path::PathBuf;
use uuid::Uuid;

/// Test 1: Creazione DB in memoria, verifica migrazioni con nuove colonne
/// (`series`, `age_rating`, `completion_status`, `play_actions`, `custom_links`, `user_notes`).
#[test]
fn test_1_db_in_memory_migrations_and_parity_columns() {
    let db = Database::open_in_memory().expect("Failed to create in-memory database");

    // Verify columns via PRAGMA table_info(games)
    let columns = db
        .get_table_columns("games")
        .expect("Failed to inspect games table columns");

    let required_columns = [
        "id",
        "library_id",
        "external_id",
        "title",
        "sorting_title",
        "install_dir",
        "is_installed",
        "playtime_seconds",
        "play_count",
        "last_activity",
        "release_date",
        "user_score",
        "critic_score",
        "community_score",
        "description",
        "cover_image_path",
        "background_image_path",
        "icon_image_path",
        "genres",
        "developers",
        "publishers",
        "tags",
        "series",
        "age_rating",
        "completion_status",
        "user_notes",
        "custom_links",
        "play_actions",
        "added_timestamp",
        "modified_timestamp",
    ];

    for col in &required_columns {
        assert!(
            columns.iter().any(|c| c.eq_ignore_ascii_case(col)),
            "Missing expected column in SQLite games table: {}",
            col
        );
    }

    // Verify migration idempotency (running migrate multiple times must succeed non-destructively)
    db.migrate().expect("Second migration call must succeed");
    db.migrate().expect("Third migration call must succeed");

    // Ingest a minimal discovered game to verify default column population
    let initial_game = DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "730".to_string(),
        title: "Counter-Strike 2".to_string(),
        install_dir: Some(PathBuf::from("C:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive")),
        is_installed: true,
        play_action: None,
        playtime_seconds: 3600,
        play_count: 10,
        last_activity: Some(chrono::Utc::now()),
        cover_image_path: None,
        background_image_path: None,
    };

    let count = db
        .ingest_discovered_batch(&[initial_game])
        .expect("Failed to ingest discovered game");
    assert_eq!(count, 1);

    let all = db.get_all_games().expect("Failed to retrieve games");
    assert_eq!(all.len(), 1);
    let g = &all[0];

    assert_eq!(g.title, "Counter-Strike 2");
    assert_eq!(g.completion_status.as_deref(), Some("NotPlayed"));
    assert_eq!(g.completion_status_enum(), Some(CompletionStatus::NotPlayed));
    assert!(g.series.is_none());
    assert!(g.age_rating.is_none());
    assert!(g.user_notes.is_none());
    assert!(g.play_actions.is_empty());
    assert!(g.custom_links.is_empty());
}

/// Test 2: Inserimento e aggiornamento gioco con `GameUpdateDto`
/// (modifica di serie, completion status 'Completed', voto critica, voto utente, custom link wiki, play action)
/// e verifica della persistenza in SQLite.
#[test]
fn test_2_game_update_dto_persistence() {
    let db = Database::open_in_memory().expect("Failed to create in-memory database");

    let initial = DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "292030".to_string(),
        title: "The Witcher 3".to_string(),
        install_dir: Some(PathBuf::from("C:\\Games\\The Witcher 3")),
        is_installed: true,
        play_action: None,
        playtime_seconds: 7200,
        play_count: 5,
        last_activity: Some(chrono::Utc::now()),
        cover_image_path: None,
        background_image_path: None,
    };
    db.ingest_discovered_batch(&[initial])
        .expect("Failed to ingest game");

    let games = db.get_all_games().expect("Failed to get all games");
    let target = &games[0];
    let game_id = target.id;

    let update_dto = GameUpdateDto {
        id: game_id,
        title: "The Witcher 3: Wild Hunt - GOTY Edition".to_string(),
        sorting_title: Some("witcher 3 wild hunt goty edition".to_string()),
        release_date: Some("2015-05-18".to_string()),
        description: Some("Acclaimed story-driven open world RPG.".to_string()),
        user_score: Some(96),
        critic_score: Some(93),
        community_score: Some(94),
        series: Some("The Witcher".to_string()),
        age_rating: Some("PEGI 18".to_string()),
        completion_status: Some("Completed".to_string()),
        user_notes: Some("Masterpiece RPG. Completed all quests and expansions.".to_string()),
        genres: vec!["RPG".to_string(), "Action".to_string(), "Open World".to_string()],
        developers: vec!["CD PROJEKT RED".to_string()],
        publishers: vec!["CD PROJEKT".to_string()],
        tags: vec!["Fantasy".to_string(), "Story Rich".to_string()],
        features: vec!["Single-player".to_string(), "Cloud Saves".to_string(), "Achievements".to_string()],
        cover_image_path: Some("C:\\covers\\witcher3_goty.jpg".to_string()),
        background_image_path: Some("C:\\wallpapers\\witcher3_goty.jpg".to_string()),
        icon_image_path: Some("C:\\icons\\witcher3.ico".to_string()),
        play_actions: vec![LaunchConfiguration {
            executable: "bin/x64/witcher3.exe".to_string(),
            arguments: vec!["-novid".to_string(), "-nosplash".to_string()],
            working_dir: Some(PathBuf::from("C:\\Games\\The Witcher 3")),
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }],
        custom_links: vec![
            CustomLink {
                title: "Official Wiki".to_string(),
                url: "https://witcher.fandom.com".to_string(),
            },
            CustomLink {
                title: "Official Discord".to_string(),
                url: "https://discord.gg/cdpred".to_string(),
            },
        ],
        extra_metadata: None,
    };

    let updated_game = db.update_game(&update_dto).expect("Failed to update game");

    // Verify fields on return value
    assert_eq!(updated_game.title, "The Witcher 3: Wild Hunt - GOTY Edition");
    assert_eq!(updated_game.sorting_title, "witcher 3 wild hunt goty edition");
    assert_eq!(updated_game.series.as_deref(), Some("The Witcher"));
    assert_eq!(updated_game.age_rating.as_deref(), Some("PEGI 18"));
    assert_eq!(updated_game.completion_status.as_deref(), Some("Completed"));
    assert_eq!(
        updated_game.completion_status_enum(),
        Some(CompletionStatus::Completed)
    );
    assert_eq!(updated_game.critic_score, Some(93));
    assert_eq!(updated_game.user_score, Some(96));
    assert_eq!(updated_game.community_score, Some(94));
    assert_eq!(
        updated_game.user_notes.as_deref(),
        Some("Masterpiece RPG. Completed all quests and expansions.")
    );
    assert_eq!(
        updated_game.features,
        vec!["Single-player", "Cloud Saves", "Achievements"]
    );
    assert_eq!(updated_game.play_actions.len(), 1);
    assert_eq!(updated_game.play_actions[0].executable, "bin/x64/witcher3.exe");
    assert_eq!(
        updated_game.play_actions[0].arguments,
        vec!["-novid", "-nosplash"]
    );
    assert_eq!(
        updated_game.play_actions[0].tracking_mode,
        ProcessTrackingMode::KernelJobObject
    );
    assert_eq!(updated_game.custom_links.len(), 2);
    assert_eq!(updated_game.custom_links[0].title, "Official Wiki");
    assert_eq!(updated_game.custom_links[1].url, "https://discord.gg/cdpred");

    // Verify persistence via clean get_game_by_id query
    let reloaded = db
        .get_game_by_id(game_id)
        .expect("Database query failed")
        .expect("Game must exist in SQLite");
    assert_eq!(reloaded, updated_game);

    // Verify search matches series, tags, and user notes
    let series_search = db.search_games("The Witcher").expect("Search failed");
    assert_eq!(series_search.len(), 1);
    assert_eq!(series_search[0].id, game_id);

    let notes_search = db.search_games("Masterpiece RPG").expect("Search failed");
    assert_eq!(notes_search.len(), 1);
    assert_eq!(notes_search[0].id, game_id);
}

/// Test 3: Verifica importazione giochi custom (`Database::insert_custom_game`)
/// con `library_id = "custom"`, `ProcessTrackingMode::KernelJobObject`
/// e verifica che `get_all_games()` restituisca il gioco con le relative play actions.
#[test]
fn test_3_custom_game_insertion_and_kernel_tracking() {
    let db = Database::open_in_memory().expect("Failed to create in-memory database");

    let custom_id = Uuid::new_v4();
    let play_actions = vec![LaunchConfiguration {
        executable: "C:\\Emulators\\RPCS3\\rpcs3.exe".to_string(),
        arguments: vec![
            "--no-gui".to_string(),
            "C:\\Games\\PS3\\GOW3\\PS3_GAME\\USRDIR\\EBOOT.BIN".to_string(),
        ],
        working_dir: Some(PathBuf::from("C:\\Emulators\\RPCS3")),
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    }];

    let inserted = db
        .insert_custom_game(
            custom_id,
            "God of War III (RPCS3)",
            "god of war iii rpcs3",
            Some(PathBuf::from("C:\\Emulators\\RPCS3")),
            play_actions.clone(),
            Some("C:\\Emulators\\RPCS3\\covers\\gow3.png".to_string()),
        )
        .expect("Failed to insert custom standalone game");

    // Direct assertions on returned entity
    assert_eq!(inserted.id, custom_id);
    assert_eq!(inserted.library_id, "custom");
    assert_eq!(inserted.external_id, custom_id.to_string());
    assert_eq!(inserted.title, "God of War III (RPCS3)");
    assert_eq!(inserted.sorting_title, "god of war iii rpcs3");
    assert!(inserted.is_installed);
    assert_eq!(inserted.play_actions.len(), 1);
    assert_eq!(
        inserted.play_actions[0].tracking_mode,
        ProcessTrackingMode::KernelJobObject
    );

    // Verify game is returned in library listing via get_all_games()
    let all_games = db.get_all_games().expect("Failed to fetch all games");
    let found = all_games
        .into_iter()
        .find(|g| g.id == custom_id)
        .expect("Custom game must appear in get_all_games list");

    assert_eq!(found.library_id, "custom");
    assert_eq!(found.title, "God of War III (RPCS3)");
    assert_eq!(found.play_actions.len(), 1);
    assert_eq!(
        found.play_actions[0].executable,
        "C:\\Emulators\\RPCS3\\rpcs3.exe"
    );
    assert_eq!(
        found.play_actions[0].arguments,
        vec![
            "--no-gui",
            "C:\\Games\\PS3\\GOW3\\PS3_GAME\\USRDIR\\EBOOT.BIN"
        ]
    );
    assert_eq!(
        found.play_actions[0].tracking_mode,
        ProcessTrackingMode::KernelJobObject
    );
    assert_eq!(
        found.cover_image_path.as_deref(),
        Some("C:\\Emulators\\RPCS3\\covers\\gow3.png")
    );
}

/// Test 4: Parsing manifest Epic Games Store (`EpicManifest`)
/// e generazione `DiscoveredGame` con launch configuration URI `com.epicgames.launcher://`.
#[tokio::test]
async fn test_4_epic_manifest_parsing_and_launch_uri() {
    let manifest_json = r#"{
        "FormatVersion": 0,
        "AppVersionString": "29.10.0",
        "AppName": "Fortnite",
        "CatalogItemId": "4fe75bbc5a674f4f9b356b5c90567da5",
        "CatalogNamespace": "fn",
        "DisplayName": "Fortnite Battle Royale",
        "InstallationStatus": "Complete",
        "InstallLocation": "C:\\Program Files\\Epic Games\\Fortnite",
        "MainGameAppName": "Fortnite",
        "LaunchExecutable": "FortniteLauncher.exe",
        "ManifestLocation": "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests",
        "StagingLocation": "C:\\Program Files\\Epic Games\\.staging"
    }"#;

    // 1. Verify JSON deserialization into EpicManifest
    let manifest: EpicManifest =
        serde_json::from_str(manifest_json).expect("Failed to deserialize EpicManifest");

    assert_eq!(manifest.app_name, "Fortnite");
    assert_eq!(manifest.display_name, "Fortnite Battle Royale");
    assert_eq!(
        manifest.install_location,
        PathBuf::from("C:\\Program Files\\Epic Games\\Fortnite")
    );
    assert_eq!(manifest.launch_executable, "FortniteLauncher.exe");
    assert_eq!(manifest.app_version, Some("29.10.0".to_string()));

    // 2. Verify DiscoveredGame launch configuration contract
    let expected_uri = format!(
        "com.epicgames.launcher://apps/{}?action=launch&silent=true",
        manifest.app_name
    );
    let launch_config = LaunchConfiguration {
        executable: expected_uri.clone(),
        arguments: vec![],
        working_dir: Some(manifest.install_location.clone()),
        tracking_mode: ProcessTrackingMode::ProcessName(manifest.launch_executable.clone()),
    };

    let discovered = DiscoveredGame {
        library_id: "epic".to_string(),
        external_id: manifest.app_name.clone(),
        title: manifest.display_name.clone(),
        install_dir: Some(manifest.install_location.clone()),
        is_installed: true,
        play_action: Some(launch_config),
        playtime_seconds: 0,
        play_count: 0,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
    };

    assert_eq!(discovered.library_id, "epic");
    assert_eq!(discovered.external_id, "Fortnite");
    assert_eq!(discovered.title, "Fortnite Battle Royale");

    let action = discovered
        .play_action
        .as_ref()
        .expect("Epic game must have a play_action");
    assert_eq!(
        action.executable,
        "com.epicgames.launcher://apps/Fortnite?action=launch&silent=true"
    );
    assert_eq!(
        action.tracking_mode,
        ProcessTrackingMode::ProcessName("FortniteLauncher.exe".to_string())
    );

    // 3. Verify EpicLibraryPlugin file scanner with temporary manifest
    let temp_manifests = std::env::temp_dir().join(format!("epic_test_manifests_{}", Uuid::new_v4()));
    let temp_game_dir = std::env::temp_dir().join(format!("epic_test_game_{}", Uuid::new_v4()));
    std::fs::create_dir_all(&temp_manifests).expect("Failed to create temp manifest dir");
    std::fs::create_dir_all(&temp_game_dir).expect("Failed to create temp game dir");

    // Write dummy launch executable inside game install directory
    let dummy_exe = temp_game_dir.join("Game.exe");
    std::fs::write(&dummy_exe, b"test").expect("Failed to write dummy exe");

    let dynamic_manifest = serde_json::json!({
        "AppName": "CustomEpicGame",
        "DisplayName": "Custom Epic Title",
        "InstallLocation": temp_game_dir.to_string_lossy().to_string(),
        "LaunchExecutable": "Game.exe"
    });

    let item_path = temp_manifests.join("1234567890ABCDEF.item");
    std::fs::write(&item_path, serde_json::to_string_pretty(&dynamic_manifest).unwrap())
        .expect("Failed to write .item file");

    let plugin = EpicLibraryPlugin::with_custom_path(temp_manifests.clone());
    use omnis_sdk::LibraryPlugin;
    let scanned_games = plugin.scan().await.expect("Plugin scan failed");

    assert_eq!(scanned_games.len(), 1);
    let scanned = &scanned_games[0];
    assert_eq!(scanned.library_id, "epic");
    assert_eq!(scanned.external_id, "CustomEpicGame");
    assert_eq!(scanned.title, "Custom Epic Title");
    assert!(scanned.is_installed);
    let scanned_action = scanned.play_action.as_ref().unwrap();
    assert_eq!(
        scanned_action.executable,
        "com.epicgames.launcher://apps/CustomEpicGame?action=launch&silent=true"
    );
    assert_eq!(
        scanned_action.tracking_mode,
        ProcessTrackingMode::ProcessName("Game.exe".to_string())
    );

    // Cleanup temp dirs
    let _ = std::fs::remove_dir_all(&temp_manifests);
    let _ = std::fs::remove_dir_all(&temp_game_dir);
}

/// Test 5: Verifica ricerca candidati metadati (`MetadataCandidateDto`) e arricchimento patch.
#[tokio::test]
async fn test_5_metadata_candidate_dto_and_patch_enrichment() {
    let db = Database::open_in_memory().expect("Failed to create in-memory database");

    // 1. Ingest an un-enriched title
    let initial = DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "1091500".to_string(),
        title: "Cyberpunk 2077".to_string(),
        install_dir: Some(PathBuf::from("C:\\Games\\Cyberpunk 2077")),
        is_installed: true,
        play_action: None,
        playtime_seconds: 0,
        play_count: 0,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
    };
    db.ingest_discovered_batch(&[initial])
        .expect("Failed to ingest game");

    let games = db.get_all_games().expect("Failed to fetch games");
    let target_id = games[0].id;

    // 2. Validate MetadataCandidateDto structure and serialization
    let raw_patch = GameMetadataPatch {
        description: Some("An open-world, action-adventure story set in Night City.".to_string()),
        release_date: Some("2020-12-10".to_string()),
        cover_url: Some("https://cdn.example.com/covers/cyberpunk.jpg".to_string()),
        background_url: Some("https://cdn.example.com/backgrounds/nightcity.jpg".to_string()),
        icon_url: Some("https://cdn.example.com/icons/cp.ico".to_string()),
        critic_score: Some(86),
        community_score: Some(90),
        genres: vec!["Action RPG".to_string(), "Open World".to_string()],
        developers: vec!["CD PROJEKT RED".to_string()],
        publishers: vec!["CD PROJEKT".to_string()],
        tags: vec!["Cyberpunk".to_string(), "Sci-Fi".to_string()],
        extra_metadata: None,
    };

    let candidate = MetadataCandidateDto {
        provider_id: "steam".to_string(),
        provider_game_id: "1091500".to_string(),
        title: "Cyberpunk 2077".to_string(),
        release_year: Some(2020),
        cover_url: Some("https://cdn.example.com/covers/cyberpunk.jpg".to_string()),
        background_url: Some("https://cdn.example.com/backgrounds/nightcity.jpg".to_string()),
        description: Some("An open-world, action-adventure story set in Night City.".to_string()),
        raw_patch: raw_patch.clone(),
    };

    // Verify JSON round-trip for frontend IPC
    let serialized = serde_json::to_string(&candidate).expect("Serialization failed");
    let deserialized: MetadataCandidateDto =
        serde_json::from_str(&serialized).expect("Deserialization failed");
    assert_eq!(deserialized.provider_id, "steam");
    assert_eq!(deserialized.provider_game_id, "1091500");
    assert_eq!(deserialized.title, "Cyberpunk 2077");
    assert_eq!(deserialized.release_year, Some(2020));

    // 3. Apply metadata patch to database
    let applied = db
        .apply_metadata_patch(target_id, &candidate.raw_patch)
        .expect("Failed to apply candidate patch");
    assert!(applied, "apply_metadata_patch should return true");

    // 4. Verify enriched fields in SQLite
    let enriched = db
        .get_game_by_id(target_id)
        .expect("Failed to query DB")
        .expect("Game must exist");

    assert_eq!(
        enriched.description.as_deref(),
        Some("An open-world, action-adventure story set in Night City.")
    );
    assert_eq!(enriched.release_date.as_deref(), Some("2020-12-10"));
    assert_eq!(enriched.critic_score, Some(86));
    assert_eq!(enriched.community_score, Some(90));
    assert_eq!(
        enriched.cover_image_path.as_deref(),
        Some("https://cdn.example.com/covers/cyberpunk.jpg")
    );
    assert_eq!(
        enriched.background_image_path.as_deref(),
        Some("https://cdn.example.com/backgrounds/nightcity.jpg")
    );
    assert_eq!(
        enriched.icon_image_path.as_deref(),
        Some("https://cdn.example.com/icons/cp.ico")
    );
    assert_eq!(enriched.genres, vec!["Action RPG", "Open World"]);
    assert_eq!(enriched.developers, vec!["CD PROJEKT RED"]);
    assert_eq!(enriched.publishers, vec!["CD PROJEKT"]);
    assert_eq!(enriched.tags, vec!["Cyberpunk", "Sci-Fi"]);

    // 5. Test search_candidates pipeline live / cached query
    let downloader = MetadataDownloader::new();
    let candidates_result = downloader.search_candidates("Cyberpunk", Some("steam")).await;
    assert!(
        candidates_result.is_ok(),
        "search_candidates returned error: {:?}",
        candidates_result.err()
    );
    let candidates_list = candidates_result.unwrap();
    assert!(
        !candidates_list.is_empty(),
        "Expected at least one candidate for 'Cyberpunk'"
    );
    let first = &candidates_list[0];
    assert_eq!(first.provider_id, "steam");
    assert!(!first.title.is_empty());
}
