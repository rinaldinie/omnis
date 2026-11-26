use omnis_sdk::{LaunchConfiguration, ProcessTrackingMode};
use rusqlite::{params, Connection, Result};

use crate::db::parse_and_normalize_genres;

pub const CURRENT_SCHEMA_VERSION: i32 = 12;

pub fn run_migrations(conn: &Connection) -> Result<()> {
    let current_version: i32 = conn.query_row("PRAGMA user_version;", [], |r| r.get(0))?;
    if current_version >= CURRENT_SCHEMA_VERSION {
        return Ok(());
    }

    // Version 1: Core Tables, Indexes and Schedules
    if current_version < 1 {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY NOT NULL,
                library_id TEXT NOT NULL,
                external_id TEXT NOT NULL,
                title TEXT NOT NULL COLLATE NOCASE,
                sorting_title TEXT NOT NULL COLLATE NOCASE,
                install_dir TEXT,
                is_installed INTEGER NOT NULL DEFAULT 0,
                playtime_seconds INTEGER NOT NULL DEFAULT 0,
                play_count INTEGER NOT NULL DEFAULT 0,
                last_activity TEXT,
                release_date TEXT,
                user_score INTEGER,
                critic_score INTEGER,
                community_score INTEGER,
                description TEXT,
                cover_image_path TEXT,
                background_image_path TEXT,
                icon_image_path TEXT,
                genres TEXT,
                developers TEXT,
                publishers TEXT,
                tags TEXT,
                features TEXT,
                series TEXT,
                age_rating TEXT,
                completion_status TEXT DEFAULT 'NotPlayed',
                user_notes TEXT,
                custom_links TEXT,
                play_actions TEXT,
                library_play_action TEXT,
                use_library_integration INTEGER NOT NULL DEFAULT 1,
                achievements_sync_status TEXT NOT NULL DEFAULT 'unknown',
                achievements_synced_at TEXT,
                extra_metadata TEXT,
                added_timestamp TEXT NOT NULL,
                modified_timestamp TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_games_library ON games(library_id);
            CREATE INDEX IF NOT EXISTS idx_games_installed ON games(is_installed);
            CREATE INDEX IF NOT EXISTS idx_games_sorting_title ON games(sorting_title);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_games_library_external ON games(library_id, external_id);

            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE
            );

            CREATE TABLE IF NOT EXISTS game_tags (
                game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY(game_id, tag_id)
            );

            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE
            );

            CREATE TABLE IF NOT EXISTS game_categories (
                game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                PRIMARY KEY(game_id, category_id)
            );

            CREATE TABLE IF NOT EXISTS game_sessions (
                id TEXT PRIMARY KEY,
                game_id TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL,
                FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_game_sessions_game_id ON game_sessions (game_id);
            CREATE INDEX IF NOT EXISTS idx_game_sessions_started_at ON game_sessions (started_at);
            CREATE INDEX IF NOT EXISTS idx_game_sessions_game_id_started_at ON game_sessions (game_id, started_at DESC);

            CREATE TABLE IF NOT EXISTS secrets (
                id TEXT PRIMARY KEY NOT NULL,
                nonce BLOB NOT NULL,
                ciphertext BLOB NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_secrets_updated_at ON secrets (updated_at);

            CREATE TABLE IF NOT EXISTS game_achievements (
                id TEXT PRIMARY KEY NOT NULL,
                game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                api_name TEXT NOT NULL,
                display_name TEXT NOT NULL COLLATE NOCASE,
                description TEXT,
                icon_unlocked_url TEXT NOT NULL,
                icon_locked_url TEXT,
                local_icon_path TEXT,
                is_unlocked INTEGER NOT NULL DEFAULT 0,
                unlock_time TEXT,
                rarity_percentage REAL,
                points INTEGER,
                is_hidden INTEGER NOT NULL DEFAULT 0,
                updated_timestamp TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_game_achievements_game ON game_achievements(game_id);
            CREATE INDEX IF NOT EXISTS idx_game_achievements_unlocked ON game_achievements(game_id, is_unlocked);
            CREATE INDEX IF NOT EXISTS idx_game_achievements_rarity ON game_achievements(game_id, rarity_percentage);

            CREATE TABLE IF NOT EXISTS backup_schedule (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                frequency TEXT NOT NULL DEFAULT 'disabled',
                destination_dir TEXT,
                max_rotations INTEGER NOT NULL DEFAULT 10,
                last_backup_utc TEXT,
                include_artwork INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            );
            INSERT OR IGNORE INTO backup_schedule (id, frequency, destination_dir, max_rotations, last_backup_utc, include_artwork, updated_at)
            VALUES (1, 'disabled', NULL, 10, NULL, 0, datetime('now'));
            PRAGMA user_version = 1;
            ",
        )?;
    }

    // Version 2: Schema Column Extensions & Parity Indexes
    if current_version < 2 {
        let _ = conn.execute("ALTER TABLE games ADD COLUMN genres TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN developers TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN publishers TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN tags TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN features TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN series TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN age_rating TEXT;", []);
        let _ = conn.execute(
            "ALTER TABLE games ADD COLUMN completion_status TEXT DEFAULT 'NotPlayed';",
            [],
        );
        let _ = conn.execute("ALTER TABLE games ADD COLUMN user_notes TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN custom_links TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN play_actions TEXT;", []);
        let _ = conn.execute("ALTER TABLE games ADD COLUMN extra_metadata TEXT;", []);
        let _ = conn.execute(
            "ALTER TABLE games ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;",
            [],
        );

        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_games_series ON games(series);",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_games_completion_status ON games(completion_status);",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_games_critic_score ON games(critic_score);",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_games_playtime ON games(playtime_seconds);",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE games ADD COLUMN name TEXT GENERATED ALWAYS AS (title) VIRTUAL;",
            [],
        );
        conn.execute_batch("PRAGMA user_version = 2;")?;
    }

    // Version 3: FTS5 Virtual Table with trigram tokenizer + sync triggers
    if current_version < 3 {
        conn.execute_batch(
            "
            CREATE VIRTUAL TABLE IF NOT EXISTS games_fts USING fts5(
                name, title, description, content='games', content_rowid='rowid', tokenize='trigram'
            );

            CREATE TRIGGER IF NOT EXISTS games_ai AFTER INSERT ON games BEGIN
                INSERT INTO games_fts(rowid, name, title, description) VALUES (new.rowid, new.name, new.title, new.description);
            END;

            CREATE TRIGGER IF NOT EXISTS games_ad AFTER DELETE ON games BEGIN
                INSERT INTO games_fts(games_fts, rowid, name, title, description) VALUES('delete', old.rowid, old.name, old.title, old.description);
            END;

            CREATE TRIGGER IF NOT EXISTS games_au AFTER UPDATE OF title, description ON games BEGIN
                INSERT INTO games_fts(games_fts, rowid, name, title, description) VALUES('delete', old.rowid, old.name, old.title, old.description);
                INSERT INTO games_fts(rowid, name, title, description) VALUES (new.rowid, new.name, new.title, new.description);
            END;
            ",
        )?;

        let _ = conn.execute(
            "INSERT OR IGNORE INTO games_fts(rowid, name, title, description) SELECT rowid, name, title, description FROM games;",
            [],
        );
        conn.execute_batch("PRAGMA user_version = 3;")?;
    }

    // Version 4: One-time path migration for legacy image and app bundle paths
    if current_version < 4 {
        let _ = conn.execute(
            "UPDATE games SET
                background_image_path = CASE
                    WHEN background_image_path LIKE '%/header.jpg'
                    THEN REPLACE(background_image_path, '/header.jpg', '/library_hero.jpg')
                    ELSE COALESCE(background_image_path, cover_image_path)
                END,
                cover_image_path = REPLACE(cover_image_path, '/header.jpg', '/library_600x900_2x.jpg')
             WHERE library_id = 'steam' AND (cover_image_path LIKE '%/header.jpg' OR background_image_path LIKE '%/header.jpg');",
            [],
        );

        let _ = conn.execute(
            "UPDATE games SET
                cover_image_path = REPLACE(REPLACE(cover_image_path, 'Omnis Game Library', 'com.omnis.gamelibrary'), 'OmnisGameLibrary', 'com.omnis.gamelibrary'),
                background_image_path = REPLACE(REPLACE(background_image_path, 'Omnis Game Library', 'com.omnis.gamelibrary'), 'OmnisGameLibrary', 'com.omnis.gamelibrary'),
                icon_image_path = REPLACE(REPLACE(icon_image_path, 'Omnis Game Library', 'com.omnis.gamelibrary'), 'OmnisGameLibrary', 'com.omnis.gamelibrary')
             WHERE cover_image_path LIKE '%OmnisGameLibrary%'
                OR cover_image_path LIKE '%Omnis Game Library%'
                OR background_image_path LIKE '%OmnisGameLibrary%'
                OR background_image_path LIKE '%Omnis Game Library%'
                OR icon_image_path LIKE '%OmnisGameLibrary%'
                OR icon_image_path LIKE '%Omnis Game Library%';",
            [],
        );
        conn.execute_batch("PRAGMA user_version = 4;")?;
    }

    // Version 5: Duplicate Hider columns, indexes, and singleton configuration table
    if current_version < 5 {
        let _ = conn.execute(
            "ALTER TABLE games ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE games ADD COLUMN hidden_by_duplicate_hider INTEGER NOT NULL DEFAULT 0;",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE games ADD COLUMN duplicate_group_id TEXT;",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_games_is_hidden ON games(is_hidden);",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_games_duplicate_group ON games(duplicate_group_id);",
            [],
        );
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS duplicate_hider_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER NOT NULL DEFAULT 1,
                store_priority TEXT NOT NULL DEFAULT '[\"steam\",\"gog\",\"epic\",\"xbox\",\"custom\"]',
                prefer_installed INTEGER NOT NULL DEFAULT 1,
                ignore_edition_suffixes INTEGER NOT NULL DEFAULT 1,
                show_other_copies_in_menu INTEGER NOT NULL DEFAULT 1,
                show_store_badges_on_card INTEGER NOT NULL DEFAULT 1,
                ignored_game_ids TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL
            );
            INSERT OR IGNORE INTO duplicate_hider_config (
                id, enabled, store_priority, prefer_installed, ignore_edition_suffixes,
                show_other_copies_in_menu, show_store_badges_on_card, ignored_game_ids, updated_at
            ) VALUES (1, 1, '[\"steam\",\"gog\",\"epic\",\"xbox\",\"custom\"]', 1, 1, 1, 1, '[]', datetime('now'));
            PRAGMA user_version = 5;
            ",
        )?;
    }

    // Version 6: Separate library-discovered play action from user custom play_actions
    if current_version < 6 {
        let _ = conn.execute("ALTER TABLE games ADD COLUMN library_play_action TEXT;", []);
        let _ = conn.execute(
            "UPDATE games
             SET library_play_action = json_extract(play_actions, '$[0]'),
                 play_actions = '[]'
             WHERE LOWER(library_id) != 'custom'
               AND play_actions IS NOT NULL
               AND TRIM(play_actions) != ''
               AND TRIM(play_actions) != '[]'
               AND json_valid(play_actions) = 1
               AND json_array_length(play_actions) = 1
               AND (
                   json_extract(play_actions, '$[0].executable') LIKE 'steam://%'
                   OR json_extract(play_actions, '$[0].executable') LIKE 'com.epicgames.launcher://%'
                   OR json_extract(play_actions, '$[0].executable') LIKE 'goggalaxy://%'
                   OR json_extract(play_actions, '$[0].executable') LIKE 'ms-windows-store://%'
                   OR json_extract(play_actions, '$[0].executable') LIKE 'amazon-games://%'
                   OR json_extract(play_actions, '$[0].executable') LIKE 'shell:AppsFolder%'
                   OR (
                       LOWER(library_id) = 'steam'
                       AND LOWER(COALESCE(json_extract(play_actions, '$[0].executable'), '')) IN ('cmd.exe', 'xdg-open', 'open', 'rundll32.exe')
                       AND LOWER(COALESCE(json_extract(play_actions, '$[0].arguments'), '')) LIKE '%steam://%'
                   )
                   OR LOWER(library_id) IN ('gog', 'amazon', 'switch')
                   OR LOWER(library_id) LIKE 'emulator_%'
               );",
            [],
        );
        conn.execute_batch("PRAGMA user_version = 6;")?;
    }

    // Version 7: Game-level library integration toggle
    if current_version < 7 {
        let _ = conn.execute(
            "ALTER TABLE games ADD COLUMN use_library_integration INTEGER NOT NULL DEFAULT 1;",
            [],
        );
        conn.execute_batch("PRAGMA user_version = 7;")?;
    }

    // Version 8: Track per-game achievement sync status to avoid rescanning games without trophies
    if current_version < 8 {
        let _ = conn.execute(
            "ALTER TABLE games ADD COLUMN achievements_sync_status TEXT NOT NULL DEFAULT 'unknown';",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE games ADD COLUMN achievements_synced_at TEXT;",
            [],
        );
        let _ = conn.execute(
            "UPDATE games
             SET achievements_sync_status = 'available'
             WHERE EXISTS (
                 SELECT 1 FROM game_achievements ga WHERE ga.game_id = games.id
             );",
            [],
        );
        conn.execute_batch("PRAGMA user_version = 8;")?;
    }

    // Version 9: Normalize and deduplicate stored game genres into canonical English names
    if current_version < 9 {
        let tx = conn.unchecked_transaction()?;
        let rows: Vec<(String, String)> = {
            let mut stmt = tx.prepare(
                "SELECT id, genres FROM games WHERE genres IS NOT NULL AND TRIM(genres) != '';",
            )?;
            let mapped = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            mapped.collect::<Result<Vec<_>>>()?
        };

        {
            let mut update_stmt =
                tx.prepare("UPDATE games SET genres = ?2 WHERE id = ?1;")?;
            for (id, raw_genres) in rows {
                let normalized = parse_and_normalize_genres(&raw_genres);
                let next_val: Option<String> = if normalized.is_empty() {
                    None
                } else {
                    Some(normalized.join(", "))
                };
                if next_val.as_deref() != Some(raw_genres.as_str()) {
                    update_stmt.execute(params![id, next_val])?;
                }
            }
        }

        tx.execute_batch("PRAGMA user_version = 9;")?;
        tx.commit()?;
    }

    // Version 10: Reconcile store/plugin launch commands left in play_actions by earlier v6 migration
    if current_version < 10 {
        let tx = conn.unchecked_transaction()?;
        struct V10ReconcileRow {
            id: String,
            library_id: String,
            install_dir: Option<String>,
            raw_play_actions: String,
            raw_lib_action: Option<String>,
        }

        let rows: Vec<V10ReconcileRow> = {
            let mut stmt = tx.prepare(
                "SELECT id, library_id, install_dir, play_actions, library_play_action
                 FROM games
                 WHERE LOWER(library_id) != 'custom'
                   AND play_actions IS NOT NULL
                   AND TRIM(play_actions) != ''
                   AND TRIM(play_actions) != '[]';",
            )?;
            let mapped = stmt.query_map([], |row| {
                Ok(V10ReconcileRow {
                    id: row.get(0)?,
                    library_id: row.get(1)?,
                    install_dir: row.get(2)?,
                    raw_play_actions: row.get(3)?,
                    raw_lib_action: row.get(4)?,
                })
            })?;
            mapped.collect::<Result<Vec<_>>>()?
        };

        {
            let mut update_stmt = tx.prepare(
                "UPDATE games SET library_play_action = ?2, play_actions = ?3 WHERE id = ?1;",
            )?;
            for row in rows {
                let Ok(play_actions) = serde_json::from_str::<Vec<LaunchConfiguration>>(&row.raw_play_actions) else {
                    continue;
                };
                if play_actions.is_empty() {
                    continue;
                }

                let existing_lib_action = row
                    .raw_lib_action
                    .as_deref()
                    .and_then(|s| serde_json::from_str::<LaunchConfiguration>(s).ok())
                    .filter(|a| !a.executable.trim().is_empty());

                let (next_lib_action, next_play_actions) = reconcile_v10_actions(
                    &row.library_id,
                    row.install_dir.as_deref(),
                    existing_lib_action.as_ref(),
                    &play_actions,
                );

                if next_lib_action != existing_lib_action || next_play_actions != play_actions {
                    let lib_json = next_lib_action
                        .as_ref()
                        .and_then(|a| serde_json::to_string(a).ok());
                    let actions_json =
                        serde_json::to_string(&next_play_actions).unwrap_or_else(|_| "[]".to_string());
                    update_stmt.execute(params![row.id, lib_json, actions_json])?;
                }
            }
        }

        tx.execute_batch("PRAGMA user_version = 10;")?;
        tx.commit()?;
    }

    // Version 11: Custom/manual games have no store integration, so disable use_library_integration
    if current_version < 11 {
        let _ = conn.execute(
            "UPDATE games SET use_library_integration = 0 WHERE LOWER(library_id) IN ('custom', 'manual');",
            [],
        );
        conn.execute_batch("PRAGMA user_version = 11;")?;
    }

    // Version 12: Scope FTS5 update trigger to indexed text columns (title, description)
    // so non-text updates (playtime, hidden flags, duplicate groups) do not rewrite trigram FTS entries
    if current_version < 12 {
        conn.execute_batch(
            "
            DROP TRIGGER IF EXISTS games_au;
            CREATE TRIGGER IF NOT EXISTS games_au AFTER UPDATE OF title, description ON games BEGIN
                INSERT INTO games_fts(games_fts, rowid, name, title, description) VALUES('delete', old.rowid, old.name, old.title, old.description);
                INSERT INTO games_fts(rowid, name, title, description) VALUES (new.rowid, new.name, new.title, new.description);
            END;
            PRAGMA user_version = 12;
            ",
        )?;
    }

    conn.execute_batch(&format!(
        "PRAGMA user_version = {};",
        CURRENT_SCHEMA_VERSION
    ))?;
    Ok(())
}

