use crate::types::AppState;
use omnis_core::Database;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;
use tokio::sync::RwLock;
use tracing::debug;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SteamMovieItem {
    id: Option<u64>,
    name: Option<String>,
    hls_h264: Option<String>,
    dash_h264: Option<String>,
    #[serde(default)]
    highlight: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct SteamAppDetailsData {
    movies: Option<Vec<SteamMovieItem>>,
}

#[derive(Debug, Deserialize)]
struct SteamAppDetailsResponse {
    success: bool,
    data: Option<SteamAppDetailsData>,
}

pub struct GameTrailerResolver;

impl GameTrailerResolver {
    /// Resolves trailer URL with the cascading fallback chain:
    /// 1. In-memory cache
    /// 2. Local filesystem candidate files
    /// 3. Database custom links
    /// 4. Remote Steam store API
    pub async fn resolve(
        state: &AppState,
        game_id: &str,
        library_id: &str,
        external_id: &str,
    ) -> Result<Option<String>, String> {
        let cache_key = format!("{}:{}:{}", library_id, external_id, game_id);

        // 1. Check in-memory trailer cache
        if let Some(url) = Self::check_memory_cache(&state.trailer_cache, &cache_key).await {
            return Ok(Some(url));
        }

        // 2. Check local trailer files
        if let Some(path_str) = Self::check_local_disk(&state.app_dir, game_id, external_id, library_id) {
            state.trailer_cache.write().await.insert(cache_key, path_str.clone());
            return Ok(Some(path_str));
        }

        // 3. Check custom links in database
        if let Some(link_url) = Self::check_db_custom_links(&state.db, game_id) {
            state.trailer_cache.write().await.insert(cache_key, link_url.clone());
            return Ok(Some(link_url));
        }

        // 4. Steam games: query Steam Store API
        if library_id.eq_ignore_ascii_case("steam")
            && !external_id.is_empty()
            && external_id.chars().all(|c| c.is_ascii_digit())
        {
            if let Some(hls_url) = Self::fetch_steam_store_trailer(external_id).await? {
                state.trailer_cache.write().await.insert(cache_key, hls_url.clone());
                return Ok(Some(hls_url));
            }
        }

        Ok(None)
    }

    pub async fn check_memory_cache(
        cache: &RwLock<HashMap<String, String>>,
        cache_key: &str,
    ) -> Option<String> {
        let guard = cache.read().await;
        guard.get(cache_key).cloned()
    }

    pub fn check_local_disk(
        app_dir: &Path,
        game_id: &str,
        external_id: &str,
        library_id: &str,
    ) -> Option<String> {
        let trailers_dir = app_dir.join("trailers");
        let candidates = [
            trailers_dir.join(format!("{}.mp4", game_id)),
            trailers_dir.join(format!("{}.webm", game_id)),
            trailers_dir.join(format!("{}.mp4", external_id)),
            trailers_dir.join(format!("{}.webm", external_id)),
            trailers_dir.join(format!("{}_{}.mp4", library_id, external_id)),
            trailers_dir.join(format!("{}_{}.webm", library_id, external_id)),
        ];

        for candidate in candidates {
            if candidate.exists() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
        None
    }

    pub fn check_db_custom_links(db: &Database, game_id: &str) -> Option<String> {
        let uuid = Uuid::parse_str(game_id).ok()?;
        let game = db.get_game_by_id(uuid).ok()??;

        for link in game.custom_links {
            let url_lower = link.url.to_lowercase();
            let title_lower = link.title.to_lowercase();
            if url_lower.ends_with(".mp4")
                || url_lower.ends_with(".webm")
                || url_lower.contains(".m3u8")
                || title_lower.contains("trailer")
                || title_lower.contains("video")
            {
                return Some(link.url);
            }
        }
        None
    }

    pub async fn fetch_steam_store_trailer(external_id: &str) -> Result<Option<String>, String> {
        let store_url = format!(
            "https://store.steampowered.com/api/appdetails?appids={}",
            external_id
        );
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(4))
            .build()
            .map_err(|e| e.to_string())?;

        match client.get(&store_url).send().await {
            Ok(resp) => {
                if let Ok(body) = resp.json::<HashMap<String, SteamAppDetailsResponse>>().await {
                    if let Some(app_data) = body.get(external_id) {
                        if app_data.success {
                            if let Some(ref data) = app_data.data {
                                if let Some(ref movies) = data.movies {
                                    let chosen = movies
                                        .iter()
                                        .find(|m| m.highlight == Some(true))
                                        .or_else(|| movies.first());
                                    if let Some(movie) = chosen {
                                        if let Some(ref hls) = movie.hls_h264 {
                                            return Ok(Some(hls.clone()));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                debug!(
                    "Failed to fetch Steam store trailer for appid {}: {}",
                    external_id, e
                );
            }
        }

        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{game_to_dto, ImageCache};
    use omnis_sdk::Game;

    #[test]
    fn test_game_dto_external_id_serialization() {
        let cache = ImageCache::new();
        let mut game = Game::new(
            "steam".to_string(),
            "1091500".to_string(),
            "Cyberpunk 2077".to_string(),
        );
        game.is_installed = true;
        game.playtime_seconds = 7200;
        game.critic_score = Some(86);

        let dto = game_to_dto(game, &cache);
        assert_eq!(dto.external_id, "1091500");
        assert_eq!(dto.library, "steam");

        let json = serde_json::to_string(&dto).expect("GameDto serialization failed");
        assert!(
            json.contains("\"external_id\":\"1091500\""),
            "Serialized JSON must contain external_id"
        );
    }

    #[test]
    fn test_steam_movie_details_deserialization() {
        let mock_json = r#"{
            "1091500": {
                "success": true,
                "data": {
                    "movies": [
                        {
                            "id": 257081132,
                            "name": "City of Dreams",
                            "hls_h264": "https://video.akamai.steamstatic.com/store_trailers/1091500/hls_264_master.m3u8",
                            "dash_h264": "https://video.akamai.steamstatic.com/store_trailers/1091500/dash_h264.mpd",
                            "highlight": true
                        }
                    ]
                }
            }
        }"#;

        let parsed: HashMap<String, SteamAppDetailsResponse> =
            serde_json::from_str(mock_json).expect("Deserialization failed");
        assert!(parsed.contains_key("1091500"));
        let app = &parsed["1091500"];
        assert!(app.success);
        let movies = app.data.as_ref().unwrap().movies.as_ref().unwrap();
        assert_eq!(movies.len(), 1);
        assert_eq!(
            movies[0].hls_h264.as_deref(),
            Some("https://video.akamai.steamstatic.com/store_trailers/1091500/hls_264_master.m3u8")
        );
        assert_eq!(movies[0].highlight, Some(true));
    }
}
