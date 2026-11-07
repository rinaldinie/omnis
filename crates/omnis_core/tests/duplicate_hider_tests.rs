use omnis_core::db::{normalize_title_for_dedup, Database};
use omnis_sdk::DiscoveredGame;

fn create_discovered_game(
    library_id: &str,
    external_id: &str,
    title: &str,
    is_installed: bool,
    playtime_seconds: u64,
) -> DiscoveredGame {
    DiscoveredGame {
        library_id: library_id.to_string(),
        external_id: external_id.to_string(),
        title: title.to_string(),
        install_dir: None,
        is_installed,
        play_action: None,
        playtime_seconds,
        play_count: if playtime_seconds > 0 { 1 } else { 0 },
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
    }
}

#[test]
fn test_title_normalization() {
    // 1. Strips ™, ®, ©, (tm), (r), (c) and punctuation
    assert_eq!(
        normalize_title_for_dedup("Cyberpunk 2077™!", false),
        "cyberpunk 2077"
    );
    assert_eq!(
        normalize_title_for_dedup("Grand Theft Auto®: San Andreas™ (c)", false),
        "grand theft auto san andreas"
    );
    assert_eq!(
        normalize_title_for_dedup("Super Game: Sub-Title — Ultra_Deluxe", false),
        "super game sub title ultra deluxe"
    );

    // 2. Strips edition suffixes when ignore_edition_suffixes is true
    let cases = vec![
        (
            "The Witcher 3: Wild Hunt - Game of the Year Edition",
            "the witcher 3 wild hunt",
        ),
        (
            "The Witcher 3: Wild Hunt GOTY",
            "the witcher 3 wild hunt",
        ),
        (
            "The Witcher 3: Wild Hunt - GOTY Edition",
            "the witcher 3 wild hunt",
        ),
        ("BioShock - Remastered", "bioshock"),
        (
            "Persona 5 Royal - Ultimate Edition",
            "persona 5 royal",
        ),
        ("Death Stranding - Director's Cut", "death stranding"),
        ("Death Stranding - Directors Cut", "death stranding"),
        ("Dishonored - Definitive Edition", "dishonored"),
        ("Skyrim - Anniversary Edition", "skyrim"),
        ("Control - Ultimate Edition", "control"),
        ("The Witcher 3: Wild Hunt - Complete Edition", "the witcher 3 wild hunt"),
        ("Borderlands 2 - GOTY", "borderlands 2"),
    ];

    for (input, expected) in cases {
        assert_eq!(
            normalize_title_for_dedup(input, true),
            expected,
            "Failed stripping suffix for: {input}"
        );
    }

    // 3. When ignore_edition_suffixes is false, suffixes are preserved
    assert_eq!(
        normalize_title_for_dedup("The Witcher 3: Wild Hunt - Game of the Year Edition", false),
        "the witcher 3 wild hunt game of the year edition"
    );

    // 4. Base titles matching across edition variants
    let base = normalize_title_for_dedup("The Witcher 3: Wild Hunt", true);
    let goty = normalize_title_for_dedup("The Witcher 3: Wild Hunt - Game of the Year Edition", true);
    let complete = normalize_title_for_dedup("The Witcher 3: Wild Hunt - Complete Edition", true);
    assert_eq!(base, goty);
    assert_eq!(base, complete);

    // 5. Edge cases: empty string, whitespace only, or titles that are only an edition suffix
    assert_eq!(normalize_title_for_dedup("", true), "");
    assert_eq!(normalize_title_for_dedup("   ", true), "");
    assert_eq!(normalize_title_for_dedup("Remastered", true), "remastered");
    assert_eq!(normalize_title_for_dedup("GOTY", true), "goty");
    assert_eq!(
        normalize_title_for_dedup("Game of the Year Edition", true),
        "game of the year edition"
    );
    assert_eq!(
        normalize_title_for_dedup("Ultimate Edition", true),
        "ultimate edition"
    );
}

