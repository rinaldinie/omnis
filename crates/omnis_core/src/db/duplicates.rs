use chrono::Utc;
use omnis_sdk::{DuplicateHiderConfig, DuplicateHiderStats, Game};
use rusqlite::{params, Result};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::db::games::{map_row_to_game, GAME_COLUMNS};
use crate::db::Database;

const EDITION_SUFFIXES: &[&str] = &[
    "game of the year edition",
    "the game of the year edition",
    "digital deluxe edition",
    "the definitive edition",
    "definitive edition",
    "anniversary edition",
    "the ultimate edition",
    "ultimate edition",
    "the complete edition",
    "complete edition",
    "standard edition",
    "enhanced edition",
    "collector's edition",
    "collectors edition",
    "special edition",
    "deluxe edition",
    "gold edition",
    "silver edition",
    "platinum edition",
    "goty edition",
    "director's cut",
    "directors cut",
    "upgrade bundle",
    "remastered",
    "goty",
    "bundle",
];

/// Normalize a game title into a canonical deduplication key.
///
/// 1. Converts to lowercase and removes `™`, `®`, `©`, `(tm)`, `(r)`, `(c)`.
/// 2. Replaces `:`, `-`, `–`, `—`, `_` with spaces.
/// 3. If `ignore_edition_suffixes` is true, iteratively strips trailing edition suffixes
///    when doing so leaves a non-empty base title.
/// 4. Keeps only alphanumeric characters and spaces, collapses multiple spaces into single spaces, and trims.
pub fn normalize_title_for_dedup(title: &str, ignore_edition_suffixes: bool) -> String {
    let mut s = title.to_lowercase();
    for mark in ["™", "®", "©", "(tm)", "(r)", "(c)"] {
        s = s.replace(mark, "");
    }

    s = s
        .chars()
        .map(|c| match c {
            ':' | '-' | '–' | '—' | '_' => ' ',
            _ if c.is_alphanumeric() || c.is_whitespace() || c == '\'' => c,
            _ => ' ',
        })
        .collect();

    s = s.split_whitespace().collect::<Vec<_>>().join(" ");

    if ignore_edition_suffixes {
        loop {
            let mut stripped_any = false;
            for suffix in EDITION_SUFFIXES {
                if let Some(prefix) = s.strip_suffix(suffix) {
                    if prefix.ends_with(' ') {
                        let candidate = prefix.trim();
                        if !candidate.is_empty() {
                            s = candidate.to_string();
                            stripped_any = true;
                            break;
                        }
                    }
                }
            }
            if !stripped_any {
                break;
            }
        }
    }

    let cleaned: String = s
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();

    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Repository trait for Duplicate Hider configuration and deduplication operations
pub trait DuplicateHiderRepository: Send + Sync {
    /// Retrieve the current Duplicate Hider configuration
    fn get_duplicate_hider_config(&self) -> Result<DuplicateHiderConfig>;

    /// Persist the Duplicate Hider configuration
    fn save_duplicate_hider_config(&self, config: &DuplicateHiderConfig) -> Result<()>;

    /// Recompute duplicate groups and automatically hide non-winning copies according to config
    fn recompute_duplicates(&self) -> Result<DuplicateHiderStats>;

    /// Manually hide or unhide a specific game (clears `hidden_by_duplicate_hider`)
    fn set_game_hidden(&self, game_id: Uuid, is_hidden: bool) -> Result<Game>;

    /// Promote a specific duplicate copy to be the visible primary copy for its group
    fn promote_duplicate_copy(&self, game_id: Uuid) -> Result<Vec<Game>>;

    /// Retrieve all games belonging to a specific duplicate group
    fn get_games_by_duplicate_group(&self, group_id: &str) -> Result<Vec<Game>>;
}

impl DuplicateHiderRepository for Database {
    fn get_duplicate_hider_config(&self) -> Result<DuplicateHiderConfig> {
        let conn = self.reader();
        let res = conn.query_row(
            "SELECT enabled, store_priority, prefer_installed, ignore_edition_suffixes,
                    show_other_copies_in_menu, show_store_badges_on_card, ignored_game_ids
             FROM duplicate_hider_config
             WHERE id = 1;",
            [],
            |row| {
                let enabled: i32 = row.get(0)?;
                let store_priority_str: String = row.get(1)?;
                let prefer_installed: i32 = row.get(2)?;
                let ignore_edition_suffixes: i32 = row.get(3)?;
                let show_other_copies_in_menu: i32 = row.get(4)?;
                let show_store_badges_on_card: i32 = row.get(5)?;
                let ignored_game_ids_str: String = row.get(6)?;

                let store_priority: Vec<String> = serde_json::from_str(&store_priority_str)
                    .ok()
                    .filter(|v: &Vec<String>| !v.is_empty())
                    .unwrap_or_else(|| DuplicateHiderConfig::default().store_priority);

                let ignored_game_ids: Vec<String> =
                    serde_json::from_str(&ignored_game_ids_str).unwrap_or_default();

                Ok(DuplicateHiderConfig {
                    enabled: enabled != 0,
                    store_priority,
                    prefer_installed: prefer_installed != 0,
                    ignore_edition_suffixes: ignore_edition_suffixes != 0,
                    show_other_copies_in_menu: show_other_copies_in_menu != 0,
                    show_store_badges_on_card: show_store_badges_on_card != 0,
                    ignored_game_ids,
                })
            },
        );

        match res {
            Ok(cfg) => Ok(cfg),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(DuplicateHiderConfig::default()),
            Err(err) => Err(err),
        }
    }

    fn save_duplicate_hider_config(&self, config: &DuplicateHiderConfig) -> Result<()> {
        let conn = self.writer();
        let store_priority_json = serde_json::to_string(&config.store_priority)
            .unwrap_or_else(|_| "[\"steam\",\"gog\",\"epic\",\"xbox\",\"custom\"]".to_string());
        let ignored_json =
            serde_json::to_string(&config.ignored_game_ids).unwrap_or_else(|_| "[]".to_string());
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO duplicate_hider_config (
                id, enabled, store_priority, prefer_installed, ignore_edition_suffixes,
                show_other_copies_in_menu, show_store_badges_on_card, ignored_game_ids, updated_at
            ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                enabled = excluded.enabled,
                store_priority = excluded.store_priority,
                prefer_installed = excluded.prefer_installed,
                ignore_edition_suffixes = excluded.ignore_edition_suffixes,
                show_other_copies_in_menu = excluded.show_other_copies_in_menu,
                show_store_badges_on_card = excluded.show_store_badges_on_card,
                ignored_game_ids = excluded.ignored_game_ids,
                updated_at = excluded.updated_at;",
            params![
                if config.enabled { 1 } else { 0 },
                store_priority_json,
                if config.prefer_installed { 1 } else { 0 },
                if config.ignore_edition_suffixes { 1 } else { 0 },
                if config.show_other_copies_in_menu {
                    1
                } else {
                    0
                },
                if config.show_store_badges_on_card {
                    1
                } else {
                    0
                },
                ignored_json,
                now,
            ],
        )?;

        Ok(())
    }

    fn recompute_duplicates(&self) -> Result<DuplicateHiderStats> {
        let config = self.get_duplicate_hider_config()?;
        let all_games = self.get_all_games()?;

        let ignored_set: HashSet<String> = config
            .ignored_game_ids
            .iter()
            .map(|id| id.to_lowercase())
            .collect();

        let store_rank: HashMap<String, usize> = config
            .store_priority
            .iter()
            .enumerate()
            .map(|(idx, store)| (store.to_lowercase(), idx))
            .collect();

        let mut groups: HashMap<String, Vec<Game>> = HashMap::new();
        let mut singletons_or_ignored: Vec<Game> = Vec::new();

        for game in all_games {
            if ignored_set.contains(&game.id.to_string().to_lowercase()) {
                singletons_or_ignored.push(game);
                continue;
            }
            let key = normalize_title_for_dedup(&game.title, config.ignore_edition_suffixes);
            if key.is_empty() {
                singletons_or_ignored.push(game);
            } else {
                groups.entry(key).or_default().push(game);
            }
        }

        let mut conn = self.writer();
        let tx = conn.transaction()?;

        if !config.enabled {
            // Reset all rows hidden automatically by Duplicate Hider while preserving manual hides
            tx.execute(
                "UPDATE games
                 SET is_hidden = 0, hidden_by_duplicate_hider = 0
                 WHERE hidden_by_duplicate_hider = 1;",
                [],
            )?;

            for g in &singletons_or_ignored {
                if g.duplicate_group_id.is_some() {
                    tx.execute(
                        "UPDATE games SET duplicate_group_id = NULL WHERE id = ?1;",
                        params![g.id.to_string()],
                    )?;
                }
            }

            let mut total_groups = 0usize;
            for (norm_key, members) in &groups {
                if members.len() >= 2 {
                    total_groups += 1;
                    for member in members {
                        tx.execute(
                            "UPDATE games SET duplicate_group_id = ?2 WHERE id = ?1;",
                            params![member.id.to_string(), norm_key],
                        )?;
                    }
                } else if let Some(single) = members.first() {
                    if single.duplicate_group_id.is_some() {
                        tx.execute(
                            "UPDATE games SET duplicate_group_id = NULL WHERE id = ?1;",
                            params![single.id.to_string()],
                        )?;
                    }
                }
            }

            tx.commit()?;
            return Ok(DuplicateHiderStats {
                total_groups,
                hidden_duplicates: 0,
            });
        }

        // Config is enabled
        for g in &singletons_or_ignored {
            let (new_is_hidden, new_hidden_by_dh) = if g.hidden_by_duplicate_hider {
                (0, 0)
            } else {
                (if g.is_hidden { 1 } else { 0 }, 0)
            };
            tx.execute(
                "UPDATE games
                 SET is_hidden = ?2, hidden_by_duplicate_hider = ?3, duplicate_group_id = NULL
                 WHERE id = ?1;",
                params![g.id.to_string(), new_is_hidden, new_hidden_by_dh],
            )?;
        }

        let mut total_groups = 0usize;
        let mut hidden_duplicates = 0usize;

        for (norm_key, members) in groups {
            if members.len() == 1 {
                let single = &members[0];
                let (new_is_hidden, new_hidden_by_dh) = if single.hidden_by_duplicate_hider {
                    (0, 0)
                } else {
                    (if single.is_hidden { 1 } else { 0 }, 0)
                };
                tx.execute(
                    "UPDATE games
                     SET is_hidden = ?2, hidden_by_duplicate_hider = ?3, duplicate_group_id = NULL
                     WHERE id = ?1;",
                    params![single.id.to_string(), new_is_hidden, new_hidden_by_dh],
                )?;
                continue;
            }

            // Group with >= 2 copies
            total_groups += 1;

            // Separate manually hidden copies from eligible candidates
            let mut candidates: Vec<&Game> = members
                .iter()
                .filter(|g| !(g.is_hidden && !g.hidden_by_duplicate_hider))
                .collect();

            candidates.sort_by(|a, b| {
                if config.prefer_installed {
                    let inst_cmp = b.is_installed.cmp(&a.is_installed);
                    if inst_cmp != std::cmp::Ordering::Equal {
                        return inst_cmp;
                    }
                }

                let prio_a = store_rank
                    .get(&a.library_id.to_lowercase())
                    .copied()
                    .unwrap_or(usize::MAX);
                let prio_b = store_rank
                    .get(&b.library_id.to_lowercase())
                    .copied()
                    .unwrap_or(usize::MAX);
                let store_cmp = prio_a.cmp(&prio_b);
                if store_cmp != std::cmp::Ordering::Equal {
                    return store_cmp;
                }

                let play_cmp = b.playtime_seconds.cmp(&a.playtime_seconds);
                if play_cmp != std::cmp::Ordering::Equal {
                    return play_cmp;
                }

                let added_cmp = a.added_timestamp.cmp(&b.added_timestamp);
                if added_cmp != std::cmp::Ordering::Equal {
                    return added_cmp;
                }

                a.id.cmp(&b.id)
            });

            let winner_id = candidates.first().map(|g| g.id);

            for member in &members {
                if member.is_hidden && !member.hidden_by_duplicate_hider {
                    // Preserve manual hide while assigning duplicate_group_id
                    tx.execute(
                        "UPDATE games
                         SET duplicate_group_id = ?2
                         WHERE id = ?1;",
                        params![member.id.to_string(), &norm_key],
                    )?;
                } else if Some(member.id) == winner_id {
                    tx.execute(
                        "UPDATE games
                         SET is_hidden = 0, hidden_by_duplicate_hider = 0, duplicate_group_id = ?2
                         WHERE id = ?1;",
                        params![member.id.to_string(), &norm_key],
                    )?;
                } else {
                    hidden_duplicates += 1;
                    tx.execute(
                        "UPDATE games
                         SET is_hidden = 1, hidden_by_duplicate_hider = 1, duplicate_group_id = ?2
                         WHERE id = ?1;",
                        params![member.id.to_string(), &norm_key],
                    )?;
                }
            }
        }

        tx.commit()?;

        Ok(DuplicateHiderStats {
            total_groups,
            hidden_duplicates,
        })
    }

    fn set_game_hidden(&self, game_id: Uuid, is_hidden: bool) -> Result<Game> {
        let now = Utc::now().to_rfc3339();
        {
            let conn = self.writer();
            let affected = conn.execute(
                "UPDATE games
                 SET is_hidden = ?2, hidden_by_duplicate_hider = 0, modified_timestamp = ?3
                 WHERE id = ?1;",
                params![game_id.to_string(), if is_hidden { 1 } else { 0 }, now],
            )?;
            if affected == 0 {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }
        }

        self.get_game_by_id(game_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    fn promote_duplicate_copy(&self, game_id: Uuid) -> Result<Vec<Game>> {
        let target = self
            .get_game_by_id(game_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

        let now = Utc::now().to_rfc3339();

        if let Some(ref group_id) = target.duplicate_group_id {
            {
                let mut conn = self.writer();
                let tx = conn.transaction()?;

                tx.execute(
                    "UPDATE games
                     SET is_hidden = 0, hidden_by_duplicate_hider = 0, modified_timestamp = ?2
                     WHERE id = ?1;",
                    params![game_id.to_string(), &now],
                )?;

                tx.execute(
                    "UPDATE games
                     SET is_hidden = 1, hidden_by_duplicate_hider = 1, modified_timestamp = ?3
                     WHERE duplicate_group_id = ?1
                       AND id != ?2
                       AND NOT (is_hidden = 1 AND hidden_by_duplicate_hider = 0);",
                    params![group_id, game_id.to_string(), &now],
                )?;

                tx.commit()?;
            }

            let conn = self.reader();
            let query = format!(
                "SELECT {} FROM games WHERE duplicate_group_id = ?1 ORDER BY sorting_title ASC;",
                GAME_COLUMNS
            );
            let mut stmt = conn.prepare(&query)?;
            let rows = stmt.query_map(params![group_id], map_row_to_game)?;
            let mut games = Vec::new();
            for r in rows {
                games.push(r?);
            }
            Ok(games)
        } else {
            let updated = self.set_game_hidden(game_id, false)?;
            Ok(vec![updated])
        }
    }

    fn get_games_by_duplicate_group(&self, group_id: &str) -> Result<Vec<Game>> {
        let conn = self.reader();
        let query = format!(
            "SELECT {} FROM games WHERE duplicate_group_id = ?1 ORDER BY sorting_title ASC;",
            GAME_COLUMNS
        );
        let mut stmt = conn.prepare(&query)?;
        let rows = stmt.query_map(params![group_id], map_row_to_game)?;
        let mut games = Vec::new();
        for r in rows {
            games.push(r?);
        }
        Ok(games)
    }
}

// Inherent forwarders on Database
impl Database {
    #[inline]
    pub fn get_duplicate_hider_config(&self) -> Result<DuplicateHiderConfig> {
        DuplicateHiderRepository::get_duplicate_hider_config(self)
    }

    #[inline]
    pub fn save_duplicate_hider_config(&self, config: &DuplicateHiderConfig) -> Result<()> {
        DuplicateHiderRepository::save_duplicate_hider_config(self, config)
    }

    #[inline]
    pub fn recompute_duplicates(&self) -> Result<DuplicateHiderStats> {
        DuplicateHiderRepository::recompute_duplicates(self)
    }

    #[inline]
    pub fn set_game_hidden(&self, game_id: Uuid, is_hidden: bool) -> Result<Game> {
        DuplicateHiderRepository::set_game_hidden(self, game_id, is_hidden)
    }

    #[inline]
    pub fn promote_duplicate_copy(&self, game_id: Uuid) -> Result<Vec<Game>> {
        DuplicateHiderRepository::promote_duplicate_copy(self, game_id)
    }

    #[inline]
    pub fn get_games_by_duplicate_group(&self, group_id: &str) -> Result<Vec<Game>> {
        DuplicateHiderRepository::get_games_by_duplicate_group(self, group_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use omnis_sdk::DiscoveredGame;

    #[test]
    fn test_normalize_title_for_dedup() {
        assert_eq!(
            normalize_title_for_dedup(
                "The Witcher® 3: Wild Hunt - Game of the Year Edition",
                true
            ),
            "the witcher 3 wild hunt"
        );
        assert_eq!(
            normalize_title_for_dedup("The Witcher 3: Wild Hunt", true),
            "the witcher 3 wild hunt"
        );
        assert_eq!(
            normalize_title_for_dedup(
                "The Witcher® 3: Wild Hunt - Game of the Year Edition",
                false
            ),
            "the witcher 3 wild hunt game of the year edition"
        );
        assert_eq!(
            normalize_title_for_dedup("Death Stranding: Director's Cut", true),
            "death stranding"
        );
        assert_eq!(
            normalize_title_for_dedup("Control™ – Ultimate Edition", true),
            "control"
        );
        // Suffix-only title should not strip to empty
        assert_eq!(normalize_title_for_dedup("Remastered", true), "remastered");
    }

    #[test]
    fn test_recompute_duplicates_and_promote() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        let batch = vec![
            DiscoveredGame {
                library_id: "epic".to_string(),
                external_id: "w3_epic".to_string(),
                title: "The Witcher 3: Wild Hunt - Complete Edition".to_string(),
                install_dir: None,
                is_installed: false,
                play_action: None,
                playtime_seconds: 100,
                play_count: 1,
                last_activity: None,
                cover_image_path: None,
                background_image_path: None,
            },
            DiscoveredGame {
                library_id: "gog".to_string(),
                external_id: "w3_gog".to_string(),
                title: "The Witcher 3: Wild Hunt - Game of the Year Edition".to_string(),
                install_dir: None,
                is_installed: false,
                play_action: None,
                playtime_seconds: 500,
                play_count: 2,
                last_activity: None,
                cover_image_path: None,
                background_image_path: None,
            },
            DiscoveredGame {
                library_id: "steam".to_string(),
                external_id: "w3_steam".to_string(),
                title: "The Witcher® 3: Wild Hunt".to_string(),
                install_dir: None,
                is_installed: false,
                play_action: None,
                playtime_seconds: 50,
                play_count: 1,
                last_activity: None,
                cover_image_path: None,
                background_image_path: None,
            },
        ];

        db.ingest_discovered_batch(&batch).expect("Ingest failed");
        let stats = db.recompute_duplicates().expect("Recompute failed");
        assert_eq!(stats.total_groups, 1);
        assert_eq!(stats.hidden_duplicates, 2);

        let games = db.get_all_games().expect("Get all failed");
        let steam_copy = games.iter().find(|g| g.library_id == "steam").unwrap();
        let gog_copy = games.iter().find(|g| g.library_id == "gog").unwrap();
        let epic_copy = games.iter().find(|g| g.library_id == "epic").unwrap();

        assert!(!steam_copy.is_hidden);
        assert!(!steam_copy.hidden_by_duplicate_hider);
        assert!(gog_copy.is_hidden);
        assert!(gog_copy.hidden_by_duplicate_hider);
        assert!(epic_copy.is_hidden);
        assert!(epic_copy.hidden_by_duplicate_hider);

        // Promote GOG copy
        let group_after_promote = db
            .promote_duplicate_copy(gog_copy.id)
            .expect("Promote failed");
        assert_eq!(group_after_promote.len(), 3);
        let gog_updated = group_after_promote
            .iter()
            .find(|g| g.id == gog_copy.id)
            .unwrap();
        let steam_updated = group_after_promote
            .iter()
            .find(|g| g.id == steam_copy.id)
            .unwrap();
        assert!(!gog_updated.is_hidden);
        assert!(steam_updated.is_hidden);
        assert!(steam_updated.hidden_by_duplicate_hider);
    }
}
