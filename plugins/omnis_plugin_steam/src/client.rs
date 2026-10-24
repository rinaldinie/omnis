//! Steam Cloud Store Client & Web API integration
//!
//! Provides Web API and Steam Community endpoints for cloud library syncing,
//! authentication redirect parsing, and game catalog retrieval.

use omnis_sdk::{
    DiscoveredGame, LaunchConfiguration, PluginError, ProcessTrackingMode, StoreAccountSession,
};
use serde::{Deserialize, Serialize};

/// Steam OpenID 2.0 Login URL (Valve official OpenID provider)
pub const STEAM_OPENID_LOGIN_URL: &str =
    "https://steamcommunity.com/openid/login?openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.mode=checkid_setup&openid.return_to=https%3A%2F%2Fomnis.app%2Fauth%2Fsteam&openid.realm=https%3A%2F%2Fomnis.app&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select";

/// Steam Community Login URL (legacy fallback)
pub const STEAM_COMMUNITY_LOGIN_URL: &str =
    "https://steamcommunity.com/login/home/?goto=%2Fmy%2Fgames%3Fxml%3D1";

/// Steam Web API endpoint for retrieving owned games list
pub const STEAM_API_OWNED_GAMES_URL: &str =
    "https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/";

/// Steam Community base URL
pub const STEAM_COMMUNITY_URL: &str = "https://steamcommunity.com";

/// Profile summary containing persona name and avatar
#[derive(Debug, Clone, Default)]
pub struct SteamProfileSummary {
    pub name: Option<String>,
    pub avatar: Option<String>,
}

/// Deserialized response wrapper for IPlayerService/GetOwnedGames/v0001
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SteamOwnedGamesApiResponse {
    pub response: SteamOwnedGamesResponseData,
}

/// Inner payload for Steam Owned Games
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SteamOwnedGamesResponseData {
    #[serde(default, alias = "gameCount")]
    pub game_count: Option<usize>,
    #[serde(default)]
    pub games: Option<Vec<SteamApiGameItem>>,
}

/// Individual game returned by Steam Web API or Steam Community XML
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SteamApiGameItem {
    pub appid: u64,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub playtime_forever: Option<u64>, // playtime in minutes
    #[serde(default, alias = "rtime_last_played")]
    pub rtime_last_played: Option<i64>,
    #[serde(default)]
    pub img_icon_url: Option<String>,
}

/// Deserialized response wrapper for ISteamUser/GetPlayerSummaries/v0002
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SteamPlayerSummaryResponse {
    pub response: SteamPlayerSummaryData,
}

/// Player summary container
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SteamPlayerSummaryData {
    #[serde(default)]
    pub players: Vec<SteamPlayerItem>,
}

/// Steam profile item
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SteamPlayerItem {
    pub steamid: String,
    pub personaname: String,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub avatarfull: Option<String>,
}

/// Checks if a redirected URL indicates completion of Steam web authentication.
///
/// Matches OpenID callbacks or URLs pointing to user profile endpoints
/// `steamcommunity.com/id/` or `steamcommunity.com/profiles/`, while strictly excluding
/// intermediate `/my/` aliases and login endpoints.
pub fn is_steam_redirect(url: &str) -> bool {
    let lower = url.to_lowercase();
    if lower.contains("/login") {
        return false;
    }
    // Never intercept intermediate /my/ paths: let Steam redirect to /profiles/ or /id/
    if lower.contains("steamcommunity.com/my/") || lower.ends_with("/my") {
        return false;
    }

    // 1. OpenID callback
    if lower.contains("omnis.app/auth/steam")
        || lower.contains("openid.claimed_id")
        || lower.contains("/openid/id/")
        || lower.contains("openid%2fid")
    {
        return true;
    }

    // 2. Profile or vanity URLs
    let has_profile = lower.contains("steamcommunity.com/id/")
        || lower.contains("steamcommunity.com/profiles/");

    has_profile
}

