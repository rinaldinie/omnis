pub mod client;
pub mod vdf_parser;

pub use client::*;

use async_trait::async_trait;
use omnis_sdk::{
    CloudStorePlugin, DiscoveredGame, LibraryPlugin, LogLevel, PluginError, PluginEvent,
    PluginSettingsSchema, ReactivePlugin, SettingField, SettingGroup, SettingType,
    StoreAccountSession,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::info;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SteamConfig {
    pub custom_steam_path: Option<PathBuf>,
    pub api_key: Option<String>,
    pub steam_id64: Option<String>,
    pub import_free_games: bool,
}

#[derive(Clone)]
pub struct SteamPlugin {
    config: SteamConfig,
    client: reqwest::Client,
}

impl Default for SteamPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl SteamPlugin {
    pub fn new() -> Self {
        Self {
            config: SteamConfig::default(),
            client: reqwest::Client::builder()
                .pool_max_idle_per_host(4)
                .tcp_nodelay(true)
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
        }
    }

    pub fn with_config(config: SteamConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::builder()
                .pool_max_idle_per_host(4)
                .tcp_nodelay(true)
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
        }
    }

    pub fn with_client(config: SteamConfig, client: reqwest::Client) -> Self {
        Self { config, client }
    }
}

#[async_trait]
impl LibraryPlugin for SteamPlugin {
    fn id(&self) -> &str {
        "steam"
    }

    fn name(&self) -> &str {
        "Steam"
    }

    async fn scan(&self) -> Result<Vec<DiscoveredGame>, PluginError> {
        let steam_path = self
            .config
            .custom_steam_path
            .clone()
            .or_else(vdf_parser::detect_steam_installation);

        if let Some(path) = steam_path {
            Ok(vdf_parser::scan_installed_games(&path))
        } else {
            Ok(Vec::new())
        }
    }
}

#[async_trait]
impl CloudStorePlugin for SteamPlugin {
    fn login_url(&self) -> String {
        client::STEAM_OPENID_LOGIN_URL.to_string()
    }

    fn is_redirect_url(&self, url: &str) -> bool {
        client::is_steam_redirect(url)
    }

    async fn exchange_code(&self, redirect_url: &str) -> Result<StoreAccountSession, PluginError> {
        let mut session = client::extract_session_from_redirect(redirect_url)?;
        if let Ok(profile) = client::fetch_player_summary(
            &self.client,
            &session.user_id,
            self.config.api_key.as_deref(),
        )
        .await
        {
            if let Some(name) = profile.name {
                if !name.trim().is_empty() {
                    session.username = name;
                }
            }
            if let Some(avatar) = profile.avatar {
                if !avatar.trim().is_empty() {
                    session.avatar_url = Some(avatar);
                }
            }
        }
        Ok(session)
    }

    async fn refresh_session(&self, refresh_token: &str) -> Result<StoreAccountSession, PluginError> {
        let user_id = if let Some(stripped) = refresh_token.strip_prefix("steam_session:") {
            stripped
        } else {
            refresh_token
        };

        let mut session = StoreAccountSession {
            store_id: "steam".to_string(),
            user_id: user_id.to_string(),
            username: user_id.to_string(),
            avatar_url: None,
            access_token: format!("steam_session:{}", user_id),
            refresh_token: Some(refresh_token.to_string()),
            expires_at: None,
        };

        if let Ok(profile) = client::fetch_player_summary(
            &self.client,
            user_id,
            self.config.api_key.as_deref(),
        )
        .await
        {
            if let Some(name) = profile.name {
                if !name.trim().is_empty() {
                    session.username = name;
                }
            }
            if let Some(avatar) = profile.avatar {
                if !avatar.trim().is_empty() {
                    session.avatar_url = Some(avatar);
                }
            }
        }

        Ok(session)
    }

    async fn sync_games(&self, session: &StoreAccountSession) -> Result<Vec<DiscoveredGame>, PluginError> {
        client::fetch_user_games_web_api(&self.client, &session.user_id, self.config.api_key.as_deref()).await
    }
}

