//! Background achievement synchronization: library-wide pass on startup and
//! single-game refresh after a play session ends. Progress is streamed to the UI
//! as non-blocking events; failures are logged and never surfaced as errors.

use omnis_sdk::constants::events;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::task::JoinSet;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::types::AppState;

/// Maximum number of store API requests in flight during a library sync
const LIBRARY_SYNC_CONCURRENCY: usize = 3;

/// Grace period after a game exits so the store can upload the latest unlocks
const POST_SESSION_SYNC_DELAY: Duration = Duration::from_secs(5);

pub const SCOPE_LIBRARY: &str = "library";
pub const SCOPE_GAME: &str = "game";

#[derive(Debug, Clone, Serialize)]
pub struct AchievementSyncProgress {
    /// "library" for the startup pass, "game" for a post-session refresh
    pub scope: &'static str,
    /// "syncing" while in progress, "completed" once finished
    pub status: &'static str,
    pub current: usize,
    pub total: usize,
    pub updated: usize,
    pub failed: usize,
    pub title: Option<String>,
}

/// Games with a post-session refresh pending; a killed game can emit `game-stopped` twice
fn pending_post_session() -> &'static Mutex<HashSet<Uuid>> {
    static PENDING: OnceLock<Mutex<HashSet<Uuid>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashSet::new()))
}

fn emit_progress(app: &AppHandle, progress: AchievementSyncProgress) {
    let _ = app.emit(events::ACHIEVEMENT_SYNC_PROGRESS, progress);
}

fn emit_updated(app: &AppHandle, game_id: Uuid) {
    let _ = app.emit(
        events::ACHIEVEMENTS_UPDATED,
        serde_json::json!({ "game_id": game_id.to_string() }),
    );
}

/// Refreshes achievements for every eligible library game with bounded concurrency.
/// Returns immediately (without emitting) if a library sync is already running.
pub async fn run_library_sync(app: AppHandle) {
    let state = app.state::<AppState>();
    let service = state.achievement_service.clone();
    if !service.try_begin_library_sync() {
        debug!("Library achievement sync already running, skipping");
        return;
    }

    let db = state.db.clone();
    let store_accounts = state.store_account_manager.clone();
    let app_dir = state.app_dir.clone();

    let games = match service.library_sync_candidates(&db, &store_accounts) {
        Ok(games) => games,
        Err(e) => {
            warn!("Library achievement sync could not list games: {e}");
            service.end_library_sync();
            return;
        }
    };

    let total = games.len();
    if total == 0 {
        debug!("Library achievement sync: no eligible games");
        service.end_library_sync();
        return;
    }

    info!("Starting background achievement sync for {total} games");
    let mut progress = AchievementSyncProgress {
        scope: SCOPE_LIBRARY,
        status: "syncing",
        current: 0,
        total,
        updated: 0,
        failed: 0,
        title: None,
    };
    emit_progress(&app, progress.clone());

    let mut pending = games.into_iter();
    let mut in_flight = JoinSet::new();
    loop {
        while in_flight.len() < LIBRARY_SYNC_CONCURRENCY {
            let Some(game) = pending.next() else { break };
            let service = service.clone();
            let db = db.clone();
            let store_accounts = store_accounts.clone();
            let app_dir = app_dir.clone();
            in_flight.spawn(async move {
                let res = service
                    .sync_game_achievements(&db, &store_accounts, &app_dir, game.id)
                    .await;
                (game.id, game.title, res)
            });
        }

        let Some(joined) = in_flight.join_next().await else {
            break;
        };
        progress.current += 1;
        match joined {
            Ok((game_id, title, Ok(_))) => {
                progress.updated += 1;
                progress.title = Some(title);
                emit_updated(&app, game_id);
            }
            Ok((_, title, Err(e))) => {
                progress.failed += 1;
                debug!("Background achievement sync failed for {title}: {e}");
                progress.title = Some(title);
            }
            Err(e) => {
                progress.failed += 1;
                warn!("Background achievement sync task panicked: {e}");
            }
        }
        emit_progress(&app, progress.clone());
    }

    info!(
        "Background achievement sync finished: {} updated, {} failed",
        progress.updated, progress.failed
    );
    progress.status = "completed";
    progress.title = None;
    emit_progress(&app, progress);
    service.end_library_sync();
}

/// Refreshes the achievements of a single game after its play session ended.
/// Games from stores without an achievement provider are skipped silently.
pub async fn run_post_session_sync(app: AppHandle, game_id: Uuid) {
    if !pending_post_session()
        .lock()
        .map(|mut p| p.insert(game_id))
        .unwrap_or(false)
    {
        return;
    }
    sync_after_session(&app, game_id).await;
    if let Ok(mut pending) = pending_post_session().lock() {
        pending.remove(&game_id);
    }
}

async fn sync_after_session(app: &AppHandle, game_id: Uuid) {
    tokio::time::sleep(POST_SESSION_SYNC_DELAY).await;

    let state = app.state::<AppState>();
    let game = match state.db.get_game_by_id(game_id) {
        Ok(Some(game)) => game,
        Ok(None) => return,
        Err(e) => {
            warn!("Post-session achievement sync could not load game {game_id}: {e}");
            return;
        }
    };
    if !state.achievement_service.supports_store(&game.library_id)
        || game.achievements_sync_status == omnis_sdk::AchievementsSyncStatus::None
    {
        return;
    }

    let mut progress = AchievementSyncProgress {
        scope: SCOPE_GAME,
        status: "syncing",
        current: 0,
        total: 1,
        updated: 0,
        failed: 0,
        title: Some(game.title.clone()),
    };
    emit_progress(app, progress.clone());

    match state
        .achievement_service
        .sync_game_achievements(
            &state.db,
            &state.store_account_manager,
            &state.app_dir,
            game_id,
        )
        .await
    {
        Ok(_) => {
            progress.updated = 1;
            emit_updated(app, game_id);
        }
        Err(e) => {
            progress.failed = 1;
            debug!(
                "Post-session achievement sync failed for {}: {e}",
                game.title
            );
        }
    }

    progress.current = 1;
    progress.status = "completed";
    emit_progress(app, progress);
}