fn normalize_path_for_compare(raw: &str) -> String {
    raw.trim().replace('\\', "/").to_ascii_lowercase()
}

fn is_store_or_wrapper_action(library_id: &str, action: &LaunchConfiguration) -> bool {
    let exe = action.executable.trim().to_ascii_lowercase();
    if exe.starts_with("steam://")
        || exe.starts_with("com.epicgames.launcher://")
        || exe.starts_with("goggalaxy://")
        || exe.starts_with("ms-windows-store://")
        || exe.starts_with("amazon-games://")
        || exe.starts_with("shell:appsfolder")
    {
        return true;
    }

    library_id.eq_ignore_ascii_case("steam")
        && matches!(
            exe.as_str(),
            "cmd.exe" | "xdg-open" | "open" | "rundll32.exe"
        )
        && action
            .arguments
            .iter()
            .any(|arg| arg.to_ascii_lowercase().contains("steam://"))
}

fn is_discovered_local_game_action(
    library_id: &str,
    install_dir: Option<&str>,
    action: &LaunchConfiguration,
) -> bool {
    if !library_id.eq_ignore_ascii_case("gog") && !library_id.eq_ignore_ascii_case("amazon") {
        return false;
    }
    let Some(dir) = install_dir.map(str::trim).filter(|d| !d.is_empty()) else {
        return false;
    };
    let dir_norm = normalize_path_for_compare(dir);
    let dir_prefix = format!("{}/", dir_norm.trim_end_matches('/'));
    let exe_norm = normalize_path_for_compare(&action.executable);
    if !exe_norm.starts_with(&dir_prefix) {
        return false;
    }

    let exe_file = exe_norm.rsplit('/').next().unwrap_or("");
    matches!(
        &action.tracking_mode,
        ProcessTrackingMode::ProcessName(name) if name.trim().eq_ignore_ascii_case(exe_file)
    )
}

