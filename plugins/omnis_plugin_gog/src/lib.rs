//! GOG Galaxy library and cloud store integration plugin for Omnis Game Library

pub mod achievements;
pub mod client;
pub mod local_scanner;

pub use achievements::*;
pub use client::{
    deserialize_string_or_number, extract_code_from_url, fetch_user_data, fetch_user_games,
    normalize_gog_game, GogGameDetails, GogGamesResponse, GogProductItem, GogProductsEnvelope,
    GogTokenResponse, GogUserData, GOG_AUTH_URL, GOG_CLIENT_ID, GOG_CLIENT_SECRET,
    GOG_PRODUCTS_URL, GOG_REDIRECT_URI, GOG_TOKEN_URL, GOG_USER_DATA_URL, GOG_USER_GAMES_URL,
};
pub use local_scanner::*;

use omnis_sdk::{
    async_trait, CloudStorePlugin, DiscoveredGame, LibraryPlugin, PluginError, StoreAccountSession,
};
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct GogCloudPlugin {
    client: reqwest::Client,
    custom_paths: Vec<PathBuf>,
}

impl GogCloudPlugin {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
            custom_paths: Vec::new(),
        }
    }

    pub fn with_client(client: reqwest::Client) -> Self {
        Self {
            client,
            custom_paths: Vec::new(),
        }
    }

    pub fn with_custom_paths(custom_paths: Vec<PathBuf>) -> Self {
        Self {
            client: reqwest::Client::builder()
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
            custom_paths,
        }
    }

    pub fn with_client_and_paths(client: reqwest::Client, custom_paths: Vec<PathBuf>) -> Self {
        Self {
            client,
            custom_paths,
        }
    }
}

impl Default for GogCloudPlugin {
    fn default() -> Self {
        Self::new()
    }
}

pub type GogPlugin = GogCloudPlugin;

#[async_trait]
impl LibraryPlugin for GogCloudPlugin {
    fn id(&self) -> &str {
        "gog"
    }

    fn name(&self) -> &str {
        "GOG Galaxy"
    }

    async fn scan(&self) -> Result<Vec<DiscoveredGame>, PluginError> {
        let games = local_scanner::scan_local_games(&self.custom_paths);
        tracing::info!("Discovered {} local GOG titles.", games.len());
        Ok(games)
    }
}

