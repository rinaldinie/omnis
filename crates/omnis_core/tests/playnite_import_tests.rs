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
            Features: Some(vec!["Single-player".to_string(), "Achievements".to_string()]),
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
            Features: Some(vec!["Single-player".to_string()]),
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
            Features: None,
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
        Features: None,
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
        Features: None,
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
        Features: None,
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

#[test]
fn test_litedb_bson_parser_and_scanner() {
    use omnis_core::playnite::litedb::{
        is_litedb_buffer, parse_bson_document, scan_litedb_games,
        LITEDB_MAGIC, LITEDB_HEADER_MAGIC_OFFSET,
    };

    // 1. Build a synthetic BSON document
    // doc_len (u32) + elements + 0x00
    let mut bson_body = Vec::new();
    // Element 1: _id (Binary UUID)
    bson_body.push(0x05); // Binary
    bson_body.extend_from_slice(b"_id\0");
    bson_body.extend_from_slice(&16u32.to_le_bytes()); // length 16
    bson_body.push(0x04); // UUID subtype
    let guid_bytes = [
        0x7c, 0x8b, 0xbe, 0xae, 0xc3, 0x6d, 0x66, 0x4a, 0xaf, 0x31, 0xe7, 0x37, 0x5c, 0x6b, 0x5e, 0x9e,
    ]; // aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e (GOG) in .NET bytes_le
    bson_body.extend_from_slice(&guid_bytes);

    // Element 2: Name (String)
    bson_body.push(0x02);
    bson_body.extend_from_slice(b"Name\0");
    let name_str = b"Cyberpunk 2077\0";
    bson_body.extend_from_slice(&(name_str.len() as u32).to_le_bytes());
    bson_body.extend_from_slice(name_str);

    // Element 3: GameId (String)
    bson_body.push(0x02);
    bson_body.extend_from_slice(b"GameId\0");
    let gid_str = b"1091500\0";
    bson_body.extend_from_slice(&(gid_str.len() as u32).to_le_bytes());
    bson_body.extend_from_slice(gid_str);

    // Element 4: PluginId (Binary UUID)
    bson_body.push(0x05);
    bson_body.extend_from_slice(b"PluginId\0");
    bson_body.extend_from_slice(&16u32.to_le_bytes());
    bson_body.push(0x04);
    bson_body.extend_from_slice(&guid_bytes);

    // Element 5: Playtime (Int64)
    bson_body.push(0x12);
    bson_body.extend_from_slice(b"Playtime\0");
    bson_body.extend_from_slice(&7200i64.to_le_bytes());

    // Element 6: PlayCount (Int32)
    bson_body.push(0x10);
    bson_body.extend_from_slice(b"PlayCount\0");
    bson_body.extend_from_slice(&10i32.to_le_bytes());

    // Element 7: Favorite (Bool)
    bson_body.push(0x08);
    bson_body.extend_from_slice(b"Favorite\0");
    bson_body.push(0x01); // true

    // Element 8: CoverImage (String)
    bson_body.push(0x02);
    bson_body.extend_from_slice(b"CoverImage\0");
    let cover_str = b"guid/cover.jpg\0";
    bson_body.extend_from_slice(&(cover_str.len() as u32).to_le_bytes());
    bson_body.extend_from_slice(cover_str);

    // Finalize BSON doc
    let total_doc_len = (4 + bson_body.len() + 1) as u32;
    let mut bson_doc = Vec::new();
    bson_doc.extend_from_slice(&total_doc_len.to_le_bytes());
    bson_doc.extend_from_slice(&bson_body);
    bson_doc.push(0x00); // trailing null

    // Test standalone BSON parser
    let (parsed, consumed) = parse_bson_document(&bson_doc).expect("BSON parse failed");
    assert_eq!(consumed, total_doc_len as usize);
    assert_eq!(parsed.get("Name").unwrap().as_str().unwrap(), "Cyberpunk 2077");
    assert_eq!(parsed.get("Playtime").unwrap().as_u64().unwrap(), 7200);
    assert_eq!(parsed.get("PlayCount").unwrap().as_u64().unwrap(), 10);
    assert_eq!(parsed.get("Favorite").unwrap().as_bool().unwrap(), true);
    assert_eq!(
        parsed.get("PluginId").unwrap().as_guid_string().unwrap(),
        "aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e"
    );

    // 2. Build a synthetic LiteDB buffer (4KB pages)
    let page_size = 4096;
    let mut litedb_buf = vec![0u8; page_size * 3];

    // Page 0: Header
    litedb_buf[4] = 0x01; // PageType Header
    litedb_buf[LITEDB_HEADER_MAGIC_OFFSET..LITEDB_HEADER_MAGIC_OFFSET + LITEDB_MAGIC.len()]
        .copy_from_slice(LITEDB_MAGIC);
    litedb_buf[52] = 7; // Version 7
    litedb_buf[59..63].copy_from_slice(&2u32.to_le_bytes()); // LastPageID = 2

    assert!(is_litedb_buffer(&litedb_buf));

    // Page 1: DataPage (PageType 0x04) containing our BSON doc
    let page1_start = page_size;
    litedb_buf[page1_start + 4] = 0x04; // DataPage
    // Place BSON doc at offset 48 inside DataPage
    let doc_offset = page1_start + 48;
    litedb_buf[doc_offset..doc_offset + bson_doc.len()].copy_from_slice(&bson_doc);

    // Scan games from LiteDB buffer
    let games = scan_litedb_games(&litedb_buf).expect("LiteDB scan failed");
    assert_eq!(games.len(), 1);
    let game = &games[0];
    assert_eq!(game.Name, "Cyberpunk 2077");
    assert_eq!(game.GameId.as_deref(), Some("1091500"));
    assert_eq!(
        game.PluginId.as_deref(),
        Some("aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e")
    );
    assert_eq!(game.PlaytimeSeconds, Some(7200));
    assert_eq!(game.PlayCount, Some(10));
    assert_eq!(game.Favorite, Some(true));
    assert_eq!(game.Cover.as_deref(), Some("guid/cover.jpg"));
}

