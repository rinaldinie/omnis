use chrono::Utc;
use omnis_sdk::{
    DiscoveredGame, LaunchConfiguration, PluginError, ProcessTrackingMode, StoreAccountSession,
};
use serde::{Deserialize, Deserializer, Serialize};

pub const GOG_CLIENT_ID: &str = "46899977096215655";
pub const GOG_CLIENT_SECRET: &str = "9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9";
pub const GOG_REDIRECT_URI: &str = "https://embed.gog.com/on_login_success?origin=client";
pub const GOG_AUTH_URL: &str = "https://auth.gog.com/auth";
pub const GOG_TOKEN_URL: &str = "https://auth.gog.com/token";
pub const GOG_USER_DATA_URL: &str = "https://embed.gog.com/userData.json";
pub const GOG_USER_GAMES_URL: &str = "https://embed.gog.com/user/data/games";
pub const GOG_PRODUCTS_URL: &str = "https://api.gog.com/products";

/// Helper for deserializing user_id whether it arrives as a JSON string or integer
pub fn deserialize_string_or_number<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    struct StringOrNumberVisitor;

    impl<'de> serde::de::Visitor<'de> for StringOrNumberVisitor {
        type Value = String;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string or integer")
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E> {
            Ok(v.to_string())
        }

        fn visit_string<E>(self, v: String) -> Result<Self::Value, E> {
            Ok(v)
        }

        fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E> {
            Ok(v.to_string())
        }

        fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E> {
            Ok(v.to_string())
        }
    }

    deserializer.deserialize_any(StringOrNumberVisitor)
}

/// OAuth token response returned by GOG auth endpoint
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GogTokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    #[serde(deserialize_with = "deserialize_string_or_number")]
    pub user_id: String,
}

/// User profile data returned by GOG userData.json
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct GogUserData {
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default, alias = "avatar_url", alias = "user_avatar")]
    pub avatar: Option<String>,
}

/// User owned games response from GOG
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct GogGamesResponse {
    #[serde(default)]
    pub owned: Vec<u64>,
}

/// Game details metadata from GOG catalog
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GogGameDetails {
    pub id: u64,
    pub title: String,
    #[serde(default)]
    pub image: Option<String>,
}

