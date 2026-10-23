//! Tauri IPC commands for game achievements and icon caching

use crate::types::AppState;
use omnis_core::achievements::AchievementCacheManager;
use omnis_plugin_epic::EpicLibraryPlugin;
use omnis_plugin_gog::GogCloudPlugin;
use omnis_plugin_steam::SteamPlugin;
use omnis_plugin_xbox::XboxCloudPlugin;
use omnis_sdk::{Achievement, AchievementProvider, GameAchievementsSummary};
use std::sync::Arc;
use tauri::State;
use tracing::{debug, warn};
use uuid::Uuid;

async fn refresh_game_achievements_internal(
    state: &AppState,
    game_id: Uuid,
) -> Result<GameAchievementsSummary, String> {
    let game = state
        .db
        .get_game_by_id(game_id)
        .map_err(|e| format!("Database error fetching game: {e}"))?
        .ok_or_else(|| format!("Game not found: {game_id}"))?;

    let achievements: Vec<Achievement> = match game.library_id.as_str() {
        "steam" => {
            let session = state
                .store_account_manager
                .load_session("steam")
                .map_err(|e| format!("Errore nel caricamento della sessione Steam: {e}"))?
                .ok_or_else(|| {
                    "Nessun account Steam configurato. Inserisci la Steam Web API Key e l'ID Account nelle impostazioni Store.".to_string()
                })?;
            let provider = SteamPlugin::new();
            provider
                .fetch_achievements(&game, Some(&session))
                .await
                .map_err(|e| format!("{e}"))?
        }
        "xbox" => {
            let session = state
                .store_account_manager
                .load_session("xbox")
                .map_err(|e| format!("Error loading Xbox session: {e}"))?
                .ok_or_else(|| {
                    "No active Xbox account found. Please connect your Xbox account in Store Accounts."
                        .to_string()
                })?;
            let provider = XboxCloudPlugin::new();
            provider
                .fetch_achievements(&game, Some(&session))
                .await
                .map_err(|e| format!("Xbox achievements fetch error: {e}"))?
        }
        "gog" => {
            let session = state
                .store_account_manager
                .load_session("gog")
                .map_err(|e| format!("Error loading GOG session: {e}"))?
                .ok_or_else(|| {
                    "No active GOG Galaxy account found. Please connect your GOG account in Store Accounts."
                        .to_string()
                })?;
            let provider = GogCloudPlugin::new();
            provider
                .fetch_achievements(&game, Some(&session))
                .await
                .map_err(|e| format!("GOG achievements fetch error: {e}"))?
        }
        "epic" => {
            let session = state
                .store_account_manager
                .load_session("epic")
                .ok()
                .flatten();
            let provider = EpicLibraryPlugin::new();
            provider
                .fetch_achievements(&game, session.as_ref())
                .await
                .map_err(|e| format!("Epic achievements fetch error: {e}"))?
        }
        other => {
            return Err(format!(
                "Achievements are currently not supported for store '{other}'"
            ));
        }
    };

    // 1. Persist to SQLite
    state
        .db
        .upsert_achievements(game_id, &achievements)
        .map_err(|e| format!("Database error saving achievements: {e}"))?;

    // 2. Cache icons to disk in background (limit 8 concurrent downloads)
    // We spawn this task so the IPC call returns immediately with remote CDN icon URLs,
    // avoiding a multi-second delay while dozens of images download over HTTP.
    let db_clone = Arc::clone(&state.db);
    let cache_dir = state.app_dir.join("cache").join("achievements");
    let cache_manager = AchievementCacheManager::new(cache_dir);
    tokio::spawn(async move {
        if let Err(e) = cache_manager
            .cache_achievements_for_game(&db_clone, game_id, &achievements)
            .await
        {
            warn!("Achievement icon caching had errors for {game_id}: {e}");
        }
    });

    // 3. Return updated summary immediately
    state
        .db
        .get_game_achievements(game_id)
        .map_err(|e| format!("Database error reading achievement summary: {e}"))
}

#[tauri::command]
pub async fn get_game_achievements(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<GameAchievementsSummary, String> {
    let gid = Uuid::parse_str(&game_id).map_err(|e| format!("Invalid game ID: {e}"))?;

    let summary = state
        .db
        .get_game_achievements(gid)
        .map_err(|e| format!("Database error: {e}"))?;

    if summary.total_count > 0 {
        return Ok(summary);
    }

    // Attempt automatic refresh if never synced
    match refresh_game_achievements_internal(&state, gid).await {
        Ok(refreshed) => Ok(refreshed),
        Err(e) => {
            debug!("Automatic achievements sync skipped or failed for {game_id}: {e}");
            Ok(summary)
        }
    }
}

#[tauri::command]
pub async fn refresh_game_achievements(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<GameAchievementsSummary, String> {
    let gid = Uuid::parse_str(&game_id).map_err(|e| format!("Invalid game ID: {e}"))?;

    refresh_game_achievements_internal(&state, gid).await
}
