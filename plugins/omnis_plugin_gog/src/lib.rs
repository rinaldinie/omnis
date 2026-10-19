//! GOG Galaxy library and cloud store integration plugin for Omnis Game Library

pub mod client;

pub use client::{
    deserialize_string_or_number, extract_code_from_url, fetch_user_data, fetch_user_games,
    normalize_gog_game, GogGameDetails, GogGamesResponse, GogTokenResponse, GogUserData,
    GOG_AUTH_URL, GOG_CLIENT_ID, GOG_CLIENT_SECRET, GOG_PRODUCTS_URL, GOG_REDIRECT_URI,
    GOG_TOKEN_URL, GOG_USER_DATA_URL, GOG_USER_GAMES_URL,
};

use omnis_sdk::{
    async_trait, CloudStorePlugin, DiscoveredGame, LibraryPlugin, PluginError,
    StoreAccountSession,
};

#[derive(Debug, Clone)]
pub struct GogCloudPlugin {
    client: reqwest::Client,
}

impl GogCloudPlugin {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }

    pub fn with_client(client: reqwest::Client) -> Self {
        Self { client }
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
        // Scansione locale: se il client locale non è rilevato, restituisce Ok(vec![])
        Ok(Vec::new())
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

    async fn refresh_session(&self, refresh_token: &str) -> Result<StoreAccountSession, PluginError> {
        client::refresh_token(&self.client, refresh_token).await
    }

    async fn sync_games(&self, session: &StoreAccountSession) -> Result<Vec<DiscoveredGame>, PluginError> {
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

        let token: GogTokenResponse = serde_json::from_str(json_data).expect("Failed to deserialize token");
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

        let token_numeric: GogTokenResponse =
            serde_json::from_str(json_numeric_user).expect("Failed to deserialize token with numeric user_id");
        assert_eq!(token_numeric.user_id, "123456789");
    }

    #[test]
    fn test_normalize_gog_game_protocol_uri() {
        let gog_game = GogGameDetails {
            id: 1207658691,
            title: "The Witcher 3: Wild Hunt - Game of the Year Edition".to_string(),
            image: Some("//images-3.gog.com/witcher3_thumb.jpg".to_string()),
        };

        let discovered = normalize_gog_game(&gog_game);

        assert_eq!(discovered.library_id, "gog");
        assert_eq!(discovered.external_id, "1207658691");
        assert_eq!(discovered.title, "The Witcher 3: Wild Hunt - Game of the Year Edition");
        assert!(!discovered.is_installed);
        assert_eq!(discovered.install_dir, None);
        assert_eq!(discovered.playtime_seconds, 0);
        assert_eq!(discovered.play_count, 0);
        assert_eq!(discovered.last_activity, None);
        assert_eq!(
            discovered.cover_image_path,
            Some("https://images-3.gog.com/witcher3_thumb.jpg".to_string())
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
    fn test_cloud_store_plugin_interface() {
        let plugin = GogCloudPlugin::new();

        assert_eq!(plugin.id(), "gog");
        assert_eq!(plugin.name(), "GOG Galaxy");

        let login_url = plugin.login_url();
        assert!(login_url.contains(client::GOG_CLIENT_ID));
        assert!(login_url.contains("response_type=code"));
        assert!(login_url.contains("layout=client2"));
        assert!(login_url.contains("https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient"));

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

        let parsed: GogGamesResponse = serde_json::from_str(json_games).expect("Failed to deserialize owned games");
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

        let parsed: GogUserData = serde_json::from_str(json_user).expect("Failed to deserialize user data");
        assert_eq!(parsed.username, Some("GeraltOfRivia".to_string()));
        assert_eq!(parsed.avatar, Some("https://images.gog.com/avatars/geralt.png".to_string()));
    }
}
