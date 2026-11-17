//! Amazon Games Cloud Store API Client.
//!
//! Implements OpenID / PKCE authentication, Amazon Device registration, session refresh,
//! and cloud entitlements synchronization with Prime Gaming / Amazon Games catalog.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::Utc;
use omnis_sdk::{DiscoveredGame, LaunchConfiguration, PluginError, ProcessTrackingMode, StoreAccountSession};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

/// Base OpenID sign-in URL for Amazon Games Launcher
pub const AMAZON_AUTH_BASE_URL: &str =
    "https://www.amazon.com/ap/signin?openid.ns=http://specs.openid.net/auth/2.0&openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select&openid.identity=http://specs.openid.net/auth/2.0/identifier_select&openid.mode=checkid_setup&openid.oa2.scope=device_auth_access&openid.ns.oa2=http://www.amazon.com/ap/ext/oauth/2&openid.oa2.response_type=code&openid.oa2.code_challenge_method=S256&openid.oa2.client_id=device:3733646238643238366332613932346432653737653161663637373636363435234132554d56484f58375550345637&language=en_US&marketPlaceId=ATVPDKIKX0DER&openid.return_to=https://www.amazon.com&openid.pape.max_auth_age=0&openid.assoc_handle=amzn_sonic_games_launcher&pageId=amzn_sonic_games_launcher&openid.oa2.code_challenge=";

/// OAuth Client ID extracted from Amazon Games client
pub const AMAZON_CLIENT_ID: &str =
    "3733646238643238366332613932346432653737653161663637373636363435234132554d56484f58375550345637";

/// Amazon Device Type ID for Windows Desktop Client
pub const AMAZON_DEVICE_TYPE: &str = "A2UMVHOX7UP4V7";

/// Hardcoded key ID for entitlements distribution service
pub const AMAZON_KEY_ID: &str = "d5dc8b8b-86c8-4fc4-ae93-18c0def5314d";

/// Client identifier for Amazon Entitlements Distribution Service (`GetEntitlements`)
pub const AMAZON_ENTITLEMENTS_CLIENT_ID: &str = "Sonic";

/// User-Agent header for Device Registration & Token endpoints
pub const AMAZON_USER_AGENT: &str = "AGSLauncher/1.0.0";

/// User-Agent header for Entitlements Distribution Service
pub const AMAZON_ENTITLEMENTS_USER_AGENT: &str = "com.amazon.agslauncher.win/3.0.9495.3";

/// Amazon Device Registration endpoint
pub const AMAZON_AUTH_REGISTER_URL: &str = "https://api.amazon.com/auth/register";

/// Amazon Token Refresh endpoint
pub const AMAZON_AUTH_TOKEN_URL: &str = "https://api.amazon.com/auth/token";

/// Amazon User Profile endpoint
pub const AMAZON_USER_PROFILE_URL: &str = "https://api.amazon.com/user/profile";

/// Amazon Entitlements Distribution Service endpoint
pub const AMAZON_ENTITLEMENTS_URL: &str =
    "https://gaming.amazon.com/api/distribution/entitlements";

/// Product line for in-game loot/DLCs that should be skipped during game sync
pub const TWITCH_FUEL_ENTITLEMENT: &str = "Twitch:FuelEntitlement";

