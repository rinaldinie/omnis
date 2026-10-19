use omnis_core::{
    export_csharp_script, map_playnite_plugin_id, Database, PlayniteGameDto, PlayniteImportOptions,
};
use omnis_sdk::{DiscoveredGame, LaunchConfiguration, ProcessTrackingMode};
use std::fs;
use uuid::Uuid;

#[test]
fn test_playnite_csharp_export_script_present() {
    let script = export_csharp_script();
    assert!(script.contains("Playnite.SDK"));
    assert!(script.contains("GenericPlugin"));
    assert!(script.contains("PlayniteApi.Database.Games"));
    assert!(script.contains("PlaytimeSeconds = g.Playtime"));
    assert!(script.contains("JsonConvert.SerializeObject"));
}

#[test]
fn test_playnite_guid_mappings() {
    assert_eq!(
        map_playnite_plugin_id(Some("cb91aec9-6843-410e-a02b-a64c48325983")),
        "steam"
    );
    assert_eq!(
        map_playnite_plugin_id(Some("CB91AEC9-6843-410E-A02B-A64C48325983")),
        "steam"
    );
    assert_eq!(
        map_playnite_plugin_id(Some("aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e")),
        "gog"
    );
    assert_eq!(
        map_playnite_plugin_id(Some("00000002-dbd1-46c6-b5d0-b1cb55d14e34")),
        "epic"
    );
    assert_eq!(
        map_playnite_plugin_id(Some("7e4fbb5e-2304-4c2c-9721-402f4586f6a7")),
        "xbox"
    );
    assert_eq!(
        map_playnite_plugin_id(Some("b5199324-4061-4613-9f4c-1e24749f57d6")),
        "xbox"
    );
    assert_eq!(
        map_playnite_plugin_id(Some("85dd7072-76de-42bc-9c2b-000e60e4e843")),
        "origin"
    );
    assert_eq!(
        map_playnite_plugin_id(Some("c2f038e5-8b92-4877-9163-0d6e1fa20322")),
        "ubisoft"
    );
    assert_eq!(
        map_playnite_plugin_id(Some("e3c26a3d-dce2-4bb7-9ec7-300e12361115")),
        "battlenet"
    );
    assert_eq!(
        map_playnite_plugin_id(Some("00000001-ebb0-4663-8a98-3b94e39b52a8")),
        "itch"
    );
    assert_eq!(
        map_playnite_plugin_id(Some("4029fdd1-eb23-4e4b-9e58-690a9a4b85c2")),
        "amazon"
    );
    assert_eq!(
        map_playnite_plugin_id(Some("00000000-0000-0000-0000-000000000000")),
        "manual"
    );
    assert_eq!(map_playnite_plugin_id(None), "manual");
    assert_eq!(map_playnite_plugin_id(Some("random-unrecognized-guid")), "manual");
}

#[test]
fn test_dry_run_does_not_mutate_database() {
    let db = Database::new_in_memory().expect("In-memory DB creation failed");
    db.migrate().expect("DB migration failed");

    let items = vec![
        PlayniteGameDto {
            Name: "Hades II".to_string(),
            GameId: Some("1145350".to_string()),
            PluginId: Some("cb91aec9-6843-410e-a02b-a64c48325983".to_string()),
            PlaytimeSeconds: Some(4200),
            PlayCount: Some(15),
            LastActivity: Some("2026-10-15T12:00:00Z".to_string()),
            Added: Some("2026-05-01T00:00:00Z".to_string()),
            Favorite: Some(true),
            Hidden: Some(false),
            Tags: Some(vec!["Roguelike".to_string(), "Action".to_string()]),
            Categories: Some(vec!["Top Games".to_string()]),
            Completion: Some("Played".to_string()),
            InstallDirectory: Some("C:\\Games\\Hades2".to_string()),
            Cover: None,
            Background: None,
        },
    ];

    let options = PlayniteImportOptions {
        dry_run: true,
        image_cache_dir: None,
    };

    let stats = db.import_playnite_games(&items, &options).expect("Dry run import failed");
    assert_eq!(stats.total_read, 1);
    assert_eq!(stats.games_created, 1);

    // Verify DB remains completely empty!
    let count = db.count_games().expect("count_games failed");
    assert_eq!(count, 0, "Dry-run mode must NOT modify the database");
}

