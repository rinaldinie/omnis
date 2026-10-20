use crate::types::{game_to_dto, AppState, GameDto};
use omnis_core::{MetadataCandidateDto, MetadataPipelineConfig, ProviderInfo};
use tauri::{Emitter, State};
use uuid::Uuid;

#[derive(Clone, serde::Serialize)]
pub struct MetadataProgressPayload {
    pub current: usize,
    pub total: usize,
    pub title: String,
}

#[tauri::command]
pub async fn download_all_metadata(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let downloader = state.downloader.clone();
    let db = state.db.clone();
    let cache_dir = state.covers_dir.parent().unwrap_or(&state.covers_dir).to_path_buf();
    let handle = app_handle.clone();
    downloader
        .download_for_all(db, &cache_dir, move |cur, tot, title| {
            let _ = handle.emit(
                "metadata-progress",
                MetadataProgressPayload {
                    current: cur,
                    total: tot,
                    title: title.to_string(),
                },
            );
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_metadata_download(state: State<'_, AppState>) -> Result<bool, String> {
    state.downloader.cancel_download();
    Ok(true)
}

#[tauri::command]
pub async fn download_metadata(game_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let cache_dir = state.covers_dir.parent().unwrap_or(&state.covers_dir).to_path_buf();
    let downloader = state.downloader.clone();
    downloader
        .download_for_game(&state.db, id, &cache_dir)
        .await
        .map(|_| true)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn enrich_single_game(
    game_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<GameDto, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let cache_dir = state.covers_dir.parent().unwrap_or(&state.covers_dir).to_path_buf();
    state
        .downloader
        .download_for_game(&state.db, id, &cache_dir)
        .await?;
    let game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    if let Some(ref p) = game.cover_image_path {
        state.image_cache.invalidate(p);
    }
    if let Some(ref p) = game.background_image_path {
        state.image_cache.invalidate(p);
    }

    let _ = app_handle.emit("game-updated", &game_id);
    let _ = app_handle.emit("library-updated", ());

    Ok(game_to_dto(game, &state.image_cache))
}

#[tauri::command]
pub async fn search_metadata_candidates(
    title: String,
    provider_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<MetadataCandidateDto>, String> {
    state
        .downloader
        .search_candidates(&title, provider_id.as_deref())
        .await
}

#[tauri::command]
pub async fn apply_metadata_candidate(
    game_id: String,
    candidate: MetadataCandidateDto,
    fields: Vec<omnis_sdk::MetadataField>,
    state: State<'_, AppState>,
) -> Result<GameDto, String> {
    let uuid = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let existing_game = state
        .db
        .get_game_by_id(uuid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    let appid_hint = if candidate.provider_id == "steam" {
        if candidate.provider_game_id.chars().all(|c| c.is_ascii_digit()) {
            Some(candidate.provider_game_id.as_str())
        } else if existing_game.library_id == "steam" {
            Some(existing_game.external_id.as_str())
        } else {
            None
        }
    } else {
        None
    };

    let mut patch = omnis_sdk::GameMetadataPatch::default();

    for field in &fields {
        match field {
            omnis_sdk::MetadataField::CoverImage => {
                let cover_url = candidate
                    .cover_url
                    .as_ref()
                    .or(candidate.raw_patch.cover_url.as_ref());
                if let Some(url) = cover_url {
                    let url_trim = url.trim();
                    if !url_trim.is_empty() {
                        if url_trim.starts_with("http://") || url_trim.starts_with("https://") {
                            let covers_dir = state.covers_dir.clone();
                            let _ = std::fs::create_dir_all(&covers_dir);
                            let now_ts = chrono::Utc::now().timestamp_millis();
                            let dest = covers_dir.join(format!("{}_{}.jpg", uuid, now_ts));
                            match state.downloader.download_image_with_fallbacks(url_trim, appid_hint).await {
                                Ok(bytes) => {
                                    if let Err(e) = std::fs::write(&dest, bytes) {
                                        tracing::warn!("Impossibile scrivere cover su disco {}: {}", dest.display(), e);
                                        patch.cover_url = Some(url_trim.to_string());
                                    } else {
                                        // Clean up old cover file if managed by omnis
                                        if let Some(ref old_cover) = existing_game.cover_image_path {
                                            let old_path = std::path::Path::new(old_cover);
                                            if old_path.exists() && old_path.starts_with(&covers_dir) && old_path != &dest {
                                                let _ = std::fs::remove_file(old_path);
                                            }
                                            state.image_cache.invalidate(old_cover);
                                        }
                                        let dest_str = dest.to_string_lossy().to_string();
                                        state.image_cache.invalidate(&dest_str);
                                        patch.cover_url = Some(dest_str);
                                    }
                                }
                                Err(e) => {
                                    tracing::warn!("Download cover fallito da {}: {}", url_trim, e);
                                    patch.cover_url = Some(url_trim.to_string());
                                }
                            }
                        } else {
                            patch.cover_url = Some(url_trim.to_string());
                        }
                    }
                }
            }
            omnis_sdk::MetadataField::BackgroundImage => {
                let bg_url = candidate
                    .background_url
                    .as_ref()
                    .or(candidate.raw_patch.background_url.as_ref());
                if let Some(url) = bg_url {
                    let url_trim = url.trim();
                    if !url_trim.is_empty() {
                        if url_trim.starts_with("http://") || url_trim.starts_with("https://") {
                            let bgs_dir = state.backgrounds_dir.clone();
                            let _ = std::fs::create_dir_all(&bgs_dir);
                            let now_ts = chrono::Utc::now().timestamp_millis();
                            let dest = bgs_dir.join(format!("{}_{}.jpg", uuid, now_ts));
                            match state.downloader.download_image_with_fallbacks(url_trim, appid_hint).await {
                                Ok(bytes) => {
                                    if let Err(e) = std::fs::write(&dest, bytes) {
                                        tracing::warn!("Impossibile scrivere background su disco {}: {}", dest.display(), e);
                                        patch.background_url = Some(url_trim.to_string());
                                    } else {
                                        // Clean up old background file if managed by omnis
                                        if let Some(ref old_bg) = existing_game.background_image_path {
                                            let old_path = std::path::Path::new(old_bg);
                                            if old_path.exists() && old_path.starts_with(&bgs_dir) && old_path != &dest {
                                                let _ = std::fs::remove_file(old_path);
                                            }
                                            state.image_cache.invalidate(old_bg);
                                        }
                                        let dest_str = dest.to_string_lossy().to_string();
                                        state.image_cache.invalidate(&dest_str);
                                        patch.background_url = Some(dest_str);
                                    }
                                }
                                Err(e) => {
                                    tracing::warn!("Download background fallito da {}: {}", url_trim, e);
                                    patch.background_url = Some(url_trim.to_string());
                                }
                            }
                        } else {
                            patch.background_url = Some(url_trim.to_string());
                        }
                    }
                }
            }
            omnis_sdk::MetadataField::Icon => {
                if let Some(ref icon) = candidate.raw_patch.icon_url {
                    let icon_trim = icon.trim();
                    if !icon_trim.is_empty() {
                        patch.icon_url = Some(icon_trim.to_string());
                    }
                }
            }
            omnis_sdk::MetadataField::CriticScore => {
                if candidate.raw_patch.critic_score.is_some() {
                    patch.critic_score = candidate.raw_patch.critic_score;
                }
            }
            omnis_sdk::MetadataField::CommunityScore => {
                if candidate.raw_patch.community_score.is_some() {
                    patch.community_score = candidate.raw_patch.community_score;
                }
            }
            omnis_sdk::MetadataField::Description => {
                let desc = candidate
                    .description
                    .as_ref()
                    .or(candidate.raw_patch.description.as_ref());
                if let Some(d) = desc {
                    let d_trim = d.trim();
                    if !d_trim.is_empty() {
                        patch.description = Some(d_trim.to_string());
                    }
                }
            }
            omnis_sdk::MetadataField::ReleaseDate => {
                if let Some(ref rd) = candidate.raw_patch.release_date {
                    let rd_trim = rd.trim();
                    if !rd_trim.is_empty() {
                        patch.release_date = Some(rd_trim.to_string());
                    }
                } else if let Some(year) = candidate.release_year {
                    patch.release_date = Some(year.to_string());
                }
            }
            omnis_sdk::MetadataField::Genres => {
                if !candidate.raw_patch.genres.is_empty() {
                    patch.genres = candidate.raw_patch.genres.clone();
                }
            }
            omnis_sdk::MetadataField::Developers => {
                if !candidate.raw_patch.developers.is_empty() {
                    patch.developers = candidate.raw_patch.developers.clone();
                }
            }
            omnis_sdk::MetadataField::Publishers => {
                if !candidate.raw_patch.publishers.is_empty() {
                    patch.publishers = candidate.raw_patch.publishers.clone();
                }
            }
        }
    }

    state
        .db
        .apply_metadata_patch(uuid, &patch)
        .map_err(|e| e.to_string())?;

    let updated_game = state
        .db
        .get_game_by_id(uuid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    if let Some(ref p) = updated_game.cover_image_path {
        state.image_cache.invalidate(p);
    }
    if let Some(ref p) = updated_game.background_image_path {
        state.image_cache.invalidate(p);
    }

    Ok(game_to_dto(updated_game, &state.image_cache))
}

#[tauri::command]
pub async fn get_metadata_providers(state: State<'_, AppState>) -> Result<Vec<ProviderInfo>, String> {
    Ok(state.downloader.get_providers_info().await)
}

#[tauri::command]
pub async fn refresh_metadata_providers(state: State<'_, AppState>) -> Result<Vec<ProviderInfo>, String> {
    state.downloader.refresh_external_plugins().await
}

#[tauri::command]
pub async fn save_provider_settings(
    provider_id: String,
    settings: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let map = settings.as_object().cloned().unwrap_or_default();
    state
        .downloader
        .save_provider_settings(&provider_id, map)
        .await?;
    Ok(true)
}

#[tauri::command]
pub async fn toggle_provider(
    provider_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state.downloader.toggle_provider(&provider_id, enabled).await?;
    Ok(true)
}

#[tauri::command]
pub async fn test_provider_connection(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state.downloader.test_provider_connection(&provider_id).await
}

#[tauri::command]
pub async fn get_metadata_pipeline_config(
    state: State<'_, AppState>,
) -> Result<MetadataPipelineConfig, String> {
    Ok(state.downloader.get_pipeline_config().await)
}

#[tauri::command]
pub async fn save_metadata_pipeline_config(
    config: MetadataPipelineConfig,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state.downloader.save_pipeline_config(config).await?;
    Ok(true)
}
