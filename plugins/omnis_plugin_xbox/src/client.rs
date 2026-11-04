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

/// Scope that requests offline_access for issuing durable refresh tokens in Authorization Code flow
pub const MS_AUTH_SCOPE_OFFLINE: &str = "service::user.auth.xboxlive.com::MBI_SSL offline_access";

/// Standard desktop User-Agent string used for Xbox Live and TitleHub requests to prevent WAF / 403 blocks
pub const XBOX_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 XboxApp/2311.1001.7.0";

/// Error message when Microsoft account has no active Xbox Live profile/gamertag (XErr 2148916233)
pub const ERR_XSTS_NO_XBOX_ACCOUNT: &str =
    "Microsoft account does not have an active Xbox Live profile. Please sign in to https://www.xbox.com or the Xbox app on Windows to create a Gamertag before linking your account.";

/// Error message when account belongs to a minor without family organizer permission (XErr 2148916238)
pub const ERR_XSTS_CHILD_ACCOUNT: &str =
    "The account belongs to a minor (child/family account). It must be added to a Microsoft Family group and authorized by an adult organizer.";

/// Error message when account is in an unsupported Xbox Live region (XErr 2148916235)
pub const ERR_XSTS_REGION_UNSUPPORTED: &str =
    "Xbox Live is not available in the country or region associated with your Microsoft account profile.";

/// Error message when adult/age verification is required (XErr 2148916236, 2148916237)
pub const ERR_XSTS_AGE_VERIFICATION_REQUIRED: &str =
    "Adult/age verification is required. Please visit https://www.xbox.com to complete age verification.";

/// Error message when user interaction or TOS acceptance is required (XErr 2148916222)
pub const ERR_XSTS_USER_ACTION_REQUIRED: &str =
    "Account requires user action (such as accepting updated terms of service). Please sign in to https://www.xbox.com to confirm.";

/// Generic error message for HTTP 403 Forbidden on Xbox XSTS
pub const ERR_XSTS_FORBIDDEN_GENERIC: &str =
    "Access forbidden (403 Forbidden) during Xbox XSTS authorization. Verify that your Microsoft account has access to Xbox Live or try again later.";

/// Response payload returned by Xbox Live / XSTS when authorization fails (HTTP 400, 401, 403)
#[derive(Deserialize)]
struct XstsErrorPayload {
    #[serde(rename = "XErr")]
    xerr: Option<serde_json::Value>,
    #[serde(rename = "Message")]
    message: Option<String>,
}

/// Formats Xbox XSTS authorization errors into actionable diagnostic messages
pub fn format_xsts_error(status: reqwest::StatusCode, body: &str) -> String {
    if let Ok(err) = serde_json::from_str::<XstsErrorPayload>(body) {
        let parsed_code = match &err.xerr {
            Some(serde_json::Value::Number(n)) => {
                n.as_u64().or_else(|| n.as_i64().map(|v| v as u32 as u64))
            }
            Some(serde_json::Value::String(s)) => {
                let s = s.trim();
                s.strip_prefix("0x")
                    .or_else(|| s.strip_prefix("0X"))
                    .and_then(|h| u64::from_str_radix(h, 16).ok())
                    .or_else(|| s.parse::<i64>().ok().map(|v| v as u32 as u64))
            }
            _ => None,
        };

        if let Some(code) = parsed_code {
            return match code {
                2148916233 => ERR_XSTS_NO_XBOX_ACCOUNT.to_string(),
                2148916238 => ERR_XSTS_CHILD_ACCOUNT.to_string(),
                2148916235 => ERR_XSTS_REGION_UNSUPPORTED.to_string(),
                2148916236 | 2148916237 => ERR_XSTS_AGE_VERIFICATION_REQUIRED.to_string(),
                2148916222 => ERR_XSTS_USER_ACTION_REQUIRED.to_string(),
                custom_code => {
                    let msg = err
                        .message
                        .as_deref()
                        .unwrap_or("Access denied by Xbox Live service");
                    format!("Xbox XSTS authorization failed ({status}) [XErr {custom_code} / 0x{custom_code:08X}]: {msg}")
                }
            };
        }
    }

    if status.as_u16() == 403 {
        let trimmed = body.trim();
        if trimmed.starts_with("<!DOCTYPE") || trimmed.starts_with("<html") || trimmed.len() > 512 {
            format!("{ERR_XSTS_FORBIDDEN_GENERIC} (WAF / Access Denied)")
        } else if trimmed.is_empty() {
            ERR_XSTS_FORBIDDEN_GENERIC.to_string()
        } else {
            format!("{ERR_XSTS_FORBIDDEN_GENERIC}: {trimmed}")
        }
    } else {
        format!("Xbox XSTS authorization failed ({status}): {body}")
    }
}