#[async_trait]
impl ReactivePlugin for SteamPlugin {
    fn id(&self) -> &'static str {
        "steam"
    }

    fn name(&self) -> &'static str {
        "Steam Integration"
    }

    fn settings_schema(&self) -> Option<PluginSettingsSchema> {
        Some(PluginSettingsSchema {
            plugin_id: "steam".to_string(),
            title: "Steam Configuration".to_string(),
            groups: vec![
                SettingGroup {
                    id: "local_scan".to_string(),
                    title: "Local Detection".to_string(),
                    fields: vec![SettingField {
                        key: "custom_steam_path".to_string(),
                        label: "Custom Steam Path".to_string(),
                        description: Some("Override Steam installation path".to_string()),
                        required: false,
                        field_type: SettingType::Path { is_directory: true },
                    }],
                },
                SettingGroup {
                    id: "web_api".to_string(),
                    title: "Steam Web API (Optional Cloud Sync)".to_string(),
                    fields: vec![
                        SettingField {
                            key: "api_key".to_string(),
                            label: "Steam Web API Key".to_string(),
                            description: Some("Optional API Key for non-installed library sync".to_string()),
                            required: false,
                            field_type: SettingType::SecretString {
                                placeholder: Some("32-character key".to_string()),
                            },
                        },
                        SettingField {
                            key: "steam_id64".to_string(),
                            label: "SteamID64".to_string(),
                            description: Some("Your 17-digit SteamID".to_string()),
                            required: false,
                            field_type: SettingType::String {
                                default: None,
                                placeholder: Some("76561198...".to_string()),
                                regex: Some("^[0-9]{17}$".to_string()),
                            },
                        },
                        SettingField {
                            key: "import_free_games".to_string(),
                            label: "Import Free-to-Play Games".to_string(),
                            description: None,
                            required: false,
                            field_type: SettingType::Boolean { default: false },
                        },
                    ],
                },
            ],
        })
    }

    async fn initialize(&mut self, config_json: &str) -> Result<(), String> {
        if !config_json.is_empty() && config_json != "{}" {
            self.config = serde_json::from_str(config_json).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    async fn handle_event(&mut self, event: PluginEvent) -> Result<Vec<PluginEvent>, String> {
        let mut responses = Vec::new();

        match event {
            PluginEvent::SyncRequested { library_id, .. } if library_id == "steam" || library_id == "all" => {
                info!("Steam sync requested. Initiating zero-overhead local manifest scan...");

                let steam_path = self
                    .config
                    .custom_steam_path
                    .clone()
                    .or_else(vdf_parser::detect_steam_installation);

                if let Some(path) = steam_path {
                    let local_games = vdf_parser::scan_installed_games(&path);
                    info!("Discovered {} local Steam games.", local_games.len());

                    responses.push(PluginEvent::BatchGamesDiscovered {
                        library_id: "steam".to_string(),
                        games: local_games,
                    });
                } else {
                    responses.push(PluginEvent::NotificationEmitted {
                        level: LogLevel::Warn,
                        message: "Steam installation directory not found on system.".to_string(),
                    });
                }
            }
            _ => {}
        }

        Ok(responses)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use omnis_sdk::ProcessTrackingMode;

    #[test]
    fn test_is_steam_redirect() {
        // Positive tests
        assert!(is_steam_redirect(
            "https://steamcommunity.com/profiles/76561198000000000/games?xml=1"
        ));
        assert!(is_steam_redirect(
            "https://steamcommunity.com/id/gabelogannewell/games?xml=1"
        ));
        assert!(is_steam_redirect(
            "https://steamcommunity.com/profiles/76561198000000000/games"
        ));
        assert!(is_steam_redirect(
            "https://steamcommunity.com/profiles/76561198000000000"
        ));
        assert!(is_steam_redirect(
            "https://steamcommunity.com/id/gabelogannewell"
        ));

        // Negative tests
        assert!(!is_steam_redirect(
            "https://steamcommunity.com/login/home/?goto=%2Fmy%2Fgames%3Fxml%3D1"
        ));
        assert!(!is_steam_redirect(
            "https://steamcommunity.com/my/games?xml=1"
        ));
        assert!(!is_steam_redirect(
            "https://steamcommunity.com/my/profile"
        ));
        assert!(!is_steam_redirect("https://store.steampowered.com/app/440"));
        assert!(!is_steam_redirect("https://google.com"));
        assert!(!is_steam_redirect("https://example.com/games?xml=1"));

        // OpenID callback positive test
        assert!(is_steam_redirect(
            "https://omnis.app/auth/steam?openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.mode=id_res&openid.claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000000"
        ));
    }

    #[test]
    fn test_extract_session_from_openid() {
        let url = "https://omnis.app/auth/steam?openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.mode=id_res&openid.claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000000&openid.identity=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000000";
        let session = extract_session_from_redirect(url).expect("Should extract OpenID session");
        assert_eq!(session.store_id, "steam");
        assert_eq!(session.user_id, "76561198000000000");
        assert_eq!(session.access_token, "steam_session:76561198000000000");
        assert_eq!(
            session.refresh_token,
            Some("steam_session:76561198000000000".to_string())
        );
    }

    #[test]
    fn test_extract_session_from_redirect_profiles() {
        let url = "https://steamcommunity.com/profiles/76561198000000000/games?xml=1";
        let session = extract_session_from_redirect(url).expect("Should extract session");
        assert_eq!(session.store_id, "steam");
        assert_eq!(session.user_id, "76561198000000000");
        assert_eq!(session.username, "76561198000000000");
        assert_eq!(session.access_token, "steam_session:76561198000000000");
        assert_eq!(
            session.refresh_token,
            Some("steam_session:76561198000000000".to_string())
        );
        assert_eq!(session.avatar_url, None);
    }

    #[test]
    fn test_extract_session_from_redirect_vanity() {
        let url = "https://steamcommunity.com/id/gabelogannewell/games?tab=all";
        let session = extract_session_from_redirect(url).expect("Should extract vanity session");
        assert_eq!(session.store_id, "steam");
        assert_eq!(session.user_id, "gabelogannewell");
        assert_eq!(session.username, "gabelogannewell");
        assert_eq!(session.access_token, "steam_session:gabelogannewell");
    }

    #[test]
    fn test_extract_session_invalid_url() {
        let url = "https://steamcommunity.com/about";
        assert!(extract_session_from_redirect(url).is_err());
    }

    #[test]
    fn test_steam_owned_games_deserialization_and_mapping() {
        let json_payload = r#"{
            "response": {
                "game_count": 2,
                "games": [
                    {
                        "appid": 440,
                        "name": "Team Fortress 2",
                        "playtime_forever": 120,
                        "img_icon_url": "tf2_icon_hash"
                    },
                    {
                        "appid": 730,
                        "name": "Counter-Strike 2",
                        "playtime_forever": 350,
                        "img_icon_url": "cs2_icon_hash"
                    }
                ]
            }
        }"#;

        let api_resp: SteamOwnedGamesApiResponse =
            serde_json::from_str(json_payload).expect("Failed to deserialize Steam API response");

        assert_eq!(api_resp.response.game_count, Some(2));
        let games = api_resp.response.games.expect("Games list should be present");
        assert_eq!(games.len(), 2);

        let discovered = map_steam_games_to_discovered(games);
        assert_eq!(discovered.len(), 2);

        // Check first game mapping
        let tf2 = &discovered[0];
        assert_eq!(tf2.library_id, "steam");
        assert_eq!(tf2.external_id, "440");
        assert_eq!(tf2.title, "Team Fortress 2");
        assert!(!tf2.is_installed);
        assert_eq!(tf2.playtime_seconds, 120 * 60);
        assert_eq!(
            tf2.cover_image_path,
            Some("https://cdn.cloudflare.steamstatic.com/steam/apps/440/header.jpg".to_string())
        );

        let action = tf2.play_action.as_ref().expect("Play action should exist");
        assert_eq!(action.executable, "steam://install/440");
        assert!(action.arguments.is_empty());
        assert_eq!(
            action.tracking_mode,
            ProcessTrackingMode::ProcessName("steam.exe".to_string())
        );

        // Check second game
        let cs2 = &discovered[1];
        assert_eq!(cs2.external_id, "730");
        assert_eq!(cs2.title, "Counter-Strike 2");
        assert_eq!(cs2.playtime_seconds, 350 * 60);
        assert_eq!(
            cs2.cover_image_path,
            Some("https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg".to_string())
        );
    }

    #[test]
    fn test_parse_steam_community_games_xml() {
        let xml_payload = r#"
        <gamesList>
            <error>
                <![CDATA[The specified profile could not be found.]]>
            </error>
            <steamID64>76561198000000000</steamID64>
            <steamID>
                <![CDATA[User]]>
            </steamID>
            <games>
                <game>
                    <appID>220</appID>
                    <name>
                        <![CDATA[Half-Life 2]]>
                    </name>
                    <logo><![CDATA[https://cdn.example.com/logo.jpg]]></logo>
                    <storeLink><![CDATA[https://steamcommunity.com/app/220]]></storeLink>
                    <hoursOnRecord>10.5</hoursOnRecord>
                </game>
                <game>
                    <appID>400</appID>
                    <name><![CDATA[Portal]]></name>
                    <logo><![CDATA[https://cdn.example.com/portal.jpg]]></logo>
                    <storeLink><![CDATA[https://steamcommunity.com/app/400]]></storeLink>
                    <hoursOnRecord>5.0</hoursOnRecord>
                </game>
            </games>
        </gamesList>
        "#;

        assert_eq!(
            extract_xml_tag(xml_payload, "error").as_deref(),
            Some("The specified profile could not be found.")
        );
        assert_eq!(extract_xml_tag(xml_payload, "steamID").as_deref(), Some("User"));

        let parsed = parse_steam_community_games_xml(xml_payload);
        assert_eq!(parsed.len(), 2);

        assert_eq!(parsed[0].appid, 220);
        assert_eq!(parsed[0].name.as_deref(), Some("Half-Life 2"));
        assert_eq!(parsed[0].playtime_forever, Some(630)); // 10.5 * 60

        assert_eq!(parsed[1].appid, 400);
        assert_eq!(parsed[1].name.as_deref(), Some("Portal"));
        assert_eq!(parsed[1].playtime_forever, Some(300)); // 5.0 * 60

        let discovered = map_steam_games_to_discovered(parsed);
        assert_eq!(discovered.len(), 2);
        assert_eq!(discovered[0].title, "Half-Life 2");
        assert_eq!(
            discovered[0].cover_image_path,
            Some("https://cdn.cloudflare.steamstatic.com/steam/apps/220/header.jpg".to_string())
        );
    }

    #[tokio::test]
    async fn test_steam_plugin_library_and_cloud_traits() {
        let plugin = SteamPlugin::new();

        // LibraryPlugin tests
        assert_eq!(LibraryPlugin::id(&plugin), "steam");
        assert_eq!(LibraryPlugin::name(&plugin), "Steam");

        // ReactivePlugin tests
        assert_eq!(ReactivePlugin::id(&plugin), "steam");
        assert_eq!(ReactivePlugin::name(&plugin), "Steam Integration");

        // CloudStorePlugin tests
        assert_eq!(plugin.login_url(), STEAM_OPENID_LOGIN_URL);
        assert!(plugin.is_redirect_url("https://steamcommunity.com/profiles/76561198000000000/games?xml=1"));
        assert!(!plugin.is_redirect_url("https://google.com"));

        let session = plugin
            .exchange_code("https://steamcommunity.com/profiles/76561198000000000/games?xml=1")
            .await
            .expect("Should exchange code");
        assert_eq!(session.user_id, "76561198000000000");

        let refreshed = plugin
            .refresh_session(&session.access_token)
            .await
            .expect("Should refresh session");
        assert_eq!(refreshed.user_id, "76561198000000000");
        assert_eq!(refreshed.store_id, "steam");
    }
}
