//! Steam & Epic Games Store Cloud Sync Integration Tests
//!
//! Validates:
//! - Test 1 (`test_epic_cloud_plugin_contract_and_normalization`):
//!   Epic Games Store plugin metadata, OAuth login URL structure, redirect URL detection,
//!   and normalization of `EpicEntitlement` to `DiscoveredGame` with protocol install action.
//! - Test 2 (`test_steam_cloud_plugin_contract_and_normalization`):
//!   Steam plugin metadata, community login URL, redirect URL detection, session extraction,
//!   and normalization of `SteamApiGameItem` to `DiscoveredGame`.
//! - Test 3 (`test_database_non_destructive_cloud_merge_steam_and_epic`):
//!   SQLite database non-destructive merge ensuring locally installed Steam & Epic games
//!   retain `is_installed: true`, their `install_dir`, and local launch actions when uninstalled
//!   cloud entries are ingested.
//! - Test 4 (`test_database_uninstalled_cloud_games_ingestion`):
//!   Direct ingestion and retrieval of uninstalled cloud-only games for Steam and Epic.

use omnis_core::Database;
use omnis_plugin_epic::{
    client::{normalize_epic_entitlement, EpicEntitlement},
    EpicLibraryPlugin,
};
use omnis_plugin_steam::{
    client::{
        extract_session_from_redirect, is_steam_redirect, map_steam_games_to_discovered,
        SteamApiGameItem,
    },
    SteamPlugin,
};
use omnis_sdk::{
    CloudStorePlugin, DiscoveredGame, LaunchConfiguration, LibraryPlugin, ProcessTrackingMode,
};
use std::path::PathBuf;

/// Test 1: Verifies Epic Games Store Cloud Plugin contracts, login URL, redirect detection, and normalization.
#[test]
fn test_epic_cloud_plugin_contract_and_normalization() {
    let plugin = EpicLibraryPlugin::new();

    // Verify plugin metadata
    assert_eq!(plugin.id(), "epic");
    assert_eq!(plugin.name(), "Epic Games Store");

    // Verify login URL structure
    let login_url = plugin.login_url();
    assert!(
        login_url.contains("34a02cf8f4414e29b15921876da36f9a"),
        "login_url must contain Epic client ID: {}",
        login_url
    );
    assert!(
        login_url.contains("redirectUrl"),
        "login_url must contain redirectUrl parameter: {}",
        login_url
    );

    // Verify redirect URL detection
    assert!(
        plugin.is_redirect_url("https://www.epicgames.com/id/api/redirect?code=MOCK_EXCHANGE_CODE_123"),
        "Should accept Epic redirect callback with code query param"
    );
    assert!(
        plugin.is_redirect_url("https://localhost/launcher/authorized?code=MOCK_AUTH_CODE_123"),
        "Should accept localhost authorized callback with code query param"
    );
    assert!(
        !plugin.is_redirect_url("https://www.epicgames.com/store/en-US/"),
        "Should reject standard Epic storefront URLs"
    );

    // Test normalization of EpicEntitlement
    let entitlement = EpicEntitlement {
        id: "ent_123".to_string(),
        catalog_item_id: Some("cat_456".to_string()),
        entitlement_name: Some("Alan Wake 2".to_string()),
        namespace: Some("sparrow".to_string()),
        grant_date: Some("2024-01-01T00:00:00Z".to_string()),
    };

    let discovered = normalize_epic_entitlement(&entitlement);
    assert_eq!(discovered.library_id, "epic");
    assert_eq!(discovered.external_id, "cat_456");
    assert_eq!(discovered.title, "Alan Wake 2");
    assert!(!discovered.is_installed, "Cloud discovered games must default to is_installed: false");
    assert_eq!(discovered.install_dir, None);

    let play_action = discovered
        .play_action
        .expect("DiscoveredGame must provide a play_action");
    assert_eq!(
        play_action.executable,
        "com.epicgames.launcher://apps/cat_456?action=install",
        "Epic cloud play_action must target launcher install protocol"
    );
    assert_eq!(
        play_action.tracking_mode,
        ProcessTrackingMode::ProcessName("EpicGamesLauncher.exe".to_string()),
        "Tracking mode must be ProcessName('EpicGamesLauncher.exe')"
    );
    assert!(play_action.arguments.is_empty());
}