/// Internal helper envelope for batch product responses
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GogProductsEnvelope {
    #[serde(default)]
    pub products: Vec<GogProductItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GogProductItem {
    pub id: u64,
    pub title: String,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub images: Option<GogProductImages>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GogProductImages {
    #[serde(default)]
    pub box_art: Option<String>,
    #[serde(default, rename = "boxArt")]
    pub box_art_camel: Option<String>,
    #[serde(default)]
    pub background: Option<String>,
}

impl GogProductItem {
    pub fn to_game_details(&self) -> GogGameDetails {
        let image = self.image.clone().or_else(|| {
            self.images.as_ref().and_then(|imgs| {
                imgs.box_art_camel
                    .clone()
                    .or_else(|| imgs.box_art.clone())
                    .or_else(|| imgs.background.clone())
            })
        });

        GogGameDetails {
            id: self.id,
            title: self.title.clone(),
            image,
        }
    }
}

/// Normalize GOG game details into a unified Omnis DiscoveredGame
pub fn normalize_gog_game(game: &GogGameDetails) -> DiscoveredGame {
    let cover_image_path = game.image.as_ref().map(|img| {
        if img.starts_with("//") {
            format!("https:{}", img)
        } else {
            img.clone()
        }
    });

    DiscoveredGame {
        library_id: "gog".to_string(),
        external_id: game.id.to_string(),
        title: game.title.clone(),
        install_dir: None,
        is_installed: false,
        play_action: Some(LaunchConfiguration {
            executable: format!("goggalaxy://openGameView/{}", game.id),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::ProcessName("GalaxyClient.exe".to_string()),
        }),
        playtime_seconds: 0,
        play_count: 0,
        last_activity: None,
        cover_image_path,
        background_image_path: None,
    }
}

/// Extract authorization `code` parameter from OAuth redirect callback URL
pub fn extract_code_from_url(url_str: &str) -> Option<String> {
    if let Ok(parsed) = url::Url::parse(url_str) {
        for (key, val) in parsed.query_pairs() {
            if key == "code" {
                return Some(val.into_owned());
            }
        }
    } else if let Some(pos) = url_str.find("code=") {
        let after = &url_str[pos + 5..];
        let end = after.find('&').unwrap_or(after.len());
        let val = &after[..end];
        let cleaned = val.split('#').next().unwrap_or(val);
        return Some(cleaned.to_string());
    }
    None
}

/// Fetch user profile details (username, avatar) from GOG userData.json
pub async fn fetch_user_data(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<GogUserData, PluginError> {
    let resp = client
        .get(GOG_USER_DATA_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| PluginError::Io(format!("Failed to request user data: {}", e)))?;

    if !resp.status().is_success() {
        return Err(PluginError::Other(format!(
            "User data request failed with HTTP status {}",
            resp.status()
        )));
    }

    resp.json::<GogUserData>()
        .await
        .map_err(|e| PluginError::Parse(format!("Failed to parse user data: {}", e)))
}

/// Exchange OAuth authorization code for an authenticated StoreAccountSession
pub async fn exchange_code(
    client: &reqwest::Client,
    code: &str,
) -> Result<StoreAccountSession, PluginError> {
    let url = format!(
        "{}?client_id={}&client_secret={}&grant_type=authorization_code&code={}&redirect_uri={}",
        GOG_TOKEN_URL,
        GOG_CLIENT_ID,
        GOG_CLIENT_SECRET,
        code,
        urlencoding::encode(GOG_REDIRECT_URI)
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| PluginError::Io(format!("OAuth token request failed: {}", e)))?;

    if !resp.status().is_success() {
        return Err(PluginError::Other(format!(
            "OAuth token exchange failed with HTTP status {}",
            resp.status()
        )));
    }

    let token_resp: GogTokenResponse = resp
        .json()
        .await
        .map_err(|e| PluginError::Parse(format!("Failed to parse GOG token response: {}", e)))?;

    let user_data = fetch_user_data(client, &token_resp.access_token)
        .await
        .unwrap_or_default();

    let now = Utc::now().timestamp();
    let expires_at = Some(now + token_resp.expires_in);

    Ok(StoreAccountSession {
        store_id: "gog".to_string(),
        user_id: token_resp.user_id.clone(),
        username: user_data
            .username
            .unwrap_or_else(|| format!("GOG User {}", token_resp.user_id)),
        avatar_url: user_data.avatar,
        access_token: token_resp.access_token,
        refresh_token: Some(token_resp.refresh_token),
        expires_at,
    })
}

/// Refresh an existing OAuth session using refresh_token
pub async fn refresh_token(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<StoreAccountSession, PluginError> {
    let url = format!(
        "{}?client_id={}&client_secret={}&grant_type=refresh_token&refresh_token={}",
        GOG_TOKEN_URL,
        GOG_CLIENT_ID,
        GOG_CLIENT_SECRET,
        refresh_token
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| PluginError::Io(format!("OAuth token refresh request failed: {}", e)))?;

    if !resp.status().is_success() {
        return Err(PluginError::Other(format!(
            "OAuth token refresh failed with HTTP status {}",
            resp.status()
        )));
    }

    let token_resp: GogTokenResponse = resp
        .json()
        .await
        .map_err(|e| PluginError::Parse(format!("Failed to parse GOG token refresh response: {}", e)))?;

    let user_data = fetch_user_data(client, &token_resp.access_token)
        .await
        .unwrap_or_default();

    let now = Utc::now().timestamp();
    let expires_at = Some(now + token_resp.expires_in);

    Ok(StoreAccountSession {
        store_id: "gog".to_string(),
        user_id: token_resp.user_id.clone(),
        username: user_data
            .username
            .unwrap_or_else(|| format!("GOG User {}", token_resp.user_id)),
        avatar_url: user_data.avatar,
        access_token: token_resp.access_token,
        refresh_token: Some(token_resp.refresh_token),
        expires_at,
    })
}

/// Fetch user owned games from GOG API and enrich them as DiscoveredGame
pub async fn fetch_user_games(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<Vec<DiscoveredGame>, PluginError> {
    let resp = client
        .get(GOG_USER_GAMES_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| PluginError::Io(format!("Failed to request user games: {}", e)))?;

    if !resp.status().is_success() {
        return Err(PluginError::Other(format!(
            "Failed to fetch user games: HTTP {}",
            resp.status()
        )));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| PluginError::Io(format!("Failed to read response body: {}", e)))?;

    let games_resp: GogGamesResponse = if let Ok(resp) = serde_json::from_str::<GogGamesResponse>(&body) {
        resp
    } else if let Ok(list) = serde_json::from_str::<Vec<u64>>(&body) {
        GogGamesResponse { owned: list }
    } else {
        return Err(PluginError::Parse(format!(
            "Failed to parse user games response JSON: {}",
            body
        )));
    };

    if games_resp.owned.is_empty() {
        return Ok(Vec::new());
    }

    let mut discovered_games = Vec::new();

    for chunk in games_resp.owned.chunks(50) {
        let ids_str: Vec<String> = chunk.iter().map(|id| id.to_string()).collect();
        let query_ids = ids_str.join(",");
        let url = format!("{}?ids={}", GOG_PRODUCTS_URL, query_ids);

        let batch_details: Vec<GogGameDetails> = match client.get(&url).send().await {
            Ok(prod_resp) if prod_resp.status().is_success() => {
                let prod_body = prod_resp.text().await.unwrap_or_default();
                if let Ok(env) = serde_json::from_str::<GogProductsEnvelope>(&prod_body) {
                    env.products.into_iter().map(|p| p.to_game_details()).collect()
                } else if let Ok(items) = serde_json::from_str::<Vec<GogProductItem>>(&prod_body) {
                    items.into_iter().map(|p| p.to_game_details()).collect()
                } else if let Ok(details) = serde_json::from_str::<Vec<GogGameDetails>>(&prod_body) {
                    details
                } else {
                    chunk
                        .iter()
                        .map(|&id| GogGameDetails {
                            id,
                            title: format!("GOG Game {}", id),
                            image: None,
                        })
                        .collect()
                }
            }
            _ => chunk
                .iter()
                .map(|&id| GogGameDetails {
                    id,
                    title: format!("GOG Game {}", id),
                    image: None,
                })
                .collect(),
        };

        for game in batch_details {
            discovered_games.push(normalize_gog_game(&game));
        }
    }

    Ok(discovered_games)
}