#[test]
fn test_duplicate_detection_and_store_priority() {
    let db = Database::open_in_memory().expect("Failed to open DB");

    // Insert copies across Steam, GOG, and Epic
    let batch = vec![
        create_discovered_game("epic", "cp_epic", "Cyberpunk 2077", false, 0),
        create_discovered_game("gog", "cp_gog", "Cyberpunk 2077", false, 0),
        create_discovered_game("steam", "cp_steam", "Cyberpunk 2077®", false, 0),
    ];
    db.ingest_discovered_batch(&batch).expect("Ingest failed");

    let stats = db.recompute_duplicates().expect("Recompute failed");
    assert_eq!(stats.total_groups, 1);
    assert_eq!(stats.hidden_duplicates, 2);

    let games = db.get_all_games().expect("Get all failed");
    let steam_copy = games.iter().find(|g| g.library_id == "steam").unwrap();
    let gog_copy = games.iter().find(|g| g.library_id == "gog").unwrap();
    let epic_copy = games.iter().find(|g| g.library_id == "epic").unwrap();

    // Store priority is Steam (0), GOG (1), Epic (2)
    // Steam copy should win and remain visible
    assert!(!steam_copy.is_hidden, "Steam copy should not be hidden");
    assert!(
        !steam_copy.hidden_by_duplicate_hider,
        "Steam copy should not be flagged hidden_by_duplicate_hider"
    );

    // GOG and Epic copies must be auto-hidden
    assert!(gog_copy.is_hidden, "GOG copy should be hidden");
    assert!(
        gog_copy.hidden_by_duplicate_hider,
        "GOG copy should have hidden_by_duplicate_hider flag"
    );

    assert!(epic_copy.is_hidden, "Epic copy should be hidden");
    assert!(
        epic_copy.hidden_by_duplicate_hider,
        "Epic copy should have hidden_by_duplicate_hider flag"
    );

    // All copies share the same duplicate group id
    let expected_group_id = Some("cyberpunk 2077".to_string());
    assert_eq!(steam_copy.duplicate_group_id, expected_group_id);
    assert_eq!(gog_copy.duplicate_group_id, expected_group_id);
    assert_eq!(epic_copy.duplicate_group_id, expected_group_id);
}

#[test]
fn test_prefer_installed_scoring() {
    let db = Database::open_in_memory().expect("Failed to open DB");

    // Epic copy is installed, Steam copy is uninstalled
    let batch = vec![
        create_discovered_game("epic", "hades_epic", "Hades", true, 0),
        create_discovered_game("steam", "hades_steam", "Hades", false, 0),
    ];
    db.ingest_discovered_batch(&batch).expect("Ingest failed");

    // With prefer_installed = true (default)
    let stats = db.recompute_duplicates().expect("Recompute failed");
    assert_eq!(stats.total_groups, 1);
    assert_eq!(stats.hidden_duplicates, 1);

    let games = db.get_all_games().expect("Get all failed");
    let epic_copy = games.iter().find(|g| g.library_id == "epic").unwrap();
    let steam_copy = games.iter().find(|g| g.library_id == "steam").unwrap();

    // Epic should win because it is installed despite Steam having higher priority
    assert!(
        !epic_copy.is_hidden,
        "Installed Epic copy must remain visible"
    );
    assert!(
        !epic_copy.hidden_by_duplicate_hider,
        "Installed Epic copy must not have hidden_by_duplicate_hider flag"
    );
    assert!(
        steam_copy.is_hidden,
        "Uninstalled Steam copy must be hidden"
    );
    assert!(
        steam_copy.hidden_by_duplicate_hider,
        "Uninstalled Steam copy must have hidden_by_duplicate_hider flag"
    );

    // Now disable prefer_installed: Steam store priority should win
    let mut config = db.get_duplicate_hider_config().expect("Config failed");
    config.prefer_installed = false;
    db.save_duplicate_hider_config(&config)
        .expect("Save config failed");

    db.recompute_duplicates().expect("Recompute 2 failed");

    let games_after = db.get_all_games().expect("Get all failed");
    let epic_after = games_after
        .iter()
        .find(|g| g.library_id == "epic")
        .unwrap();
    let steam_after = games_after
        .iter()
        .find(|g| g.library_id == "steam")
        .unwrap();

    assert!(
        !steam_after.is_hidden,
        "Steam copy should win when prefer_installed is false"
    );
    assert!(epic_after.is_hidden, "Epic copy should be hidden");
}

