//! Store Cloud Sync & OAuth Plugins Integration Test Suite
//!
//! Validates:
//! - Test 1 (`test_gog_cloud_plugin_contract_and_normalization`):
//!   GOG Galaxy plugin metadata, OAuth login URL structure, redirect URL detection,
//!   and normalization to DiscoveredGame with protocol handler play action.
//! - Test 2 (`test_xbox_cloud_plugin_contract_and_normalization`):
//!   Xbox / PC Game Pass plugin metadata, OAuth authorize URL, redirect URL detection,
//!   and normalization to DiscoveredGame with ms-windows-store protocol URI.
//! - Test 3 (`test_store_account_session_expiration_buffer`):
//!   StoreAccountSession expiration calculations including 60-second safety buffer.
//! - Test 4 (`test_database_non_destructive_cloud_merge`):
//!   SQLite database ingestion preserving local installation status and install_dir
//!   when merging uninstalled cloud library entries.
//! - Test 5 (`test_database_uninstalled_cloud_game_ingestion`):
//!   Direct ingestion of uninstalled cloud-only games into database and retrieval.

use chrono::Utc;
use omnis_core::Database;
use omnis_plugin_gog::{normalize_gog_game, GogCloudPlugin, GogGameDetails};
use omnis_plugin_xbox::{map_title_to_discovered_game, XboxCloudPlugin, XboxTitleItem};
use omnis_sdk::{
    CloudStorePlugin, DiscoveredGame, LaunchConfiguration, LibraryPlugin, ProcessTrackingMode,
    StoreAccountSession,
};
use std::path::PathBuf;

/// Test 1: Verifies GOG Galaxy Cloud Plugin contracts, login URL, redirect detection, and normalization.
#[test]
fn test_gog_cloud_plugin_contract_and_normalization() {
    let plugin = GogCloudPlugin::new();

    // Verify plugin identification
    assert_eq!(plugin.id(), "gog");
    assert_eq!(plugin.name(), "GOG Galaxy");

    // Verify login URL contains required OAuth parameters
    let login_url = plugin.login_url();
    assert!(
        login_url.contains("client_id=46899977096215655"),
        "login_url must contain GOG client_id 46899977096215655: {}",
        login_url
    );
    assert!(
        login_url.contains("redirect_uri"),
        "login_url must contain redirect_uri parameter: {}",
        login_url
    );

    // Verify redirect URL detection
    assert!(
        plugin.is_redirect_url("https://embed.gog.com/on_login_success?code=MOCK_CODE&origin=client"),
        "Should accept GOG on_login_success redirect callback"
    );
    assert!(
        !plugin.is_redirect_url("https://www.gog.com/games"),
        "Should reject standard GOG storefront URLs"
    );

    // Verify normalization of a GOG game
    let gog_details = GogGameDetails {
        id: 1207658691,
        title: "The Witcher 3: Wild Hunt".to_string(),
        image: Some("//images-3.gog.com/witcher3.jpg".to_string()),
    };

    let discovered = normalize_gog_game(&gog_details);
    assert_eq!(discovered.library_id, "gog");
    assert_eq!(discovered.external_id, "1207658691");
    assert_eq!(discovered.title, "The Witcher 3: Wild Hunt");
    assert!(!discovered.is_installed, "Cloud discovered games must default to is_installed: false");
    assert_eq!(discovered.install_dir, None);
    assert_eq!(
        discovered.cover_image_path,
        Some("https://images-3.gog.com/witcher3.jpg".to_string())
    );

    let play_action = discovered.play_action.expect("DiscoveredGame must provide a play_action");
    assert_eq!(
        play_action.executable,
        "goggalaxy://openGameView/1207658691",
        "GOG play_action executable must target goggalaxy protocol handler"
    );
    assert!(play_action.arguments.is_empty());
}