/// Generates a cryptographically random PKCE code verifier (45-64 alphanumeric chars).
pub fn generate_code_verifier() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    (0..50)
        .map(|_| {
            let idx = fastrand::usize(..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Computes the SHA-256 PKCE code challenge encoded in base64url without padding.
pub fn compute_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    URL_SAFE_NO_PAD.encode(hash)
}

/// Extracts the `openid.oa2.authorization_code` parameter from the redirect URL query string,
/// including nested `openid.return_to` / `return_to` parameters (such as Amazon passkey nudge redirects).
pub fn extract_authorization_code(redirect_url: &str) -> Option<String> {
    extract_authorization_code_inner(redirect_url, 0)
}

fn extract_authorization_code_inner(redirect_url: &str, depth: usize) -> Option<String> {
    if depth > 3 {
        return None;
    }

    if let Ok(parsed) = url::Url::parse(redirect_url) {
        let mut nested_urls = Vec::new();

        for (k, v) in parsed.query_pairs() {
            if k == "openid.oa2.authorization_code" && !v.is_empty() {
                return Some(v.into_owned());
            }
            if k == "openid.return_to" || k == "return_to" {
                nested_urls.push(v.into_owned());
            }
        }

        for nested in nested_urls {
            if let Some(code) = extract_authorization_code_inner(&nested, depth + 1) {
                return Some(code);
            }
        }

        return None;
    }

    // Direct fallback if URL parsing failed (e.g. schemeless URLs)
    if let Some(pos) = redirect_url.find("openid.oa2.authorization_code=") {
        let rest = &redirect_url[pos + "openid.oa2.authorization_code=".len()..];
        let code_part = rest.split('&').next().unwrap_or(rest);
        let decoded = urlencoding::decode(code_part)
            .map(|c| c.into_owned())
            .unwrap_or_else(|_| code_part.to_string());
        if !decoded.is_empty() {
            return Some(decoded);
        }
    }

    None
}

/// Computes the hex-encoded Amazon OAuth client ID from `device_serial` and `AMAZON_DEVICE_TYPE`.
pub fn compute_client_id(device_serial: &str) -> String {
    let raw = format!("{}#{}", device_serial, AMAZON_DEVICE_TYPE);
    raw.bytes().map(|b| format!("{:02x}", b)).collect()
}

/// Builds the Amazon OpenID + PKCE sign-in URL for the given `client_id` and `code_challenge`.
pub fn build_login_url(client_id: &str, code_challenge: &str) -> String {
    format!(
        "https://www.amazon.com/ap/signin?openid.ns=http://specs.openid.net/auth/2.0&openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select&openid.identity=http://specs.openid.net/auth/2.0/identifier_select&openid.mode=checkid_setup&openid.oa2.scope=device_auth_access&openid.ns.oa2=http://www.amazon.com/ap/ext/oauth/2&openid.oa2.response_type=code&openid.oa2.code_challenge_method=S256&openid.oa2.client_id=device:{}&language=en_US&marketPlaceId=ATVPDKIKX0DER&openid.return_to=https://www.amazon.com&openid.pape.max_auth_age=0&openid.assoc_handle=amzn_sonic_games_launcher&pageId=amzn_sonic_games_launcher&openid.oa2.code_challenge={}",
        client_id, code_challenge
    )
}

/// Generates a fresh 32-character uppercase hex device serial (matching Nile / AGSLauncher format).
pub fn generate_device_serial() -> String {
    uuid::Uuid::new_v4().simple().to_string().to_uppercase()
}

/// Retrieves Windows Machine GUID normalized to 32 uppercase hex chars, or generates a random serial.
pub fn get_device_serial() -> String {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_LOCAL_MACHINE;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(crypto) = hklm.open_subkey("SOFTWARE\\Microsoft\\Cryptography") {
            if let Ok(guid) = crypto.get_value::<String, _>("MachineGuid") {
                let hex_only: String = guid
                    .trim()
                    .chars()
                    .filter(|c| c.is_ascii_hexdigit())
                    .collect();
                if hex_only.len() == 32 {
                    return hex_only.to_uppercase();
                }
            }
        }
    }
    generate_device_serial()
}

/// Generates an uppercase SHA-256 hardware hash derived from the device serial for the entitlements API.
pub fn get_hardware_hash() -> String {
    let serial = get_device_serial();
    let mut hasher = Sha256::new();
    hasher.update(serial.as_bytes());
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect()
}

/// Custom deserializer for `expires_in` accepting string or number representation
pub fn deserialize_expires_in<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let v = Option::<serde_json::Value>::deserialize(deserializer)?;
    match v {
        Some(serde_json::Value::Number(n)) => Ok(n.as_i64()),
        Some(serde_json::Value::String(s)) => Ok(s.parse::<i64>().ok()),
        _ => Ok(None),
    }
}

// ---------------------------------------------------------------------------
// DTOs for Device Registration & Token Exchange
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct DeviceRegistrationPayload<'a> {
    pub auth_data: DeviceAuthData<'a>,
    pub registration_data: DeviceRegistrationData<'a>,
    pub requested_extensions: &'a [&'a str],
    pub requested_token_type: &'a [&'a str],
}