#[test]
fn test_manual_hide_preservation() {
    let db = Database::open_in_memory().expect("Failed to open DB");

    // Ingest two duplicate copies
    let batch = vec![
        create_discovered_game("steam", "hl2_steam", "Half-Life 2", false, 0),
        create_discovered_game("gog", "hl2_gog", "Half-Life 2", false, 0),
    ];
    db.ingest_discovered_batch(&batch).expect("Ingest failed");

    let games = db.get_all_games().expect("Get all failed");
    let steam_copy = games.iter().find(|g| g.library_id == "steam").unwrap();

    // Manually hide the Steam copy
    let updated = db
        .set_game_hidden(steam_copy.id, true)
        .expect("Manual hide failed");
    assert!(updated.is_hidden);
    assert!(
        !updated.hidden_by_duplicate_hider,
        "Manual hide must have hidden_by_duplicate_hider = false"
    );

    // Recompute duplicates: Steam was manually hidden, so GOG becomes the visible copy
    let stats = db.recompute_duplicates().expect("Recompute failed");
    assert_eq!(stats.total_groups, 1);

    let games_after = db.get_all_games().expect("Get all failed");
    let steam_after = games_after
        .iter()
        .find(|g| g.library_id == "steam")
        .unwrap();
    let gog_after = games_after.iter().find(|g| g.library_id == "gog").unwrap();

    // Manually hidden game must remain hidden with hidden_by_duplicate_hider = false
    assert!(steam_after.is_hidden);
    assert!(!steam_after.hidden_by_duplicate_hider);

    // GOG copy should now be visible
    assert!(!gog_after.is_hidden);
    assert!(!gog_after.hidden_by_duplicate_hider);

    // Now disable duplicate hider completely
    let mut config = db.get_duplicate_hider_config().expect("Config failed");
    config.enabled = false;
    db.save_duplicate_hider_config(&config)
        .expect("Save config failed");

    db.recompute_duplicates().expect("Recompute disabled failed");

    let games_disabled = db.get_all_games().expect("Get all failed");
    let steam_disabled = games_disabled
        .iter()
        .find(|g| g.library_id == "steam")
        .unwrap();
    let gog_disabled = games_disabled
        .iter()
        .find(|g| g.library_id == "gog")
        .unwrap();

    // Crucial check: Disabling duplicate hider must NOT unhide manually hidden games!
    assert!(
        steam_disabled.is_hidden,
        "Manually hidden game must remain hidden even when duplicate hider is disabled"
    );
    assert!(!steam_disabled.hidden_by_duplicate_hider);
    assert!(!gog_disabled.is_hidden);
}

#[test]
fn test_promote_duplicate_copy() {
    let db = Database::open_in_memory().expect("Failed to open DB");

    let batch = vec![
        create_discovered_game("steam", "dc_steam", "Dead Cells", false, 0),
        create_discovered_game("gog", "dc_gog", "Dead Cells", false, 0),
    ];
    db.ingest_discovered_batch(&batch).expect("Ingest failed");

    db.recompute_duplicates().expect("Recompute failed");

    let games = db.get_all_games().expect("Get all failed");
    let steam_copy = games.iter().find(|g| g.library_id == "steam").unwrap();
    let gog_copy = games.iter().find(|g| g.library_id == "gog").unwrap();

    // Steam is visible, GOG is hidden
    assert!(!steam_copy.is_hidden);
    assert!(gog_copy.is_hidden);
    assert!(gog_copy.hidden_by_duplicate_hider);

    // Promote the GOG copy
    let updated_group = db
        .promote_duplicate_copy(gog_copy.id)
        .expect("Promote failed");
    assert_eq!(updated_group.len(), 2);

    let gog_promoted = updated_group
        .iter()
        .find(|g| g.id == gog_copy.id)
        .unwrap();
    let steam_demoted = updated_group
        .iter()
        .find(|g| g.id == steam_copy.id)
        .unwrap();

    assert!(
        !gog_promoted.is_hidden,
        "Promoted copy must become visible"
    );
    assert!(
        !gog_promoted.hidden_by_duplicate_hider,
        "Promoted copy must have hidden_by_duplicate_hider = false"
    );

    assert!(
        steam_demoted.is_hidden,
        "Previously visible copy must become hidden"
    );
    assert!(
        steam_demoted.hidden_by_duplicate_hider,
        "Previously visible copy must have hidden_by_duplicate_hider = true"
    );

    // Verify DB persistence
    let games_db = db.get_all_games().expect("Get all failed");
    let gog_in_db = games_db.iter().find(|g| g.id == gog_copy.id).unwrap();
    let steam_in_db = games_db.iter().find(|g| g.id == steam_copy.id).unwrap();
    assert!(!gog_in_db.is_hidden);
    assert!(steam_in_db.is_hidden);
}

