//! Epic Games Store cloud and OAuth client implementation

use chrono::Utc;
use omnis_sdk::{
    DiscoveredGame, LaunchConfiguration, PluginError, ProcessTrackingMode, StoreAccountSession,
};
use serde::{Deserialize, Serialize};

pub const EPIC_CLIENT_ID: &str = "34a6cf8bd0344e2197fb8514a0e23778";
pub const EPIC_REDIRECT_URI: &str = "https://www.epicgames.com/id/api/redirect";
pub const EPIC_AUTH_URL: &str = "https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D34a6cf8bd0344e2197fb8514a0e23778%26responseType%3Dcode";
pub const EPIC_TOKEN_URL: &str = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";
pub const EPIC_ENTITLEMENTS_URL: &str = "https://entitlement-public-service-prod08.ol.epicgames.com/entitlement/api/account";
pub const EPIC_BASIC_AUTH: &str = "Basic MzRhNmNmOGJkMDM0NGUyMTk3ZmI4NTE0YTBlMjM3Nzg6ZGFmM2VhZjAyMDI4NDcxNDhhZGFlNDZlcmd1ZmQzNDE=";

/// OAuth token response returned by Epic Games token service
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EpicOAuthTokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_in: Option<i64>,
    #[serde(alias = "accountId")]
    pub account_id: String,
    #[serde(default, alias = "displayName")]
    pub display_name: Option<String>,
}

/// Entitlement metadata item returned by Epic Games entitlement service
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EpicEntitlement {
    pub id: String,
    #[serde(default, alias = "entitlementName")]
    pub entitlement_name: Option<String>,
    #[serde(default)]
    pub namespace: Option<String>,
    #[serde(default, alias = "catalogItemId")]
    pub catalog_item_id: Option<String>,
    #[serde(default, alias = "grantDate")]
    pub grant_date: Option<String>,
}

/// Normalizes an Epic Games Entitlement into an Omnis DiscoveredGame
pub fn normalize_epic_entitlement(entitlement: &EpicEntitlement) -> DiscoveredGame {
    let external_id = entitlement
        .catalog_item_id
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| entitlement.id.clone());

    let title = entitlement
        .entitlement_name
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| entitlement.id.clone());

    DiscoveredGame {
        library_id: "epic".to_string(),
        external_id: external_id.clone(),
        title,
        install_dir: None,
        is_installed: false,
        play_action: Some(LaunchConfiguration {
            executable: format!("com.epicgames.launcher://apps/{}?action=install", external_id),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::ProcessName("EpicGamesLauncher.exe".to_string()),
        }),
        playtime_seconds: 0,
        play_count: 0,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
    }
}

/// Extracts exchangeCode or code from the query parameters or URL fragment
pub fn extract_exchange_code(url_str: &str) -> Option<String> {
    if let Ok(parsed) = url::Url::parse(url_str) {
        // 1. Check query parameters
        for (key, val) in parsed.query_pairs() {
            if key == "exchangeCode" || key == "code" {
                return Some(val.into_owned());
            }
        }

        // 2. Check fragment
        if let Some(fragment) = parsed.fragment() {
            for (key, val) in url::form_urlencoded::parse(fragment.as_bytes()) {
                if key == "exchangeCode" || key == "code" {
                    return Some(val.into_owned());
                }
            }
        }
    }

    // Fallback: search string directly (checking exchangeCode before code)
    if let Some(pos) = url_str.find("exchangeCode=") {
        let after = &url_str[pos + 13..];
        let end = after.find(|c| c == '&' || c == '#' || c == ' ').unwrap_or(after.len());
        return Some(after[..end].to_string());
    }
    if let Some(pos) = url_str.find("code=") {
        let after = &url_str[pos + 5..];
        let end = after.find(|c| c == '&' || c == '#' || c == ' ').unwrap_or(after.len());
        return Some(after[..end].to_string());
    }

    None
}