#[test]
fn test_playnite_import_and_idempotency() {
    let db = Database::new_in_memory().expect("In-memory DB creation failed");
    db.migrate().expect("DB migration failed");

    let items = vec![
        PlayniteGameDto {
            Name: "The Witcher 3".to_string(),
            GameId: Some("witcher-3-wild-hunt".to_string()),
            PluginId: Some("aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e".to_string()),
            PlaytimeSeconds: Some(3600),
            PlayCount: Some(5),
            LastActivity: Some("2026-10-10T18:00:00Z".to_string()),
            Added: Some("2026-01-01T00:00:00Z".to_string()),
            Favorite: Some(true),
            Hidden: Some(false),
            Tags: Some(vec!["RPG".to_string(), "Fantasy".to_string()]),
            Categories: Some(vec!["Masterpieces".to_string()]),
            Completion: Some("Completed".to_string()),
            InstallDirectory: Some("C:\\GOG Games\\The Witcher 3".to_string()),
            Cover: None,
            Background: None,
        },
        PlayniteGameDto {
            Name: "Celeste".to_string(),
            GameId: Some("celeste".to_string()),
            PluginId: Some("00000000-0000-0000-0000-000000000000".to_string()), // Manual custom game
            PlaytimeSeconds: Some(7200),
            PlayCount: Some(20),
            LastActivity: None,
            Added: None,
            Favorite: Some(false),
            Hidden: Some(false),
            Tags: Some(vec!["Platformer".to_string(), "Indie".to_string()]),
            Categories: None,
            Completion: Some("Played".to_string()),
            InstallDirectory: None,
            Cover: None,
            Background: None,
        },
    ];

    let options = PlayniteImportOptions {
        dry_run: false,
        image_cache_dir: None,
    };

    // Run 1: First import
    let stats1 = db.import_playnite_games(&items, &options).expect("First import failed");
    assert_eq!(stats1.total_read, 2);
    assert_eq!(stats1.games_created, 2);
    assert_eq!(stats1.games_merged, 0);

    let games = db.get_all_games().expect("get_all_games failed");
    assert_eq!(games.len(), 2);
    let witcher = games.iter().find(|g| g.title == "The Witcher 3").unwrap();
    assert_eq!(witcher.library_id, "gog");
    assert_eq!(witcher.playtime_seconds, 3600);
    assert!(witcher.is_installed);

    let celeste = games.iter().find(|g| g.title == "Celeste").unwrap();
    assert_eq!(celeste.library_id, "manual");
    assert_eq!(celeste.playtime_seconds, 7200);

    // Run 2: Re-import exact same payload (Idempotency test)
    let stats2 = db.import_playnite_games(&items, &options).expect("Second import failed");
    assert_eq!(stats2.total_read, 2);
    assert_eq!(stats2.games_created, 0, "Re-running import must NOT create duplicates");
    assert_eq!(stats2.games_merged, 2, "Re-running import should merge existing games");

    // Total games in DB must still be exactly 2
    let games_after = db.get_all_games().expect("get_all_games failed");
    assert_eq!(games_after.len(), 2, "Database must not contain duplicated games");

    // Playtime must NOT be doubled!
    let witcher_after = games_after.iter().find(|g| g.title == "The Witcher 3").unwrap();
    assert_eq!(witcher_after.playtime_seconds, 3600, "Playtime must NOT be doubled on re-import");
}