#[test]
fn test_ignored_games_list() {
    let db = Database::open_in_memory().expect("Failed to open DB");

    let batch = vec![
        create_discovered_game("steam", "terraria_steam", "Terraria", false, 0),
        create_discovered_game("gog", "terraria_gog", "Terraria", false, 0),
    ];
    db.ingest_discovered_batch(&batch).expect("Ingest failed");

    let games = db.get_all_games().expect("Get all failed");
    let gog_copy = games.iter().find(|g| g.library_id == "gog").unwrap();

    // Add GOG game ID to ignored_game_ids
    let mut config = db.get_duplicate_hider_config().expect("Config failed");
    config.ignored_game_ids = vec![gog_copy.id.to_string()];
    db.save_duplicate_hider_config(&config)
        .expect("Save config failed");

    let stats = db.recompute_duplicates().expect("Recompute failed");
    // With GOG ignored, there is only 1 game left in the cluster, so 0 groups formed
    assert_eq!(stats.total_groups, 0);
    assert_eq!(stats.hidden_duplicates, 0);

    let games_after = db.get_all_games().expect("Get all failed");
    let gog_after = games_after.iter().find(|g| g.library_id == "gog").unwrap();
    let steam_after = games_after
        .iter()
        .find(|g| g.library_id == "steam")
        .unwrap();

    assert!(
        !gog_after.is_hidden,
        "Ignored game must never be auto-hidden"
    );
    assert!(
        !gog_after.hidden_by_duplicate_hider,
        "Ignored game must not have hidden_by_duplicate_hider flag"
    );
    assert_eq!(
        gog_after.duplicate_group_id, None,
        "Ignored game must have duplicate_group_id = None"
    );

    assert!(!steam_after.is_hidden);
    assert_eq!(
        steam_after.duplicate_group_id, None,
        "Single remaining game must not form a group"
    );
}

#[test]
fn test_library_counts_with_hidden() {
    let db = Database::open_in_memory().expect("Failed to open DB");

    let batch = vec![
        create_discovered_game("steam", "game_1", "Celeste", true, 120),
        create_discovered_game("steam", "game_2_steam", "Hollow Knight", false, 0),
        create_discovered_game("gog", "game_2_gog", "Hollow Knight", false, 0),
        create_discovered_game("steam", "game_3", "Spelunky 2", false, 0),
    ];
    db.ingest_discovered_batch(&batch).expect("Ingest failed");

    // Recompute duplicates: GOG Hollow Knight is hidden by duplicate hider
    db.recompute_duplicates().expect("Recompute failed");

    let games = db.get_all_games().expect("Get all failed");
    let spelunky = games.iter().find(|g| g.title == "Spelunky 2").unwrap();

    // Manually hide Spelunky 2
    db.set_game_hidden(spelunky.id, true)
        .expect("Manual hide failed");

    // Library counts verification:
    // Total in DB = 4
    // Hidden games = 2 (GOG Hollow Knight [auto-hidden] + Spelunky 2 [manually hidden])
    // Visible games = 2 (Celeste [Steam] + Hollow Knight [Steam])
    let counts = db.get_library_counts().expect("Get library counts failed");

    assert_eq!(counts.hidden, 2, "Hidden count should reflect both manual and auto-hidden games");
    assert_eq!(counts.total, 2, "Total count must only include visible games");
    assert_eq!(counts.steam, 2, "Steam count must only include visible Steam games");
    assert_eq!(counts.gog, 0, "GOG count must only include visible GOG games");
    assert_eq!(counts.installed, 1, "Installed count must reflect visible installed games (Celeste)");
}