#[derive(Debug, Serialize)]
pub struct DeviceAuthData<'a> {
    pub use_global_authentication: bool,
    pub authorization_code: &'a str,
    pub code_verifier: &'a str,
    pub code_algorithm: &'a str,
    pub client_id: &'a str,
    pub client_domain: &'a str,
}

#[derive(Debug, Serialize)]
pub struct DeviceRegistrationData<'a> {
    pub app_name: &'a str,
    pub app_version: &'a str,
    pub device_model: &'a str,
    pub device_serial: &'a str,
    pub device_type: &'a str,
    pub domain: &'a str,
    pub os_version: &'a str,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct DeviceRegistrationResponse {
    pub response: Option<DeviceRegistrationInnerResponse>,
    pub success: Option<DeviceRegistrationSuccess>,
    pub bearer: Option<BearerTokenInfo>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct DeviceRegistrationInnerResponse {
    pub success: Option<DeviceRegistrationSuccess>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct DeviceRegistrationSuccess {
    pub tokens: Option<TokensContainer>,
    pub extensions: Option<ExtensionsContainer>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct TokensContainer {
    pub bearer: Option<BearerTokenInfo>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct BearerTokenInfo {
    #[serde(default)]
    pub access_token: String,
    pub refresh_token: Option<String>,
    #[serde(deserialize_with = "deserialize_expires_in", default)]
    pub expires_in: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ExtensionsContainer {
    pub customer_info: Option<CustomerInfo>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct CustomerInfo {
    pub user_id: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
}

impl DeviceRegistrationResponse {
    pub fn extract_bearer_and_customer(
        &self,
    ) -> Result<(BearerTokenInfo, Option<CustomerInfo>), PluginError> {
        let success = self
            .response
            .as_ref()
            .and_then(|r| r.success.as_ref())
            .or(self.success.as_ref());

        let bearer = success
            .and_then(|s| s.tokens.as_ref())
            .and_then(|t| t.bearer.clone())
            .or_else(|| self.bearer.clone())
            .ok_or_else(|| {
                PluginError::Parse(
                    "Nessun bearer token trovato nella risposta di registrazione dispositivo Amazon"
                        .to_string(),
                )
            })?;

        let customer = success
            .and_then(|s| s.extensions.as_ref())
            .and_then(|e| e.customer_info.clone());

        Ok((bearer, customer))
    }
}

// ---------------------------------------------------------------------------
// DTOs for User Profile
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, Default)]
pub struct AmazonUserProfile {
    pub user_id: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
}

// ---------------------------------------------------------------------------
// DTOs for Token Refresh
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct TokenRefreshPayload<'a> {
    pub app_name: &'a str,
    pub app_version: &'a str,
    pub source_token: &'a str,
    pub requested_token_type: &'a str,
    pub source_token_type: &'a str,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct TokenRefreshResponse {
    pub response: Option<DeviceRegistrationInnerResponse>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    #[serde(deserialize_with = "deserialize_expires_in", default)]
    pub expires_in: Option<i64>,
}

impl TokenRefreshResponse {
    pub fn extract_tokens(
        &self,
        original_refresh: &str,
    ) -> Result<(String, String, Option<i64>), PluginError> {
        // Try response.success.tokens.bearer first
        if let Some(bearer) = self
            .response
            .as_ref()
            .and_then(|r| r.success.as_ref())
            .and_then(|s| s.tokens.as_ref())
            .and_then(|t| t.bearer.as_ref())
        {
            let refresh = bearer
                .refresh_token
                .clone()
                .unwrap_or_else(|| original_refresh.to_string());
            return Ok((bearer.access_token.clone(), refresh, bearer.expires_in));
        }

        // Top-level fallback
        if let Some(ref access) = self.access_token {
            let refresh = self
                .refresh_token
                .clone()
                .unwrap_or_else(|| original_refresh.to_string());
            return Ok((access.clone(), refresh, self.expires_in));
        }

        Err(PluginError::Parse(
            "Nessun access token trovato nella risposta di refresh Amazon".to_string(),
        ))
    }
}

// ---------------------------------------------------------------------------
// DTOs for Entitlements Distribution Service
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, Default)]
pub struct EntitlementsResponse {
    #[serde(default)]
    pub entitlements: Vec<EntitlementItem>,
    #[serde(rename = "nextToken", default)]
    pub next_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct EntitlementItem {
    pub id: Option<String>,
    pub product: Option<EntitlementProduct>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct EntitlementProduct {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(rename = "productTitle", default)]
    pub product_title: Option<String>,
    #[serde(rename = "productLine", default)]
    pub product_line: Option<String>,
    #[serde(rename = "productDetail", default)]
    pub product_detail: Option<EntitlementProductDetail>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct EntitlementProductDetail {
    #[serde(rename = "iconUrl", default)]
    pub icon_url: Option<String>,
    #[serde(rename = "boxArtUrl", default)]
    pub box_art_url: Option<String>,
    #[serde(rename = "logoUrl", default)]
    pub logo_url: Option<String>,
    #[serde(rename = "coverUrl", default)]
    pub cover_url: Option<String>,
    #[serde(rename = "detailsUrl", default)]
    pub details_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Client API Implementations
// ---------------------------------------------------------------------------

/// Registers device with Amazon using authorization code, PKCE verifier, and matching device serial.
pub async fn exchange_code_with_serial(
    client: &reqwest::Client,
    auth_code: &str,
    code_verifier: &str,
    device_serial: &str,
) -> Result<StoreAccountSession, PluginError> {
    exchange_code_custom(
        client,
        AMAZON_AUTH_REGISTER_URL,
        AMAZON_USER_PROFILE_URL,
        auth_code,
        code_verifier,
        device_serial,
    )
    .await
}

/// Registers device with Amazon using authorization code & PKCE verifier, obtaining session tokens.
pub async fn exchange_code(
    client: &reqwest::Client,
    auth_code: &str,
    code_verifier: &str,
) -> Result<StoreAccountSession, PluginError> {
    let device_serial = get_device_serial();
    exchange_code_with_serial(client, auth_code, code_verifier, &device_serial).await
}

/// Custom endpoint implementation of `exchange_code` to support unit testing and proxies.
pub async fn exchange_code_custom(
    client: &reqwest::Client,
    register_url: &str,
    profile_url: &str,
    auth_code: &str,
    code_verifier: &str,
    device_serial: &str,
) -> Result<StoreAccountSession, PluginError> {
    let client_id = compute_client_id(device_serial);
    let payload = DeviceRegistrationPayload {
        auth_data: DeviceAuthData {
            use_global_authentication: false,
            authorization_code: auth_code,
            code_verifier,
            code_algorithm: "SHA-256",
            client_id: &client_id,
            client_domain: "DeviceLegacy",
        },
        registration_data: DeviceRegistrationData {
            app_name: "AGSLauncher for Windows",
            app_version: "1.0.0",
            device_model: "Windows",
            device_serial,
            device_type: AMAZON_DEVICE_TYPE,
            domain: "Device",
            os_version: "10.0",
        },
        requested_extensions: &["customer_info", "device_info"],
        requested_token_type: &["bearer", "mac_dms"],
    };

    let resp = client
        .post(register_url)
        .header("User-Agent", AMAZON_USER_AGENT)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            PluginError::Io(format!(
                "Richiesta di registrazione dispositivo Amazon fallita: {}",
                e
            ))
        })?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(PluginError::Other(format!(
            "Registrazione dispositivo Amazon fallita con HTTP {status}: {body}"
        )));
    }

