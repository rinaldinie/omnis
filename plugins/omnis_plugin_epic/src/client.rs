//! Epic Games Store cloud and OAuth client implementation

use chrono::Utc;
use omnis_sdk::{
    DiscoveredGame, LaunchConfiguration, PluginError, ProcessTrackingMode, StoreAccountSession,
};
use serde::{Deserialize, Serialize};

pub const EPIC_CLIENT_ID: &str = "34a02cf8f4414e29b15921876da36f9a";
pub const EPIC_REDIRECT_URI: &str = "https://www.epicgames.com/id/api/redirect";
pub const EPIC_AUTH_URL: &str = "https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D34a02cf8f4414e29b15921876da36f9a%26responseType%3Dcode";
pub const EPIC_TOKEN_URL: &str = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";
pub const EPIC_ENTITLEMENTS_URL: &str = "https://entitlement-public-service-prod08.ol.epicgames.com/entitlement/api/account";
pub const EPIC_LIBRARY_URL: &str = "https://library-service.live.use1a.on.epicgames.com/library/api/public/items";
pub const EPIC_PLAYTIME_URL: &str = "https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account";
pub const EPIC_CATALOG_URL: &str = "https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace";
pub const EPIC_ASSETS_URL: &str = "https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/Windows?label=Live";
pub const EPIC_BASIC_AUTH: &str = "Basic MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y=";
pub const EPIC_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher";

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

