//! Amazon Games library, local scanner and cloud store integration plugin for Omnis Game Library.

pub mod client;
pub mod local_scanner;

pub use client::*;
pub use local_scanner::*;

use async_trait::async_trait;
use omnis_sdk::{
    CloudStorePlugin, DiscoveredGame, LibraryPlugin, LogLevel, PluginError, PluginEvent,
    PluginSettingsSchema, ReactivePlugin, SettingField, SettingGroup, SettingType,
    StoreAccountSession,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Plugin identifier constant for Amazon Games
pub const PLUGIN_ID: &str = "amazon";

/// Plugin display name constant for Amazon Games
pub const PLUGIN_NAME: &str = "Amazon Games";

/// Persisted configuration for the Amazon Games plugin
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AmazonGamesConfig {
    /// Optional user-specified paths to SQLite database or game directories
    #[serde(default)]
    pub custom_paths: Vec<PathBuf>,
    /// When true, launches games directly via binary executable instead of amazon-games:// URI
    #[serde(default)]
    pub prefer_direct_launch: bool,
}

/// Amazon Games Library Plugin instance
#[derive(Debug, Clone)]
pub struct AmazonGamesPlugin {
    config: AmazonGamesConfig,
    client: reqwest::Client,
    code_verifier: Arc<Mutex<Option<String>>>,
}

impl Default for AmazonGamesPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl AmazonGamesPlugin {
    pub fn new() -> Self {
        Self {
            config: AmazonGamesConfig::default(),
            client: reqwest::Client::builder()
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
            code_verifier: Arc::new(Mutex::new(None)),
        }
    }

    pub fn with_client(client: reqwest::Client) -> Self {
        Self {
            config: AmazonGamesConfig::default(),
            client,
            code_verifier: Arc::new(Mutex::new(None)),
        }
    }

    pub fn with_config(config: AmazonGamesConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::builder()
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
            code_verifier: Arc::new(Mutex::new(None)),
        }
    }

    pub fn with_custom_paths(custom_paths: Vec<PathBuf>) -> Self {
        Self {
            config: AmazonGamesConfig {
                custom_paths,
                prefer_direct_launch: false,
            },
            client: reqwest::Client::builder()
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
            code_verifier: Arc::new(Mutex::new(None)),
        }
    }

    pub fn with_client_and_paths(client: reqwest::Client, custom_paths: Vec<PathBuf>) -> Self {
        Self {
            config: AmazonGamesConfig {
                custom_paths,
                prefer_direct_launch: false,
            },
            client,
            code_verifier: Arc::new(Mutex::new(None)),
        }
    }

    pub fn with_custom_path(path: PathBuf) -> Self {
        Self::with_custom_paths(vec![path])
    }

    pub fn client(&self) -> &reqwest::Client {
        &self.client
    }

    pub fn set_code_verifier(&self, verifier: String) {
        if let Ok(mut lock) = self.code_verifier.lock() {
            *lock = Some(verifier);
        }
    }

    pub fn get_code_verifier(&self) -> Option<String> {
        self.code_verifier.lock().ok().and_then(|g| g.clone())
    }

    pub fn config(&self) -> &AmazonGamesConfig {
        &self.config
    }

    pub fn config_mut(&mut self) -> &mut AmazonGamesConfig {
        &mut self.config
    }

    pub fn set_prefer_direct_launch(&mut self, prefer: bool) {
        self.config.prefer_direct_launch = prefer;
    }
}

#[async_trait]
impl LibraryPlugin for AmazonGamesPlugin {
    fn id(&self) -> &str {
        PLUGIN_ID
    }

    fn name(&self) -> &str {
        PLUGIN_NAME
    }

    async fn scan(&self) -> Result<Vec<DiscoveredGame>, PluginError> {
        let games = local_scanner::scan_local_games(
            &self.config.custom_paths,
            self.config.prefer_direct_launch,
        );
        tracing::info!("Discovered {} local Amazon Games titles.", games.len());
        Ok(games)
    }
}