/// Response from Xbox Live user authenticate or XSTS authorize endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XboxLiveAuthResponse {
    #[serde(alias = "token", rename = "Token")]
    pub token: String,
    #[serde(
        alias = "displayClaims",
        alias = "display_claims",
        rename = "DisplayClaims"
    )]
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

/// Result of parsing an OAuth redirect URI (either PKCE authorization code or implicit access token)
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MsAuthRedirect {
    Code(String),
    AccessToken(String),
}

/// Extracts an authorization code or access token from the OAuth redirect URL
pub fn extract_auth_from_redirect(redirect_url: &str) -> Result<MsAuthRedirect, PluginError> {
    if redirect_url.contains("error=") {
        return Err(PluginError::Other(format!(
            "OAuth authentication error in redirect: {redirect_url}"
        )));
    }

    let parts = [
        redirect_url
            .split_once('?')
            .map(|(_, q)| q.split('#').next().unwrap_or(q)),
        redirect_url.split_once('#').map(|(_, f)| f),
    ];

    for part_opt in parts.into_iter().flatten() {
        for pair in part_opt.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "code" {
                    let decoded = urlencoding::decode(v).map_err(|e| {
                        PluginError::Parse(format!("Failed to decode authorization code: {e}"))
                    })?;
                    return Ok(MsAuthRedirect::Code(decoded.into_owned()));
                } else if k == "access_token" {
                    let decoded = urlencoding::decode(v).map_err(|e| {
                        PluginError::Parse(format!("Failed to decode access_token: {e}"))
                    })?;
                    return Ok(MsAuthRedirect::AccessToken(decoded.into_owned()));
                }
            }
        }
    }

    Err(PluginError::Parse(format!(
        "No authorization code or access_token found in redirect URL: {redirect_url}"
    )))
}

/// Extracts access_token or authorization code from the OAuth redirect URL (backwards compatible)
pub fn extract_token_from_redirect(redirect_url: &str) -> Result<String, PluginError> {
    match extract_auth_from_redirect(redirect_url)? {
        MsAuthRedirect::AccessToken(tok) => Ok(tok),
        MsAuthRedirect::Code(code) => Ok(code),
    }
}

/// Token payload returned by Microsoft OAuth token endpoint
#[derive(Debug, Clone, Deserialize)]
pub struct MsTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_in: Option<i64>,
}