    let reg_resp: DeviceRegistrationResponse = resp.json().await.map_err(|e| {
        PluginError::Parse(format!(
            "Impossibile analizzare la risposta di registrazione Amazon: {}",
            e
        ))
    })?;

    let (bearer, customer) = reg_resp.extract_bearer_and_customer()?;

    // Fetch user profile to retrieve accurate profile username
    let profile = fetch_user_profile_custom(client, profile_url, &bearer.access_token)
        .await
        .ok();

    let user_id = profile
        .as_ref()
        .and_then(|p| p.user_id.clone())
        .or_else(|| customer.as_ref().and_then(|c| c.user_id.clone()))
        .unwrap_or_else(|| format!("amzn_{}", &device_serial[..8.min(device_serial.len())]));

    let username = profile
        .as_ref()
        .and_then(|p| p.name.clone())
        .or_else(|| customer.as_ref().and_then(|c| c.name.clone()))
        .or_else(|| customer.as_ref().and_then(|c| c.email.clone()))
        .unwrap_or_else(|| "Amazon Games User".to_string());

    let expires_at = bearer
        .expires_in
        .map(|exp| Utc::now().timestamp() + exp);

    Ok(StoreAccountSession {
        store_id: "amazon".to_string(),
        user_id,
        username,
        avatar_url: None,
        access_token: bearer.access_token,
        refresh_token: bearer.refresh_token,
        expires_at,
    })
}