#[async_trait]
impl ReactivePlugin for AmazonGamesPlugin {
    fn id(&self) -> &'static str {
        PLUGIN_ID
    }

    fn name(&self) -> &'static str {
        PLUGIN_NAME
    }

    fn settings_schema(&self) -> Option<PluginSettingsSchema> {
        Some(PluginSettingsSchema {
            plugin_id: PLUGIN_ID.to_string(),
            title: "Amazon Games Configuration".to_string(),
            groups: vec![SettingGroup {
                id: "detection".to_string(),
                title: "Local Detection & Launch Settings".to_string(),
                fields: vec![
                    SettingField {
                        key: "custom_path".to_string(),
                        label: "Custom Amazon Games / DataStorage.db Path".to_string(),
                        description: Some(
                            "Override path to DataStorage.db, GameInstall.sqlite, or Amazon Games root directory"
                                .to_string(),
                        ),
                        required: false,
                        field_type: SettingType::Path { is_directory: false },
                    },
                    SettingField {
                        key: "prefer_direct_launch".to_string(),
                        label: "Launch via Direct Executable".to_string(),
                        description: Some(
                            "Launch games directly using their executable binary instead of the amazon-games:// URI scheme"
                                .to_string(),
                        ),
                        required: false,
                        field_type: SettingType::Boolean { default: false },
                    },
                ],
            }],
        })
    }

    async fn initialize(&mut self, config_json: &str) -> Result<(), String> {
        if !config_json.is_empty() && config_json != "{}" {
            if let Ok(cfg) = serde_json::from_str::<AmazonGamesConfig>(config_json) {
                self.config = cfg;
            }
        }
        Ok(())
    }

    async fn handle_event(&mut self, event: PluginEvent) -> Result<Vec<PluginEvent>, String> {
        let mut responses = Vec::new();

        match event {
            PluginEvent::SyncRequested { library_id, .. }
                if library_id == PLUGIN_ID || library_id == "all" =>
            {
                tracing::info!(
                    "Amazon Games: Handling SyncRequested event for '{}'",
                    library_id
                );
                match self.scan().await {
                    Ok(games) => {
                        tracing::info!("Amazon Games: Found {} installed games", games.len());
                        responses.push(PluginEvent::BatchGamesDiscovered {
                            library_id: PLUGIN_ID.to_string(),
                            games,
                        });
                    }
                    Err(e) => {
                        responses.push(PluginEvent::NotificationEmitted {
                            level: LogLevel::Error,
                            message: format!("Amazon Games local scan failed: {}", e),
                        });
                    }
                }
            }
            _ => {}
        }

        Ok(responses)
    }
}

#[async_trait]
impl CloudStorePlugin for AmazonGamesPlugin {
    fn login_url(&self) -> String {
        let verifier = client::generate_code_verifier();
        let challenge = client::compute_code_challenge(&verifier);
        if let Ok(mut lock) = self.code_verifier.lock() {
            *lock = Some(verifier);
        }
        format!("{}{}", client::AMAZON_AUTH_BASE_URL, challenge)
    }

    fn is_redirect_url(&self, url: &str) -> bool {
        url.contains("openid.oa2.authorization_code")
    }

    async fn exchange_code(&self, redirect_url: &str) -> Result<StoreAccountSession, PluginError> {
        let auth_code = client::extract_authorization_code(redirect_url).ok_or_else(|| {
            PluginError::Parse(format!(
                "Impossibile estrarre il parametro openid.oa2.authorization_code dall'URL: {}",
                redirect_url
            ))
        })?;

        let verifier = self
            .code_verifier
            .lock()
            .ok()
            .and_then(|mut guard| guard.take())
            .ok_or_else(|| {
                PluginError::Other(
                    "PKCE code_verifier mancante. Riavviare il login di Amazon Games.".to_string(),
                )
            })?;

        client::exchange_code(&self.client, &auth_code, &verifier).await
    }

    async fn refresh_session(
        &self,
        refresh_token: &str,
    ) -> Result<StoreAccountSession, PluginError> {
        client::refresh_session(&self.client, refresh_token).await
    }