/// Exchanges an exchange code for an authenticated StoreAccountSession
pub async fn exchange_code(
    client: &reqwest::Client,
    code: &str,
) -> Result<StoreAccountSession, PluginError> {
    let params = [
        ("grant_type", "exchange_code"),
        ("exchange_code", code),
        ("token_type", "eg1"),
    ];

    let resp = client
        .post(EPIC_TOKEN_URL)
        .header("Authorization", EPIC_BASIC_AUTH)
        .form(&params)
        .send()
        .await
        .map_err(|e| PluginError::Io(format!("OAuth token request failed: {}", e)))?;

    if !resp.status().is_success() {
        return Err(PluginError::Other(format!(
            "Epic OAuth token exchange failed with HTTP status {}",
            resp.status()
        )));
    }

    let token_resp: EpicOAuthTokenResponse = resp
        .json()
        .await
        .map_err(|e| PluginError::Parse(format!("Failed to parse Epic token response: {}", e)))?;

    let now = Utc::now().timestamp();
    let expires_at = token_resp.expires_in.map(|exp| now + exp);

    Ok(StoreAccountSession {
        store_id: "epic".to_string(),
        user_id: token_resp.account_id,
        username: token_resp
            .display_name
            .unwrap_or_else(|| "Epic Player".to_string()),
        avatar_url: None,
        access_token: token_resp.access_token,
        refresh_token: token_resp.refresh_token,
        expires_at,
    })
}

/// Refreshes an expired session using a refresh_token
pub async fn refresh_token(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<StoreAccountSession, PluginError> {
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("token_type", "eg1"),
    ];

    let resp = client
        .post(EPIC_TOKEN_URL)
        .header("Authorization", EPIC_BASIC_AUTH)
        .form(&params)
        .send()
        .await
        .map_err(|e| PluginError::Io(format!("OAuth token refresh request failed: {}", e)))?;

    if !resp.status().is_success() {
        return Err(PluginError::Other(format!(
            "Epic OAuth token refresh failed with HTTP status {}",
            resp.status()
        )));
    }

    let token_resp: EpicOAuthTokenResponse = resp
        .json()
        .await
        .map_err(|e| PluginError::Parse(format!("Failed to parse Epic token refresh response: {}", e)))?;

    let now = Utc::now().timestamp();
    let expires_at = token_resp.expires_in.map(|exp| now + exp);

    Ok(StoreAccountSession {
        store_id: "epic".to_string(),
        user_id: token_resp.account_id,
        username: token_resp
            .display_name
            .unwrap_or_else(|| "Epic Player".to_string()),
        avatar_url: None,
        access_token: token_resp.access_token,
        refresh_token: token_resp.refresh_token,
        expires_at,
    })
}

/// Fetches user entitlements and normalizes them into DiscoveredGame items
pub async fn fetch_user_games(
    client: &reqwest::Client,
    session: &StoreAccountSession,
) -> Result<Vec<DiscoveredGame>, PluginError> {
    let url = format!(
        "{}/{}/entitlements?start=0&count=5000",
        EPIC_ENTITLEMENTS_URL, session.user_id
    );

    let resp = client
        .get(&url)
        .bearer_auth(&session.access_token)
        .send()
        .await
        .map_err(|e| PluginError::Io(format!("Failed to fetch Epic entitlements: {}", e)))?;

    if !resp.status().is_success() {
        return Err(PluginError::Other(format!(
            "Failed to fetch Epic entitlements: HTTP {}",
            resp.status()
        )));
    }

    let entitlements: Vec<EpicEntitlement> = resp
        .json()
        .await
        .map_err(|e| PluginError::Parse(format!("Failed to parse Epic entitlements: {}", e)))?;

    let mut seen_ids = std::collections::HashSet::new();
    let mut games = Vec::new();

    for entitlement in entitlements {
        let game = normalize_epic_entitlement(&entitlement);
        if seen_ids.insert(game.external_id.clone()) {
            games.push(game);
        }
    }

    Ok(games)
}