/// Fetches user profile from Amazon profile API.
pub async fn fetch_user_profile(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<AmazonUserProfile, PluginError> {
    fetch_user_profile_custom(client, AMAZON_USER_PROFILE_URL, access_token).await
}

/// Custom endpoint implementation of `fetch_user_profile`.
pub async fn fetch_user_profile_custom(
    client: &reqwest::Client,
    profile_url: &str,
    access_token: &str,
) -> Result<AmazonUserProfile, PluginError> {
    let resp = client
        .get(profile_url)
        .header("Authorization", format!("bearer {}", access_token))
        .header("User-Agent", AMAZON_USER_AGENT)
        .send()
        .await
        .map_err(|e| {
            PluginError::Io(format!(
                "Richiesta profilo utente Amazon fallita: {}",
                e
            ))
        })?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(PluginError::Other(format!(
            "Recupero profilo Amazon fallito con HTTP {status}: {body}"
        )));
    }

    resp.json::<AmazonUserProfile>().await.map_err(|e| {
        PluginError::Parse(format!(
            "Impossibile deserializzare il profilo Amazon: {}",
            e
        ))
    })
}

/// Refreshes session tokens with Amazon authentication service using stored refresh token.
pub async fn refresh_session(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<StoreAccountSession, PluginError> {
    refresh_session_custom(
        client,
        AMAZON_AUTH_TOKEN_URL,
        AMAZON_USER_PROFILE_URL,
        refresh_token,
    )
    .await
}

/// Custom endpoint implementation of `refresh_session`.
pub async fn refresh_session_custom(
    client: &reqwest::Client,
    token_url: &str,
    profile_url: &str,
    refresh_token: &str,
) -> Result<StoreAccountSession, PluginError> {
    let payload = TokenRefreshPayload {
        app_name: "AGSLauncher",
        app_version: "3.0.9495.3",
        source_token: refresh_token,
        requested_token_type: "access_token",
        source_token_type: "refresh_token",
    };

    let resp = client
        .post(token_url)
        .header("Expect", "100-continue")
        .header("User-Agent", AMAZON_USER_AGENT)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            PluginError::Io(format!("Richiesta refresh token Amazon fallita: {}", e))
        })?;

    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(PluginError::SessionExpired(format!(
            "Refresh token Amazon scaduto o non valido (HTTP {status})"
        )));
    }
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(PluginError::Other(format!(
            "Refresh token Amazon fallito con HTTP {status}: {body}"
        )));
    }

    let token_resp: TokenRefreshResponse = resp.json().await.map_err(|e| {
        PluginError::Parse(format!(
            "Impossibile analizzare la risposta di refresh token Amazon: {}",
            e
        ))
    })?;

    let (new_access_token, new_refresh_token, expires_in) =
        token_resp.extract_tokens(refresh_token)?;

    let profile = fetch_user_profile_custom(client, profile_url, &new_access_token)
        .await
        .ok();

    let user_id = profile
        .as_ref()
        .and_then(|p| p.user_id.clone())
        .unwrap_or_default();

    let username = profile
        .as_ref()
        .and_then(|p| p.name.clone())
        .or_else(|| profile.as_ref().and_then(|p| p.email.clone()))
        .unwrap_or_else(|| "Amazon Games User".to_string());

    let expires_at = expires_in.map(|exp| Utc::now().timestamp() + exp);

    Ok(StoreAccountSession {
        store_id: "amazon".to_string(),
        user_id,
        username,
        avatar_url: None,
        access_token: new_access_token,
        refresh_token: Some(new_refresh_token),
        expires_at,
    })
}