/// Extracts a `StoreAccountSession` from a Steam redirection URL.
///
/// Looks for OpenID claimed_id, a 17-digit numeric SteamID64 from `/profiles/{id}`, or a vanity URL from `/id/{vanity}`.
pub fn extract_session_from_redirect(url: &str) -> Result<StoreAccountSession, PluginError> {
    let lower = url.to_lowercase();

    // 1. Check OpenID claimed_id pattern: ...openid/id/<steamid> or ...openid%2fid%2f<steamid>
    if let Some(pos) = lower.find("openid/id/") {
        let remainder = &url[pos + "openid/id/".len()..];
        let id_str = remainder
            .split(['/', '?', '#', '&', '%'])
            .next()
            .unwrap_or_default()
            .trim();
        if !id_str.is_empty() && id_str.chars().all(|c| c.is_ascii_digit()) {
            return Ok(StoreAccountSession {
                store_id: "steam".to_string(),
                user_id: id_str.to_string(),
                username: id_str.to_string(),
                avatar_url: None,
                access_token: format!("steam_session:{}", id_str),
                refresh_token: Some(format!("steam_session:{}", id_str)),
                expires_at: None,
            });
        }
    }

    if let Some(pos) = lower.find("openid%2fid%2f") {
        let remainder = &url[pos + "openid%2fid%2f".len()..];
        let id_str = remainder
            .split(['/', '?', '#', '&', '%'])
            .next()
            .unwrap_or_default()
            .trim();
        if !id_str.is_empty() && id_str.chars().all(|c| c.is_ascii_digit()) {
            return Ok(StoreAccountSession {
                store_id: "steam".to_string(),
                user_id: id_str.to_string(),
                username: id_str.to_string(),
                avatar_url: None,
                access_token: format!("steam_session:{}", id_str),
                refresh_token: Some(format!("steam_session:{}", id_str)),
                expires_at: None,
            });
        }
    }

    // 2. Check for profiles/{steamid} (typically 17 digits)
    if let Some(pos) = url.find("/profiles/") {
        let remainder = &url[pos + "/profiles/".len()..];
        let id_str = remainder
            .split(['/', '?', '#', '&'])
            .next()
            .unwrap_or_default()
            .trim();

        if !id_str.is_empty() && id_str.chars().all(|c| c.is_ascii_digit()) {
            return Ok(StoreAccountSession {
                store_id: "steam".to_string(),
                user_id: id_str.to_string(),
                username: id_str.to_string(),
                avatar_url: None,
                access_token: format!("steam_session:{}", id_str),
                refresh_token: Some(format!("steam_session:{}", id_str)),
                expires_at: None,
            });
        }
    }

    // 3. Check for id/{vanity}
    if let Some(pos) = url.find("/id/") {
        let remainder = &url[pos + "/id/".len()..];
        let vanity_str = remainder
            .split(['/', '?', '#', '&'])
            .next()
            .unwrap_or_default()
            .trim();

        if !vanity_str.is_empty() {
            return Ok(StoreAccountSession {
                store_id: "steam".to_string(),
                user_id: vanity_str.to_string(),
                username: vanity_str.to_string(),
                avatar_url: None,
                access_token: format!("steam_session:{}", vanity_str),
                refresh_token: Some(format!("steam_session:{}", vanity_str)),
                expires_at: None,
            });
        }
    }

    Err(PluginError::Parse(format!(
        "Impossibile estrarre lo SteamID o Vanity URL dal redirect: {}",
        url
    )))
}

/// Map a list of `SteamApiGameItem` into `DiscoveredGame` entries ready for Omnis integration.
pub fn map_steam_games_to_discovered(games: Vec<SteamApiGameItem>) -> Vec<DiscoveredGame> {
    games
        .into_iter()
        .map(|game| {
            let last_activity = game.rtime_last_played.and_then(|ts| {
                if ts > 0 {
                    chrono::DateTime::from_timestamp(ts, 0)
                } else {
                    None
                }
            });

            DiscoveredGame {
                library_id: "steam".to_string(),
                external_id: game.appid.to_string(),
                title: game.name.unwrap_or_else(|| format!("Steam App {}", game.appid)),
                install_dir: None,
                is_installed: false,
                play_action: Some(LaunchConfiguration {
                    executable: format!("steam://install/{}", game.appid),
                    arguments: vec![],
                    working_dir: None,
                    tracking_mode: ProcessTrackingMode::ProcessName("steam.exe".to_string()),
                }),
                playtime_seconds: game.playtime_forever.unwrap_or(0) * 60,
                play_count: 0,
                last_activity,
                cover_image_path: Some(format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900_2x.jpg",
                    game.appid
                )),
                background_image_path: Some(format!(
                    "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
                    game.appid
                )),
            }
        })
        .collect()
}

/// Helper function to parse games from public Steam Community XML (`/games?tab=all&xml=1`)
pub fn parse_steam_community_games_xml(xml: &str) -> Vec<SteamApiGameItem> {
    if let Some(err_msg) = extract_xml_tag(xml, "error") {
        tracing::warn!("Steam Community XML returned an error: {}", err_msg);
    }

    let mut items = Vec::new();
    let mut cursor = xml;

    while let Some(start_game) = cursor.find("<game>") {
        cursor = &cursor[start_game + 6..];
        let end_game = match cursor.find("</game>") {
            Some(pos) => pos,
            None => break,
        };
        let game_chunk = &cursor[..end_game];
        cursor = &cursor[end_game + 7..];

        let appid = extract_xml_tag(game_chunk, "appID")
            .and_then(|id_str| id_str.parse::<u64>().ok());

        if let Some(appid) = appid {
            let name = extract_xml_tag(game_chunk, "name");
            let hours = extract_xml_tag(game_chunk, "hoursOnRecord")
                .and_then(|h| h.replace(',', ".").parse::<f64>().ok())
                .map(|h| (h * 60.0).round() as u64);

            items.push(SteamApiGameItem {
                appid,
                name,
                playtime_forever: hours,
                rtime_last_played: None,
                img_icon_url: None,
            });
        }
    }

    items
}