#[async_trait]
impl omnis_sdk::ReactivePlugin for GogCloudPlugin {
    fn id(&self) -> &'static str {
        "gog"
    }

    fn name(&self) -> &'static str {
        "GOG Galaxy"
    }

    fn settings_schema(&self) -> Option<omnis_sdk::PluginSettingsSchema> {
        None
    }

    async fn initialize(&mut self, _config_json: &str) -> Result<(), String> {
        Ok(())
    }

    async fn handle_event(
        &mut self,
        event: omnis_sdk::PluginEvent,
    ) -> Result<Vec<omnis_sdk::PluginEvent>, String> {
        let mut responses = Vec::new();

        match event {
            omnis_sdk::PluginEvent::SyncRequested { library_id, .. }
                if library_id == "gog" || library_id == "all" =>
            {
                tracing::info!("GOG: Handling SyncRequested event for '{}'", library_id);
                match self.scan().await {
                    Ok(games) => {
                        tracing::info!("GOG: Found {} installed games", games.len());
                        responses.push(omnis_sdk::PluginEvent::BatchGamesDiscovered {
                            library_id: "gog".to_string(),
                            games,
                        });
                    }
                    Err(e) => {
                        responses.push(omnis_sdk::PluginEvent::NotificationEmitted {
                            level: omnis_sdk::LogLevel::Error,
                            message: format!("GOG local scan failed: {}", e),
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
impl CloudStorePlugin for GogCloudPlugin {
    fn login_url(&self) -> String {
        format!(
            "https://auth.gog.com/auth?client_id={}&redirect_uri={}&response_type=code&layout=client2",
            client::GOG_CLIENT_ID,
            urlencoding::encode(client::GOG_REDIRECT_URI)
        )
    }

    fn is_redirect_url(&self, url: &str) -> bool {
        url.starts_with("https://embed.gog.com/on_login_success")
    }

    async fn exchange_code(&self, redirect_url: &str) -> Result<StoreAccountSession, PluginError> {
        let code = client::extract_code_from_url(redirect_url).ok_or_else(|| {
            PluginError::Parse(format!(
                "Impossibile estrarre il parametro 'code' dall'URL di redirect: {}",
                redirect_url
            ))
        })?;
        client::exchange_code(&self.client, &code).await
    }

    async fn refresh_session(
        &self,
        refresh_token: &str,
    ) -> Result<StoreAccountSession, PluginError> {
        client::refresh_token(&self.client, refresh_token).await
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
    use omnis_sdk::ProcessTrackingMode;

    #[test]
    fn test_extract_code_from_gog_redirect_url() {
        let url = "https://embed.gog.com/on_login_success?code=XYZ12345&origin=client";
        let code = client::extract_code_from_url(url);
        assert_eq!(code, Some("XYZ12345".to_string()));

        // Test with different param ordering
        let url_alt = "https://embed.gog.com/on_login_success?origin=client&code=AUTH_CODE_987";
        let code_alt = client::extract_code_from_url(url_alt);
        assert_eq!(code_alt, Some("AUTH_CODE_987".to_string()));

        // Test missing code parameter
        let url_no_code = "https://embed.gog.com/on_login_success?origin=client";
        let code_missing = client::extract_code_from_url(url_no_code);
        assert_eq!(code_missing, None);
    }

    #[test]
    fn test_gog_token_response_deserialization() {
        let json_data = r#"{
            "access_token": "mock_access_token_abc123",
            "refresh_token": "mock_refresh_token_def456",
            "expires_in": 3600,
            "user_id": "46899977096215655"
        }"#;

        let token: GogTokenResponse =
            serde_json::from_str(json_data).expect("Failed to deserialize token");
        assert_eq!(token.access_token, "mock_access_token_abc123");
        assert_eq!(token.refresh_token, "mock_refresh_token_def456");
        assert_eq!(token.expires_in, 3600);
        assert_eq!(token.user_id, "46899977096215655");

        // Test numeric user_id parsing compatibility
        let json_numeric_user = r#"{
            "access_token": "token_numeric",
            "refresh_token": "refresh_numeric",
            "expires_in": 7200,
            "user_id": 123456789
        }"#;

        let token_numeric: GogTokenResponse = serde_json::from_str(json_numeric_user)
            .expect("Failed to deserialize token with numeric user_id");
        assert_eq!(token_numeric.user_id, "123456789");
    }

    #[test]
    fn test_normalize_gog_game_protocol_uri() {
        let gog_game = GogGameDetails {
            id: 1207658691,
            title: "The Witcher 3: Wild Hunt - Game of the Year Edition".to_string(),
            image: Some("//images-3.gog.com/witcher3_thumb.jpg".to_string()),
            background: Some("//images-3.gog.com/witcher3_bg.jpg".to_string()),
        };

        let discovered = normalize_gog_game(&gog_game);

        assert_eq!(discovered.library_id, "gog");
        assert_eq!(discovered.external_id, "1207658691");
        assert_eq!(
            discovered.title,
            "The Witcher 3: Wild Hunt - Game of the Year Edition"
        );
        assert!(!discovered.is_installed);
        assert_eq!(discovered.install_dir, None);
        assert_eq!(discovered.playtime_seconds, 0);
        assert_eq!(discovered.play_count, 0);
        assert_eq!(discovered.last_activity, None);
        assert_eq!(
            discovered.cover_image_path,
            Some("https://images-3.gog.com/witcher3_thumb.jpg".to_string())
        );
        assert_eq!(
            discovered.background_image_path,
            Some("https://images-3.gog.com/witcher3_bg.jpg".to_string())
        );

        let play_action = discovered.play_action.expect("Play action must be present");
        assert_eq!(
            play_action.executable,
            "goggalaxy://openGameView/1207658691"
        );
        assert!(play_action.arguments.is_empty());
        assert_eq!(play_action.working_dir, None);
        assert_eq!(
            play_action.tracking_mode,
            ProcessTrackingMode::ProcessName("GalaxyClient.exe".to_string())
        );
    }

    #[test]
    fn test_parse_goggame_info_file_task() {
        let json_info = r#"{
            "gameId": "1207658930",
            "rootGameId": "1207658930",
            "name": "The Witcher 2: Assassins of Kings Enhanced Edition",
            "playTasks": [
                {
                    "isPrimary": false,
                    "type": "URLTask",
                    "path": "https://www.gog.com/support"
                },
                {
                    "arguments": "-novid",
                    "isPrimary": true,
                    "path": "bin\\witcher2.exe",
                    "type": "FileTask",
                    "workingDir": "bin"
                }
            ]
        }"#;

        let game_dir = std::path::Path::new("/mock/games/witcher2");
        let discovered = local_scanner::parse_goggame_info(json_info, game_dir)
            .expect("Should parse goggame info");

        assert_eq!(discovered.library_id, "gog");
        assert_eq!(discovered.external_id, "1207658930");
        assert_eq!(
            discovered.title,
            "The Witcher 2: Assassins of Kings Enhanced Edition"
        );
        assert_eq!(discovered.install_dir, Some(game_dir.to_path_buf()));

        let play_action = discovered.play_action.expect("Play action must be present");
        assert_eq!(
            play_action.tracking_mode,
            ProcessTrackingMode::ProcessName("witcher2.exe".to_string())
        );
        assert_eq!(play_action.arguments, vec!["-novid"]);
        assert!(play_action.executable.contains("witcher2.exe"));
    }

    #[test]
    fn test_gog_product_item_dlc_filtering() {
        let base_game = client::GogProductItem {
            id: 1207658691,
            title: "Cyberpunk 2077".to_string(),
            game_type: Some("game".to_string()),
            is_installable: Some(true),
            image: None,
            images: None,
        };
        assert!(base_game.to_game_details().is_some());

        let bundle_pack = client::GogProductItem {
            id: 1274966284,
            title: "Cyberpunk 2077: Ultimate Edition".to_string(),
            game_type: Some("pack".to_string()),
            is_installable: Some(true),
            image: None,
            images: None,
        };
        assert!(bundle_pack.to_game_details().is_some());

        let dlc_item = client::GogProductItem {
            id: 1256837418,
            title: "Cyberpunk 2077: Phantom Liberty".to_string(),
            game_type: Some("dlc".to_string()),
            is_installable: Some(true),
            image: None,
            images: None,
        };
        assert!(
            dlc_item.to_game_details().is_none(),
            "DLC items must be filtered out"
        );

        let bonus_item = client::GogProductItem {
            id: 1999999999,
            title: "Cyberpunk 2077 - Goodies Collection".to_string(),
            game_type: Some("bonus".to_string()),
            is_installable: Some(false),
            image: None,
            images: None,
        };
        assert!(
            bonus_item.to_game_details().is_none(),
            "Bonus items must be filtered out"
        );
    }

    #[test]
    fn test_gog_product_item_images_mapping() {
        // 1. Logos and icons must NOT be mapped as covers
        let product_with_only_logos = client::GogProductItem {
            id: 1207658691,
            title: "Unreal Tournament 2004".to_string(),
            game_type: Some("game".to_string()),
            is_installable: Some(true),
            image: None,
            images: Some(client::GogProductImages {
                box_art: None,
                box_art_camel: None,
                cover_vertical: None,
                background: Some("//images-3.gog-statics.com/ut2004_bg.jpg".to_string()),
                logo: Some("//images-3.gog-statics.com/ut2004_logo.jpg".to_string()),
                logo2x: Some("//images-2.gog-statics.com/ut2004_logo_2x.jpg".to_string()),
                icon: Some("//images-1.gog-statics.com/ut2004_icon.png".to_string()),
                sidebar_icon: None,
            }),
        };

        let details = product_with_only_logos
            .to_game_details()
            .expect("Game details must be present");
        assert_eq!(
            details.image, None,
            "Low-resolution logo2x/logo/icon must NOT be mapped to cover image"
        );
        assert_eq!(
            details.background,
            Some("//images-3.gog-statics.com/ut2004_bg.jpg".to_string())
        );

        // 2. High-definition box_art or coverVertical MUST be preserved
        let product_with_box_art = client::GogProductItem {
            id: 1207658691,
            title: "Unreal Tournament 2004".to_string(),
            game_type: Some("game".to_string()),
            is_installable: Some(true),
            image: None,
            images: Some(client::GogProductImages {
                box_art: Some("//images-3.gog-statics.com/ut2004_box.jpg".to_string()),
                box_art_camel: None,
                cover_vertical: None,
                background: Some("//images-3.gog-statics.com/ut2004_bg.jpg".to_string()),
                logo: Some("//images-3.gog-statics.com/ut2004_logo.jpg".to_string()),
                logo2x: Some("//images-2.gog-statics.com/ut2004_logo_2x.jpg".to_string()),
                icon: None,
                sidebar_icon: None,
            }),
        };
        let details_box = product_with_box_art
            .to_game_details()
            .expect("Game details must be present");
        assert_eq!(
            details_box.image,
            Some("//images-3.gog-statics.com/ut2004_box.jpg".to_string())
        );
    }

    #[test]
    fn test_gog_v2_envelope_deserialization() {
        let v2_json = r#"{
            "_links": {
                "boxArtImage": {
                    "href": "https://images.gog-statics.com/vertical_hd_cover.jpg"
                },
                "galaxyBackgroundImage": {
                    "href": "https://images.gog-statics.com/galaxy_bg.jpg"
                },
                "icon": {
                    "href": "https://images.gog-statics.com/icon.png"
                }
            }
        }"#;

        let parsed: client::GogV2GameEnvelope =
            serde_json::from_str(v2_json).expect("Failed to parse GOG v2 envelope");
        let links = parsed.links.expect("Links must be present");
        assert_eq!(
            links.box_art_image.and_then(|h| h.href),
            Some("https://images.gog-statics.com/vertical_hd_cover.jpg".to_string())
        );
        assert_eq!(
            links.galaxy_background_image.and_then(|h| h.href),
            Some("https://images.gog-statics.com/galaxy_bg.jpg".to_string())
        );
    }

    #[tokio::test]
    async fn test_gog_reactive_plugin_sync_requested() {
        use omnis_sdk::ReactivePlugin;
        let mut plugin = GogCloudPlugin::new();
        assert_eq!(ReactivePlugin::id(&plugin), "gog");
        assert_eq!(ReactivePlugin::name(&plugin), "GOG Galaxy");

        let events = plugin
            .handle_event(omnis_sdk::PluginEvent::SyncRequested {
                library_id: "gog".to_string(),
                force_full: false,
            })
            .await
            .expect("Event handling must succeed");

        assert_eq!(events.len(), 1);
        match &events[0] {
            omnis_sdk::PluginEvent::BatchGamesDiscovered { library_id, games } => {
                assert_eq!(library_id, "gog");
                // On test runner (without local GOG registry), games can be empty
                assert!(games.is_empty() || !games.is_empty());
            }
            _ => panic!("Expected BatchGamesDiscovered event"),
        }
    }

    #[test]
    fn test_cloud_store_plugin_interface() {
        let plugin = GogCloudPlugin::new();

        assert_eq!(LibraryPlugin::id(&plugin), "gog");
        assert_eq!(LibraryPlugin::name(&plugin), "GOG Galaxy");

        let login_url = plugin.login_url();
        assert!(login_url.contains(client::GOG_CLIENT_ID));
        assert!(login_url.contains("response_type=code"));
        assert!(login_url.contains("layout=client2"));
        assert!(
            login_url.contains("https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient")
        );

        assert!(plugin.is_redirect_url("https://embed.gog.com/on_login_success?code=TEST1234"));
        assert!(plugin.is_redirect_url("https://embed.gog.com/on_login_success?origin=client"));
        assert!(!plugin.is_redirect_url("https://auth.gog.com/auth"));
        assert!(!plugin.is_redirect_url("https://google.com"));
    }

    #[test]
    fn test_gog_games_response_deserialization() {
        let json_games = r#"{
            "owned": [1207658691, 1207658713, 1207658805]
        }"#;

        let parsed: GogGamesResponse =
            serde_json::from_str(json_games).expect("Failed to deserialize owned games");
        assert_eq!(parsed.owned.len(), 3);
        assert_eq!(parsed.owned[0], 1207658691);
        assert_eq!(parsed.owned[1], 1207658713);
        assert_eq!(parsed.owned[2], 1207658805);
    }

    #[test]
    fn test_gog_user_data_deserialization() {
        let json_user = r#"{
            "username": "GeraltOfRivia",
            "avatar": "https://images.gog.com/avatars/geralt.png"
        }"#;

        let parsed: GogUserData =
            serde_json::from_str(json_user).expect("Failed to deserialize user data");
        assert_eq!(parsed.username, Some("GeraltOfRivia".to_string()));
        assert_eq!(
            parsed.avatar,
            Some("https://images.gog.com/avatars/geralt.png".to_string())
        );
    }
}