/// Test 2: Verifies Xbox Live / PC Game Pass Cloud Plugin contracts, login URL, redirect detection, and normalization.
#[test]
fn test_xbox_cloud_plugin_contract_and_normalization() {
    let plugin = XboxCloudPlugin::new();

    // Verify plugin identification
    assert_eq!(plugin.id(), "xbox");
    assert_eq!(plugin.name(), "Xbox / PC Game Pass");

    // Verify login URL contains required Microsoft OAuth client ID
    let login_url = plugin.login_url();
    assert!(
        login_url.contains("client_id=0000000048093EE3"),
        "login_url must contain Microsoft Xbox client ID 0000000048093EE3: {}",
        login_url
    );

    // Verify redirect URL detection
    assert!(
        plugin.is_redirect_url("https://login.live.com/oauth20_desktop.srf#access_token=MOCK_TOKEN&expires_in=3600"),
        "Should accept Microsoft desktop OAuth redirect callback"
    );
    assert!(
        !plugin.is_redirect_url("https://www.xbox.com/games"),
        "Should reject standard Xbox web URLs"
    );

    // Verify normalization of an Xbox title
    let xbox_title = XboxTitleItem {
        title_id: "192837465".to_string(),
        name: "Forza Horizon 5".to_string(),
        r#type: Some("Game".to_string()),
        display_image: Some("https://images-eds.xboxlive.com/image?url=fh5.jpg".to_string()),
        modern_title_id: Some("9NXQXX31PRSF".to_string()),
    };

    let discovered = map_title_to_discovered_game(&xbox_title);
    assert_eq!(discovered.library_id, "xbox");
    assert_eq!(discovered.external_id, "192837465");
    assert_eq!(discovered.title, "Forza Horizon 5");
    assert!(!discovered.is_installed, "Cloud title must default to is_installed: false");
    assert_eq!(discovered.install_dir, None);
    assert_eq!(
        discovered.cover_image_path,
        Some("https://images-eds.xboxlive.com/image?url=fh5.jpg".to_string())
    );

    let play_action = discovered.play_action.expect("DiscoveredGame must provide a play_action");
    assert_eq!(
        play_action.executable,
        "ms-windows-store://pdp/?ProductId=9NXQXX31PRSF",
        "Xbox play_action executable must target ms-windows-store protocol URI"
    );
    assert!(play_action.arguments.is_empty());
}

/// Test 3: Verifies StoreAccountSession expiration logic and the 60-second safety buffer.
#[test]
fn test_store_account_session_expiration_buffer() {
    let now = Utc::now().timestamp();

    // 1. None expiration -> never expires
    let session_no_expiry = StoreAccountSession {
        store_id: "gog".to_string(),
        user_id: "u_100".to_string(),
        username: "PlayerOne".to_string(),
        avatar_url: None,
        access_token: "token_no_expiry".to_string(),
        refresh_token: None,
        expires_at: None,
    };
    assert!(
        !session_no_expiry.is_expired(),
        "Session with expires_at: None must not be considered expired"
    );

    // 2. Expired 10 seconds ago -> is_expired == true
    let session_past = StoreAccountSession {
        store_id: "gog".to_string(),
        user_id: "u_100".to_string(),
        username: "PlayerOne".to_string(),
        avatar_url: None,
        access_token: "token_past".to_string(),
        refresh_token: None,
        expires_at: Some(now - 10),
    };
    assert!(
        session_past.is_expired(),
        "Session expired in the past must return is_expired: true"
    );

    // 3. Expiring in 30 seconds -> within 60-second safety buffer -> is_expired == true
    let session_buffer = StoreAccountSession {
        store_id: "xbox".to_string(),
        user_id: "u_200".to_string(),
        username: "PlayerTwo".to_string(),
        avatar_url: None,
        access_token: "token_buffer".to_string(),
        refresh_token: None,
        expires_at: Some(now + 30),
    };
    assert!(
        session_buffer.is_expired(),
        "Session expiring in 30s must return is_expired: true due to 60s safety buffer"
    );

    // 4. Expiring in 1 hour (3600 seconds) -> is_expired == false
    let session_valid = StoreAccountSession {
        store_id: "xbox".to_string(),
        user_id: "u_200".to_string(),
        username: "PlayerTwo".to_string(),
        avatar_url: None,
        access_token: "token_valid".to_string(),
        refresh_token: None,
        expires_at: Some(now + 3600),
    };
    assert!(
        !session_valid.is_expired(),
        "Session expiring in 3600s must return is_expired: false"
    );
}

