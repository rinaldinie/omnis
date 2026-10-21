use crate::Database;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::info;
use uuid::Uuid;

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
        Some("cb91aec9-6843-410e-a02b-a64c48325983") => "steam",
        Some("aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e") => "gog",
        Some("00000002-dbd1-46c6-b5d0-b1cb55d14e34") => "epic",
        Some("7e4fbb5e-2304-4c2c-9721-402f4586f6a7") | Some("b5199324-4061-4613-9f4c-1e24749f57d6") => "xbox",
        Some("85dd7072-76de-42bc-9c2b-000e60e4e843") => "origin",
        Some("c2f038e5-8b92-4877-9163-0d6e1fa20322") => "ubisoft",
        Some("e3c26a3d-dce2-4bb7-9ec7-300e12361115") => "battlenet",
        Some("00000001-ebb0-4663-8a98-3b94e39b52a8") => "itch",
        Some("4029fdd1-eb23-4e4b-9e58-690a9a4b85c2") => "amazon",
        Some("0e460992-6ff1-4666-a111-000000000001") => "bethesda",
        Some("96e8c4bc-1666-4e5a-a435-0902c3ec0b2b") => "humble",
        _ => "manual",
    }
}

/// Serialized representation of a Playnite 10 game export item.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct PlayniteGameDto {
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
}

