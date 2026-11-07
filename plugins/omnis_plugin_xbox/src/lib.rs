//! Xbox Live & PC Game Pass cloud store integration plugin for Omnis Game Library

pub mod achievements;
pub mod client;

pub use achievements::*;
use async_trait::async_trait;
use omnis_sdk::{
    CloudStorePlugin, DiscoveredGame, LibraryPlugin, PluginError, StoreAccountSession,
};

pub use client::{
    authenticate_xbox_live, clean_title_name, exchange_authorization_code,
    extract_auth_from_redirect, extract_token_from_redirect, fetch_user_titles, format_xsts_error,
    is_pc_device_name, map_title_to_discovered_game, refresh_session_token, MsAuthRedirect,
    MsTokenResponse, XboxDisplayClaims, XboxGamePassInfo, XboxLiveAuthResponse,
    XboxTitleHistoryDetail, XboxTitleHistoryItemInfo, XboxTitleHistoryResponse, XboxTitleItem,
    XboxXuiClaim, ERR_XSTS_AGE_VERIFICATION_REQUIRED, ERR_XSTS_CHILD_ACCOUNT,
    ERR_XSTS_FORBIDDEN_GENERIC, ERR_XSTS_NO_XBOX_ACCOUNT, ERR_XSTS_REGION_UNSUPPORTED,
    ERR_XSTS_USER_ACTION_REQUIRED, MS_AUTH_SCOPE, MS_AUTH_SCOPE_OFFLINE, MS_CLIENT_ID,
    MS_REDIRECT_URI, XBOX_USER_AGENT,
};

/// Plugin instance for Xbox Live / PC Game Pass
pub struct XboxCloudPlugin {
    client: reqwest::Client,
}

/// Backwards compatibility alias
pub type XboxPlugin = XboxCloudPlugin;

impl XboxCloudPlugin {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(XBOX_USER_AGENT)
            .build()
            .unwrap_or_default();
        Self { client }
    }

    pub fn with_client(client: reqwest::Client) -> Self {
        Self { client }
    }
}

impl Default for XboxCloudPlugin {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LibraryPlugin for XboxCloudPlugin {
    fn id(&self) -> &str {
        "xbox"
    }

    fn name(&self) -> &str {
        "Xbox / PC Game Pass"
    }

    async fn scan(&self) -> Result<Vec<DiscoveredGame>, PluginError> {
        // Fallback locale: Xbox / Game Pass titles are synced primarily via CloudStorePlugin API
        Ok(Vec::new())
    }
}

#[async_trait]
impl omnis_sdk::ReactivePlugin for XboxCloudPlugin {
    fn id(&self) -> &'static str {
        "xbox"
    }

