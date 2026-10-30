use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufReader, Read, Seek};
use std::path::{Path, PathBuf};

use chrono::Utc;
use omnis_sdk::constants::stores;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use zip::ZipArchive;

use crate::db::Database;
use crate::playnite::litedb::scan_litedb_games;
use crate::playnite::{map_playnite_plugin_id, PlayniteImportStats, PlayniteImporter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayniteBackupMatchSample {
    pub title: String,
    pub library_id: String,
    pub external_id: String,
    pub existing_playtime_seconds: u64,
    pub backup_playtime_seconds: u64,
    pub has_playtime_update: bool,
    pub cover_available: bool,
    pub background_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayniteUnmatchedGame {
    pub title: String,
    pub library_id: String,
    pub external_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayniteBackupInspection {
    pub total_games_in_backup: usize,
    pub matching_games_in_library: usize,
    pub non_matching_games: usize,
    pub playtime_updates_available: usize,
    pub missing_covers_available: usize,
    pub missing_backgrounds_available: usize,
    pub sample_matches: Vec<PlayniteBackupMatchSample>,
    #[serde(default)]
    pub unmatched_in_library: Vec<PlayniteUnmatchedGame>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayniteBackupImportOptions {
    #[serde(default)]
    pub image_cache_dir: Option<PathBuf>,
    #[serde(default = "default_true")]
    pub import_images: bool,
    #[serde(default = "default_true")]
    pub update_playtime: bool,
    #[serde(default)]
    pub dry_run: bool,
}

fn default_true() -> bool {
    true
}

impl Default for PlayniteBackupImportOptions {
    fn default() -> Self {
        Self {
            image_cache_dir: None,
            import_images: true,
            update_playtime: true,
            dry_run: false,
        }
    }
}

pub struct ExistingGameRecord {
    pub id: String,
    pub library_id: String,
    pub external_id: String,
    pub title: String,
    pub playtime_seconds: u64,
    pub play_count: i32,
    pub is_favorite: i32,
    pub last_activity: Option<String>,
    pub cover_image_path: Option<String>,
    pub background_image_path: Option<String>,
    pub completion_status: Option<String>,
}

fn normalize_title(title: &str) -> String {
    title.trim().to_lowercase()
}

fn normalize_zip_image_key(raw: &str) -> String {
    let cleaned = raw.replace('\\', "/").trim_start_matches('/').to_ascii_lowercase();
    if cleaned.starts_with("libraryfiles/") {
        cleaned
    } else {
        format!("libraryfiles/{}", cleaned)
    }
}

const MAX_GAMES_DB_SIZE: u64 = 256 * 1024 * 1024;
const MAX_IMAGE_ASSET_SIZE: u64 = 50 * 1024 * 1024;

/// Helper to read `library/games.db` or `library\games.db` directly from the ZIP into memory.
fn extract_games_db<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let name = file.name().replace('\\', "/");
        if name == "library/games.db" || name.ends_with("/games.db") || name == "games.db" {
            if file.size() > MAX_GAMES_DB_SIZE {
                return Err(format!(
                    "library/games.db exceeds maximum allowed size ({} bytes > {} max)",
                    file.size(),
                    MAX_GAMES_DB_SIZE
                )
                .into());
            }
            let initial_cap = (file.size() as usize).min(32 * 1024 * 1024);
            let mut buf = Vec::with_capacity(initial_cap);
            let mut limited = Read::take(&mut file, MAX_GAMES_DB_SIZE);
            limited.read_to_end(&mut buf)?;
            return Ok(buf);
        }
    }
    Err("library/games.db not found in Playnite backup zip".into())
}

/// Build an index mapping normalized `libraryfiles/...` relative paths to file indices in the zip archive.
fn build_zip_image_index<R: Read + Seek>(archive: &mut ZipArchive<R>) -> HashMap<String, usize> {
    let mut index = HashMap::new();
    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index(i) {
            let name = file.name().replace('\\', "/").to_ascii_lowercase();
            if name.starts_with("libraryfiles/") {
                index.insert(name, i);
            }
        }
    }
    index
}

#[derive(Debug, Deserialize)]
struct GameActivityFile {
    #[serde(alias = "items", alias = "Items", default)]
    items: Vec<GameActivityItem>,
}

#[derive(Debug, Deserialize)]
struct GameActivityItem {
    #[serde(alias = "date_session", alias = "DateSession", alias = "date", alias = "Date", default)]
    date_session: Option<String>,
    #[serde(alias = "elapsed_seconds", alias = "ElapsedSeconds", alias = "duration_seconds", alias = "duration", default)]
    elapsed_seconds: Option<u64>,
}

fn filter_activity_items(items: impl IntoIterator<Item = GameActivityItem>) -> Vec<(String, u64)> {
    items
        .into_iter()
        .filter_map(|it| match (it.date_session, it.elapsed_seconds) {
            (Some(d), Some(s)) if s > 0 && !d.trim().is_empty() => Some((d, s)),
            _ => None,
        })
        .collect()
}

/// Extract sessions from Playnite GameActivity extension files (e.g. `ExtensionsData/.../GameActivity/<guid>.json`)
fn extract_playnite_game_activities<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
) -> HashMap<String, Vec<(String, u64)>> {
    let mut map: HashMap<String, Vec<(String, u64)>> = HashMap::new();
    for i in 0..archive.len() {
        if let Ok(mut file) = archive.by_index(i) {
            let name = file.name().replace('\\', "/").to_ascii_lowercase();
            if (name.contains("gameactivity") || name.contains("af129c15-0960-449e-b9ef-6910db9f187a"))
                && name.ends_with(".json")
            {
                if let Some(file_stem) = Path::new(&name).file_stem().and_then(|s| s.to_str()) {
                    let mut content = String::new();
                    if file.read_to_string(&mut content).is_ok() {
                        let sessions: Vec<(String, u64)> = if let Ok(doc) =
                            serde_json::from_str::<GameActivityFile>(&content)
                        {
                            filter_activity_items(doc.items)
                        } else if let Ok(items) =
                            serde_json::from_str::<Vec<GameActivityItem>>(&content)
                        {
                            filter_activity_items(items)
                        } else {
                            Vec::new()
                        };
                        if !sessions.is_empty() {
                            map.insert(file_stem.to_ascii_lowercase(), sessions);
                        }
                    }
                }
            }
        }
    }
    map
}

