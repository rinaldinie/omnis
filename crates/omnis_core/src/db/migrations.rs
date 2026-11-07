use rusqlite::{Connection, Result};

pub const CURRENT_SCHEMA_VERSION: i32 = 5;

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

            CREATE TRIGGER IF NOT EXISTS games_au AFTER UPDATE ON games BEGIN
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

    conn.execute_batch(&format!(
        "PRAGMA user_version = {};",
        CURRENT_SCHEMA_VERSION
    ))?;
    Ok(())
}
