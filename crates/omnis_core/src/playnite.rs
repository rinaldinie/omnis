use crate::Database;
use chrono::Utc;
use omnis_sdk::constants::stores;
use omnis_sdk::CompletionStatus;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::info;
use uuid::Uuid;

pub mod litedb;
pub mod backup;

pub use backup::{
    execute_playnite_backup_import, inspect_playnite_backup, PlayniteBackupImportOptions,
    PlayniteBackupInspection, PlayniteBackupMatchSample, PlayniteUnmatchedGame,
};
pub use litedb::{scan_litedb_games, BsonDocument, BsonValue, LiteDbError};

/// Return the C# Playnite 10 Generic Plugin export script.
pub fn export_csharp_script() -> &'static str {
    r#"using System;
using System.IO;
using System.Linq;
using Playnite.SDK;
using Playnite.SDK.Plugins;
using Newtonsoft.Json;

namespace OmnisPlayniteExporter
{
    public class OmnisPlayniteExportPlugin : GenericPlugin
    {
        public OmnisPlayniteExportPlugin(IPlayniteAPI api) : base(api) { }

        public void ExportLibrary(string outputPath)
        {
            var export = PlayniteApi.Database.Games.Select(g => new {
                Id = g.Id.ToString(),
                g.Name,
                g.GameId,
                g.PluginId,
                PlaytimeSeconds = g.Playtime,
                g.PlayCount,
                g.LastActivity,
                g.Added,
                g.Favorite,
                g.Hidden,
                Tags = g.Tags?.Select(t => t.Name),
                Categories = g.Categories?.Select(c => c.Name),
                Completion = g.CompletionStatus?.Name,
                g.InstallDirectory,
                Cover = PlayniteApi.Database.GetFullFilePath(g.CoverImage),
                Background = PlayniteApi.Database.GetFullFilePath(g.BackgroundImage)
            });

            File.WriteAllText(outputPath, JsonConvert.SerializeObject(export, Formatting.Indented));
        }
    }
}
"#
}

/// Map a Playnite Library Plugin GUID to an Omnis store identifier.
/// Official GUIDs taken from Playnite source code:
pub fn map_playnite_plugin_id(plugin_id: Option<&str>) -> &'static str {
    match plugin_id.map(|s| s.trim().to_ascii_lowercase()).as_deref() {
        Some("cb91aec9-6843-410e-a02b-a64c48325983") | Some("cb91dfc9-b977-43bf-8e70-55f46e410fab") => stores::STEAM,
        Some("aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e") => stores::GOG,
        Some("00000002-dbd1-46c6-b5d0-b1cb55d14e34") | Some("00000002-dbd1-46c6-b5d0-b1ba559d10e4") => stores::EPIC,
        Some("7e4fbb5e-2304-4c2c-9721-402f4586f6a7")
        | Some("b5199324-4061-4613-9f4c-1e24749f57d6")
        | Some("7e4fbb5e-2ae3-48d4-8ba0-6b30e7a4e287") => stores::XBOX,
        Some("85dd7072-76de-42bc-9c2b-000e60e4e843") | Some("85dd7072-2f20-4e76-a007-41035e390724") => "origin",
        Some("c2f038e5-8b92-4877-9163-0d6e1fa20322") | Some("c2f038e5-8b92-4877-91f1-da9094155fc5") => "ubisoft",
        Some("e3c26a3d-dce2-4bb7-9ec7-300e12361115") | Some("e3c26a3d-d695-4cb7-a769-5ff7612c7edd") => "battlenet",
        Some("00000001-ebb0-4663-8a98-3b94e39b52a8") => "itch",
        Some("4029fdd1-eb23-4e4b-9e58-690a9a4b85c2") | Some("402674cd-4af6-4886-b6ec-0e695bfa0688") => "amazon",
        Some("0e460992-6ff1-4666-a111-000000000001") => "bethesda",
        Some("96e8c4bc-1666-4e5a-a435-0902c3ec0b2b") => "humble",
        Some("34c3178f-6e1d-4e27-8885-99d4f031b168") => "legacy",
        _ => stores::MANUAL,
    }
}

/// Play session representation from Playnite (or GameActivity extension)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayniteSessionDto {
    #[serde(alias = "date_session", alias = "DateSession", alias = "date", alias = "started_at", default)]
    pub date: Option<String>,
    #[serde(alias = "elapsed_seconds", alias = "ElapsedSeconds", alias = "duration_seconds", alias = "duration", default)]
    pub elapsed_seconds: Option<u64>,
}