/// Inspect a Playnite backup ZIP without modifying database or filesystem.
pub fn inspect_playnite_backup(
    zip_path: &Path,
    db: &Database,
) -> Result<PlayniteBackupInspection, Box<dyn std::error::Error>> {
    let file = File::open(zip_path)?;
    let reader = BufReader::new(file);
    let mut archive = ZipArchive::new(reader)?;

    let games_db_bytes = extract_games_db(&mut archive)?;
    let backup_games = scan_litedb_games(&games_db_bytes)?;
    let total_games_in_backup = backup_games.len();

    let zip_images = build_zip_image_index(&mut archive);

    // Query existing games in Omnis (single pass)
    let conn = db.reader();
    let mut stmt = conn.prepare(
        "SELECT id, library_id, external_id, title, playtime_seconds, play_count, is_favorite, last_activity, cover_image_path, background_image_path, completion_status FROM games;"
    )?;

    let mut existing_by_store_ext = HashMap::new();
    let mut existing_by_title = HashMap::new();
    let mut all_existing: HashMap<String, ExistingGameRecord> = HashMap::new();

    let rows = stmt.query_map([], |row| {
        Ok(ExistingGameRecord {
            id: row.get(0)?,
            library_id: row.get(1)?,
            external_id: row.get(2)?,
            title: row.get(3)?,
            playtime_seconds: row.get::<_, i64>(4)? as u64,
            play_count: row.get::<_, i32>(5)?,
            is_favorite: row.get::<_, i32>(6)?,
            last_activity: row.get(7)?,
            cover_image_path: row.get(8)?,
            background_image_path: row.get(9)?,
            completion_status: row.get(10)?,
        })
    })?;

    for row in rows {
        let game = row?;
        existing_by_store_ext.insert((game.library_id.clone(), game.external_id.clone()), game.id.clone());
        if game.library_id == stores::MANUAL {
            existing_by_title.insert(normalize_title(&game.title), game.id.clone());
        }
        all_existing.insert(game.id.clone(), game);
    }

    let mut matching_games_in_library = 0;
    let mut non_matching_games = 0;
    let mut playtime_updates_available = 0;
    let mut missing_covers_available = 0;
    let mut missing_backgrounds_available = 0;
    let mut sample_matches = Vec::new();
    let mut matched_existing_ids = HashSet::new();

    for item in backup_games {
        let library_id = map_playnite_plugin_id(item.PluginId.as_deref());
        let external_id = match &item.GameId {
            Some(gid) if !gid.trim().is_empty() => gid.trim().to_string(),
            _ => format!("manual:{}", item.Name.to_lowercase().replace(' ', "-")),
        };

        let matched_id = existing_by_store_ext
            .get(&(library_id.to_string(), external_id.clone()))
            .or_else(|| {
                if library_id == stores::MANUAL {
                    existing_by_title.get(&normalize_title(&item.Name))
                } else {
                    None
                }
            });

        if let Some(existing_id) = matched_id {
            matching_games_in_library += 1;
            matched_existing_ids.insert(existing_id.clone());
            if let Some(existing) = all_existing.get(existing_id) {
                let backup_playtime = item.PlaytimeSeconds.unwrap_or(0);
                let has_playtime_update = backup_playtime > existing.playtime_seconds;
                if has_playtime_update {
                    playtime_updates_available += 1;
                }

                let cover_available = existing.cover_image_path.is_none()
                    && item.Cover.as_ref().map_or(false, |c| {
                        zip_images.contains_key(&normalize_zip_image_key(c))
                    });
                if cover_available {
                    missing_covers_available += 1;
                }

                let background_available = existing.background_image_path.is_none()
                    && item.Background.as_ref().map_or(false, |b| {
                        zip_images.contains_key(&normalize_zip_image_key(b))
                    });
                if background_available {
                    missing_backgrounds_available += 1;
                }

                if sample_matches.len() < 500 {
                    sample_matches.push(PlayniteBackupMatchSample {
                        title: existing.title.clone(),
                        library_id: existing.library_id.clone(),
                        external_id: existing.external_id.clone(),
                        existing_playtime_seconds: existing.playtime_seconds,
                        backup_playtime_seconds: backup_playtime,
                        has_playtime_update,
                        cover_available,
                        background_available,
                    });
                }
            }
        } else {
            non_matching_games += 1;
        }
    }

    sample_matches.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));

    let mut unmatched_in_library = Vec::new();
    for (id, game) in &all_existing {
        if !matched_existing_ids.contains(id) {
            unmatched_in_library.push(PlayniteUnmatchedGame {
                title: game.title.clone(),
                library_id: game.library_id.clone(),
                external_id: game.external_id.clone(),
            });
        }
    }
    unmatched_in_library.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));

    Ok(PlayniteBackupInspection {
        total_games_in_backup,
        matching_games_in_library,
        non_matching_games,
        playtime_updates_available,
        missing_covers_available,
        missing_backgrounds_available,
        sample_matches,
        unmatched_in_library,
    })
}

