use std::sync::atomic::Ordering;
use crate::commands::games::game_to_enriched_dto;
use crate::types::{AppState, GameDto};
use omnis_core::{MetadataCandidateDto, MetadataPipelineConfig, ProviderInfo};
use omnis_sdk::constants::events;
use tauri::{Emitter, State};
use uuid::Uuid;

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchEnrichmentPayload {
    #[serde(alias = "game_ids")]
    pub game_ids: Vec<String>,
    #[serde(alias = "fetch_metadata")]
    pub fetch_metadata: bool,
    #[serde(alias = "fetch_hltb")]
    pub fetch_hltb: bool,
    #[serde(alias = "fetch_achievements")]
    pub fetch_achievements: bool,
}

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
    let cache_dir = state
        .covers_dir
        .parent()
        .unwrap_or(&state.covers_dir)
        .to_path_buf();
    let handle = app_handle.clone();
    downloader
        .download_for_all(db, &cache_dir, move |cur, tot, title| {
            let _ = handle.emit(
                events::METADATA_PROGRESS,
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
pub async fn download_batch_metadata(
    game_ids: Vec<String>,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let uuids: Vec<Uuid> = game_ids
        .into_iter()
        .filter_map(|s| Uuid::parse_str(&s).ok())
        .collect();
    let downloader = state.downloader.clone();
    let db = state.db.clone();
    let cache_dir = state
        .covers_dir
        .parent()
        .unwrap_or(&state.covers_dir)
        .to_path_buf();
    let handle = app_handle.clone();
    downloader
        .download_for_games(db, uuids, &cache_dir, move |cur, tot, title| {
            let _ = handle.emit(
                events::METADATA_PROGRESS,
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
pub async fn start_batch_enrichment(
    payload: BatchEnrichmentPayload,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let uuids: Vec<Uuid> = payload
        .game_ids
        .into_iter()
        .filter_map(|s| Uuid::parse_str(&s).ok())
        .collect();

    if uuids.is_empty()
        || (!payload.fetch_metadata && !payload.fetch_hltb && !payload.fetch_achievements)
    {
        return Ok(0);
    }

    state
        .downloader
        .cancel_requested
        .store(false, Ordering::SeqCst);

    let mut enriched_count = 0;
    let total_games = uuids.len();

    // Step 1: Metadata & Artwork pipeline
    if payload.fetch_metadata {
        let cache_dir = state
            .covers_dir
            .parent()
            .unwrap_or(&state.covers_dir)
            .to_path_buf();
        let handle = app_handle.clone();
        let count = state
            .downloader
            .clone()
            .download_for_games(
                state.db.clone(),
                uuids.clone(),
                &cache_dir,
                move |cur, tot, title| {
                    let _ = handle.emit(
                        events::METADATA_PROGRESS,
                        MetadataProgressPayload {
                            current: cur,
                            total: tot,
                            title: title.to_string(),
                        },
                    );
                },
            )
            .await
            .map_err(|e| e.to_string())?;

        enriched_count += count;

        if state.downloader.is_cancel_requested() {
            if enriched_count > 0 {
                let _ = app_handle.emit(events::LIBRARY_UPDATED, ());
            }
            return Ok(enriched_count);
        }
    }

    // Step 2: HowLongToBeat times (when metadata was skipped, as full metadata pipeline already includes HLTB)
    if payload.fetch_hltb && !payload.fetch_metadata {
        for (i, &id) in uuids.iter().enumerate() {
            if state.downloader.is_cancel_requested() {
                break;
            }

            if let Ok(Some(game)) = state.db.get_game_by_id(id) {
                let _ = app_handle.emit(
                    events::METADATA_PROGRESS,
                    MetadataProgressPayload {
                        current: i + 1,
                        total: total_games,
                        title: format!("HowLongToBeat: {}", game.title),
                    },
                );

                let (main_h, extra_h, comp_h) =
                    state.downloader.fetch_hltb_times(&game.title).await;
                let hltb_data = serde_json::json!({
                    "howlongtobeat": {
                        "main_story": main_h,
                        "main_extra": extra_h,
                        "completionist": comp_h,
                    }
                });

                let patch = omnis_sdk::GameMetadataPatch {
                    extra_metadata: Some(hltb_data.to_string()),
                    ..Default::default()
                };

                if state.db.apply_metadata_patch(id, &patch).is_ok() {
                    enriched_count += 1;
                    let _ = app_handle.emit(events::GAME_UPDATED, &id.to_string());
                }

                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            }
        }

        if state.downloader.is_cancel_requested() {
            if enriched_count > 0 {
                let _ = app_handle.emit(events::LIBRARY_UPDATED, ());
            }
            return Ok(enriched_count);
        }
    }

    // Step 3: Store Achievements (skips unsupported games and games marked 'none')
    if payload.fetch_achievements {
        let mut eligible_games = Vec::new();
        for &id in &uuids {
            if let Ok(Some(game)) = state.db.get_game_by_id(id) {
                if state.achievement_service.supports_store(&game.library_id)
                    && game.achievements_sync_status != omnis_sdk::AchievementsSyncStatus::None
                {
                    eligible_games.push(game);
                }
            }
        }

        let total_achievements = eligible_games.len();
        for (i, game) in eligible_games.into_iter().enumerate() {
            if state.downloader.is_cancel_requested() {
                break;
            }

            let _ = app_handle.emit(
                events::METADATA_PROGRESS,
                MetadataProgressPayload {
                    current: i + 1,
                    total: total_achievements,
                    title: format!("Achievements: {}", game.title),
                },
            );

            match state
                .achievement_service
                .sync_game_achievements(
                    &state.db,
                    &state.store_account_manager,
                    &state.app_dir,
                    game.id,
                )
                .await
            {
                Ok(_) => {
                    enriched_count += 1;
                    let _ = app_handle.emit(
                        events::ACHIEVEMENTS_UPDATED,
                        serde_json::json!({ "game_id": game.id.to_string() }),
                    );
                    let _ = app_handle.emit(events::GAME_UPDATED, &game.id.to_string());
                }
                Err(err) => {
                    tracing::debug!("Achievement sync skipped for '{}': {}", game.title, err);
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        }
    }

    if enriched_count > 0 {
        let _ = app_handle.emit(events::LIBRARY_UPDATED, ());
    }

    Ok(enriched_count)
}

#[tauri::command]
pub async fn cancel_metadata_download(state: State<'_, AppState>) -> Result<bool, String> {
    state.downloader.cancel_download();
    Ok(true)
}

#[tauri::command]
pub async fn download_metadata(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let cache_dir = state
        .covers_dir
        .parent()
        .unwrap_or(&state.covers_dir)
        .to_path_buf();
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
    let cache_dir = state
        .covers_dir
        .parent()
        .unwrap_or(&state.covers_dir)
        .to_path_buf();
    state
        .downloader
        .download_for_game(&state.db, id, &cache_dir)
        .await?;
    let game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    let _ = app_handle.emit(events::GAME_UPDATED, &game_id);
    let _ = app_handle.emit(events::LIBRARY_UPDATED, ());

    Ok(game_to_enriched_dto(&state, game))
}

#[tauri::command]
pub async fn refresh_game_howlongtobeat(
    game_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<GameDto, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    let (main_h, extra_h, comp_h) = state.downloader.fetch_hltb_times(&game.title).await;
    let hltb_data = serde_json::json!({
        "howlongtobeat": {
            "main_story": main_h,
            "main_extra": extra_h,
            "completionist": comp_h,
        }
    });

    let patch = omnis_sdk::GameMetadataPatch {
        extra_metadata: Some(hltb_data.to_string()),
        ..Default::default()
    };

    state
        .db
        .apply_metadata_patch(id, &patch)
        .map_err(|e| e.to_string())?;

    let updated_game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    let _ = app_handle.emit(events::GAME_UPDATED, &game_id);
    let _ = app_handle.emit(events::LIBRARY_UPDATED, ());

    Ok(game_to_enriched_dto(&state, updated_game))
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
    let applier = crate::services::CandidateMetadataApplier::from_state(&state);
    applier.apply_candidate(&game_id, &candidate, &fields).await
}

#[tauri::command]
pub async fn get_metadata_providers(
    state: State<'_, AppState>,
) -> Result<Vec<ProviderInfo>, String> {
    Ok(state.downloader.get_providers_info().await)
}

#[tauri::command]
pub async fn refresh_metadata_providers(
    state: State<'_, AppState>,
) -> Result<Vec<ProviderInfo>, String> {
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
    state
        .downloader
        .toggle_provider(&provider_id, enabled)
        .await?;
    Ok(true)
}

#[tauri::command]
pub async fn test_provider_connection(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state
        .downloader
        .test_provider_connection(&provider_id)
        .await
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_batch_enrichment_payload_deserialization_camel_and_snake() {
        let json_camel = r#"{
            "gameIds": ["c34e0627-2c1b-4f93-b8f9-4d048d085955"],
            "fetchMetadata": true,
            "fetchHltb": false,
            "fetchAchievements": true
        }"#;

        let payload_camel: BatchEnrichmentPayload = serde_json::from_str(json_camel).unwrap();
        assert_eq!(payload_camel.game_ids.len(), 1);
        assert_eq!(
            payload_camel.game_ids[0],
            "c34e0627-2c1b-4f93-b8f9-4d048d085955"
        );
        assert!(payload_camel.fetch_metadata);
        assert!(!payload_camel.fetch_hltb);
        assert!(payload_camel.fetch_achievements);

        let json_snake = r#"{
            "game_ids": ["c34e0627-2c1b-4f93-b8f9-4d048d085955"],
            "fetch_metadata": false,
            "fetch_hltb": true,
            "fetch_achievements": false
        }"#;

        let payload_snake: BatchEnrichmentPayload = serde_json::from_str(json_snake).unwrap();
        assert_eq!(payload_snake.game_ids.len(), 1);
        assert!(!payload_snake.fetch_metadata);
        assert!(payload_snake.fetch_hltb);
        assert!(!payload_snake.fetch_achievements);
    }
}
