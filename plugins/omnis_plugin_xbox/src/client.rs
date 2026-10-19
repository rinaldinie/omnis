//! HTTP Client and data models for Xbox Live & PC Game Pass cloud sync.

use omnis_sdk::{
    DiscoveredGame, LaunchConfiguration, PluginError, ProcessTrackingMode, StoreAccountSession,
};
use serde::{Deserialize, Serialize};

/// Microsoft OAuth client ID used for Xbox Live authentication (Xbox app client ID)
pub const MS_CLIENT_ID: &str = "0000000048093EE3";

/// Microsoft OAuth desktop redirect URI
pub const MS_REDIRECT_URI: &str = "https://login.live.com/oauth20_desktop.srf";

/// Microsoft OAuth authorization scope for Xbox Live service
pub const MS_AUTH_SCOPE: &str = "service::user.auth.xboxlive.com::MBI_SSL";

/// Response from Xbox Live user authenticate or XSTS authorize endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XboxLiveAuthResponse {
    #[serde(alias = "token", rename = "Token")]
    pub token: String,
    #[serde(alias = "displayClaims", alias = "display_claims", rename = "DisplayClaims")]
    pub display_claims: XboxDisplayClaims,
    #[serde(alias = "issueInstant", alias = "IssueInstant", default)]
    pub issue_instant: Option<String>,
    #[serde(alias = "notAfter", alias = "NotAfter", default)]
    pub not_after: Option<String>,
}

/// Container for display claims returned by Xbox Live
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XboxDisplayClaims {
    #[serde(default)]
    pub xui: Vec<XboxXuiClaim>,
}

/// Individual user claim in Xbox Live authentication response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XboxXuiClaim {
    pub uhs: String,
    #[serde(default)]
    pub gtg: Option<String>,
    #[serde(default)]
    pub xid: Option<String>,
    #[serde(default)]
    pub agg: Option<String>,
}

/// Response returned from TitleHub title history API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XboxTitleHistoryResponse {
    #[serde(default)]
    pub titles: Vec<XboxTitleItem>,
}

/// Single title entry in the Xbox user library / title history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XboxTitleItem {
    #[serde(alias = "titleId", alias = "title_id")]
    pub title_id: String,
    pub name: String,
    #[serde(alias = "type", default)]
    pub r#type: Option<String>,
    #[serde(alias = "displayImage", alias = "display_image", default)]
    pub display_image: Option<String>,
    #[serde(alias = "modernTitleId", alias = "modern_title_id", default)]
    pub modern_title_id: Option<String>,
}

impl XboxTitleItem {
    pub fn to_discovered_game(&self) -> DiscoveredGame {
        map_title_to_discovered_game(self)
    }
}

impl From<XboxTitleItem> for DiscoveredGame {
    fn from(title: XboxTitleItem) -> Self {
        map_title_to_discovered_game(&title)
    }
}

/// Convert an `XboxTitleItem` into a standardized `DiscoveredGame`
pub fn map_title_to_discovered_game(title: &XboxTitleItem) -> DiscoveredGame {
    let product_id = title
        .modern_title_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(&title.title_id);

    DiscoveredGame {
        library_id: "xbox".to_string(),
        external_id: title.title_id.clone(),
        title: title.name.clone(),
        install_dir: None,
        is_installed: false,
        play_action: Some(LaunchConfiguration {
            executable: format!("ms-windows-store://pdp/?ProductId={product_id}"),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }),
        playtime_seconds: 0,
        play_count: 0,
        last_activity: None,
        cover_image_path: title.display_image.clone(),
        background_image_path: None,
    }
}

/// Extracts access_token from the OAuth redirect URL (fragment hash or query param)
pub fn extract_token_from_redirect(redirect_url: &str) -> Result<String, PluginError> {
    // 1. Check URL fragment (#access_token=...&...)
    if let Some((_, fragment)) = redirect_url.split_once('#') {
        for pair in fragment.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "access_token" {
                    let decoded = urlencoding::decode(v)
                        .map_err(|e| PluginError::Parse(format!("Failed to decode access_token: {e}")))?;
                    return Ok(decoded.into_owned());
                }
            }
        }
    }

    // 2. Check query string (?access_token=...&...)
    if let Some((_, query_part)) = redirect_url.split_once('?') {
        let query = query_part.split('#').next().unwrap_or(query_part);
        for pair in query.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "access_token" {
                    let decoded = urlencoding::decode(v)
                        .map_err(|e| PluginError::Parse(format!("Failed to decode access_token: {e}")))?;
                    return Ok(decoded.into_owned());
                }
            }
        }
    }

    // Check for error parameters in redirect
    if redirect_url.contains("error=") {
        return Err(PluginError::Other(format!(
            "OAuth authentication error in redirect: {redirect_url}"
        )));
    }

    Err(PluginError::Parse(format!(
        "No access_token found in redirect URL: {redirect_url}"
    )))
}