    async fn sync_games(
        &self,
        session: &StoreAccountSession,
    ) -> Result<Vec<DiscoveredGame>, PluginError> {
        client::fetch_user_games(&self.client, &session.access_token).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::fs;
    use std::path::{Path, PathBuf};

    struct TempDir(PathBuf);
    impl TempDir {
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    fn tempdir() -> std::io::Result<TempDir> {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let id = COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let p = std::env::temp_dir().join(format!("omnis_test_amazon_{}_{}_{}", std::process::id(), nanos, id));
        std::fs::create_dir_all(&p)?;
        Ok(TempDir(p))
    }

    #[test]
    fn test_plugin_metadata() {
        let plugin = AmazonGamesPlugin::new();
        assert_eq!(LibraryPlugin::id(&plugin), "amazon");
        assert_eq!(LibraryPlugin::name(&plugin), "Amazon Games");
        assert_eq!(ReactivePlugin::id(&plugin), "amazon");
        assert_eq!(ReactivePlugin::name(&plugin), "Amazon Games");
        assert!(plugin.settings_schema().is_some());
    }

    #[test]
    fn test_extract_games_from_relational_schema() {
        let conn = Connection::open_in_memory().expect("open in memory db");
        conn.execute_batch(
            "CREATE TABLE GameInstall (
                Id TEXT PRIMARY KEY,
                ProductTitle TEXT NOT NULL,
                InstallDirectory TEXT,
                MainExecutable TEXT,
                Installed INTEGER NOT NULL
            );
            INSERT INTO GameInstall (Id, ProductTitle, InstallDirectory, MainExecutable, Installed)
            VALUES ('amzn1.adg.product.123', 'Fallout: New Vegas', 'C:\\Games\\FalloutNV', 'FalloutNV.exe', 1);
            INSERT INTO GameInstall (Id, ProductTitle, InstallDirectory, MainExecutable, Installed)
            VALUES ('amzn1.adg.product.456', 'DOOM Eternal', 'C:\\Games\\DOOMEternal', 'DOOMEternal.exe', 0);",
        )
        .expect("insert test data");

        let records = local_scanner::extract_games_from_connection(&conn);
        assert_eq!(records.len(), 2);

        let fallout = records.iter().find(|r| r.id == "amzn1.adg.product.123").unwrap();
        assert_eq!(fallout.title, "Fallout: New Vegas");
        assert_eq!(fallout.install_dir, Some(PathBuf::from("C:\\Games\\FalloutNV")));
        assert_eq!(fallout.main_executable, Some("FalloutNV.exe".to_string()));
        assert!(fallout.is_installed);

        let doom = records.iter().find(|r| r.id == "amzn1.adg.product.456").unwrap();
        assert_eq!(doom.title, "DOOM Eternal");
        assert!(!doom.is_installed);
    }

    #[test]
    fn test_extract_games_from_keyvalue_schema() {
        let conn = Connection::open_in_memory().expect("open in memory db");
        conn.execute_batch(
            "CREATE TABLE DataStorage (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT INTO DataStorage (key, value)
            VALUES ('prod_1', '{\"Id\": \"amzn1.product.kv1\", \"ProductTitle\": \"The Wolf Among Us\", \"InstallDirectory\": \"C:\\\\Games\\\\Wolf\", \"MainExecutable\": \"Wolf.exe\", \"Installed\": true}');
            INSERT INTO DataStorage (key, value)
            VALUES ('prod_2', '{\"id\": \"amzn1.product.kv2\", \"title\": \"Alien: Isolation\", \"install_dir\": \"C:\\\\Games\\\\Alien\", \"installed\": false}');",
        )
        .expect("insert test data");

        let records = local_scanner::extract_games_from_connection(&conn);
        assert_eq!(records.len(), 2);

        let wolf = records.iter().find(|r| r.id == "amzn1.product.kv1").unwrap();
        assert_eq!(wolf.title, "The Wolf Among Us");
        assert_eq!(wolf.main_executable, Some("Wolf.exe".to_string()));
        assert!(wolf.is_installed);

        let alien = records.iter().find(|r| r.id == "amzn1.product.kv2").unwrap();
        assert_eq!(alien.title, "Alien: Isolation");
        assert!(!alien.is_installed);
    }

    #[test]
    fn test_fuel_json_manifest_parsing() {
        let tmp = tempdir().expect("create temp dir");
        let fuel_content = r#"{
            "Id": "amzn1.adg.product.fueltest",
            "Title": "Test Game With Fuel",
            "Main": {
                "Command": "bin/testgame.exe",
                "WorkingSubdirOverride": "bin",
                "Args": ["-console", "-novid"]
            }
        }"#;

        fs::write(tmp.path().join("fuel.json"), fuel_content).expect("write fuel.json");
        let manifest = local_scanner::parse_fuel_manifest(tmp.path()).expect("parse fuel manifest");

        assert_eq!(manifest.id.as_deref(), Some("amzn1.adg.product.fueltest"));
        assert_eq!(manifest.title.as_deref(), Some("Test Game With Fuel"));

        let main = manifest.main.unwrap();
        assert_eq!(main.command.as_deref(), Some("bin/testgame.exe"));
        assert_eq!(main.working_subdir_override.as_deref(), Some("bin"));
        assert_eq!(main.args, Some(vec!["-console".to_string(), "-novid".to_string()]));
    }