/// Helper to selectively extract an image asset from the zip archive directly into cache.
fn extract_image_asset<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    zip_index: &HashMap<String, usize>,
    image_rel_path: &str,
    game_id: &str,
    suffix: &str,
    cache_dir: Option<&Path>,
    dry_run: bool,
    stats: &mut PlayniteImportStats,
) -> Option<String> {
    let key = normalize_zip_image_key(image_rel_path);
    let &file_idx = zip_index.get(&key)?;

    if let Some(dir) = cache_dir {
        let raw_ext = Path::new(&key)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase());
        let ext = match raw_ext.as_deref() {
            Some(e @ ("jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "avif" | "ico")) => e,
            _ => "jpg",
        };
        let target_path = dir.join(format!("{}_{}.{}", game_id, suffix, ext));

        if !dry_run {
            if let Ok(mut zip_file) = archive.by_index(file_idx) {
                if let Ok(mut out_file) = File::create(&target_path) {
                    let mut limited = Read::take(&mut zip_file, MAX_IMAGE_ASSET_SIZE);
                    let _ = std::io::copy(&mut limited, &mut out_file);
                } else {
                    return None;
                }
            } else {
                return None;
            }
        }
        stats.images_cached += 1;
        Some(target_path.to_string_lossy().to_string())
    } else {
        stats.images_cached += 1;
        Some(key)
    }
}

/// Execute Playnite backup import into Omnis library with non-destructive merge semantics.
/// Only games already present in the Omnis library are matched and updated. Non-matching games are skipped.
pub fn execute_playnite_backup_import<F>(
    zip_path: &Path,
    db: &Database,
    options: &PlayniteBackupImportOptions,
    mut progress_cb: F,
) -> Result<PlayniteImportStats, Box<dyn std::error::Error>>
where
    F: FnMut(usize, usize, &str),
{
    let file = File::open(zip_path)?;
    let reader = BufReader::new(file);
    let mut archive = ZipArchive::new(reader)?;

    let games_db_bytes = extract_games_db(&mut archive)?;
    let backup_games = scan_litedb_games(&games_db_bytes)?;
    let total_backup = backup_games.len();

    let zip_images = build_zip_image_index(&mut archive);
    let activity_sessions = extract_playnite_game_activities(&mut archive);

    if let Some(ref dir) = options.image_cache_dir {
        if !options.dry_run {
            fs::create_dir_all(dir)?;
        }
    }

    let mut stats = PlayniteImportStats {
        total_read: total_backup,
        ..Default::default()
    };

    let now = Utc::now().to_rfc3339();
    let mut conn = db.writer();

    // Query existing games map (single pass)
    let mut stmt = conn.prepare(
        "SELECT id, library_id, external_id, title, playtime_seconds, play_count, is_favorite, last_activity, cover_image_path, background_image_path, completion_status FROM games;"
    )?;

    let mut existing_by_store_ext = HashMap::new();
    let mut existing_by_title = HashMap::new();
    let mut all_existing = HashMap::new();

    let rows = stmt.query_map([], |row| {
        Ok(ExistingGameRecord {
            id: row.get(0)?,
            library_id: row.get(1)?,
            external_id: row.get(2)?,
            title: row.get(3)?,
            playtime_seconds: row.get::<_, i64>(4)? as u64,
            play_count: row.get::<_, i32>(5)?,
            is_favorite: row.get::<_, i32>(6)?,
            last_activity: row.get(7)?,
            cover_image_path: row.get(8)?,
            background_image_path: row.get(9)?,
            completion_status: row.get(10)?,
        })
    })?;

    for row in rows {
        let game = row?;
        existing_by_store_ext.insert((game.library_id.clone(), game.external_id.clone()), game.id.clone());
        if game.library_id == stores::MANUAL {
            existing_by_title.insert(normalize_title(&game.title), game.id.clone());
        }
        all_existing.insert(game.id.clone(), game);
    }
    drop(stmt);

    let tx = conn.transaction()?;

    for (idx, item) in backup_games.iter().enumerate() {
        let library_id = map_playnite_plugin_id(item.PluginId.as_deref());
        let external_id = match &item.GameId {
            Some(gid) if !gid.trim().is_empty() => gid.trim().to_string(),
            _ => format!("manual:{}", item.Name.to_lowercase().replace(' ', "-")),
        };

        let matched_id = existing_by_store_ext
            .get(&(library_id.to_string(), external_id.clone()))
            .or_else(|| {
                if library_id == stores::MANUAL {
                    existing_by_title.get(&normalize_title(&item.Name))
                } else {
                    None
                }
            });

        if let Some(existing_id) = matched_id {
            if let Some(existing) = all_existing.get_mut(existing_id) {
                stats.games_merged += 1;

                // Merge playtime and play count non-destructively
                let imported_playtime = item.PlaytimeSeconds.unwrap_or(0);
                let imported_play_count = item.PlayCount.unwrap_or(0) as i32;
                let is_fav = if item.Favorite.unwrap_or(false) { 1 } else { 0 };

                let new_playtime = if options.update_playtime && imported_playtime > existing.playtime_seconds {
                    stats.playtime_updated += 1;
                    imported_playtime
                } else {
                    existing.playtime_seconds
                };

                let new_play_count = existing.play_count.max(imported_play_count);
                let new_fav = existing.is_favorite.max(is_fav);

                // Last activity: update if imported is newer or existing is none
                let new_last_activity = match (&existing.last_activity, &item.LastActivity) {
                    (Some(curr), Some(imp)) => {
                        if imp > curr {
                            Some(imp.clone())
                        } else {
                            Some(curr.clone())
                        }
                    }
                    (None, Some(imp)) => Some(imp.clone()),
                    (Some(curr), None) => Some(curr.clone()),
                    (None, None) => None,
                };

                // Selective image caching
                let cover_to_save = if existing.cover_image_path.is_some() {
                    existing.cover_image_path.clone()
                } else if options.import_images && item.Cover.is_some() {
                    extract_image_asset(
                        &mut archive,
                        &zip_images,
                        item.Cover.as_ref().unwrap(),
                        &existing.id,
                        "cover",
                        options.image_cache_dir.as_deref(),
                        options.dry_run,
                        &mut stats,
                    )
                } else {
                    None
                };

                let bg_to_save = if existing.background_image_path.is_some() {
                    existing.background_image_path.clone()
                } else if options.import_images && item.Background.is_some() {
                    extract_image_asset(
                        &mut archive,
                        &zip_images,
                        item.Background.as_ref().unwrap(),
                        &existing.id,
                        "bg",
                        options.image_cache_dir.as_deref(),
                        options.dry_run,
                        &mut stats,
                    )
                } else {
                    None
                };

                let completion_to_save = item.Completion.clone().or_else(|| existing.completion_status.clone());

                if !options.dry_run {
                    tx.execute(
                        "UPDATE games SET
                            playtime_seconds = ?1,
                            play_count = ?2,
                            is_favorite = ?3,
                            last_activity = ?4,
                            cover_image_path = ?5,
                            background_image_path = ?6,
                            completion_status = COALESCE(?7, completion_status),
                            modified_timestamp = ?8
                        WHERE id = ?9;",
                        params![
                            new_playtime as i64,
                            new_play_count,
                            new_fav,
                            new_last_activity,
                            cover_to_save,
                            bg_to_save,
                            completion_to_save,
                            now,
                            existing.id,
                        ],
                    )?;
                }

                PlayniteImporter::sync_tags_and_categories(
                    &tx,
                    &existing.id,
                    item.Tags.as_ref(),
                    item.Categories.as_ref(),
                    options.dry_run,
                    &mut stats,
                )?;

                if !options.dry_run {
                    let playnite_guid = item.GameId.as_deref().unwrap_or("").to_ascii_lowercase();
                    if let Some(sessions) = activity_sessions.get(&playnite_guid) {
                        for (date_str, dur) in sessions {
                            let session_id = Uuid::new_v4().to_string();
                            let inserted = tx.execute(
                                "INSERT INTO game_sessions (id, game_id, started_at, ended_at, duration_seconds)
                                 SELECT ?1, ?2, ?3, ?3, ?4
                                 WHERE NOT EXISTS (
                                     SELECT 1 FROM game_sessions WHERE game_id = ?2 AND started_at = ?3
                                 );",
                                params![session_id, existing.id, date_str, *dur as i64],
                            );
                            if let Ok(n) = inserted {
                                if n > 0 {
                                    stats.sessions_imported += 1;
                                }
                            }
                        }
                    }

                    if let Some(sessions) = &item.Sessions {
                        for s in sessions {
                            if let (Some(date_str), Some(dur)) = (&s.date, s.elapsed_seconds) {
                                if dur > 0 && !date_str.trim().is_empty() {
                                    let session_id = Uuid::new_v4().to_string();
                                    let inserted = tx.execute(
                                        "INSERT INTO game_sessions (id, game_id, started_at, ended_at, duration_seconds)
                                         SELECT ?1, ?2, ?3, ?3, ?4
                                         WHERE NOT EXISTS (
                                             SELECT 1 FROM game_sessions WHERE game_id = ?2 AND started_at = ?3
                                         );",
                                        params![session_id, existing.id, date_str.trim(), dur as i64],
                                    );
                                    if let Ok(n) = inserted {
                                        if n > 0 {
                                            stats.sessions_imported += 1;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Update in-memory record
                existing.playtime_seconds = new_playtime;
                existing.play_count = new_play_count;
                existing.is_favorite = new_fav;
                existing.last_activity = new_last_activity;
                existing.cover_image_path = cover_to_save;
                existing.background_image_path = bg_to_save;
            }
        }

        progress_cb(idx + 1, total_backup, &item.Name);
    }

    if !options.dry_run {
        tx.commit()?;
    } else {
        let _ = tx.rollback();
    }

    drop(conn);

    if !options.dry_run {
        let _ = db.reload_search_index();
    }

    Ok(stats)
}