/// Authenticates with Xbox Live using a Microsoft access token:
/// 1. Calls `https://user.auth.xboxlive.com/user/authenticate`
/// 2. Exchanges user token for XSTS token via `https://xsts.auth.xboxlive.com/xsts/authorize`
/// 3. Extracts gamertag (`gtg`), user hash (`uhs`), and account ID (`xid`)
pub async fn authenticate_xbox_live(
    client: &reqwest::Client,
    ms_access_token: &str,
) -> Result<StoreAccountSession, PluginError> {
    // Format RPS ticket with "d=" prefix if not already present
    let rps_ticket = if ms_access_token.starts_with("d=") || ms_access_token.starts_with("t=") {
        ms_access_token.to_string()
    } else {
        format!("d={ms_access_token}")
    };

    // 1. Authenticate with Xbox Live User endpoint
    let user_auth_payload = serde_json::json!({
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT",
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": rps_ticket
        }
    });

    tracing::debug!("Requesting Xbox Live user token from user.auth.xboxlive.com");
    let user_resp = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&user_auth_payload)
        .send()
        .await
        .map_err(|e| PluginError::Other(format!("Failed to reach user.auth.xboxlive.com: {e}")))?;

    if !user_resp.status().is_success() {
        let status = user_resp.status();
        let body = user_resp.text().await.unwrap_or_default();
        return Err(PluginError::Other(format!(
            "Xbox user authentication failed ({status}): {body}"
        )));
    }

    let user_auth: XboxLiveAuthResponse = user_resp
        .json()
        .await
        .map_err(|e| PluginError::Parse(format!("Failed to parse Xbox user authentication response: {e}")))?;

    // 2. Authorize with XSTS endpoint for RelyingParty http://xboxlive.com
    let xsts_payload = serde_json::json!({
        "RelyingParty": "http://xboxlive.com",
        "TokenType": "JWT",
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [user_auth.token]
        }
    });

    tracing::debug!("Authorizing XSTS token with xsts.auth.xboxlive.com");
    let xsts_resp = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&xsts_payload)
        .send()
        .await
        .map_err(|e| PluginError::Other(format!("Failed to reach xsts.auth.xboxlive.com: {e}")))?;

    if !xsts_resp.status().is_success() {
        let status = xsts_resp.status();
        let body = xsts_resp.text().await.unwrap_or_default();
        return Err(PluginError::Other(format!(
            "Xbox XSTS authorization failed ({status}): {body}"
        )));
    }

    let xsts_auth: XboxLiveAuthResponse = xsts_resp
        .json()
        .await
        .map_err(|e| PluginError::Parse(format!("Failed to parse Xbox XSTS authorization response: {e}")))?;

    // 3. Extract user claims
    let claim = xsts_auth
        .display_claims
        .xui
        .first()
        .or_else(|| user_auth.display_claims.xui.first())
        .ok_or_else(|| PluginError::Other("No Xbox user claims returned from authorization".to_string()))?;

    let uhs = claim.uhs.clone();
    let gtg = claim
        .gtg
        .clone()
        .unwrap_or_else(|| "Xbox User".to_string());
    let account_id = claim.xid.clone().unwrap_or_else(|| uhs.clone());

    // Parse token expiration if present or default to 24h
    let expires_at = xsts_auth
        .not_after
        .as_deref()
        .and_then(|na| chrono::DateTime::parse_from_rfc3339(na).ok())
        .map(|dt| dt.timestamp())
        .or_else(|| Some(chrono::Utc::now().timestamp() + 86400));

    Ok(StoreAccountSession {
        store_id: "xbox".to_string(),
        user_id: account_id,
        username: gtg,
        avatar_url: None,
        access_token: format!("{uhs};{}", xsts_auth.token),
        refresh_token: Some(ms_access_token.to_string()),
        expires_at,
    })
}

/// Refreshes an expired Xbox session
pub async fn refresh_session_token(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<StoreAccountSession, PluginError> {
    // Attempt standard OAuth2 refresh token exchange with Microsoft login
    let params = [
        ("client_id", MS_CLIENT_ID),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("scope", MS_AUTH_SCOPE),
        ("redirect_uri", MS_REDIRECT_URI),
    ];

    if let Ok(resp) = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
    {
        if resp.status().is_success() {
            #[derive(Deserialize)]
            struct MsTokenResponse {
                access_token: String,
                refresh_token: Option<String>,
            }
            if let Ok(body) = resp.json::<MsTokenResponse>().await {
                let mut session = authenticate_xbox_live(client, &body.access_token).await?;
                if body.refresh_token.is_some() {
                    session.refresh_token = body.refresh_token;
                }
                return Ok(session);
            }
        }
    }

    // Fallback: If refresh_token is directly a Microsoft access token
    authenticate_xbox_live(client, refresh_token).await
}

/// Queries remote TitleHub API and retrieves the catalog of titles played/owned by the user
pub async fn fetch_user_titles(
    client: &reqwest::Client,
    session: &StoreAccountSession,
) -> Result<Vec<DiscoveredGame>, PluginError> {
    let auth_header_value = if session.access_token.starts_with("XBL3.0 ") {
        session.access_token.clone()
    } else if session.access_token.starts_with("x=") {
        format!("XBL3.0 {}", session.access_token)
    } else if session.access_token.contains(';') {
        format!("XBL3.0 x={}", session.access_token)
    } else {
        format!("XBL3.0 x={};{}", session.user_id, session.access_token)
    };

    let endpoint = "https://titlehub.xboxlive.com/users/me/titles/titlehistory/decoration/scid,image,detail";
    tracing::debug!("Fetching Xbox title history from TitleHub endpoint: {endpoint}");

    let resp = client
        .get(endpoint)
        .header("x-xbl-contract-version", "2")
        .header("X-Authorization", &auth_header_value)
        .header("Authorization", &auth_header_value)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| PluginError::Other(format!("Failed to connect to TitleHub: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(PluginError::Other(format!(
            "TitleHub request failed ({status}): {body}"
        )));
    }

    let history: XboxTitleHistoryResponse = resp
        .json()
        .await
        .map_err(|e| PluginError::Parse(format!("Failed to parse TitleHub title history: {e}")))?;

    let games = history
        .titles
        .into_iter()
        .map(|item| map_title_to_discovered_game(&item))
        .collect();

    Ok(games)
}
