use crate::types::{game_to_dto, AppState, GameDto};
use omnis_core::{MetadataCandidateDto, MetadataPipelineConfig, ProviderInfo};
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn download_all_metadata(state: State<'_, AppState>) -> Result<usize, String> {
    let downloader = state.downloader.clone();
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    downloader
        .download_for_all(db, &covers_dir, |_cur, _tot, _title| {})
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn download_metadata(game_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let downloader = state.downloader.clone();
    downloader
        .download_for_game(&state.db, id, &state.covers_dir)
        .await
        .map(|_| true)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn enrich_single_game(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<GameDto, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    state
        .downloader
        .download_for_game(&state.db, id, &state.covers_dir)
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
) -> Result<omnis_sdk::Game, String> {
    let uuid = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let mut patch = omnis_sdk::GameMetadataPatch::default();

    for field in &fields {
        match field {
            omnis_sdk::MetadataField::CoverImage => {
                if let Some(ref url) = candidate.raw_patch.cover_url {
                    if url.starts_with("http://") || url.starts_with("https://") {
                        let covers_dir = state.covers_dir.clone();
                        let _ = std::fs::create_dir_all(&covers_dir);
                        let dest = covers_dir.join(format!("{}.jpg", uuid));
                        match state.downloader.download_image_bytes(url).await {
                            Ok(bytes) => {
                                if let Err(e) = std::fs::write(&dest, bytes) {
                                    tracing::warn!("Impossibile scrivere cover su disco {}: {}", dest.display(), e);
                                } else {
                                    let dest_str = dest.to_string_lossy().to_string();
                                    state.image_cache.invalidate(&dest_str);
                                    patch.cover_url = Some(dest_str);
                                }
                            }
                            Err(e) => {
                                tracing::warn!("Download cover fallito da {}: {}", url, e);
                            }
                        }
                    } else {
                        patch.cover_url = Some(url.clone());
                    }
                }
            }
            omnis_sdk::MetadataField::BackgroundImage => {
                if let Some(ref url) = candidate.raw_patch.background_url {
                    if url.starts_with("http://") || url.starts_with("https://") {
                        let bgs_dir = state.backgrounds_dir.clone();
                        let _ = std::fs::create_dir_all(&bgs_dir);
                        let dest = bgs_dir.join(format!("{}.jpg", uuid));
                        match state.downloader.download_image_bytes(url).await {
                            Ok(bytes) => {
                                if let Err(e) = std::fs::write(&dest, bytes) {
                                    tracing::warn!("Impossibile scrivere background su disco {}: {}", dest.display(), e);
                                } else {
                                    let dest_str = dest.to_string_lossy().to_string();
                                    state.image_cache.invalidate(&dest_str);
                                    patch.background_url = Some(dest_str);
                                }
                            }
                            Err(e) => {
                                tracing::warn!("Download background fallito da {}: {}", url, e);
                            }
                        }
                    } else {
                        patch.background_url = Some(url.clone());
                    }
                }
            }
            omnis_sdk::MetadataField::Icon => {
                patch.icon_url = candidate.raw_patch.icon_url.clone();
            }
            omnis_sdk::MetadataField::CriticScore => {
                patch.critic_score = candidate.raw_patch.critic_score;
            }
            omnis_sdk::MetadataField::CommunityScore => {
                patch.community_score = candidate.raw_patch.community_score;
            }
            omnis_sdk::MetadataField::Description => {
                patch.description = candidate.raw_patch.description.clone();
            }
            omnis_sdk::MetadataField::ReleaseDate => {
                patch.release_date = candidate.raw_patch.release_date.clone();
            }
            omnis_sdk::MetadataField::Genres => {
                patch.genres = candidate.raw_patch.genres.clone();
            }
            omnis_sdk::MetadataField::Developers => {
                patch.developers = candidate.raw_patch.developers.clone();
            }
            omnis_sdk::MetadataField::Publishers => {
                patch.publishers = candidate.raw_patch.publishers.clone();
            }
        }
    }

    state
        .db
        .apply_metadata_patch(uuid, &patch)
        .map_err(|e| e.to_string())?;

    let game = state
        .db
        .get_game_by_id(uuid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    if let Some(ref p) = game.cover_image_path {
        state.image_cache.invalidate(p);
    }
    if let Some(ref p) = game.background_image_path {
        state.image_cache.invalidate(p);
    }

    Ok(game)
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
