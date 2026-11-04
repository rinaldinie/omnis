//! Xbox Live & PC Game Pass cloud store integration plugin for Omnis Game Library

pub mod achievements;
pub mod client;

pub use achievements::*;
use async_trait::async_trait;
use omnis_sdk::{
    CloudStorePlugin, DiscoveredGame, LibraryPlugin, PluginError, StoreAccountSession,
};

pub use client::{
    authenticate_xbox_live, extract_token_from_redirect, fetch_user_titles, format_xsts_error,
    map_title_to_discovered_game, refresh_session_token, XboxDisplayClaims, XboxLiveAuthResponse,
    XboxTitleHistoryResponse, XboxTitleItem, XboxXuiClaim, XstsErrorPayload,
    ERR_XSTS_AGE_VERIFICATION_REQUIRED, ERR_XSTS_CHILD_ACCOUNT, ERR_XSTS_FORBIDDEN_GENERIC,
    ERR_XSTS_NO_XBOX_ACCOUNT, ERR_XSTS_REGION_UNSUPPORTED, ERR_XSTS_USER_ACTION_REQUIRED,
    MS_AUTH_SCOPE, MS_CLIENT_ID, MS_REDIRECT_URI, XBOX_USER_AGENT,
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
            .unwrap_or_else(|_| reqwest::Client::new());
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
impl CloudStorePlugin for XboxCloudPlugin {
    fn login_url(&self) -> String {
        format!(
            "https://login.live.com/oauth20_authorize.srf?client_id={}&scope={}&response_type=token&redirect_uri={}",
            MS_CLIENT_ID,
            urlencoding::encode(MS_AUTH_SCOPE),
            urlencoding::encode(MS_REDIRECT_URI)
        )
    }

    fn is_redirect_url(&self, url: &str) -> bool {
        url.starts_with(MS_REDIRECT_URI)
    }

    async fn exchange_code(&self, redirect_url: &str) -> Result<StoreAccountSession, PluginError> {
        let token = extract_token_from_redirect(redirect_url)?;
        authenticate_xbox_live(&self.client, &token).await
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
    fn test_map_xbox_title_item_to_discovered_game_with_modern_title_id() {
        let title = XboxTitleItem {
            title_id: "192837465".to_string(),
            name: "Forza Horizon 5".to_string(),
            r#type: Some("Game".to_string()),
            display_image: Some("https://images-eds.xboxlive.com/image?url=fh5.jpg".to_string()),
            modern_title_id: Some("9NXQXX31PRSF".to_string()),
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
        assert!(login_url.contains("response_type=token"));
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

        // 6. Generic 403 Forbidden with unparseable body
        let msg_403 = format_xsts_error(StatusCode::FORBIDDEN, "Access Denied by WAF");
        assert!(msg_403.contains(ERR_XSTS_FORBIDDEN_GENERIC));
        assert!(msg_403.contains("Access Denied by WAF"));

        // 7. Custom XErr code
        let body_custom = r#"{"Identity":"0","XErr":999999,"Message":"Specific security error"}"#;
        let msg_custom = format_xsts_error(StatusCode::BAD_REQUEST, body_custom);
        assert!(msg_custom.contains("[XErr 999999]"));
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
    }
}