    fn name(&self) -> &'static str {
        "Xbox / PC Game Pass"
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
                if library_id == "xbox" || library_id == "all" =>
            {
                tracing::info!("Xbox: Handling SyncRequested event for '{}'", library_id);
                match self.scan().await {
                    Ok(games) if !games.is_empty() => {
                        responses.push(omnis_sdk::PluginEvent::BatchGamesDiscovered {
                            library_id: "xbox".to_string(),
                            games,
                        });
                    }
                    Ok(_) => {}
                    Err(e) => {
                        responses.push(omnis_sdk::PluginEvent::NotificationEmitted {
                            level: omnis_sdk::LogLevel::Warn,
                            message: format!("Xbox scan warning: {}", e),
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
impl CloudStorePlugin for XboxCloudPlugin {
    fn login_url(&self) -> String {
        format!(
            "https://login.live.com/oauth20_authorize.srf?client_id={}&scope={}&response_type=code&redirect_uri={}",
            MS_CLIENT_ID,
            urlencoding::encode(MS_AUTH_SCOPE_OFFLINE),
            urlencoding::encode(MS_REDIRECT_URI)
        )
    }

    fn is_redirect_url(&self, url: &str) -> bool {
        url.starts_with(MS_REDIRECT_URI)
    }

    async fn exchange_code(&self, redirect_url: &str) -> Result<StoreAccountSession, PluginError> {
        match extract_auth_from_redirect(redirect_url)? {
            MsAuthRedirect::Code(code) => {
                let token_resp = exchange_authorization_code(&self.client, &code).await?;
                let mut session =
                    authenticate_xbox_live(&self.client, &token_resp.access_token).await?;
                if token_resp.refresh_token.is_some() {
                    session.refresh_token = token_resp.refresh_token;
                }
                Ok(session)
            }
            MsAuthRedirect::AccessToken(token) => {
                authenticate_xbox_live(&self.client, &token).await
            }
        }
    }

    async fn refresh_session(
        &self,
        refresh_token: &str,
    ) -> Result<StoreAccountSession, PluginError> {
        refresh_session_token(&self.client, refresh_token).await
    }

    async fn sync_games(
        &self,
        session: &StoreAccountSession,
    ) -> Result<Vec<DiscoveredGame>, PluginError> {
        fetch_user_titles(&self.client, session).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use omnis_sdk::ProcessTrackingMode;

    #[test]
    fn test_extract_token_from_redirect_fragment() {
        let redirect_url =
            "https://login.live.com/oauth20_desktop.srf#access_token=TEST_TOKEN_123&expires_in=3600";
        let token =
            extract_token_from_redirect(redirect_url).expect("Should extract token from fragment");
        assert_eq!(token, "TEST_TOKEN_123");
    }

    #[test]
    fn test_extract_token_from_redirect_query() {
        let redirect_url =
            "https://login.live.com/oauth20_desktop.srf?access_token=TEST_TOKEN_QUERY&token_type=bearer";
        let token =
            extract_token_from_redirect(redirect_url).expect("Should extract token from query");
        assert_eq!(token, "TEST_TOKEN_QUERY");
    }

    #[test]
    fn test_extract_token_missing_error() {
        let redirect_url =
            "https://login.live.com/oauth20_desktop.srf#error=access_denied&error_description=User+cancelled";
        let res = extract_token_from_redirect(redirect_url);
        assert!(res.is_err());
    }

    #[test]
    fn test_deserialize_xbox_live_auth_response_with_uhs_and_gtg() {
        let json_data = r#"{
            "IssueInstant": "2026-10-19T07:28:11Z",
            "NotAfter": "2026-10-20T07:28:11Z",
            "Token": "mock_xsts_jwt_token_sample",
            "DisplayClaims": {
                "xui": [
                    {
                        "uhs": "28472910398472",
                        "gtg": "MasterChief117",
                        "xid": "2533274991234567",
                        "agg": "Adult"
                    }
                ]
            }
        }"#;

        let auth_resp: XboxLiveAuthResponse =
            serde_json::from_str(json_data).expect("Should deserialize XboxLiveAuthResponse");

        assert_eq!(auth_resp.token, "mock_xsts_jwt_token_sample");
        assert_eq!(auth_resp.display_claims.xui.len(), 1);

        let claim = &auth_resp.display_claims.xui[0];
        assert_eq!(claim.uhs, "28472910398472");
        assert_eq!(claim.gtg.as_deref(), Some("MasterChief117"));
        assert_eq!(claim.xid.as_deref(), Some("2533274991234567"));
        assert_eq!(claim.agg.as_deref(), Some("Adult"));
    }

    #[test]
    fn test_deserialize_xbox_live_auth_response_with_numeric_xid_and_xuid_alias() {
        // Numeric xid
        let json_numeric = r#"{
            "IssueInstant": "2026-10-19T07:28:11Z",
            "Token": "mock_token",
            "DisplayClaims": {
                "xui": [
                    {
                        "uhs": "28472910398472",
                        "xid": 2533274991234567
                    }
                ]
            }
        }"#;
        let resp_num: XboxLiveAuthResponse =
            serde_json::from_str(json_numeric).expect("Should deserialize numeric xid");
        assert_eq!(
            resp_num.display_claims.xui[0].xid.as_deref(),
            Some("2533274991234567")
        );

        // xuid alias
        let json_xuid = r#"{
            "IssueInstant": "2026-10-19T07:28:11Z",
            "Token": "mock_token",
            "DisplayClaims": {
                "xui": [
                    {
                        "uhs": "28472910398472",
                        "xuid": "2533274991234567"
                    }
                ]
            }
        }"#;
        let resp_xuid: XboxLiveAuthResponse =
            serde_json::from_str(json_xuid).expect("Should deserialize xuid alias");
        assert_eq!(
            resp_xuid.display_claims.xui[0].xid.as_deref(),
            Some("2533274991234567")
        );
    }

    #[test]
    fn test_map_xbox_title_item_to_discovered_game_with_modern_title_id() {
        let title = XboxTitleItem {
            title_id: "192837465".to_string(),
            name: "Forza Horizon 5".to_string(),
            r#type: Some("Game".to_string()),
            pfn: Some("Microsoft.624F8B84B80_8wekyb3d8bbwe".to_string()),
            display_image: Some("https://images-eds.xboxlive.com/image?url=fh5.jpg".to_string()),
            modern_title_id: Some("9NXQXX31PRSF".to_string()),
            media_item_type: Some("Game".to_string()),
            devices: Some(vec!["PC".to_string()]),
            title_history: None,
            detail: None,
            game_pass: None,
        };

        let game = map_title_to_discovered_game(&title);

        assert_eq!(game.library_id, "xbox");
        assert_eq!(game.external_id, "192837465");
        assert_eq!(game.title, "Forza Horizon 5");
        assert!(!game.is_installed);
        assert_eq!(
            game.cover_image_path.as_deref(),
            Some("https://images-eds.xboxlive.com/image?url=fh5.jpg")
        );

        let play_action = game.play_action.expect("play_action should be Some");
        assert_eq!(
            play_action.executable,
            "ms-windows-store://pdp/?ProductId=9NXQXX31PRSF"
        );
        assert!(play_action.arguments.is_empty());
        assert_eq!(play_action.working_dir, None);
        assert_eq!(
            play_action.tracking_mode,
            ProcessTrackingMode::KernelJobObject
        );
    }

    #[test]
    fn test_map_xbox_title_item_fallback_to_title_id() {
        let json_title = r#"{
            "titleId": "54321",
            "name": "Halo Infinite",
            "displayImage": null
        }"#;

        let title: XboxTitleItem = serde_json::from_str(json_title)
            .expect("Should deserialize XboxTitleItem without modernTitleId");
        let game = title.to_discovered_game();

        assert_eq!(game.library_id, "xbox");
        assert_eq!(game.external_id, "54321");
        assert_eq!(game.title, "Halo Infinite");
        assert_eq!(game.cover_image_path, None);

        let play_action = game.play_action.expect("play_action should be Some");
        assert_eq!(
            play_action.executable,
            "ms-windows-store://pdp/?ProductId=54321"
        );
    }

    #[test]
    fn test_xbox_cloud_plugin_metadata_and_login_url() {
        let plugin = XboxCloudPlugin::new();
        assert_eq!(plugin.id(), "xbox");
        assert_eq!(plugin.name(), "Xbox / PC Game Pass");

        let login_url = plugin.login_url();
        assert!(login_url.starts_with("https://login.live.com/oauth20_authorize.srf"));
        assert!(login_url.contains(&format!("client_id={}", MS_CLIENT_ID)));
        assert!(login_url.contains("response_type=code"));
        assert!(login_url.contains(&urlencoding::encode(MS_REDIRECT_URI).into_owned()));

        assert!(
            plugin.is_redirect_url("https://login.live.com/oauth20_desktop.srf#access_token=XYZ")
        );
        assert!(plugin.is_redirect_url("https://login.live.com/oauth20_desktop.srf?code=123"));
        assert!(!plugin.is_redirect_url("https://account.xbox.com/auth"));
    }

    #[test]
    fn test_format_xsts_error_all_cases() {
        use reqwest::StatusCode;

        // 1. No Xbox account
        let body_no_acc = r#"{"Identity":"0","XErr":2148916233,"Message":"","Redirect":"https://start.ui.xboxlive.com/AddUser"}"#;
        let msg = format_xsts_error(StatusCode::UNAUTHORIZED, body_no_acc);
        assert_eq!(msg, ERR_XSTS_NO_XBOX_ACCOUNT);

        // 2. Child account
        let body_child = r#"{"Identity":"0","XErr":2148916238,"Message":"","Redirect":""}"#;
        let msg = format_xsts_error(StatusCode::FORBIDDEN, body_child);
        assert_eq!(msg, ERR_XSTS_CHILD_ACCOUNT);

        // 3. Region unsupported
        let body_region = r#"{"Identity":"0","XErr":2148916235,"Message":""}"#;
        let msg = format_xsts_error(StatusCode::FORBIDDEN, body_region);
        assert_eq!(msg, ERR_XSTS_REGION_UNSUPPORTED);

        // 4. Age verification required
        let body_age = r#"{"Identity":"0","XErr":2148916236,"Message":""}"#;
        let msg = format_xsts_error(StatusCode::FORBIDDEN, body_age);
        assert_eq!(msg, ERR_XSTS_AGE_VERIFICATION_REQUIRED);

        // 5. User action required (terms)
        let body_action = r#"{"Identity":"0","XErr":2148916222,"Message":""}"#;
        let msg = format_xsts_error(StatusCode::FORBIDDEN, body_action);
        assert_eq!(msg, ERR_XSTS_USER_ACTION_REQUIRED);

        // 6. Generic 403 Forbidden with unparseable body & WAF HTML sanitization
        let msg_403 = format_xsts_error(StatusCode::FORBIDDEN, "Access Denied by WAF");
        assert!(msg_403.contains(ERR_XSTS_FORBIDDEN_GENERIC));
        assert!(msg_403.contains("Access Denied by WAF"));

        let msg_html = format_xsts_error(
            StatusCode::FORBIDDEN,
            "<!DOCTYPE html><html><head><title>403 Forbidden</title></head><body>WAF Blocked</body></html>",
        );
        assert!(msg_html.contains(ERR_XSTS_FORBIDDEN_GENERIC));
        assert!(msg_html.contains("WAF / Access Denied"));
        assert!(!msg_html.contains("<!DOCTYPE html>"));

        // 7. Custom XErr code
        let body_custom = r#"{"Identity":"0","XErr":999999,"Message":"Specific security error"}"#;
        let msg_custom = format_xsts_error(StatusCode::BAD_REQUEST, body_custom);
        assert!(msg_custom.contains("[XErr 999999 / 0x000F423F]"));
        assert!(msg_custom.contains("Specific security error"));

        // 8. String and Hex representation of XErr
        let body_str = r#"{"Identity":"0","XErr":"2148916233"}"#;
        let msg_str = format_xsts_error(StatusCode::UNAUTHORIZED, body_str);
        assert_eq!(msg_str, ERR_XSTS_NO_XBOX_ACCOUNT);

        let body_hex = r#"{"Identity":"0","XErr":"0x8015DC09"}"#;
        let msg_hex = format_xsts_error(StatusCode::UNAUTHORIZED, body_hex);
        assert_eq!(msg_hex, ERR_XSTS_NO_XBOX_ACCOUNT);

        let body_hex_child = r#"{"Identity":"0","XErr":"0x8015dc0e"}"#;
        let msg_hex_child = format_xsts_error(StatusCode::FORBIDDEN, body_hex_child);
        assert_eq!(msg_hex_child, ERR_XSTS_CHILD_ACCOUNT);

        // 9. Signed 32-bit COM HRESULT (negative number)
        let body_signed = r#"{"Identity":"0","XErr":-2146051063}"#;
        let msg_signed = format_xsts_error(StatusCode::UNAUTHORIZED, body_signed);
        assert_eq!(msg_signed, ERR_XSTS_NO_XBOX_ACCOUNT);
    }

    #[test]
    fn test_is_pc_game_filtering_conditions() {
        // 1. Valid PC Game Pass / Windows Store title with PFN (Sea of Thieves)
        let mut pc_game = XboxTitleItem::new("123", "Sea of Thieves");
        pc_game.pfn = Some("Microsoft.SeaofThieves_8wekyb3d8bbwe".to_string());
        pc_game.devices = Some(vec!["PC".to_string(), "XboxOne".to_string()]);
        pc_game.r#type = Some("Game".to_string());
        assert!(pc_game.is_pc_game(), "PC game with PFN must be accepted");

        // 2. Valid Windows Store game with PFN and console play history (Minecraft Dungeons)
        let mut mc_dungeons = XboxTitleItem::new("1739375565", "Minecraft Dungeons");
        mc_dungeons.pfn = Some("Microsoft.LovikaX1_8wekyb3d8bbwe".to_string());
        mc_dungeons.devices = Some(vec!["XboxOne".to_string(), "XboxSeries".to_string()]);
        mc_dungeons.r#type = Some("Game".to_string());
        assert!(
            mc_dungeons.is_pc_game(),
            "Store game with PFN must be accepted even if played on console"
        );

        // 3. Steam / Epic cross-play game linked to Xbox Live (missing PFN)
        let mut steam_crossplay = XboxTitleItem::new("456", "Halo Infinite");
        steam_crossplay.pfn = None;
        steam_crossplay.modern_title_id = None;
        steam_crossplay.devices = Some(vec!["PC".to_string()]);
        steam_crossplay.r#type = Some("Game".to_string());
        assert!(
            !steam_crossplay.is_pc_game(),
            "Cross-play title from Steam without PFN must be filtered out"
        );

        // 4. External Win32 game recorded by Game Bar telemetry
        let mut win32_game = XboxTitleItem::new("1648978890", "Dark Souls III");
        win32_game.pfn = None;
        win32_game.devices = Some(vec!["Win32".to_string()]);
        win32_game.r#type = Some("Game".to_string());
        assert!(
            !win32_game.is_pc_game(),
            "External Win32 game without PFN must be filtered out"
        );

        // 5. Xbox 360 legacy console game (no PFN)
        let mut x360_game = XboxTitleItem::new("789", "Hexic HD");
        x360_game.pfn = None;
        x360_game.modern_title_id = None;
        x360_game.devices = Some(vec!["Xbox360".to_string()]);
        x360_game.r#type = Some("Game".to_string());
        assert!(
            !x360_game.is_pc_game(),
            "Xbox 360 console-only title must be filtered out"
        );

        // 6. System application (Netflix, Edge, etc.)
        let mut app = XboxTitleItem::new("102", "Netflix");
        app.pfn = Some("4DF9E0F8.Netflix_mcm4njqhnhss8".to_string());
        app.devices = Some(vec!["PC".to_string()]);
        app.r#type = Some("Application".to_string());
        assert!(!app.is_pc_game(), "Applications must be filtered out");

        // 7. Demos and Betas
        let mut demo = XboxTitleItem::new("103", "Forza Horizon 4 Demo");
        demo.pfn = Some("Microsoft.ForzaHorizon4Demo_8wekyb3d8bbwe".to_string());
        demo.devices = Some(vec!["PC".to_string()]);
        demo.r#type = Some("Game".to_string());
        assert!(!demo.is_pc_game(), "Demos must be filtered out");

        let mut beta = XboxTitleItem::new("104", "Halo Wars 2 Beta");
        beta.pfn = Some("Microsoft.HaloWars2Beta_8wekyb3d8bbwe".to_string());
        beta.devices = Some(vec!["PC".to_string()]);
        beta.r#type = Some("Game".to_string());
        assert!(!beta.is_pc_game(), "Betas must be filtered out");

        // 8. Hidden title in privacy settings
        let mut hidden = XboxTitleItem::new("105", "Old Free Game");
        hidden.pfn = Some("Microsoft.OldFree_8wekyb3d8bbwe".to_string());
        hidden.devices = Some(vec!["PC".to_string()]);
        hidden.r#type = Some("Game".to_string());
        hidden.title_history = Some(XboxTitleHistoryItemInfo {
            last_time_played: None,
            visible: false,
            can_hide: Some(true),
        });
        assert!(!hidden.is_pc_game(), "Hidden titles must be filtered out");
    }

    #[test]
    fn test_clean_title_name() {
        assert_eq!(clean_title_name("Sea of Thieves (PC)"), "Sea of Thieves");
        assert_eq!(clean_title_name("Halo Wars 2 (Windows)"), "Halo Wars 2");
        assert_eq!(
            clean_title_name("Forza Horizon 4 for Windows 10"),
            "Forza Horizon 4"
        );
        assert_eq!(clean_title_name("Gears 5 - Windows 10"), "Gears 5");
        assert_eq!(clean_title_name("Age of Empires IV®"), "Age of Empires IV");
        assert_eq!(clean_title_name("Minecraft™"), "Minecraft");
    }

    #[test]
    fn test_map_xbox_title_item_with_last_time_played() {
        let json = r#"{
            "titleId": "12345",
            "name": "State of Decay 2 (PC)",
            "pfn": "Microsoft.StateofDecay2_8wekyb3d8bbwe",
            "modernTitleId": "9NXQXX31PRSF",
            "titleHistory": {
                "lastTimePlayed": "2026-04-12T10:15:30Z",
                "visible": true
            }
        }"#;

        let item: XboxTitleItem = serde_json::from_str(json).expect("Should deserialize item");
        assert_eq!(clean_title_name(&item.name), "State of Decay 2");

        let game = map_title_to_discovered_game(&item);
        assert_eq!(game.title, "State of Decay 2");
        assert!(game.last_activity.is_some());
        let dt = game.last_activity.unwrap();
        assert_eq!(dt.to_rfc3339(), "2026-04-12T10:15:30+00:00");
    }

    #[test]
    fn test_deserialize_and_filter_title_history_response() {
        let json_response = r#"{
            "xuid": "2533274991234567",
            "titles": [
                {
                    "titleId": "1001",
                    "name": "Forza Horizon 5",
                    "type": "Game",
                    "pfn": "Microsoft.624F8B84B80_8wekyb3d8bbwe",
                    "devices": ["PC", "XboxOne"],
                    "modernTitleId": "9NXQXX31PRSF"
                },
                {
                    "titleId": "1002",
                    "name": "Halo Infinite (Steam Crossplay)",
                    "type": "Game",
                    "pfn": null,
                    "devices": ["PC"]
                },
                {
                    "titleId": "1003",
                    "name": "Doritos Crash Course (Xbox 360 Free Game)",
                    "type": "Game",
                    "devices": ["Xbox360"]
                },
                {
                    "titleId": "1004",
                    "name": "Xbox Insider Hub",
                    "type": "Application",
                    "pfn": "Microsoft.XboxInsider_8wekyb3d8bbwe",
                    "devices": ["PC"]
                }
            ]
        }"#;

        let history: XboxTitleHistoryResponse =
            serde_json::from_str(json_response).expect("Should parse history");
        assert_eq!(history.titles.len(), 4);

        let pc_games: Vec<DiscoveredGame> = history
            .titles
            .into_iter()
            .filter(|t| t.is_pc_game())
            .map(|t| map_title_to_discovered_game(&t))
            .collect();

        assert_eq!(
            pc_games.len(),
            1,
            "Only Forza Horizon 5 should pass the PC Xbox filter"
        );
        assert_eq!(pc_games[0].title, "Forza Horizon 5");
        assert_eq!(pc_games[0].external_id, "1001");
    }
}