#[test]
fn test_playtime_merge_with_historical_sessions() {
    let db = Database::new_in_memory().expect("In-memory DB creation failed");
    db.migrate().expect("DB migration failed");

    // Game already scanned/synchronized in Omnis with 1800s playtime
    let disc = DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "730".to_string(),
        title: "Counter-Strike 2".to_string(),
        install_dir: None,
        is_installed: true,
        playtime_seconds: 1800,
        play_count: 2,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
        play_action: Some(LaunchConfiguration {
            executable: "cs2.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::ProcessName("cs2.exe".to_string()),
        }),
    };
    db.ingest_discovered_batch(&[disc]).expect("Ingest failed");

    let game = db.get_all_games().unwrap().into_iter().next().unwrap();

    // Record an active play session in Omnis historical sessions
    let now = chrono::Utc::now();
    db.record_play_session(game.id, 1800, now - chrono::Duration::seconds(1800), now)
        .expect("Record play session failed");

    // 1. Playnite import with lower playtime (1200s) when Omnis already has sessions
    let playnite_lower = vec![PlayniteGameDto {
        Name: "Counter-Strike 2".to_string(),
        GameId: Some("730".to_string()),
        PluginId: Some("cb91aec9-6843-410e-a02b-a64c48325983".to_string()),
        PlaytimeSeconds: Some(1200),
        PlayCount: Some(2),
        LastActivity: None,
        Added: None,
        Favorite: None,
        Hidden: None,
        Tags: None,
        Categories: None,
        Completion: None,
        InstallDirectory: None,
        Cover: None,
        Background: None,
    }];

    let options = PlayniteImportOptions::default();
    db.import_playnite_games(&playnite_lower, &options).expect("Import lower playtime failed");

    let game_after_lower = db.get_game_by_id(game.id).unwrap().unwrap();
    // Playtime was 3600 (1800 initial + 1800 from session). Must not downgrade to 1200!
    assert!(game_after_lower.playtime_seconds >= 3600);

    // 2. Playnite import with higher playtime (10000s)
    let playnite_higher = vec![PlayniteGameDto {
        Name: "Counter-Strike 2".to_string(),
        GameId: Some("730".to_string()),
        PluginId: Some("cb91aec9-6843-410e-a02b-a64c48325983".to_string()),
        PlaytimeSeconds: Some(10000),
        PlayCount: Some(50),
        LastActivity: None,
        Added: None,
        Favorite: None,
        Hidden: None,
        Tags: None,
        Categories: None,
        Completion: None,
        InstallDirectory: None,
        Cover: None,
        Background: None,
    }];

    let stats_higher = db.import_playnite_games(&playnite_higher, &options).expect("Import higher playtime failed");
    assert_eq!(stats_higher.playtime_updated, 1);

    let game_after_higher = db.get_game_by_id(game.id).unwrap().unwrap();
    assert_eq!(game_after_higher.playtime_seconds, 10000, "Conflict must adopt the higher playtime");
}

#[test]
fn test_image_caching_on_import() {
    let db = Database::new_in_memory().expect("In-memory DB creation failed");
    db.migrate().expect("DB migration failed");

    let temp_src = std::env::temp_dir().join(format!("omnis_src_{}", Uuid::new_v4()));
    fs::create_dir_all(&temp_src).expect("Failed to create temp src dir");
    let cover_file = temp_src.join("mock_cover.png");
    fs::write(&cover_file, b"FAKE_PNG_IMAGE_BYTES").expect("Failed to write mock image");

    let temp_cache = std::env::temp_dir().join(format!("omnis_cache_{}", Uuid::new_v4()));
    let options = PlayniteImportOptions {
        dry_run: false,
        image_cache_dir: Some(temp_cache.clone()),
    };

    let items = vec![PlayniteGameDto {
        Name: "Portal 2".to_string(),
        GameId: Some("620".to_string()),
        PluginId: Some("cb91aec9-6843-410e-a02b-a64c48325983".to_string()),
        PlaytimeSeconds: Some(1500),
        PlayCount: Some(3),
        LastActivity: None,
        Added: None,
        Favorite: None,
        Hidden: None,
        Tags: None,
        Categories: None,
        Completion: None,
        InstallDirectory: None,
        Cover: Some(cover_file.to_string_lossy().to_string()),
        Background: None,
    }];

    let stats = db.import_playnite_games(&items, &options).expect("Import failed");
    assert_eq!(stats.images_cached, 1);

    let games = db.get_all_games().unwrap();
    let portal = games.into_iter().find(|g| g.title == "Portal 2").unwrap();
    assert!(portal.cover_image_path.is_some());
    let saved_path = portal.cover_image_path.unwrap();
    assert!(saved_path.contains("_cover.png"));
    assert!(std::path::Path::new(&saved_path).exists(), "Cached image file must exist on disk");

    let _ = fs::remove_dir_all(&temp_src);
    let _ = fs::remove_dir_all(&temp_cache);
}