#[derive(Debug, Clone, Default)]
pub struct PlayniteImportOptions {
    pub dry_run: bool,
    pub image_cache_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PlayniteImportStats {
    pub total_read: usize,
    pub games_created: usize,
    pub games_merged: usize,
    pub playtime_updated: usize,
    pub images_cached: usize,
    pub tags_added: usize,
    pub categories_added: usize,
}

impl Database {
    /// Import games from Playnite 10 JSON export data.
    ///
    /// Follows strict non-duplicative, idempotent merging semantics:
    /// - Stores mapped via Playnite GUID table.
    /// - Matches existing records on (library_id, external_id).
    /// - Avoids double-counting playtime if Omnis already has historical sessions.
    /// - Copies local image assets into the image cache directory.
    /// - Supports --dry-run without mutating database or filesystem.
    pub fn import_playnite_games(
        &self,
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
        let conn = self.conn.lock().unwrap();

        // If dry_run, we do all checks without executing mutations
        for item in items {
            let library_id = map_playnite_plugin_id(item.PluginId.as_deref());
            let external_id = match &item.GameId {
                Some(gid) if !gid.trim().is_empty() => gid.trim().to_string(),
                _ => format!("manual:{}", item.Name.to_lowercase().replace(' ', "-")),
            };

            // Query existing game
            let existing: Option<(String, u64, i32, Option<String>, Option<String>, i32)> = {
                let mut stmt = conn.prepare(
                    "SELECT id, playtime_seconds, play_count, cover_image_path, background_image_path, is_favorite FROM games WHERE library_id = ?1 AND external_id = ?2;"
                )?;
                let mut rows = stmt.query(params![library_id, external_id])?;
                if let Some(row) = rows.next()? {
                    Some((
                        row.get(0)?,
                        row.get::<_, i64>(1)? as u64,
                        row.get::<_, i32>(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                } else {
                    None
                }
            };

            let imported_playtime = item.PlaytimeSeconds.unwrap_or(0);
            let imported_play_count = item.PlayCount.unwrap_or(0);
            let is_fav = if item.Favorite.unwrap_or(false) { 1 } else { 0 };

            if let Some((existing_id, existing_playtime, existing_play_count, ex_cover, ex_bg, ex_fav)) = existing {
                // Game already exists in Omnis -> Merge
                stats.games_merged += 1;

                // Check historical sessions
                let session_count: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM game_sessions WHERE game_id = ?1;",
                    params![existing_id],
                    |r| r.get(0),
                )?;

                let new_playtime = if session_count > 0 {
                    // Omnis has recorded sessions! Avoid double counting:
                    if imported_playtime > existing_playtime {
                        info!(
                            "Playtime conflict for '{}': keeping higher Playnite playtime ({}s > {}s)",
                            item.Name, imported_playtime, existing_playtime
                        );
                        stats.playtime_updated += 1;
                        imported_playtime
                    } else {
                        existing_playtime
                    }
                } else {
                    // No Omnis sessions: adopt higher playtime between store sync and playnite
                    if imported_playtime > existing_playtime {
                        stats.playtime_updated += 1;
                        imported_playtime
                    } else {
                        existing_playtime
                    }
                };

                let new_play_count = existing_play_count.max(imported_play_count as i32);
                let new_fav = ex_fav.max(is_fav);

                // Handle images
                let mut cover_to_save = ex_cover;
                if cover_to_save.is_none() {
                    if let Some(ref c) = item.Cover {
                        if Path::new(c).exists() {
                            if let Some(ref cache_dir) = options.image_cache_dir {
                                let ext = Path::new(c)
                                    .extension()
                                    .and_then(|e| e.to_str())
                                    .unwrap_or("jpg");
                                let target = cache_dir.join(format!("{}_cover.{}", existing_id, ext));
                                if !options.dry_run {
                                    let _ = fs::copy(c, &target);
                                }
                                cover_to_save = Some(target.to_string_lossy().to_string());
                                stats.images_cached += 1;
                            } else {
                                cover_to_save = Some(c.clone());
                            }
                        }
                    }
                }

                let mut bg_to_save = ex_bg;
                if bg_to_save.is_none() {
                    if let Some(ref b) = item.Background {
                        if Path::new(b).exists() {
                            if let Some(ref cache_dir) = options.image_cache_dir {
                                let ext = Path::new(b)
                                    .extension()
                                    .and_then(|e| e.to_str())
                                    .unwrap_or("jpg");
                                let target = cache_dir.join(format!("{}_bg.{}", existing_id, ext));
                                if !options.dry_run {
                                    let _ = fs::copy(b, &target);
                                }
                                bg_to_save = Some(target.to_string_lossy().to_string());
                                stats.images_cached += 1;
                            } else {
                                bg_to_save = Some(b.clone());
                            }
                        }
                    }
                }

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
                            existing_id,
                        ],
                    )?;

                    // Relate tags and categories
                    if let Some(ref tags) = item.Tags {
                        for t in tags {
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
                                    params![existing_id, tag_name],
                                )?;
                                stats.tags_added += 1;
                            }
                        }
                    }

                    if let Some(ref categories) = item.Categories {
                        for c in categories {
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
                                    params![existing_id, cat_name],
                                )?;
                                stats.categories_added += 1;
                            }
                        }
                    }
                } else {
                    if let Some(ref tags) = item.Tags {
                        stats.tags_added += tags.len();
                    }
                    if let Some(ref cats) = item.Categories {
                        stats.categories_added += cats.len();
                    }
                }
            } else {
                // Game does NOT exist -> Create new game
                stats.games_created += 1;
                let new_id = Uuid::new_v4().to_string();
                let is_installed = if item.InstallDirectory.is_some() { 1 } else { 0 };

                // Handle images
                let mut cover_to_save = None;
                if let Some(ref c) = item.Cover {
                    if Path::new(c).exists() {
                        if let Some(ref cache_dir) = options.image_cache_dir {
                            let ext = Path::new(c)
                                .extension()
                                .and_then(|e| e.to_str())
                                .unwrap_or("jpg");
                            let target = cache_dir.join(format!("{}_cover.{}", new_id, ext));
                            if !options.dry_run {
                                let _ = fs::copy(c, &target);
                            }
                            cover_to_save = Some(target.to_string_lossy().to_string());
                            stats.images_cached += 1;
                        } else {
                            cover_to_save = Some(c.clone());
                        }
                    }
                }

                let mut bg_to_save = None;
                if let Some(ref b) = item.Background {
                    if Path::new(b).exists() {
                        if let Some(ref cache_dir) = options.image_cache_dir {
                            let ext = Path::new(b)
                                .extension()
                                .and_then(|e| e.to_str())
                                .unwrap_or("jpg");
                            let target = cache_dir.join(format!("{}_bg.{}", new_id, ext));
                            if !options.dry_run {
                                let _ = fs::copy(b, &target);
                            }
                            bg_to_save = Some(target.to_string_lossy().to_string());
                            stats.images_cached += 1;
                        } else {
                            bg_to_save = Some(b.clone());
                        }
                    }
                }

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
                            item.Completion.as_deref().unwrap_or("NotPlayed"),
                            is_fav,
                            now,
                        ],
                    )?;

                    // Relate tags and categories
                    if let Some(ref tags) = item.Tags {
                        for t in tags {
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
                                    params![new_id, tag_name],
                                )?;
                                stats.tags_added += 1;
                            }
                        }
                    }

                    if let Some(ref categories) = item.Categories {
                        for c in categories {
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
                                    params![new_id, cat_name],
                                )?;
                                stats.categories_added += 1;
                            }
                        }
                    }
                } else {
                    if let Some(ref tags) = item.Tags {
                        stats.tags_added += tags.len();
                    }
                    if let Some(ref cats) = item.Categories {
                        stats.categories_added += cats.len();
                    }
                }
            }
        }

        drop(conn);

        if !options.dry_run {
            let _ = self.reload_search_index();
        }

        Ok(stats)
    }

    /// Import games from a JSON string payload.
    pub fn import_playnite_from_json(
        &self,
        json_content: &str,
        options: &PlayniteImportOptions,
    ) -> Result<PlayniteImportStats, Box<dyn std::error::Error>> {
        let items: Vec<PlayniteGameDto> = serde_json::from_str(json_content)?;
        self.import_playnite_games(&items, options)
    }

    /// Import games from a JSON file path.
    pub fn import_playnite_from_file<P: AsRef<Path>>(
        &self,
        path: P,
        options: &PlayniteImportOptions,
    ) -> Result<PlayniteImportStats, Box<dyn std::error::Error>> {
        let content = fs::read_to_string(path)?;
        self.import_playnite_from_json(&content, options)
    }
}