/// Serialized representation of a Playnite 10 game export item.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct PlayniteGameDto {
    #[serde(alias = "id", alias = "Id", default)]
    pub Id: Option<String>,
    #[serde(alias = "name")]
    pub Name: String,
    #[serde(alias = "game_id", alias = "gameId", default)]
    pub GameId: Option<String>,
    #[serde(alias = "plugin_id", alias = "pluginId", default)]
    pub PluginId: Option<String>,
    #[serde(alias = "playtime_seconds", alias = "playtime", alias = "Playtime", default)]
    pub PlaytimeSeconds: Option<u64>,
    #[serde(alias = "play_count", alias = "playCount", default)]
    pub PlayCount: Option<u32>,
    #[serde(alias = "last_activity", alias = "lastActivity", default)]
    pub LastActivity: Option<String>,
    #[serde(alias = "added", default)]
    pub Added: Option<String>,
    #[serde(alias = "favorite", default)]
    pub Favorite: Option<bool>,
    #[serde(alias = "hidden", default)]
    pub Hidden: Option<bool>,
    #[serde(alias = "tags", default)]
    pub Tags: Option<Vec<String>>,
    #[serde(alias = "features", default)]
    pub Features: Option<Vec<String>>,
    #[serde(alias = "categories", default)]
    pub Categories: Option<Vec<String>>,
    #[serde(alias = "completion", default)]
    pub Completion: Option<String>,
    #[serde(alias = "install_directory", alias = "installDirectory", default)]
    pub InstallDirectory: Option<String>,
    #[serde(alias = "cover", default)]
    pub Cover: Option<String>,
    #[serde(alias = "background", default)]
    pub Background: Option<String>,
    #[serde(alias = "sessions", alias = "Sessions", alias = "activity", alias = "Activity", default)]
    pub Sessions: Option<Vec<PlayniteSessionDto>>,
}

#[derive(Debug, Clone, Default)]
pub struct PlayniteImportOptions {
    pub dry_run: bool,
    pub image_cache_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlayniteImportStats {
    pub total_read: usize,
    pub games_created: usize,
    pub games_merged: usize,
    pub playtime_updated: usize,
    pub images_cached: usize,
    pub tags_added: usize,
    pub categories_added: usize,
    #[serde(default)]
    pub sessions_imported: usize,
}

struct ExistingGameRow {
    id: String,
    playtime_seconds: u64,
    play_count: i32,
    cover_image_path: Option<String>,
    background_image_path: Option<String>,
    is_favorite: i32,
}

/// Domain service coordinating non-duplicative, idempotent game importing from Playnite 10 JSON exports
pub struct PlayniteImporter;

impl PlayniteImporter {
    /// Import games from Playnite 10 JSON export data into the given database.
    ///
    /// Follows strict non-duplicative, idempotent merging semantics:
    /// - Stores mapped via Playnite GUID table.
    /// - Matches existing records on (library_id, external_id).
    /// - Avoids double-counting playtime if Omnis already has historical sessions.
    /// - Copies local image assets into the image cache directory.
    /// - Supports --dry-run without mutating database or filesystem.
    pub fn import_games(
        db: &Database,
        items: &[PlayniteGameDto],
        options: &PlayniteImportOptions,
    ) -> Result<PlayniteImportStats, Box<dyn std::error::Error>> {
        let mut stats = PlayniteImportStats {
            total_read: items.len(),
            ..Default::default()
        };

        if let Some(ref cache_dir) = options.image_cache_dir {
            if !options.dry_run {
                fs::create_dir_all(cache_dir)?;
            }
        }

        let now = Utc::now().to_rfc3339();
        let conn = db.writer();

        // If dry_run, we do all checks without executing mutations
        for item in items {
            let library_id = map_playnite_plugin_id(item.PluginId.as_deref());
            let external_id = match &item.GameId {
                Some(gid) if !gid.trim().is_empty() => gid.trim().to_string(),
                _ => format!("manual:{}", item.Name.to_lowercase().replace(' ', "-")),
            };

            let existing = Self::find_existing_game(&conn, library_id, &external_id)?;

            if let Some(existing_row) = existing {
                Self::merge_existing_game(&conn, item, existing_row, options, &now, &mut stats)?;
            } else {
                Self::insert_new_game(&conn, item, library_id, &external_id, options, &now, &mut stats)?;
            }
        }

        drop(conn);

        if !options.dry_run {
            let _ = db.reload_search_index();
        }

        Ok(stats)
    }