/// Paginated library response from Epic library-service
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EpicLibraryResponse {
    #[serde(default)]
    pub records: Vec<EpicLibraryRecord>,
    #[serde(default)]
    pub response_metadata: Option<EpicLibraryMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicLibraryRecord {
    pub app_name: String,
    pub catalog_item_id: String,
    pub namespace: String,
    #[serde(default)]
    pub sandbox_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicLibraryMetadata {
    pub next_cursor: Option<String>,
}

/// Asset returned by launcher-public-service
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicLauncherAsset {
    pub app_name: String,
    #[serde(default)]
    pub label_name: Option<String>,
    #[serde(default)]
    pub build_version: Option<String>,
    pub catalog_item_id: String,
    pub namespace: String,
    #[serde(default)]
    pub asset_id: Option<String>,
}

/// Catalog item returned by Epic catalog bulk API
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EpicCatalogItem {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub categories: Option<Vec<EpicCatalogCategory>>,
    #[serde(default)]
    pub key_images: Option<Vec<EpicKeyImage>>,
    #[serde(default)]
    pub main_game_item: Option<EpicMainGameItem>,
    #[serde(default)]
    pub release_info: Option<Vec<EpicReleaseInfo>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpicCatalogCategory {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpicKeyImage {
    #[serde(rename = "type")]
    pub image_type: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpicMainGameItem {
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicReleaseInfo {
    #[serde(default, alias = "appId")]
    pub app_id: Option<String>,
    #[serde(default)]
    pub platform: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicPlaytimeItem {
    #[serde(default)]
    pub account_id: Option<String>,
    pub artifact_id: String,
    #[serde(default)]
    pub total_time: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct EpicCandidate {
    pub app_name: String,
    pub catalog_item_id: String,
    pub namespace: String,
}

/// Cleans trademark and formatting noise from Epic catalog titles
pub fn sanitize_epic_title(title: &str) -> String {
    title
        .replace('™', "")
        .replace('®', "")
        .replace('\u{00a0}', " ")
        .trim()
        .to_string()
}

/// Determines if a catalog item is a full playable game/app rather than an unlaunchable DLC/addon
pub fn is_valid_game(item: &EpicCatalogItem) -> bool {
    // 1. If it has a mainGameItem, it is an addon/DLC - only keep if launchable addon
    if item.main_game_item.is_some() {
        let is_launchable = item
            .categories
            .as_ref()
            .map(|cats| cats.iter().any(|c| c.path == "addons/launchable"))
            .unwrap_or(false);
        if !is_launchable {
            return false;
        }
    }

    if let Some(ref cats) = item.categories {
        // 2. Reject digital extras, plugins, engine items
        if cats.iter().any(|c| {
            c.path == "digitalextras"
                || c.path == "plugins"
                || c.path == "plugins/engine"
        }) {
            return false;
        }

        // 3. Must have applications or games category if categories are present
        let has_app_or_game = cats.iter().any(|c| c.path == "applications" || c.path == "games");
        let is_only_addon = cats.iter().all(|c| c.path.starts_with("addons"));
        if is_only_addon || (!has_app_or_game && !cats.is_empty()) {
            return false;
        }
    }

    true
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

/// Extracts exchangeCode, authorizationCode, sid or code from the query parameters or URL fragment
pub fn extract_exchange_code(url_str: &str) -> Option<String> {
    if let Ok(parsed) = url::Url::parse(url_str) {
        // 1. Check query parameters
        for (key, val) in parsed.query_pairs() {
            if key == "exchangeCode" || key == "code" || key == "authorizationCode" || key == "sid" {
                return Some(val.into_owned());
            }
        }

        // 2. Check fragment
        if let Some(fragment) = parsed.fragment() {
            for (key, val) in url::form_urlencoded::parse(fragment.as_bytes()) {
                if key == "exchangeCode" || key == "code" || key == "authorizationCode" || key == "sid" {
                    return Some(val.into_owned());
                }
            }
        }
    }

    // Fallback: search string directly (checking authorizationCode and exchangeCode before code/sid)
    if let Some(pos) = url_str.find("authorizationCode=") {
        let after = &url_str[pos + 18..];
        let end = after.find(|c| c == '&' || c == '#' || c == ' ').unwrap_or(after.len());
        return Some(after[..end].to_string());
    }
    if let Some(pos) = url_str.find("exchangeCode=") {
        let after = &url_str[pos + 13..];
        let end = after.find(|c| c == '&' || c == '#' || c == ' ').unwrap_or(after.len());
        return Some(after[..end].to_string());
    }
    if let Some(pos) = url_str.find("sid=") {
        let after = &url_str[pos + 4..];
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

/// Exchanges an authorization code or exchange code for an authenticated StoreAccountSession
pub async fn exchange_code(
    client: &reqwest::Client,
    code: &str,
) -> Result<StoreAccountSession, PluginError> {
    // 1. Try authorization_code first (standard OAuth flow with responseType=code)
    let auth_code_params = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("token_type", "eg1"),
    ];

    let resp = client
        .post(EPIC_TOKEN_URL)
        .header("Authorization", EPIC_BASIC_AUTH)
        .header("User-Agent", EPIC_USER_AGENT)
        .form(&auth_code_params)
        .send()
        .await
        .map_err(|e| PluginError::Io(format!("OAuth token request failed: {}", e)))?;

    let token_resp: EpicOAuthTokenResponse = if resp.status().is_success() {
        resp.json().await.map_err(|e| {
            PluginError::Parse(format!("Failed to parse Epic token response: {}", e))
        })?
    } else {
        // 2. Fallback: try exchange_code grant_type
        let exchange_code_params = [
            ("grant_type", "exchange_code"),
            ("exchange_code", code),
            ("token_type", "eg1"),
        ];

        let fallback_resp = client
            .post(EPIC_TOKEN_URL)
            .header("Authorization", EPIC_BASIC_AUTH)
            .header("User-Agent", EPIC_USER_AGENT)
            .form(&exchange_code_params)
            .send()
            .await
            .map_err(|e| PluginError::Io(format!("OAuth token fallback request failed: {}", e)))?;

        if !fallback_resp.status().is_success() {
            let status = fallback_resp.status();
            let body = fallback_resp.text().await.unwrap_or_default();
            return Err(PluginError::Other(format!(
                "Epic OAuth token exchange failed with HTTP status {}: {}",
                status, body
            )));
        }

        fallback_resp.json().await.map_err(|e| {
            PluginError::Parse(format!("Failed to parse Epic token response: {}", e))
        })?
    };

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
        .header("User-Agent", EPIC_USER_AGENT)
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

/// Discovers candidate games owned by the user from library-service, launcher assets, or entitlements
pub async fn discover_epic_candidates(
    client: &reqwest::Client,
    session: &StoreAccountSession,
) -> Result<Vec<EpicCandidate>, PluginError> {
    let mut candidates = Vec::new();
    let mut seen_keys = std::collections::HashSet::new();

    // 1. Try library-service first (with cursor pagination)
    let mut next_cursor: Option<String> = None;
    let mut library_success = false;

    loop {
        let mut url = format!("{}?includeMetadata=true&platform=Windows", EPIC_LIBRARY_URL);
        if let Some(ref cursor) = next_cursor {
            url.push_str(&format!("&cursor={}", cursor));
        }

        let resp_res = client
            .get(&url)
            .header("User-Agent", EPIC_USER_AGENT)
            .bearer_auth(&session.access_token)
            .send()
            .await;

        match resp_res {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(lib_resp) = resp.json::<EpicLibraryResponse>().await {
                    library_success = true;
                    for record in lib_resp.records {
                        if record.namespace == "ue" || record.app_name.is_empty() {
                            continue;
                        }
                        if record.sandbox_type.as_deref() == Some("PRIVATE") {
                            continue;
                        }
                        if seen_keys.insert((record.namespace.clone(), record.catalog_item_id.clone())) {
                            candidates.push(EpicCandidate {
                                app_name: record.app_name,
                                catalog_item_id: record.catalog_item_id,
                                namespace: record.namespace,
                            });
                        }
                    }

                    next_cursor = lib_resp.response_metadata.and_then(|m| m.next_cursor);
                    if next_cursor.is_none() {
                        break;
                    }
                } else {
                    break;
                }
            }
            _ => break,
        }
    }

    if library_success && !candidates.is_empty() {
        return Ok(candidates);
    }

    // 2. Fallback: try launcher assets endpoint
    let assets_resp = client
        .get(EPIC_ASSETS_URL)
        .header("User-Agent", EPIC_USER_AGENT)
        .bearer_auth(&session.access_token)
        .send()
        .await;

    if let Ok(resp) = assets_resp {
        if resp.status().is_success() {
            if let Ok(assets) = resp.json::<Vec<EpicLauncherAsset>>().await {
                for asset in assets {
                    if asset.namespace == "ue" || asset.app_name.is_empty() {
                        continue;
                    }
                    if seen_keys.insert((asset.namespace.clone(), asset.catalog_item_id.clone())) {
                        candidates.push(EpicCandidate {
                            app_name: asset.app_name,
                            catalog_item_id: asset.catalog_item_id,
                            namespace: asset.namespace,
                        });
                    }
                }
                if !candidates.is_empty() {
                    return Ok(candidates);
                }
            }
        }
    }

    // 3. Fallback: entitlements endpoint
    let ent_url = format!(
        "{}/{}/entitlements?start=0&count=5000",
        EPIC_ENTITLEMENTS_URL, session.user_id
    );
    let ent_resp = client
        .get(&ent_url)
        .header("User-Agent", EPIC_USER_AGENT)
        .bearer_auth(&session.access_token)
        .send()
        .await
        .map_err(|e| PluginError::Io(format!("Failed to fetch Epic entitlements: {}", e)))?;

    if !ent_resp.status().is_success() {
        return Err(PluginError::Other(format!(
            "Failed to fetch Epic entitlements: HTTP {}",
            ent_resp.status()
        )));
    }

    let entitlements: Vec<EpicEntitlement> = ent_resp
        .json()
        .await
        .map_err(|e| PluginError::Parse(format!("Failed to parse Epic entitlements: {}", e)))?;

    for ent in entitlements {
        let namespace = ent.namespace.unwrap_or_default();
        let catalog_id = ent.catalog_item_id.unwrap_or_else(|| ent.id.clone());
        let app_name = ent.entitlement_name.unwrap_or_else(|| catalog_id.clone());

        if namespace.is_empty() || namespace == "ue" {
            continue;
        }

        if seen_keys.insert((namespace.clone(), catalog_id.clone())) {
            candidates.push(EpicCandidate {
                app_name,
                catalog_item_id: catalog_id,
                namespace,
            });
        }
    }

    Ok(candidates)
}

/// Fetches user playtimes across all products from the Epic playtime API
pub async fn fetch_playtimes(
    client: &reqwest::Client,
    session: &StoreAccountSession,
) -> std::collections::HashMap<String, u64> {
    let mut playtime_map = std::collections::HashMap::new();
    let url = format!("{}/{}/all", EPIC_PLAYTIME_URL, session.user_id);

    let resp = client
        .get(&url)
        .header("User-Agent", EPIC_USER_AGENT)
        .bearer_auth(&session.access_token)
        .send()
        .await;

    if let Ok(resp) = resp {
        if resp.status().is_success() {
            if let Ok(items) = resp.json::<Vec<EpicPlaytimeItem>>().await {
                for item in items {
                    playtime_map.insert(item.artifact_id, item.total_time);
                }
            }
        }
    }

    playtime_map
}

/// Bulk queries item details from the Epic catalog service for a given namespace
pub async fn fetch_catalog_items_batch(
    client: &reqwest::Client,
    session: &StoreAccountSession,
    namespace: &str,
    item_ids: &[String],
) -> Result<std::collections::HashMap<String, EpicCatalogItem>, PluginError> {
    if item_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let mut query_params: Vec<(&str, &str)> = item_ids.iter().map(|id| ("id", id.as_str())).collect();
    query_params.push(("country", "US"));
    query_params.push(("locale", "en-US"));
    query_params.push(("includeMainGameDetails", "true"));

    let url = format!("{}/{}/bulk/items", EPIC_CATALOG_URL, namespace);

    let resp = client
        .get(&url)
        .header("User-Agent", EPIC_USER_AGENT)
        .bearer_auth(&session.access_token)
        .query(&query_params)
        .send()
        .await
        .map_err(|e| PluginError::Io(format!("Catalog request failed for namespace {}: {}", namespace, e)))?;

    if !resp.status().is_success() {
        return Err(PluginError::Other(format!(
            "Catalog request for namespace {} failed: HTTP {}",
            namespace,
            resp.status()
        )));
    }

    let items: std::collections::HashMap<String, EpicCatalogItem> = resp
        .json()
        .await
        .map_err(|e| PluginError::Parse(format!("Failed to parse catalog items for {}: {}", namespace, e)))?;

    Ok(items)
}

/// Fetches user library, resolves genuine titles and metadata from Epic catalog, and filters out non-games
pub async fn fetch_user_games(
    client: &reqwest::Client,
    session: &StoreAccountSession,
) -> Result<Vec<DiscoveredGame>, PluginError> {
    let candidates = discover_epic_candidates(client, session).await?;
    tracing::info!(
        "Discovered {} potential Epic items from account. Querying catalog metadata...",
        candidates.len()
    );

    let playtimes = fetch_playtimes(client, session).await;

    // Group candidates by namespace
    let mut by_namespace: std::collections::HashMap<String, Vec<EpicCandidate>> = std::collections::HashMap::new();
    for cand in candidates {
        by_namespace.entry(cand.namespace.clone()).or_default().push(cand);
    }

    let mut discovered_games = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    // Query catalog items in batches of 30 per namespace
    for (namespace, items) in by_namespace {
        for chunk in items.chunks(30) {
            let item_ids: Vec<String> = chunk.iter().map(|c| c.catalog_item_id.clone()).collect();
            match fetch_catalog_items_batch(client, session, &namespace, &item_ids).await {
                Ok(catalog_map) => {
                    for cand in chunk {
                        if let Some(cat_item) = catalog_map.get(&cand.catalog_item_id) {
                            if !is_valid_game(cat_item) {
                                continue;
                            }

                            // Use genuine title from catalog item
                            let raw_title = cat_item
                                .title
                                .as_deref()
                                .filter(|t| !t.is_empty())
                                .unwrap_or(&cand.app_name);
                            let title = sanitize_epic_title(raw_title);

                            // Prefer app_name as external_id; fallback to release_info or catalog_item_id
                            let external_id = if !cand.app_name.is_empty() && cand.app_name != cand.catalog_item_id {
                                cand.app_name.clone()
                            } else if let Some(ref releases) = cat_item.release_info {
                                releases
                                    .iter()
                                    .find_map(|r| r.app_id.clone().filter(|s| !s.is_empty()))
                                    .unwrap_or_else(|| cand.app_name.clone())
                            } else {
                                cand.app_name.clone()
                            };

                            if !seen_ids.insert(external_id.clone()) {
                                continue;
                            }

                            // Extract cover and background images
                            let mut cover_image_path = None;
                            let mut background_image_path = None;

                            if let Some(ref images) = cat_item.key_images {
                                for img in images {
                                    match img.image_type.as_str() {
                                        "DieselGameBoxTall" => {
                                            cover_image_path = Some(img.url.clone());
                                            break;
                                        }
                                        "Thumbnail" | "OfferImageTall" | "DieselGameBox" if cover_image_path.is_none() => {
                                            cover_image_path = Some(img.url.clone());
                                        }
                                        _ => {}
                                    }
                                }

                                for img in images {
                                    match img.image_type.as_str() {
                                        "DieselGameBoxWide" => {
                                            background_image_path = Some(img.url.clone());
                                            break;
                                        }
                                        "Featured" | "Screenshot" if background_image_path.is_none() => {
                                            background_image_path = Some(img.url.clone());
                                        }
                                        _ => {}
                                    }
                                }
                            }

                            let playtime_seconds = playtimes.get(&external_id).copied().unwrap_or(0);

                            let launch_config = LaunchConfiguration {
                                executable: format!(
                                    "com.epicgames.launcher://apps/{}?action=install",
                                    external_id
                                ),
                                arguments: vec![],
                                working_dir: None,
                                tracking_mode: ProcessTrackingMode::ProcessName(
                                    "EpicGamesLauncher.exe".to_string(),
                                ),
                            };

                            discovered_games.push(DiscoveredGame {
                                library_id: "epic".to_string(),
                                external_id,
                                title,
                                install_dir: None,
                                is_installed: false,
                                play_action: Some(launch_config),
                                playtime_seconds,
                                play_count: 0,
                                last_activity: None,
                                cover_image_path,
                                background_image_path,
                            });
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!(
                        "Failed to fetch catalog metadata for namespace {}: {}",
                        namespace,
                        e
                    );
                }
            }
        }
    }

    tracing::info!(
        "Successfully resolved {} playable Epic Games titles.",
        discovered_games.len()
    );
    Ok(discovered_games)
}