    #[test]
    fn test_build_discovered_game_url_scheme() {
        let record = RawAmazonGameRecord {
            id: "amzn1.adg.product.skyrim".to_string(),
            title: "The Elder Scrolls V: Skyrim".to_string(),
            install_dir: Some(PathBuf::from("C:\\Games\\Skyrim")),
            main_executable: Some("SkyrimSE.exe".to_string()),
            is_installed: true,
            cover_url: None,
        };

        let game = local_scanner::build_discovered_game(record, false);
        assert_eq!(game.library_id, "amazon");
        assert_eq!(game.external_id, "amzn1.adg.product.skyrim");
        assert_eq!(game.title, "The Elder Scrolls V: Skyrim");
        assert!(game.is_installed);

        let action = game.play_action.expect("play_action should be Some");
        assert_eq!(action.executable, "amazon-games://play/amzn1.adg.product.skyrim");
        assert!(action.arguments.is_empty());
        assert_eq!(
            action.tracking_mode,
            omnis_sdk::ProcessTrackingMode::ProcessName("SkyrimSE.exe".to_string())
        );
    }

    #[test]
    fn test_build_discovered_game_direct_launch() {
        let tmp = tempdir().expect("create temp dir");
        let exe_path = tmp.path().join("game.exe");
        fs::write(&exe_path, b"mock binary").expect("write mock exe");

        let record = RawAmazonGameRecord {
            id: "amzn1.adg.product.direct".to_string(),
            title: "Direct Game".to_string(),
            install_dir: Some(tmp.path().to_path_buf()),
            main_executable: Some("game.exe".to_string()),
            is_installed: true,
            cover_url: None,
        };

        let game = local_scanner::build_discovered_game(record, true);
        let action = game.play_action.expect("play_action should be Some");
        assert_eq!(action.executable, exe_path.to_string_lossy().to_string());
        assert_eq!(
            action.tracking_mode,
            omnis_sdk::ProcessTrackingMode::ProcessName("game.exe".to_string())
        );
    }

    #[test]
    fn test_scan_local_games_with_custom_sqlite_db() {
        let tmp = tempdir().expect("create temp dir");
        let db_path = tmp.path().join("DataStorage.db");
        let conn = Connection::open(&db_path).expect("create test sqlite db");

        conn.execute_batch(
            "CREATE TABLE GameInstall (
                Id TEXT PRIMARY KEY,
                ProductTitle TEXT NOT NULL,
                InstallDirectory TEXT,
                MainExecutable TEXT,
                Installed INTEGER NOT NULL
            );
            INSERT INTO GameInstall (Id, ProductTitle, InstallDirectory, MainExecutable, Installed)
            VALUES ('amzn1.adg.product.test_sql', 'Ghostwire: Tokyo', 'C:\\Games\\Ghostwire', 'GWT.exe', 1);",
        )
        .expect("insert test data");
        drop(conn);

        let plugin = AmazonGamesPlugin::with_custom_path(db_path.clone());
        let rt = tokio::runtime::Runtime::new().unwrap();
        let games = rt.block_on(async { plugin.scan().await.expect("scan failed") });