/// Test 2: Verifies Steam Cloud Plugin contracts, login URL, redirect detection, session extraction, and normalization.
#[test]
fn test_steam_cloud_plugin_contract_and_normalization() {
    let plugin = SteamPlugin::new();

    // Verify plugin metadata
    assert_eq!(plugin.id(), "steam");
    assert_eq!(plugin.name(), "Steam");

    // Verify login URL structure
    let login_url = plugin.login_url();
    assert!(
        login_url.contains("steamcommunity.com") && login_url.contains("login"),
        "login_url must direct to steamcommunity.com login endpoint: {}",
        login_url
    );

    // Verify redirect URL detection
    assert!(
        is_steam_redirect("https://steamcommunity.com/profiles/76561198000000000/games?xml=1"),
        "Should accept Steam community profiles games XML redirect"
    );
    assert!(
        is_steam_redirect("https://steamcommunity.com/id/mycustomvanity/games?xml=1"),
        "Should accept Steam community vanity URL games XML redirect"
    );
    assert!(
        is_steam_redirect("https://omnis.app/auth/steam?openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.mode=id_res&openid.claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000000"),
        "Should accept Steam OpenID redirect callback"
    );
    assert!(
        !is_steam_redirect("https://steamcommunity.com/my/games?xml=1"),
        "Must NOT prematurely intercept intermediate /my/ path before Steam resolves profile"
    );
    assert!(
        !is_steam_redirect("https://store.steampowered.com/"),
        "Should reject Steam storefront URL"
    );

    // Test session extraction from redirect URL with SteamID64
    let session = extract_session_from_redirect(
        "https://steamcommunity.com/profiles/76561198000000000/games?xml=1",
    )
    .expect("Should extract session from profile redirect");
    assert_eq!(session.store_id, "steam");
    assert_eq!(session.user_id, "76561198000000000");

    // Test mapping of SteamApiGameItem to DiscoveredGame
    let steam_items = vec![SteamApiGameItem {
        appid: 1091500,
        name: Some("Cyberpunk 2077".to_string()),
        playtime_forever: Some(120),
        rtime_last_played: None,
        img_icon_url: None,
    }];

    let discovered_games = map_steam_games_to_discovered(steam_items);
    assert_eq!(discovered_games.len(), 1);

    let game = &discovered_games[0];
    assert_eq!(game.library_id, "steam");
    assert_eq!(game.external_id, "1091500");
    assert_eq!(game.title, "Cyberpunk 2077");
    assert!(!game.is_installed, "Cloud discovered games must default to is_installed: false");
    assert_eq!(game.install_dir, None);
    assert_eq!(game.playtime_seconds, 120 * 60);

    let play_action = game
        .play_action
        .as_ref()
        .expect("DiscoveredGame must provide a play_action");
    assert_eq!(
        play_action.executable,
        "steam://install/1091500",
        "Steam cloud play_action must target steam install protocol"
    );

    assert_eq!(
        game.cover_image_path,
        Some("https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/library_600x900_2x.jpg".to_string()),
        "Cover image must target Cloudflare Steam CDN vertical capsule image"
    );
    assert_eq!(
        game.background_image_path,
        Some("https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1091500/library_hero.jpg".to_string()),
        "Background image must target Cloudflare Steam CDN header banner image"
    );
}