/// Exchanges an OAuth2 authorization code for an access token and durable refresh token
pub async fn exchange_authorization_code(
    client: &reqwest::Client,
    code: &str,
) -> Result<MsTokenResponse, PluginError> {
    let params = [
        ("client_id", MS_CLIENT_ID),
        ("grant_type", "authorization_code"),
        ("code", code),
        ("scope", MS_AUTH_SCOPE_OFFLINE),
        ("redirect_uri", MS_REDIRECT_URI),
    ];

    let resp = client
        .post("https://login.live.com/oauth20_token.srf")
        .header("User-Agent", XBOX_USER_AGENT)
        .form(&params)
        .send()
        .await
        .map_err(|e| PluginError::Other(format!("Failed to exchange authorization code: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(PluginError::Other(format!(
            "Microsoft authorization code exchange failed ({status}): {body}"
        )));
    }

    resp.json::<MsTokenResponse>()
        .await
        .map_err(|e| PluginError::Parse(format!("Failed to parse Microsoft token response: {e}")))
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
        .header("User-Agent", XBOX_USER_AGENT)
        .header("x-xbl-contract-version", "1")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&user_auth_payload)
        .send()
        .await
        .map_err(|e| PluginError::Other(format!("Failed to reach user.auth.xboxlive.com: {e}")))?;

    if !user_resp.status().is_success() {
        let status = user_resp.status();
        let body = user_resp.text().await.unwrap_or_default();
        if status.as_u16() == 400 || status.as_u16() == 401 {
            return Err(PluginError::SessionExpired(format!(
                "Xbox user authentication token expired ({status}): {body}"
            )));
        }
        return Err(PluginError::Other(format!(
            "Xbox user authentication failed ({status}): {body}"
        )));
    }

    let user_auth: XboxLiveAuthResponse = user_resp.json().await.map_err(|e| {
        PluginError::Parse(format!(
            "Failed to parse Xbox user authentication response: {e}"
        ))
    })?;

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
        .header("User-Agent", XBOX_USER_AGENT)
        .header("x-xbl-contract-version", "1")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&xsts_payload)
        .send()
        .await
        .map_err(|e| PluginError::Other(format!("Failed to reach xsts.auth.xboxlive.com: {e}")))?;

    if !xsts_resp.status().is_success() {
        let status = xsts_resp.status();
        let body = xsts_resp.text().await.unwrap_or_default();
        let err_msg = format_xsts_error(status, &body);
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(PluginError::SessionExpired(err_msg));
        }
        return Err(PluginError::Other(err_msg));
    }

    let xsts_auth: XboxLiveAuthResponse = xsts_resp.json().await.map_err(|e| {
        PluginError::Parse(format!(
            "Failed to parse Xbox XSTS authorization response: {e}"
        ))
    })?;

    // 3. Extract user claims
    let user_claim = user_auth.display_claims.xui.first();
    let xsts_claim = xsts_auth.display_claims.xui.first();
    let claim = xsts_claim.or(user_claim).ok_or_else(|| {
        PluginError::Other("No Xbox user claims returned from authorization".to_string())
    })?;

    let uhs = claim.uhs.clone();
    let gtg = xsts_claim
        .and_then(|c| c.gtg.clone())
        .or_else(|| user_claim.and_then(|c| c.gtg.clone()))
        .unwrap_or_else(|| "Xbox User".to_string());
    let account_id = xsts_claim
        .and_then(|c| c.xid.clone())
        .or_else(|| user_claim.and_then(|c| c.xid.clone()))
        .unwrap_or_else(|| uhs.clone());

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
        ("scope", MS_AUTH_SCOPE_OFFLINE),
        ("redirect_uri", MS_REDIRECT_URI),
    ];

    if let Ok(resp) = client
        .post("https://login.live.com/oauth20_token.srf")
        .header("User-Agent", XBOX_USER_AGENT)
        .form(&params)
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(body) = resp.json::<MsTokenResponse>().await {
                let mut session = authenticate_xbox_live(client, &body.access_token).await?;
                if body.refresh_token.is_some() {
                    session.refresh_token = body.refresh_token;
                } else {
                    session.refresh_token = Some(refresh_token.to_string());
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

    let mut candidate_endpoints = Vec::with_capacity(2);
    if !session.user_id.is_empty() && session.user_id.chars().all(|c| c.is_ascii_digit()) {
        candidate_endpoints.push(format!(
            "https://titlehub.xboxlive.com/users/xuid({})/titles/titlehistory/decoration/scid,image,detail",
            session.user_id
        ));
    }
    candidate_endpoints.push(
        "https://titlehub.xboxlive.com/users/me/titles/titlehistory/decoration/scid,image,detail"
            .to_string(),
    );

    let mut last_error = None;
    let mut session_expired = false;
    for endpoint in candidate_endpoints {
        tracing::debug!("Fetching Xbox title history from TitleHub endpoint: {endpoint}");

        let resp = client
            .get(&endpoint)
            .header("User-Agent", XBOX_USER_AGENT)
            .header("x-xbl-contract-version", "2")
            .header("Authorization", &auth_header_value)
            .header("Accept", "application/json")
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                let history: XboxTitleHistoryResponse = r.json().await.map_err(|e| {
                    PluginError::Parse(format!("Failed to parse TitleHub title history: {e}"))
                })?;

                let games = history
                    .titles
                    .into_iter()
                    .map(|item| map_title_to_discovered_game(&item))
                    .collect();

                return Ok(games);
            }
            Ok(r) => {
                let status = r.status();
                let body = r.text().await.unwrap_or_default();
                last_error = Some(format!("TitleHub request failed ({status}): {body}"));
                if status == reqwest::StatusCode::UNAUTHORIZED {
                    session_expired = true;
                    break;
                }
            }
            Err(e) => {
                last_error = Some(format!("Failed to connect to TitleHub: {e}"));
            }
        }
    }

    if session_expired {
        return Err(PluginError::SessionExpired(last_error.unwrap_or_else(
            || "Xbox Live XSTS session expired (401 Unauthorized)".to_string(),
        )));
    }

    Err(PluginError::Other(last_error.unwrap_or_else(|| {
        "Failed to fetch Xbox title history from TitleHub".to_string()
    })))
}