#[test]
fn test_synthetic_playnite_backup_inspection_and_import() {
    use omnis_core::{
        PlayniteBackupImportOptions, Database,
    };
    use std::path::Path;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    let temp_dir = std::env::temp_dir().join(format!("omnis_backup_test_{}", Uuid::new_v4()));
    fs::create_dir_all(&temp_dir).unwrap();
    let zip_path = temp_dir.join("test_backup.zip");
    let cache_dir = temp_dir.join("image_cache");

    // 1. Create a synthetic LiteDB buffer with 2 games:
    // Game 1: "Portal 2" (GameId: "620", PluginId: Steam, Playtime: 3600, Cover: "p2/cover.jpg")
    // Game 2: "Unknown Game" (GameId: "999", PluginId: Steam, Playtime: 100)
    let page_size = 4096;
    let mut litedb_buf = vec![0u8; page_size * 2];
    litedb_buf[4] = 0x01;
    litedb_buf[25..25 + 27].copy_from_slice(b"** This is a LiteDB file **");
    litedb_buf[52] = 7;
    litedb_buf[59..63].copy_from_slice(&1u32.to_le_bytes());

    // Helper to serialize a game BSON doc
    let make_game_doc = |name: &str, gid: &str, playtime: i64, cover: Option<&str>| -> Vec<u8> {
        let mut body = Vec::new();
        // _id
        body.push(0x05);
        body.extend_from_slice(b"_id\0");
        body.extend_from_slice(&16u32.to_le_bytes());
        body.push(0x04);
        body.extend_from_slice(&[1u8; 16]);

        // Name
        body.push(0x02);
        body.extend_from_slice(b"Name\0");
        let n_bytes = format!("{}\0", name);
        body.extend_from_slice(&(n_bytes.len() as u32).to_le_bytes());
        body.extend_from_slice(n_bytes.as_bytes());

        // GameId
        body.push(0x02);
        body.extend_from_slice(b"GameId\0");
        let g_bytes = format!("{}\0", gid);
        body.extend_from_slice(&(g_bytes.len() as u32).to_le_bytes());
        body.extend_from_slice(g_bytes.as_bytes());

        // PluginId: cb91dfc9-b977-43bf-8e70-55f46e410fab (Steam) in .NET bytes_le
        let steam_le = [
            0xc9, 0xdf, 0x91, 0xcb, 0x77, 0xb9, 0xbf, 0x43, 0x8e, 0x70, 0x55, 0xf4, 0x6e, 0x41, 0x0f, 0xab,
        ];
        body.push(0x05);
        body.extend_from_slice(b"PluginId\0");
        body.extend_from_slice(&16u32.to_le_bytes());
        body.push(0x04);
        body.extend_from_slice(&steam_le);

        // Playtime
        body.push(0x12);
        body.extend_from_slice(b"Playtime\0");
        body.extend_from_slice(&playtime.to_le_bytes());

        // PlayCount
        body.push(0x10);
        body.extend_from_slice(b"PlayCount\0");
        body.extend_from_slice(&5i32.to_le_bytes());

        // Favorite
        body.push(0x08);
        body.extend_from_slice(b"Favorite\0");
        body.push(0x01);

        if let Some(c) = cover {
            body.push(0x02);
            body.extend_from_slice(b"CoverImage\0");
            let c_bytes = format!("{}\0", c);
            body.extend_from_slice(&(c_bytes.len() as u32).to_le_bytes());
            body.extend_from_slice(c_bytes.as_bytes());
        }

        let total_len = (4 + body.len() + 1) as u32;
        let mut doc = Vec::new();
        doc.extend_from_slice(&total_len.to_le_bytes());
        doc.extend_from_slice(&body);
        doc.push(0x00);
        doc
    };

    let doc1 = make_game_doc("Portal 2", "620", 3600, Some("p2/cover.jpg"));
    let doc2 = make_game_doc("Unknown Game", "999", 100, None);

    litedb_buf[4096 + 4] = 0x04; // DataPage
    litedb_buf[4096 + 48..4096 + 48 + doc1.len()].copy_from_slice(&doc1);
    let off2 = 4096 + 48 + doc1.len() + 16;
    litedb_buf[off2..off2 + doc2.len()].copy_from_slice(&doc2);

    // 2. Create the ZIP archive
    {
        let zip_file = fs::File::create(&zip_path).unwrap();
        let mut zip_writer = ZipWriter::new(zip_file);
        let zip_opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        zip_writer.start_file("library/games.db", zip_opts).unwrap();
        zip_writer.write_all(&litedb_buf).unwrap();

        zip_writer.start_file("libraryfiles/p2/cover.jpg", zip_opts).unwrap();
        zip_writer.write_all(b"FAKE_JPEG_DATA_COVER").unwrap();

        zip_writer.finish().unwrap();
    }

    // 3. Setup Omnis Database with only "Portal 2" (playtime 1000, no cover)
    let db = Database::new_in_memory().unwrap();
    db.migrate().unwrap();

    let p2_id = Uuid::new_v4();
    db.insert_custom_game(
        p2_id,
        "Portal 2",
        "portal 2",
        None,
        vec![],
        None,
    ).unwrap();

    // Set store and external id for Portal 2
    {
        let conn = db.writer();
        conn.execute(
            "UPDATE games SET library_id = 'steam', external_id = '620', playtime_seconds = 1000 WHERE id = ?1;",
            rusqlite::params![p2_id.to_string()],
        ).unwrap();
    }

    // 4. Test Inspection
    let inspection = db.inspect_playnite_backup(&zip_path).expect("Inspection failed");
    assert_eq!(inspection.total_games_in_backup, 2);
    assert_eq!(inspection.matching_games_in_library, 1);
    assert_eq!(inspection.non_matching_games, 1);
    assert_eq!(inspection.playtime_updates_available, 1);
    assert_eq!(inspection.missing_covers_available, 1);
    assert_eq!(inspection.sample_matches.len(), 1);
    assert_eq!(inspection.sample_matches[0].title, "Portal 2");
    assert_eq!(inspection.sample_matches[0].existing_playtime_seconds, 1000);
    assert_eq!(inspection.sample_matches[0].backup_playtime_seconds, 3600);
    assert!(inspection.sample_matches[0].cover_available);

    // 5. Test Dry-Run Import
    let dry_options = PlayniteBackupImportOptions {
        image_cache_dir: Some(cache_dir.clone()),
        import_images: true,
        update_playtime: true,
        dry_run: true,
    };
    let dry_stats = db.import_playnite_backup(&zip_path, &dry_options, |_, _, _| {}).unwrap();
    assert_eq!(dry_stats.total_read, 2);
    assert_eq!(dry_stats.games_merged, 1);
    assert_eq!(dry_stats.games_created, 0); // MUST NEVER create new games
    assert_eq!(dry_stats.playtime_updated, 1);
    assert_eq!(dry_stats.images_cached, 1);

    // Verify DB was NOT mutated
    let game = db.get_game_by_id(p2_id).unwrap().unwrap();
    assert_eq!(game.playtime_seconds, 1000);
    assert!(game.cover_image_path.is_none());

    // 6. Test Actual Import
    let live_options = PlayniteBackupImportOptions {
        image_cache_dir: Some(cache_dir.clone()),
        import_images: true,
        update_playtime: true,
        dry_run: false,
    };
    let live_stats = db.import_playnite_backup(&zip_path, &live_options, |_, _, _| {}).unwrap();
    assert_eq!(live_stats.total_read, 2);
    assert_eq!(live_stats.games_merged, 1);
    assert_eq!(live_stats.games_created, 0);
    assert_eq!(live_stats.playtime_updated, 1);
    assert_eq!(live_stats.images_cached, 1);

    // Verify DB WAS updated
    let game_after = db.get_game_by_id(p2_id).unwrap().unwrap();
    assert_eq!(game_after.playtime_seconds, 3600);
    assert_eq!(game_after.play_count, 5);
    assert!(game_after.cover_image_path.is_some());
    let cover_path = game_after.cover_image_path.unwrap();
    assert!(Path::new(&cover_path).exists(), "Extracted cover file must exist");
    assert_eq!(fs::read_to_string(&cover_path).unwrap(), "FAKE_JPEG_DATA_COVER");

    // Verify Unknown Game was NOT inserted into Omnis
    let all_games = db.get_all_games().unwrap();
    assert_eq!(all_games.len(), 1, "Only pre-existing games must be present in library");

    // Cleanup
    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_real_playnite_backup_zip_inspection_if_file_exists() {
    let backup_path = std::path::Path::new("/mnt/d/progetti/omnis/omnis/PlayniteBackup-2026-10-24-10-43-43.zip");
    if !backup_path.exists() {
        eprintln!("Playnite backup file not found, skipping real zip test");
        return;
    }

    use omnis_core::{Database, PlayniteBackupImportOptions};

    let db = Database::new_in_memory().unwrap();
    db.migrate().unwrap();

    // Pre-populate with Frozen Flame Playtest (Steam appid 1948950, which has 1080s playtime in the backup)
    let ff_id = Uuid::new_v4();
    db.insert_custom_game(
        ff_id,
        "Frozen Flame Playtest",
        "frozen flame playtest",
        None,
        vec![],
        None,
    ).unwrap();

    {
        let conn = db.writer();
        conn.execute(
            "UPDATE games SET library_id = 'steam', external_id = '1948950', playtime_seconds = 60 WHERE id = ?1;",
            rusqlite::params![ff_id.to_string()],
        ).unwrap();
    }

    // Inspect real backup
    let inspection = db.inspect_playnite_backup(backup_path).expect("Failed to inspect real backup");
    assert!(inspection.total_games_in_backup >= 1580 && inspection.total_games_in_backup <= 1590);
    assert_eq!(inspection.matching_games_in_library, 1);
    assert_eq!(inspection.non_matching_games, inspection.total_games_in_backup - 1);
    assert_eq!(inspection.playtime_updates_available, 1);
    assert!(inspection.missing_covers_available >= 1);

    // Import real backup
    let temp_cache = std::env::temp_dir().join(format!("omnis_real_cache_{}", Uuid::new_v4()));
    let options = PlayniteBackupImportOptions {
        image_cache_dir: Some(temp_cache.clone()),
        import_images: true,
        update_playtime: true,
        dry_run: false,
    };

    let mut reported_progress = 0;
    let expected_total = inspection.total_games_in_backup;
    let stats = db.import_playnite_backup(backup_path, &options, |curr, total, _name| {
        if curr == total {
            reported_progress = curr;
        }
    }).unwrap();

    assert_eq!(stats.total_read, expected_total);
    assert_eq!(stats.games_merged, 1);
    assert_eq!(stats.games_created, 0);
    assert_eq!(stats.playtime_updated, 1);
    assert_eq!(reported_progress, expected_total);

    // Verify Frozen Flame Playtest playtime was updated to 1080
    let game = db.get_game_by_id(ff_id).unwrap().unwrap();
    assert_eq!(game.playtime_seconds, 1080);
    assert!(game.cover_image_path.is_some());
    let cover_path = game.cover_image_path.unwrap();
    assert!(std::path::Path::new(&cover_path).exists(), "Extracted cover from real backup must exist");

    let _ = fs::remove_dir_all(&temp_cache);
}