/// Test 3: Verifies non-destructive SQLite database merge for Steam and Epic when syncing cloud catalogs.
#[test]
fn test_database_non_destructive_cloud_merge_steam_and_epic() {
    let db = Database::new_in_memory().expect("Failed to initialize in-memory database");
    db.migrate().expect("Database migration failed");

    // 1) Ingest locally installed Steam game
    let steam_local = DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "730".to_string(),
        title: "Counter-Strike 2".to_string(),
        install_dir: Some(PathBuf::from(r"C:\Steam\CS2")),
        is_installed: true,
        play_action: Some(LaunchConfiguration {
            executable: "steam://rungameid/730".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::ProcessName("cs2.exe".to_string()),
        }),
        playtime_seconds: 5000,
        play_count: 10,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
    };

    // 2) Ingest locally installed Epic game
    let epic_local = DiscoveredGame {
        library_id: "epic".to_string(),
        external_id: "Sugar".to_string(),
        title: "Fortnite".to_string(),
        install_dir: Some(PathBuf::from(r"C:\Epic\Fortnite")),
        is_installed: true,
        play_action: Some(LaunchConfiguration {
            executable: "com.epicgames.launcher://apps/Sugar?action=launch&silent=true".to_string(),
            arguments: vec![],
            working_dir: Some(PathBuf::from(r"C:\Epic\Fortnite")),
            tracking_mode: ProcessTrackingMode::ProcessName("FortniteClient-Win64-Shipping.exe".to_string()),
        }),
        playtime_seconds: 3600,
        play_count: 4,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
    };

    let count = db
        .ingest_discovered_batch(&[steam_local, epic_local])
        .expect("Failed to ingest local games");
    assert_eq!(count, 2);

    // 3) Simulate a cloud sync (is_installed: false and install_dir: None for both)
    let steam_cloud_game = DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "730".to_string(),
        title: "Counter-Strike 2".to_string(),
        install_dir: None,
        is_installed: false,
        play_action: Some(LaunchConfiguration {
            executable: "steam://install/730".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::ProcessName("steam.exe".to_string()),
        }),
        playtime_seconds: 12000,
        play_count: 15,
        last_activity: None,
        cover_image_path: Some("https://cdn.cloudflare.steamstatic.com/steam/apps/730/library_600x900_2x.jpg".to_string()),
        background_image_path: Some("https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/730/library_hero.jpg".to_string()),
    };

    let epic_cloud_game = DiscoveredGame {
        library_id: "epic".to_string(),
        external_id: "Sugar".to_string(),
        title: "Fortnite".to_string(),
        install_dir: None,
        is_installed: false,
        play_action: Some(LaunchConfiguration {
            executable: "com.epicgames.launcher://apps/Sugar?action=install".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::ProcessName("EpicGamesLauncher.exe".to_string()),
        }),
        playtime_seconds: 7200,
        play_count: 8,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
    };

    // 4) Execute db.ingest_discovered_batch
    let updated_count = db
        .ingest_discovered_batch(&[steam_cloud_game, epic_cloud_game])
        .expect("Failed to ingest cloud batch");
    assert_eq!(updated_count, 2);

    // 5) Reload games from DB and verify non-destructive preservation
    let all_games = db.get_all_games().expect("Failed to reload games");

    let steam_reloaded = all_games
        .iter()
        .find(|g| g.library_id == "steam" && g.external_id == "730")
        .expect("Steam game not found in database");
    let epic_reloaded = all_games
        .iter()
        .find(|g| g.library_id == "epic" && g.external_id == "Sugar")
        .expect("Epic game not found in database");

    // is_installed must strictly remain true
    assert!(
        steam_reloaded.is_installed,
        "Steam game is_installed must remain true after cloud sync"
    );
    assert!(
        epic_reloaded.is_installed,
        "Epic game is_installed must remain true after cloud sync"
    );

    // install_dir must remain intact
    assert_eq!(
        steam_reloaded.install_dir,
        Some(PathBuf::from(r"C:\Steam\CS2")),
        "Steam install_dir must remain intact after cloud sync"
    );
    assert_eq!(
        epic_reloaded.install_dir,
        Some(PathBuf::from(r"C:\Epic\Fortnite")),
        "Epic install_dir must remain intact after cloud sync"
    );

    // Local play_actions must be preserved over remote cloud install action
    assert_eq!(
        steam_reloaded.play_actions.len(),
        1,
        "Steam game must preserve exactly 1 play_action"
    );
    assert_eq!(
        steam_reloaded.play_actions[0].executable,
        "steam://rungameid/730",
        "play_actions for Steam must preserve local launch command 'steam://rungameid/730' and not overwrite with 'steam://install/...'"
    );

    // Enriched metadata from cloud
    assert_eq!(steam_reloaded.playtime_seconds, 12000);
    assert_eq!(steam_reloaded.play_count, 15);
    assert_eq!(
        steam_reloaded.cover_image_path,
        Some("https://cdn.cloudflare.steamstatic.com/steam/apps/730/library_600x900_2x.jpg".to_string())
    );

    assert_eq!(epic_reloaded.playtime_seconds, 7200);
    assert_eq!(epic_reloaded.play_count, 8);
}