    fn find_existing_game(
        conn: &rusqlite::Connection,
        library_id: &str,
        external_id: &str,
    ) -> Result<Option<ExistingGameRow>, rusqlite::Error> {
        let mut stmt = conn.prepare(
            "SELECT id, playtime_seconds, play_count, cover_image_path, background_image_path, is_favorite FROM games WHERE library_id = ?1 AND external_id = ?2;"
        )?;
        let mut rows = stmt.query(params![library_id, external_id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(ExistingGameRow {
                id: row.get(0)?,
                playtime_seconds: row.get::<_, i64>(1)? as u64,
                play_count: row.get::<_, i32>(2)?,
                cover_image_path: row.get(3)?,
                background_image_path: row.get(4)?,
                is_favorite: row.get(5)?,
            }))
        } else {
            Ok(None)
        }
    }

    fn cache_imported_image(
        source: Option<&str>,
        game_id: &str,
        suffix: &str,
        cache_dir: Option<&Path>,
        dry_run: bool,
        stats: &mut PlayniteImportStats,
    ) -> Option<String> {
        let src = source?;
        let src_path = Path::new(src);
        if !src_path.exists() {
            return None;
        }

        if let Some(dir) = cache_dir {
            let ext = src_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("jpg");
            let target = dir.join(format!("{}_{}.{}", game_id, suffix, ext));
            if !dry_run {
                let _ = fs::copy(src_path, &target);
            }
            stats.images_cached += 1;
            Some(target.to_string_lossy().to_string())
        } else {
            Some(src.to_string())
        }
    }

    pub(crate) fn sync_tags_and_categories(
        conn: &rusqlite::Connection,
        game_id: &str,
        tags: Option<&Vec<String>>,
        categories: Option<&Vec<String>>,
        dry_run: bool,
        stats: &mut PlayniteImportStats,
    ) -> Result<(), rusqlite::Error> {
        if !dry_run {
            if let Some(tags_list) = tags {
                for t in tags_list {
                    let tag_name = t.trim();
                    if !tag_name.is_empty() {
                        let tag_id = Uuid::new_v4().to_string();
                        conn.execute(
                            "INSERT INTO tags (id, name) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING;",
                            params![tag_id, tag_name],
                        )?;
                        conn.execute(
                            "INSERT INTO game_tags (game_id, tag_id)
                             SELECT ?1, id FROM tags WHERE name = ?2
                             ON CONFLICT DO NOTHING;",
                            params![game_id, tag_name],
                        )?;
                        stats.tags_added += 1;
                    }
                }
            }

            if let Some(cats_list) = categories {
                for c in cats_list {
                    let cat_name = c.trim();
                    if !cat_name.is_empty() {
                        let cat_id = Uuid::new_v4().to_string();
                        conn.execute(
                            "INSERT INTO categories (id, name) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING;",
                            params![cat_id, cat_name],
                        )?;
                        conn.execute(
                            "INSERT INTO game_categories (game_id, category_id)
                             SELECT ?1, id FROM categories WHERE name = ?2
                             ON CONFLICT DO NOTHING;",
                            params![game_id, cat_name],
                        )?;
                        stats.categories_added += 1;
                    }
                }
            }
        } else {
            if let Some(tags_list) = tags {
                stats.tags_added += tags_list.len();
            }
            if let Some(cats_list) = categories {
                stats.categories_added += cats_list.len();
            }
        }

        Ok(())
    }

    fn merge_existing_game(
        conn: &rusqlite::Connection,
        item: &PlayniteGameDto,
        existing: ExistingGameRow,
        options: &PlayniteImportOptions,
        now: &str,
        stats: &mut PlayniteImportStats,
    ) -> Result<(), Box<dyn std::error::Error>> {
        stats.games_merged += 1;

        let imported_playtime = item.PlaytimeSeconds.unwrap_or(0);
        let imported_play_count = item.PlayCount.unwrap_or(0);
        let is_fav = if item.Favorite.unwrap_or(false) { 1 } else { 0 };

        let session_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM game_sessions WHERE game_id = ?1;",
            params![existing.id],
            |r| r.get(0),
        )?;

        let new_playtime = if session_count > 0 {
            if imported_playtime > existing.playtime_seconds {
                info!(
                    "Playtime conflict for '{}': keeping higher Playnite playtime ({}s > {}s)",
                    item.Name, imported_playtime, existing.playtime_seconds
                );
                stats.playtime_updated += 1;
                imported_playtime
            } else {
                existing.playtime_seconds
            }
        } else if imported_playtime > existing.playtime_seconds {
            stats.playtime_updated += 1;
            imported_playtime
        } else {
            existing.playtime_seconds
        };