        assert_eq!(games.len(), 1);
        assert_eq!(games[0].library_id, "amazon");
        assert_eq!(games[0].external_id, "amzn1.adg.product.test_sql");
        assert_eq!(games[0].title, "Ghostwire: Tokyo");
        assert!(games[0].is_installed);
    }

    #[test]
    fn test_scan_local_games_with_fuel_directory() {
        let tmp = tempdir().expect("create temp dir");
        let game_dir = tmp.path().join("DeathLoop");
        fs::create_dir_all(&game_dir).expect("create game dir");

        let fuel_content = r#"{
            "Id": "amzn1.adg.product.deathloop",
            "Title": "DEATHLOOP",
            "Main": {
                "Command": "Deathloop.exe"
            }
        }"#;
        fs::write(game_dir.join("fuel.json"), fuel_content).expect("write fuel.json");

        let games = local_scanner::scan_local_games(&[tmp.path().to_path_buf()], false);
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].library_id, "amazon");
        assert_eq!(games[0].external_id, "amzn1.adg.product.deathloop");
        assert_eq!(games[0].title, "DEATHLOOP");
        assert!(games[0].is_installed);
    }

    #[tokio::test]
    async fn test_plugin_initialize_from_json() {
        let mut plugin = AmazonGamesPlugin::new();
        assert!(!plugin.config().prefer_direct_launch);
        assert!(plugin.config().custom_paths.is_empty());

        let json = r#"{"custom_paths": ["C:\\CustomAmazon"], "prefer_direct_launch": true}"#;
        plugin.initialize(json).await.expect("initialize");

        assert!(plugin.config().prefer_direct_launch);
        assert_eq!(plugin.config().custom_paths, vec![PathBuf::from("C:\\CustomAmazon")]);
    }

    #[tokio::test]
    async fn test_reactive_plugin_sync_event() {
        let mut plugin = AmazonGamesPlugin::new();
        let event = PluginEvent::SyncRequested {
            library_id: "amazon".to_string(),
            force_full: false,
        };

        let responses = plugin.handle_event(event).await.expect("handle event");
        assert_eq!(responses.len(), 1);
        match &responses[0] {
            PluginEvent::BatchGamesDiscovered { library_id, .. } => {
                assert_eq!(library_id, "amazon");
            }
            other => panic!("Unexpected event response: {:?}", other),
        }
    }

    #[test]
    fn test_pkce_generation_and_rfc7636() {
        let verifier = client::generate_code_verifier();
        assert_eq!(verifier.len(), 50);
        assert!(verifier.chars().all(|c| c.is_ascii_alphanumeric()));

        // Standard RFC 7636 Appendix B test vector
        let rfc_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let expected_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
        let computed = client::compute_code_challenge(rfc_verifier);
        assert_eq!(computed, expected_challenge);
    }

    #[test]
    fn test_extract_authorization_code_variations() {
        // Standard redirect
        let url1 = "https://www.amazon.com/?openid.oa2.authorization_code=ANCODE12345&openid.mode=id_res";
        assert_eq!(
            client::extract_authorization_code(url1),
            Some("ANCODE12345".to_string())
        );

        // Code as last param
        let url2 = "https://www.amazon.com/callback?foo=bar&openid.oa2.authorization_code=AUTH_SECRET_CODE";
        assert_eq!(
            client::extract_authorization_code(url2),
            Some("AUTH_SECRET_CODE".to_string())
        );

        // URL encoded characters
        let url3 = "https://www.amazon.com/?openid.oa2.authorization_code=AN%2FCODE%2B789%3D";
        assert_eq!(
            client::extract_authorization_code(url3),
            Some("AN/CODE+789=".to_string())
        );

        // Missing authorization code
        let url_err = "https://www.amazon.com/?openid.error=access_denied";
        assert_eq!(client::extract_authorization_code(url_err), None);
    }

    #[test]
    fn test_cloud_store_plugin_login_and_redirect() {
        let plugin = AmazonGamesPlugin::new();

        let login_url = plugin.login_url();
        assert!(login_url.starts_with(client::AMAZON_AUTH_BASE_URL));
        assert!(login_url.contains("openid.oa2.code_challenge="));

        // Check internal verifier was saved
        let verifier = plugin.get_code_verifier().expect("verifier was saved");
        assert_eq!(verifier.len(), 50);

        let challenge = client::compute_code_challenge(&verifier);
        assert!(login_url.ends_with(&challenge));

        // Check redirect detection
        assert!(plugin.is_redirect_url("https://www.amazon.com/?openid.oa2.authorization_code=abc1234"));
        assert!(!plugin.is_redirect_url("https://www.amazon.com/ap/signin?openid.mode=checkid_setup"));
    }

    #[test]
    fn test_device_registration_response_deserialization() {
        let json_nested = r#"{
            "response": {
                "success": {
                    "tokens": {
                        "bearer": {
                            "access_token": "Atnr|test_access_token_123",
                            "refresh_token": "Atnr|test_refresh_token_456",
                            "expires_in": "3600"
                        }
                    },
                    "extensions": {
                        "customer_info": {
                            "user_id": "amzn1.account.TEST123",
                            "name": "Test Gamer",
                            "email": "gamer@example.com"
                        }
                    }
                }
            }
        }"#;

        let parsed: DeviceRegistrationResponse =
            serde_json::from_str(json_nested).expect("deserialize nested response");
        let (bearer, customer) = parsed.extract_bearer_and_customer().expect("extract tokens");
        assert_eq!(bearer.access_token, "Atnr|test_access_token_123");
        assert_eq!(
            bearer.refresh_token,
            Some("Atnr|test_refresh_token_456".to_string())
        );
        assert_eq!(bearer.expires_in, Some(3600));

        let cust = customer.expect("customer info present");
        assert_eq!(cust.user_id, Some("amzn1.account.TEST123".to_string()));
        assert_eq!(cust.name, Some("Test Gamer".to_string()));
        assert_eq!(cust.email, Some("gamer@example.com".to_string()));

        // Also test with integer expires_in
        let json_numeric = r#"{
            "bearer": {
                "access_token": "Atnr|direct_access",
                "refresh_token": "Atnr|direct_refresh",
                "expires_in": 7200
            }
        }"#;
        let parsed_num: DeviceRegistrationResponse =
            serde_json::from_str(json_numeric).expect("deserialize direct numeric");
        let (bearer_num, _) = parsed_num.extract_bearer_and_customer().expect("extract tokens");
        assert_eq!(bearer_num.access_token, "Atnr|direct_access");
        assert_eq!(bearer_num.expires_in, Some(7200));
    }

    #[test]
    fn test_token_refresh_response_deserialization() {
        let json_refresh = r#"{
            "response": {
                "success": {
                    "tokens": {
                        "bearer": {
                            "access_token": "Atnr|new_refreshed_access_token",
                            "refresh_token": "Atnr|rotated_refresh_token",
                            "expires_in": 3600
                        }
                    }
                }
            }
        }"#;

        let parsed: TokenRefreshResponse =
            serde_json::from_str(json_refresh).expect("deserialize refresh response");
        let (access, refresh, exp) = parsed.extract_tokens("orig_refresh").expect("extract tokens");
        assert_eq!(access, "Atnr|new_refreshed_access_token");
        assert_eq!(refresh, "Atnr|rotated_refresh_token");
        assert_eq!(exp, Some(3600));

        // Test fallback when refresh token not returned in response (preserves original)
        let json_no_rot = r#"{
            "access_token": "Atnr|flat_access",
            "expires_in": 1800
        }"#;
        let parsed_flat: TokenRefreshResponse =
            serde_json::from_str(json_no_rot).expect("deserialize flat refresh");
        let (flat_acc, flat_ref, flat_exp) = parsed_flat.extract_tokens("preserved_refresh").unwrap();
        assert_eq!(flat_acc, "Atnr|flat_access");
        assert_eq!(flat_ref, "preserved_refresh");
        assert_eq!(flat_exp, Some(1800));
    }

    #[test]
    fn test_entitlements_response_filtering_and_loot_skip() {
        let json_entitlements = r#"{
            "entitlements": [
                {
                    "id": "entitlement_1",
                    "product": {
                        "id": "amzn1.adg.product.fallout3",
                        "title": "Fallout 3: Game of the Year Edition",
                        "productLine": "Twitch:GameEntitlement",
                        "productDetail": {
                            "boxArtUrl": "https://m.media-amazon.com/images/fallout3.jpg",
                            "detailsUrl": "https://gaming.amazon.com/fallout3"
                        }
                    }
                },
                {
                    "id": "entitlement_2",
                    "product": {
                        "id": "amzn1.adg.loot.apex",
                        "title": "Apex Legends Prime Gaming Bundle",
                        "productLine": "Twitch:FuelEntitlement",
                        "productDetail": {
                            "iconUrl": "https://m.media-amazon.com/images/apex_loot.jpg"
                        }
                    }
                },
                {
                    "id": "entitlement_3",
                    "product": {
                        "id": "amzn1.adg.product.oblivion",
                        "productTitle": "The Elder Scrolls IV: Oblivion GOTY",
                        "productLine": "Twitch:GameEntitlement",
                        "productDetail": {
                            "iconUrl": "https://m.media-amazon.com/images/oblivion.png"
                        }
                    }
                }
            ],
            "nextToken": "page_2_next_token"
        }"#;

        let parsed: EntitlementsResponse =
            serde_json::from_str(json_entitlements).expect("parse entitlements");
        assert_eq!(parsed.entitlements.len(), 3);
        assert_eq!(parsed.next_token, Some("page_2_next_token".to_string()));

        let mut filtered_games = Vec::new();
        for item in parsed.entitlements {
            let product = item.product.unwrap();
            if product.product_line.as_deref() == Some(client::TWITCH_FUEL_ENTITLEMENT) {
                continue;
            }
            let title = if !product.title.trim().is_empty() {
                product.title
            } else {
                product.product_title.unwrap_or_default()
            };
            filtered_games.push((product.id, title));
        }

        assert_eq!(filtered_games.len(), 2);
        assert_eq!(filtered_games[0].0, "amzn1.adg.product.fallout3");
        assert_eq!(filtered_games[0].1, "Fallout 3: Game of the Year Edition");
        assert_eq!(filtered_games[1].0, "amzn1.adg.product.oblivion");
        assert_eq!(filtered_games[1].1, "The Elder Scrolls IV: Oblivion GOTY");
    }

    #[tokio::test]
    async fn test_exchange_code_custom_mock_http() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let base_url = format!("http://127.0.0.1:{}", port);

        let server_task = tokio::spawn(async move {
            for _ in 0..2 {
                if let Ok((mut socket, _)) = listener.accept().await {
                    let mut buf = vec![0u8; 4096];
                    let n = socket.read(&mut buf).await.unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);

                    if req.contains("/auth/register") {
                        assert!(req.contains("AGSLauncher/1.0.0"));
                        assert!(req.contains("MOCK_AUTH_CODE"));
                        assert!(req.contains("MOCK_PKCE_VERIFIER"));

                        let body = serde_json::json!({
                            "response": {
                                "success": {
                                    "tokens": {
                                        "bearer": {
                                            "access_token": "Atnr|mock_access_token_xyz",
                                            "refresh_token": "Atnr|mock_refresh_token_xyz",
                                            "expires_in": 3600
                                        }
                                    },
                                    "extensions": {
                                        "customer_info": {
                                            "user_id": "amzn1.account.MOCK",
                                            "name": "Amazon Gamer",
                                            "email": "gamer@mock.com"
                                        }
                                    }
                                }
                            }
                        }).to_string();

                        let res = format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{}",
                            body.len(),
                            body
                        );
                        let _ = socket.write_all(res.as_bytes()).await;
                    } else if req.contains("/user/profile") {
                        assert!(req.contains("bearer Atnr|mock_access_token_xyz"));
                        let body = serde_json::json!({
                            "user_id": "amzn1.account.MOCK",
                            "name": "Prime Gamer Pro",
                            "email": "gamer@mock.com"
                        }).to_string();

                        let res = format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{}",
                            body.len(),
                            body
                        );
                        let _ = socket.write_all(res.as_bytes()).await;
                    }
                }
            }
        });

        let client = reqwest::Client::new();
        let register_url = format!("{}/auth/register", base_url);
        let profile_url = format!("{}/user/profile", base_url);

        let session = client::exchange_code_custom(
            &client,
            &register_url,
            &profile_url,
            "MOCK_AUTH_CODE",
            "MOCK_PKCE_VERIFIER",
            "MOCK-DEVICE-GUID-1234",
        )
        .await
        .expect("exchange code succeeds");

        assert_eq!(session.store_id, "amazon");
        assert_eq!(session.user_id, "amzn1.account.MOCK");
        assert_eq!(session.username, "Prime Gamer Pro");
        assert_eq!(session.access_token, "Atnr|mock_access_token_xyz");
        assert_eq!(
            session.refresh_token,
            Some("Atnr|mock_refresh_token_xyz".to_string())
        );
        assert!(session.expires_at.is_some());

        let _ = server_task.await;
    }

    #[tokio::test]
    async fn test_refresh_session_custom_mock_http() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let base_url = format!("http://127.0.0.1:{}", port);

        let server_task = tokio::spawn(async move {
            for _ in 0..2 {
                if let Ok((mut socket, _)) = listener.accept().await {
                    let mut buf = vec![0u8; 4096];
                    let n = socket.read(&mut buf).await.unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);

                    if req.contains("/auth/token") {
                        assert!(req.contains("3.0.9495.3"));
                        assert!(req.contains("MOCK_REFRESH_TOKEN"));

                        let body = serde_json::json!({
                            "response": {
                                "success": {
                                    "tokens": {
                                        "bearer": {
                                            "access_token": "Atnr|new_refreshed_tok",
                                            "refresh_token": "Atnr|rotated_ref_tok",
                                            "expires_in": 3600
                                        }
                                    }
                                }
                            }
                        }).to_string();

                        let res = format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{}",
                            body.len(),
                            body
                        );
                        let _ = socket.write_all(res.as_bytes()).await;
                    } else if req.contains("/user/profile") {
                        let body = serde_json::json!({
                            "user_id": "amzn1.account.REFRESHED",
                            "name": "Refreshed User",
                            "email": "user@mock.com"
                        }).to_string();

                        let res = format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{}",
                            body.len(),
                            body
                        );
                        let _ = socket.write_all(res.as_bytes()).await;
                    }
                }
            }
        });

        let client = reqwest::Client::new();
        let token_url = format!("{}/auth/token", base_url);
        let profile_url = format!("{}/user/profile", base_url);

        let session = client::refresh_session_custom(
            &client,
            &token_url,
            &profile_url,
            "MOCK_REFRESH_TOKEN",
        )
        .await
        .expect("refresh succeeds");

        assert_eq!(session.store_id, "amazon");
        assert_eq!(session.user_id, "amzn1.account.REFRESHED");
        assert_eq!(session.username, "Refreshed User");
        assert_eq!(session.access_token, "Atnr|new_refreshed_tok");
        assert_eq!(
            session.refresh_token,
            Some("Atnr|rotated_ref_tok".to_string())
        );

        let _ = server_task.await;
    }

    #[tokio::test]
    async fn test_fetch_user_games_custom_mock_pagination_and_loot() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let base_url = format!("http://127.0.0.1:{}", port);

        let server_task = tokio::spawn(async move {
            // Page 1
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buf = vec![0u8; 4096];
                let n = socket.read(&mut buf).await.unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]);

                assert!(req.contains("com.amazon.animusdistributionservice.entitlement.AnimusEntitlementsService.GetEntitlements"));
                assert!(req.contains("x-amzn-token: Atnr|test_tok"));
                assert!(req.contains("amz-1.0"));

                let body = serde_json::json!({
                    "entitlements": [
                        {
                            "id": "e1",
                            "product": {
                                "id": "amzn1.adg.product.game1",
                                "title": "Morrowind GOTY",
                                "productLine": "Twitch:GameEntitlement",
                                "productDetail": {
                                    "boxArtUrl": "https://images/morrowind.jpg"
                                }
                            }
                        },
                        {
                            "id": "e2",
                            "product": {
                                "id": "amzn1.adg.loot.drop",
                                "title": "Valorant Weapon Skin",
                                "productLine": "Twitch:FuelEntitlement",
                                "productDetail": {}
                            }
                        }
                    ],
                    "nextToken": "token_for_page_2"
                }).to_string();

                let res = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = socket.write_all(res.as_bytes()).await;
            }

            // Page 2
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buf = vec![0u8; 4096];
                let n = socket.read(&mut buf).await.unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]);

                assert!(req.contains("token_for_page_2"));

                let body = serde_json::json!({
                    "entitlements": [
                        {
                            "id": "e3",
                            "product": {
                                "id": "amzn1.adg.product.game2",
                                "title": "Wolfenstein: The New Order",
                                "productLine": "Twitch:GameEntitlement",
                                "productDetail": {
                                    "iconUrl": "https://images/wolfenstein.png"
                                }
                            }
                        }
                    ],
                    "nextToken": null
                }).to_string();

                let res = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = socket.write_all(res.as_bytes()).await;
            }
        });

        let client = reqwest::Client::new();
        let entitlements_url = format!("{}/entitlements", base_url);

        let games = client::fetch_user_games_custom(
            &client,
            &entitlements_url,
            "Atnr|test_tok",
            "MOCK_HW_HASH",
        )
        .await
        .expect("fetch user games succeeds");

        assert_eq!(games.len(), 2);
        assert_eq!(games[0].library_id, "amazon");
        assert_eq!(games[0].external_id, "amzn1.adg.product.game1");
        assert_eq!(games[0].title, "Morrowind GOTY");
        assert!(!games[0].is_installed);
        assert_eq!(
            games[0].play_action.as_ref().unwrap().executable,
            "amazon-games://play/amzn1.adg.product.game1"
        );
        assert_eq!(
            games[0].cover_image_path,
            Some("https://images/morrowind.jpg".to_string())
        );

        assert_eq!(games[1].library_id, "amazon");
        assert_eq!(games[1].external_id, "amzn1.adg.product.game2");
        assert_eq!(games[1].title, "Wolfenstein: The New Order");
        assert!(!games[1].is_installed);
        assert_eq!(
            games[1].play_action.as_ref().unwrap().executable,
            "amazon-games://play/amzn1.adg.product.game2"
        );
        assert_eq!(
            games[1].cover_image_path,
            Some("https://images/wolfenstein.png".to_string())
        );

        let _ = server_task.await;
    }
}
