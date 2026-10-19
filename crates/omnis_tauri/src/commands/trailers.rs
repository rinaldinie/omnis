use crate::types::AppState;
use serde::Deserialize;
use std::collections::HashMap;
use tauri::State;
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

#[tauri::command]
pub async fn get_game_trailer_url(
    game_id: String,
    library_id: String,
    external_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let cache_key = format!("{}:{}:{}", library_id, external_id, game_id);

    // 1. Check in-memory trailer cache
    {
        let cache = state.trailer_cache.read().await;
        if let Some(url) = cache.get(&cache_key) {
            return Ok(Some(url.clone()));
        }
    }

    // 2. Check local trailer files in %LOCALAPPDATA%/OmnisGameLibrary/trailers/
    let trailers_dir = state.app_dir.join("trailers");
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
            let path_str = candidate.to_string_lossy().to_string();
            state.trailer_cache.write().await.insert(cache_key.clone(), path_str.clone());
            return Ok(Some(path_str));
        }
    }

    // 3. Check custom links in database
    if let Ok(uuid) = Uuid::parse_str(&game_id) {
        if let Ok(Some(game)) = state.db.get_game_by_id(uuid) {
            for link in game.custom_links {
                let url_lower = link.url.to_lowercase();
                let title_lower = link.title.to_lowercase();
                if url_lower.ends_with(".mp4")
                    || url_lower.ends_with(".webm")
                    || url_lower.contains(".m3u8")
                    || title_lower.contains("trailer")
                    || title_lower.contains("video")
                {
                    state.trailer_cache.write().await.insert(cache_key.clone(), link.url.clone());
                    return Ok(Some(link.url));
                }
            }
        }
    }

    // 4. Steam games: query Steam Store API for official trailers
    if library_id.to_lowercase() == "steam"
        && !external_id.is_empty()
        && external_id.chars().all(|c| c.is_ascii_digit())
    {
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
                    if let Some(app_data) = body.get(&external_id) {
                        if app_data.success {
                            if let Some(ref data) = app_data.data {
                                if let Some(ref movies) = data.movies {
                                    // Prefer highlighted trailer or first movie
                                    let chosen = movies
                                        .iter()
                                        .find(|m| m.highlight == Some(true))
                                        .or_else(|| movies.first());
                                    if let Some(movie) = chosen {
                                        if let Some(ref hls) = movie.hls_h264 {
                                            state
                                                .trailer_cache
                                                .write()
                                                .await
                                                .insert(cache_key.clone(), hls.clone());
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
    }

    Ok(None)
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