/// Helper to extract text from a simple XML tag `<tag>value</tag>` or CDATA
pub fn extract_xml_tag(content: &str, tag: &str) -> Option<String> {
    let open_tag = format!("<{}>", tag);
    let close_tag = format!("</{}>", tag);
    let start = content.find(&open_tag)? + open_tag.len();
    let end = content[start..].find(&close_tag)? + start;
    let val = &content[start..end];
    let val = val.trim();
    let unquoted = if val.starts_with("<![CDATA[") && val.ends_with("]]>") {
        &val[9..val.len() - 3]
    } else {
        val
    };
    let extracted = unquoted.trim().to_string();
    if tag == "error" {
        tracing::warn!("Steam XML <error> tag detected: {}", extracted);
    }
    Some(extracted)
}

/// Fetch owned games using Steam Web API (API key is mandatory for cloud sync).
pub async fn fetch_user_games_web_api(
    client: &reqwest::Client,
    steam_id: &str,
    api_key: Option<&str>,
) -> Result<Vec<DiscoveredGame>, PluginError> {
    let key = match api_key.map(|k| k.trim()).filter(|k| !k.is_empty()) {
        Some(k) => k,
        None => {
            return Err(PluginError::Other(
                "La Steam Web API Key è obbligatoria per sincronizzare la libreria cloud e gli obiettivi. Configura la chiave nelle impostazioni Store.".to_string(),
            ));
        }
    };

    let url = format!(
        "{}?key={}&steamid={}&include_appinfo=1&include_played_free_games=1&format=json",
        STEAM_API_OWNED_GAMES_URL,
        urlencoding::encode(key),
        urlencoding::encode(steam_id.trim())
    );

    match client.get(&url).send().await {
        Ok(response) if response.status().is_success() => {
            match response.json::<SteamOwnedGamesApiResponse>().await {
                Ok(api_response) => {
                    let games = api_response.response.games.unwrap_or_default();
                    Ok(map_steam_games_to_discovered(games))
                }
                Err(err) => {
                    Err(PluginError::Other(format!(
                        "Errore nella decodifica della risposta Steam Web API: {}",
                        err
                    )))
                }
            }
        }
        Ok(response) => {
            let status = response.status();
            if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::UNAUTHORIZED {
                Err(PluginError::Other(
                    "Steam Web API Key non valida o non autorizzata. Verifica la chiave nelle impostazioni Account Store.".to_string(),
                ))
            } else {
                Err(PluginError::Other(format!(
                    "Steam Web API ha restituito lo stato HTTP: {}",
                    status
                )))
            }
        }
        Err(err) => {
            Err(PluginError::Other(format!(
                "Richiesta Steam Web API fallita: {}",
                err
            )))
        }
    }
}

/// Fetch user persona name and avatar from public Steam profile XML
pub async fn fetch_player_summary_xml(
    client: &reqwest::Client,
    steam_id: &str,
) -> Result<SteamProfileSummary, PluginError> {
    let url = if steam_id.chars().all(|c| c.is_ascii_digit()) && steam_id.len() == 17 {
        format!("{}/profiles/{}/?xml=1", STEAM_COMMUNITY_URL, steam_id)
    } else {
        format!("{}/id/{}/?xml=1", STEAM_COMMUNITY_URL, steam_id)
    };

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| PluginError::Other(format!("Failed to fetch Steam profile: {}", e)))?;

    if !resp.status().is_success() {
        return Ok(SteamProfileSummary::default());
    }

    let text = resp
        .text()
        .await
        .map_err(|e| PluginError::Other(format!("Failed to read Steam profile XML: {}", e)))?;

    let name = extract_xml_tag(&text, "steamID");
    let avatar = extract_xml_tag(&text, "avatarFull")
        .or_else(|| extract_xml_tag(&text, "avatarMedium"))
        .or_else(|| extract_xml_tag(&text, "avatarIcon"));

    Ok(SteamProfileSummary { name, avatar })
}

/// Fetch player summary using Web API if key is available, falling back to public XML
pub async fn fetch_player_summary(
    client: &reqwest::Client,
    steam_id: &str,
    api_key: Option<&str>,
) -> Result<SteamProfileSummary, PluginError> {
    if let Some(key) = api_key {
        let trimmed_key = key.trim();
        if !trimmed_key.is_empty() && steam_id.chars().all(|c| c.is_ascii_digit()) {
            let url = format!(
                "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={}&steamids={}",
                urlencoding::encode(trimmed_key),
                urlencoding::encode(steam_id.trim())
            );
            if let Ok(resp) = client.get(&url).send().await {
                if resp.status().is_success() {
                    if let Ok(data) = resp.json::<SteamPlayerSummaryResponse>().await {
                        if let Some(player) = data.response.players.into_iter().next() {
                            return Ok(SteamProfileSummary {
                                name: Some(player.personaname),
                                avatar: player.avatarfull.or(player.avatar),
                            });
                        }
                    }
                }
            }
        }
    }

    fetch_player_summary_xml(client, steam_id).await
}