/// Synchronizes catalog of owned titles from Amazon Entitlements Distribution API.
pub async fn fetch_user_games(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<Vec<DiscoveredGame>, PluginError> {
    let hardware_hash = get_hardware_hash();
    fetch_user_games_custom(
        client,
        AMAZON_ENTITLEMENTS_URL,
        access_token,
        &hardware_hash,
    )
    .await
}

/// Custom endpoint implementation of `fetch_user_games` with pagination and loot filtering.
pub async fn fetch_user_games_custom(
    client: &reqwest::Client,
    entitlements_url: &str,
    access_token: &str,
    hardware_hash: &str,
) -> Result<Vec<DiscoveredGame>, PluginError> {
    let mut games = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut next_token: Option<String> = None;

    loop {
        let payload = serde_json::json!({
            "Operation": "GetEntitlements",
            "clientId": AMAZON_ENTITLEMENTS_CLIENT_ID,
            "syncPoint": serde_json::Value::Null,
            "nextToken": next_token,
            "maxResults": 50,
            "productIdFilter": serde_json::Value::Null,
            "keyId": AMAZON_KEY_ID,
            "hardwareHash": hardware_hash,
        });

        let resp = client
            .post(entitlements_url)
            .header("User-Agent", AMAZON_ENTITLEMENTS_USER_AGENT)
            .header(
                "X-Amz-Target",
                "com.amazon.animusdistributionservice.entitlement.AnimusEntitlementsService.GetEntitlements",
            )
            .header("x-amzn-token", access_token)
            .header("Content-Encoding", "amz-1.0")
            .header("Expect", "100-continue")
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| {
                PluginError::Io(format!(
                    "Richiesta entitlements Amazon Games fallita: {}",
                    e
                ))
            })?;

        let status = resp.status();
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(PluginError::SessionExpired(format!(
                "Sessione Amazon Games scaduta o non autorizzata (HTTP {status})"
            )));
        }
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(PluginError::Other(format!(
                "Chiamata GetEntitlements Amazon fallita con HTTP {status}: {body}"
            )));
        }

        let entitlements_resp: EntitlementsResponse = resp.json().await.map_err(|e| {
            PluginError::Parse(format!(
                "Impossibile analizzare la risposta degli entitlements Amazon: {}",
                e
            ))
        })?;

        for item in entitlements_resp.entitlements {
            let product = match item.product {
                Some(p) => p,
                None => continue,
            };

            // Skip in-game loot/DLC: Twitch:FuelEntitlement
            if product.product_line.as_deref() == Some(TWITCH_FUEL_ENTITLEMENT) {
                continue;
            }

            let title = if !product.title.trim().is_empty() {
                product.title.trim().to_string()
            } else if let Some(ref pt) = product.product_title {
                pt.trim().to_string()
            } else {
                continue;
            };

            if product.id.trim().is_empty() || title.is_empty() {
                continue;
            }

            if !seen_ids.insert(product.id.clone()) {
                continue;
            }

            let cover_url = product.product_detail.as_ref().and_then(|d| {
                d.box_art_url
                    .clone()
                    .or_else(|| d.icon_url.clone())
                    .or_else(|| d.cover_url.clone())
                    .or_else(|| d.logo_url.clone())
            });

            games.push(DiscoveredGame {
                library_id: "amazon".to_string(),
                external_id: product.id.clone(),
                title,
                install_dir: None,
                is_installed: false,
                play_action: Some(LaunchConfiguration {
                    executable: format!("amazon-games://play/{}", product.id),
                    arguments: vec![],
                    working_dir: None,
                    tracking_mode: ProcessTrackingMode::KernelJobObject,
                }),
                playtime_seconds: 0,
                play_count: 0,
                last_activity: None,
                cover_image_path: cover_url,
                background_image_path: None,
            });
        }

        match entitlements_resp.next_token {
            Some(token) if !token.trim().is_empty() => {
                next_token = Some(token);
            }
            _ => break,
        }
    }

    tracing::info!(
        "Amazon Games: Sincronizzati {} giochi da Prime Gaming / Amazon Games catalog.",
        games.len()
    );

    Ok(games)
}