        let new_play_count = existing.play_count.max(imported_play_count as i32);
        let new_fav = existing.is_favorite.max(is_fav);

        let cover_to_save = if existing.cover_image_path.is_some() {
            existing.cover_image_path
        } else {
            Self::cache_imported_image(
                item.Cover.as_deref(),
                &existing.id,
                "cover",
                options.image_cache_dir.as_deref(),
                options.dry_run,
                stats,
            )
        };

        let bg_to_save = if existing.background_image_path.is_some() {
            existing.background_image_path
        } else {
            Self::cache_imported_image(
                item.Background.as_deref(),
                &existing.id,
                "bg",
                options.image_cache_dir.as_deref(),
                options.dry_run,
                stats,
            )
        };

        if !options.dry_run {
            conn.execute(
                "UPDATE games SET
                    playtime_seconds = ?1,
                    play_count = ?2,
                    is_favorite = ?3,
                    cover_image_path = ?4,
                    background_image_path = ?5,
                    completion_status = COALESCE(?6, completion_status),
                    modified_timestamp = ?7
                WHERE id = ?8;",
                params![
                    new_playtime as i64,
                    new_play_count,
                    new_fav,
                    cover_to_save,
                    bg_to_save,
                    item.Completion,
                    now,
                    existing.id,
                ],
            )?;
        }

        Self::sync_tags_and_categories(
            conn,
            &existing.id,
            item.Tags.as_ref(),
            item.Categories.as_ref(),
            options.dry_run,
            stats,
        )?;

        if !options.dry_run {
            Self::insert_game_sessions(conn, &existing.id, item.Sessions.as_deref(), stats);
        }

        Ok(())
    }

    fn insert_new_game(
        conn: &rusqlite::Connection,
        item: &PlayniteGameDto,
        library_id: &str,
        external_id: &str,
        options: &PlayniteImportOptions,
        now: &str,
        stats: &mut PlayniteImportStats,
    ) -> Result<(), Box<dyn std::error::Error>> {
        stats.games_created += 1;
        let new_id = Uuid::new_v4().to_string();
        let is_installed = if item.InstallDirectory.is_some() { 1 } else { 0 };
        let imported_playtime = item.PlaytimeSeconds.unwrap_or(0);
        let imported_play_count = item.PlayCount.unwrap_or(0);
        let is_fav = if item.Favorite.unwrap_or(false) { 1 } else { 0 };

        let cover_to_save = Self::cache_imported_image(
            item.Cover.as_deref(),
            &new_id,
            "cover",
            options.image_cache_dir.as_deref(),
            options.dry_run,
            stats,
        );

        let bg_to_save = Self::cache_imported_image(
            item.Background.as_deref(),
            &new_id,
            "bg",
            options.image_cache_dir.as_deref(),
            options.dry_run,
            stats,
        );

        let sorting_title = item.Name.to_lowercase();
        let tags_str = item.Tags.as_ref().map(|t| t.join(", "));
        let features_str = item.Features.as_ref().map(|f| f.join(", "));

        if !options.dry_run {
            conn.execute(
                "INSERT INTO games (
                    id, library_id, external_id, title, sorting_title,
                    install_dir, is_installed, playtime_seconds, play_count,
                    last_activity, cover_image_path, background_image_path,
                    tags, features, completion_status, is_favorite,
                    added_timestamp, modified_timestamp
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17);",
                params![
                    new_id,
                    library_id,
                    external_id,
                    item.Name,
                    sorting_title,
                    item.InstallDirectory,
                    is_installed,
                    imported_playtime as i64,
                    imported_play_count as i32,
                    item.LastActivity,
                    cover_to_save,
                    bg_to_save,
                    tags_str,
                    features_str,
                    item.Completion.as_deref().unwrap_or(CompletionStatus::NotPlayed.as_str()),
                    is_fav,
                    now,
                ],
            )?;
        }

        Self::sync_tags_and_categories(
            conn,
            &new_id,
            item.Tags.as_ref(),
            item.Categories.as_ref(),
            options.dry_run,
            stats,
        )?;

        if !options.dry_run {
            Self::insert_game_sessions(conn, &new_id, item.Sessions.as_deref(), stats);
        }