/// Test 4: Verifies direct ingestion of cloud-only uninstalled games for Steam and Epic.
#[test]
fn test_database_uninstalled_cloud_games_ingestion() {
    let db = Database::new_in_memory().expect("Failed to initialize in-memory database");
    db.migrate().expect("Database migration failed");

    // Cloud-only uninstalled Steam game
    let steam_uninstalled = DiscoveredGame {
        library_id: "steam".to_string(),
        external_id: "1091500".to_string(),
        title: "Cyberpunk 2077".to_string(),
        install_dir: None,
        is_installed: false,
        play_action: Some(LaunchConfiguration {
            executable: "steam://install/1091500".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::ProcessName("steam.exe".to_string()),
        }),
        playtime_seconds: 7200,
        play_count: 5,
        last_activity: None,
        cover_image_path: Some("https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/library_600x900_2x.jpg".to_string()),
        background_image_path: Some("https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1091500/library_hero.jpg".to_string()),
    };

    // Cloud-only uninstalled Epic game
    let epic_uninstalled = DiscoveredGame {
        library_id: "epic".to_string(),
        external_id: "cat_456".to_string(),
        title: "Alan Wake 2".to_string(),
        install_dir: None,
        is_installed: false,
        play_action: Some(LaunchConfiguration {
            executable: "com.epicgames.launcher://apps/cat_456?action=install".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::ProcessName("EpicGamesLauncher.exe".to_string()),
        }),
        playtime_seconds: 0,
        play_count: 0,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
    };

    let count = db
        .ingest_discovered_batch(&[steam_uninstalled, epic_uninstalled])
        .expect("Failed to ingest uninstalled cloud games");
    assert_eq!(count, 2);

    let all_games = db.get_all_games().expect("Failed to fetch games");
    assert_eq!(all_games.len(), 2);

    let steam_game = all_games
        .iter()
        .find(|g| g.library_id == "steam" && g.external_id == "1091500")
        .expect("Steam game missing from database");
    let epic_game = all_games
        .iter()
        .find(|g| g.library_id == "epic" && g.external_id == "cat_456")
        .expect("Epic game missing from database");

    assert!(
        !steam_game.is_installed,
        "Steam cloud-only game must have is_installed: false"
    );
    assert_eq!(steam_game.install_dir, None);
    assert_eq!(steam_game.title, "Cyberpunk 2077");
    assert_eq!(steam_game.playtime_seconds, 7200);

    assert!(
        !epic_game.is_installed,
        "Epic cloud-only game must have is_installed: false"
    );
    assert_eq!(epic_game.install_dir, None);
    assert_eq!(epic_game.title, "Alan Wake 2");
    assert_eq!(epic_game.playtime_seconds, 0);
}
