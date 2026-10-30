use std::path::{Path, PathBuf};
use omnis_core::Database;
use omnis_plugin_steam::gameprocess_log::parse_gameprocess_log;
use omnis_plugin_steam::vdf_parser::detect_steam_installation;
use omnis_sdk::ExternalSessionDto;
use tracing::info;

/// Scan Steam's local `logs/gameprocess_log.txt` and synchronize any unrecorded play sessions
/// into the Omnis `game_sessions` table for all Steam games currently in the library.
pub fn sync_local_steam_sessions(db: &Database) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let steam_path: PathBuf = match detect_steam_installation() {
        Some(p) => p,
        None => {
            info!("No Steam installation detected on this system; skipping local Steam session sync");
            return Ok(0);
        }
    };

    let log_path = steam_path.join("logs").join("gameprocess_log.txt");
    sync_local_steam_sessions_from_path(db, &log_path)
}

/// Synchronize unrecorded Steam sessions from a specific `gameprocess_log.txt` file path into Omnis database.
///
/// Follows non-duplicative, idempotent semantics:
/// - Only games present in Omnis (`library_id = 'steam'`) are considered.
/// - Checks if a session with the same start timestamp (or within +/- 5 seconds) already exists.
/// - Updates game's `play_count` and `last_activity` if the imported sessions are newer.
/// - If the sum of session durations exceeds the game's recorded `playtime_seconds`, updates `playtime_seconds`.
pub fn sync_local_steam_sessions_from_path(
    db: &Database,
    log_path: &Path,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    if !log_path.exists() {
        info!("Steam gameprocess_log.txt not found at {:?}; skipping sync", log_path);
        return Ok(0);
    }

    let sessions = parse_gameprocess_log(log_path);
    if sessions.is_empty() {
        return Ok(0);
    }

    let external_sessions: Vec<ExternalSessionDto> = sessions
        .into_iter()
        .map(|s| ExternalSessionDto {
            external_id: s.appid.to_string(),
            started_at: s.started_at,
            ended_at: s.ended_at,
            duration_seconds: s.duration_seconds,
        })
        .collect();

    let count = db.ingest_external_sessions("steam", &external_sessions)?;
    if count > 0 {
        info!(
            "Successfully synchronized {} unrecorded Steam sessions from gameprocess_log.txt",
            count
        );
    }
    Ok(count)
}