fn is_emulated_library_id(library_id: &str) -> bool {
    let lower = library_id.trim().to_ascii_lowercase();
    lower == "switch" || lower.starts_with("emulator_")
}

fn actions_equivalent(a: &LaunchConfiguration, b: &LaunchConfiguration) -> bool {
    if normalize_path_for_compare(&a.executable) != normalize_path_for_compare(&b.executable) {
        return false;
    }
    if a.arguments.len() != b.arguments.len() {
        return false;
    }
    a.arguments
        .iter()
        .zip(b.arguments.iter())
        .all(|(lhs, rhs)| lhs.trim() == rhs.trim())
}

fn reconcile_v10_actions(
    library_id: &str,
    install_dir: Option<&str>,
    existing_lib_action: Option<&LaunchConfiguration>,
    play_actions: &[LaunchConfiguration],
) -> (Option<LaunchConfiguration>, Vec<LaunchConfiguration>) {
    let mut next_lib_action = existing_lib_action.cloned();
    let mut remaining: Vec<LaunchConfiguration> = Vec::with_capacity(play_actions.len());

    if let Some(lib_act) = existing_lib_action {
        let lib_is_uri = is_store_or_wrapper_action(library_id, lib_act);
        for act in play_actions {
            if actions_equivalent(act, lib_act) || is_store_or_wrapper_action(library_id, act) {
                continue;
            }
            if lib_is_uri && is_discovered_local_game_action(library_id, install_dir, act) {
                next_lib_action = Some(act.clone());
                continue;
            }
            remaining.push(act.clone());
        }
    } else {
        let emulated_single = is_emulated_library_id(library_id) && play_actions.len() == 1;
        for act in play_actions {
            let is_plugin_action = is_store_or_wrapper_action(library_id, act)
                || is_discovered_local_game_action(library_id, install_dir, act)
                || emulated_single;
            if next_lib_action.is_none() && is_plugin_action {
                next_lib_action = Some(act.clone());
                continue;
            }
            if is_store_or_wrapper_action(library_id, act) {
                continue;
            }
            if let Some(promoted) = &next_lib_action {
                if actions_equivalent(act, promoted) {
                    continue;
                }
            }
            remaining.push(act.clone());
        }
    }

    (next_lib_action, remaining)
}
