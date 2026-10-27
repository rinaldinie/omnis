use crate::types::{game_to_dto, AppState, GameDto};
use omnis_core::{MetadataCandidateDto, MetadataPipelineConfig, ProviderInfo};
use omnis_sdk::constants::events;
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
    let cache_dir = state.covers_dir.parent().unwrap_or(&state.covers_dir).to_path_buf();
    let handle = app_handle.clone();
    downloader
        .download_for_games(db, uuids, &cache_dir, move |cur, tot, title| {
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

    let _ = app_handle.emit(events::GAME_UPDATED, &game_id);
    let _ = app_handle.emit(events::LIBRARY_UPDATED, ());

    Ok(game_to_dto(game, &state.image_cache))
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

    Ok(game_to_dto(updated_game, &state.image_cache))
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
    let applier = crate::candidate_applier::CandidateMetadataApplier::from_state(&state);
    applier.apply_candidate(&game_id, &candidate, &fields).await
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