/// Test 4: Verifies SQLite non-destructive cloud merge preserving local installation state and install_dir.
#[test]
fn test_database_non_destructive_cloud_merge() {
    let db = Database::new_in_memory().expect("Failed to initialize in-memory database");
    db.migrate().expect("Database migration failed");

    // 1. Ingest locally installed game (e.g. from local file scan)
    let local_game = DiscoveredGame {
        library_id: "gog".to_string(),
        external_id: "12345".to_string(),
        title: "The Witcher 3".to_string(),
        install_dir: Some(PathBuf::from(r"C:\Games\Witcher3")),
        is_installed: true,
        play_action: Some(LaunchConfiguration {
            executable: r"C:\Games\Witcher3\bin\x64\witcher3.exe".to_string(),
            arguments: vec!["-novid".to_string()],
            working_dir: Some(PathBuf::from(r"C:\Games\Witcher3")),
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }),
        playtime_seconds: 0,
        play_count: 0,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
    };

    let count = db
        .ingest_discovered_batch(&[local_game])
        .expect("Failed to ingest local game");
    assert_eq!(count, 1);

    // Verify initial game in DB is installed
    let all_games = db.get_all_games().expect("Failed to fetch games");
    let initial_game = all_games
        .iter()
        .find(|g| g.library_id == "gog" && g.external_id == "12345")
        .expect("Local game not found in database");
    assert!(initial_game.is_installed, "Game should initially be installed");
    assert_eq!(
        initial_game.install_dir,
        Some(PathBuf::from(r"C:\Games\Witcher3"))
    );
    assert_eq!(initial_game.playtime_seconds, 0);
    assert_eq!(initial_game.play_actions.len(), 1);
    assert_eq!(
        initial_game.play_actions[0].executable,
        r"C:\Games\Witcher3\bin\x64\witcher3.exe"
    );

    // 2. Simulate cloud sync of the same title with is_installed: false, updated title, playtime, and cover
    let cloud_game = DiscoveredGame {
        library_id: "gog".to_string(),
        external_id: "12345".to_string(),
        title: "The Witcher 3: Wild Hunt".to_string(),
        install_dir: None,
        is_installed: false,
        play_action: Some(LaunchConfiguration {
            executable: "goggalaxy://openGameView/12345".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }),
        playtime_seconds: 7200,
        play_count: 5,
        last_activity: None,
        cover_image_path: Some("https://images.gog.com/cover.jpg".to_string()),
        background_image_path: None,
    };

    let updated_count = db
        .ingest_discovered_batch(&[cloud_game])
        .expect("Failed to ingest cloud game update");
    assert_eq!(updated_count, 1);

    // 3. Reload game and verify non-destructive merge
    let reloaded_games = db.get_all_games().expect("Failed to reload games");
    let merged_game = reloaded_games
        .iter()
        .find(|g| g.library_id == "gog" && g.external_id == "12345")
        .expect("Merged game not found in database");

    // Local installation state MUST NOT be overwritten by cloud uninstalled status
    assert!(
        merged_game.is_installed,
        "is_installed must remain true after cloud sync (non-destructive merge)"
    );
    assert_eq!(
        merged_game.install_dir,
        Some(PathBuf::from(r"C:\Games\Witcher3")),
        "install_dir must be preserved after cloud sync"
    );

    // Cloud metadata must be updated
    assert_eq!(
        merged_game.title, "The Witcher 3: Wild Hunt",
        "Title should be updated from cloud metadata"
    );
    assert_eq!(
        merged_game.playtime_seconds, 7200,
        "Playtime should be updated from cloud sync"
    );
    assert_eq!(
        merged_game.cover_image_path,
        Some("https://images.gog.com/cover.jpg".to_string()),
        "Cover image path should be enriched from cloud sync"
    );

    // Local play_actions must be preserved
    assert_eq!(
        merged_game.play_actions.len(),
        1,
        "play_actions must have 1 entry preserved"
    );
    assert_eq!(
        merged_game.play_actions[0].executable,
        r"C:\Games\Witcher3\bin\x64\witcher3.exe",
        "Local executable play_action must be preserved over remote cloud protocol URI"
    );
}

/// Test 5: Verifies direct ingestion and retrieval of uninstalled cloud-only games.
#[test]
fn test_database_uninstalled_cloud_game_ingestion() {
    let db = Database::new_in_memory().expect("Failed to initialize in-memory database");
    db.migrate().expect("Database migration failed");

    // Ingest a game known only from remote cloud sync
    let uninstalled_cloud_game = DiscoveredGame {
        library_id: "xbox".to_string(),
        external_id: "9NBLGGH42CFD".to_string(),
        title: "Sea of Thieves".to_string(),
        install_dir: None,
        is_installed: false,
        play_action: Some(LaunchConfiguration {
            executable: "ms-windows-store://pdp/?ProductId=9NBLGGH42CFD".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }),
        playtime_seconds: 1800,
        play_count: 3,
        last_activity: None,
        cover_image_path: Some("https://images-eds.xboxlive.com/image?url=sot.jpg".to_string()),
        background_image_path: None,
    };

    let count = db
        .ingest_discovered_batch(&[uninstalled_cloud_game])
        .expect("Ingestion failed");
    assert_eq!(count, 1);

    // Fetch all games and verify
    let all_games = db.get_all_games().expect("Failed to fetch games");
    let game = all_games
        .iter()
        .find(|g| g.library_id == "xbox" && g.external_id == "9NBLGGH42CFD")
        .expect("Cloud game not found in database");

    assert!(
        !game.is_installed,
        "Uninstalled cloud game must be saved with is_installed: false"
    );
    assert_eq!(game.title, "Sea of Thieves");
    assert_eq!(game.library_id, "xbox");
    assert_eq!(game.external_id, "9NBLGGH42CFD");
    assert_eq!(game.playtime_seconds, 1800);
    assert_eq!(game.install_dir, None);
    assert_eq!(
        game.cover_image_path,
        Some("https://images-eds.xboxlive.com/image?url=sot.jpg".to_string())
    );
}