        Ok(())
    }

    fn insert_game_sessions(
        conn: &rusqlite::Connection,
        game_id: &str,
        sessions: Option<&[PlayniteSessionDto]>,
        stats: &mut PlayniteImportStats,
    ) {
        if let Some(sessions) = sessions {
            for s in sessions {
                if let (Some(date_str), Some(dur)) = (&s.date, s.elapsed_seconds) {
                    if dur > 0 && !date_str.trim().is_empty() {
                        let session_id = Uuid::new_v4().to_string();
                        let inserted = conn.execute(
                            "INSERT INTO game_sessions (id, game_id, started_at, ended_at, duration_seconds)
                             SELECT ?1, ?2, ?3, ?3, ?4
                             WHERE NOT EXISTS (
                                 SELECT 1 FROM game_sessions
                                 WHERE game_id = ?2
                                   AND (started_at = ?3 OR (ABS(duration_seconds - ?4) <= 5 AND SUBSTR(started_at, 1, 16) = SUBSTR(?3, 1, 16)))
                             );",
                            params![session_id, game_id, date_str.trim(), dur as i64],
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

    /// Import games from a JSON string payload.
    pub fn import_from_json(
        db: &Database,
        json_content: &str,
        options: &PlayniteImportOptions,
    ) -> Result<PlayniteImportStats, Box<dyn std::error::Error>> {
        let items: Vec<PlayniteGameDto> = serde_json::from_str(json_content)?;
        Self::import_games(db, &items, options)
    }

    /// Import games from a JSON file path.
    pub fn import_from_file<P: AsRef<Path>>(
        db: &Database,
        path: P,
        options: &PlayniteImportOptions,
    ) -> Result<PlayniteImportStats, Box<dyn std::error::Error>> {
        let content = fs::read_to_string(path)?;
        Self::import_from_json(db, &content, options)
    }

    /// Inspect a Playnite backup ZIP archive without mutating database or filesystem.
    pub fn inspect_backup(
        zip_path: &Path,
        db: &Database,
    ) -> Result<PlayniteBackupInspection, Box<dyn std::error::Error>> {
        inspect_playnite_backup(zip_path, db)
    }

    /// Import and merge games from a Playnite backup ZIP archive.
    pub fn import_backup<F>(
        zip_path: &Path,
        db: &Database,
        options: &PlayniteBackupImportOptions,
        progress_cb: F,
    ) -> Result<PlayniteImportStats, Box<dyn std::error::Error>>
    where
        F: FnMut(usize, usize, &str),
    {
        execute_playnite_backup_import(zip_path, db, options, progress_cb)
    }
}

// Inherent forwarders on Database for backward compatibility
impl Database {
    /// Inherent forwarder to PlayniteImporter::import_games
    #[inline]
    pub fn import_playnite_games(
        &self,
        items: &[PlayniteGameDto],
        options: &PlayniteImportOptions,
    ) -> Result<PlayniteImportStats, Box<dyn std::error::Error>> {
        PlayniteImporter::import_games(self, items, options)
    }

    /// Inherent forwarder to PlayniteImporter::import_from_json
    #[inline]
    pub fn import_playnite_from_json(
        &self,
        json_content: &str,
        options: &PlayniteImportOptions,
    ) -> Result<PlayniteImportStats, Box<dyn std::error::Error>> {
        PlayniteImporter::import_from_json(self, json_content, options)
    }

    /// Inherent forwarder to PlayniteImporter::import_from_file
    #[inline]
    pub fn import_playnite_from_file<P: AsRef<Path>>(
        &self,
        path: P,
        options: &PlayniteImportOptions,
    ) -> Result<PlayniteImportStats, Box<dyn std::error::Error>> {
        PlayniteImporter::import_from_file(self, path, options)
    }

    /// Inherent forwarder to inspect_playnite_backup
    #[inline]
    pub fn inspect_playnite_backup(
        &self,
        zip_path: &Path,
    ) -> Result<PlayniteBackupInspection, Box<dyn std::error::Error>> {
        inspect_playnite_backup(zip_path, self)
    }

    /// Inherent forwarder to execute_playnite_backup_import
    #[inline]
    pub fn import_playnite_backup<F>(
        &self,
        zip_path: &Path,
        options: &PlayniteBackupImportOptions,
        progress_cb: F,
    ) -> Result<PlayniteImportStats, Box<dyn std::error::Error>>
    where
        F: FnMut(usize, usize, &str),
    {
        execute_playnite_backup_import(zip_path, self, options, progress_cb)
    }
}
