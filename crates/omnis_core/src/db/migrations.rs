use rusqlite::{Connection, Result};

pub fn run_migrations(conn: &Connection) -> Result<()> {
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
        ",
    )?;

    // Ensure columns exist on already-created tables (idempotent, non-destructive)
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
    let _ = conn.execute("ALTER TABLE games ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;", []);

    // Ensure performance indexes exist on existing DBs
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_games_series ON games(series);", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_games_completion_status ON games(completion_status);", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_games_critic_score ON games(critic_score);", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_games_playtime ON games(playtime_seconds);", []);

    // Virtual column name mapping to title if not already present
    let _ = conn.execute("ALTER TABLE games ADD COLUMN name TEXT GENERATED ALWAYS AS (title) VIRTUAL;", []);

    // G3. FTS5 Virtual Table with trigram tokenizer + sync triggers
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

    // Ensure any pre-existing games are indexed into games_fts
    let _ = conn.execute(
        "INSERT OR IGNORE INTO games_fts(rowid, name, title, description) SELECT rowid, name, title, description FROM games;",
        [],
    );

    // Fix pre-existing Steam cover image paths that were stored with wide banner header.jpg
    let _ = conn.execute(
        "UPDATE games SET
            background_image_path = COALESCE(background_image_path, cover_image_path),
            cover_image_path = REPLACE(cover_image_path, '/header.jpg', '/library_600x900_2x.jpg')
         WHERE library_id = 'steam' AND cover_image_path LIKE '%/header.jpg';",
        [],
    );

    Ok(())
}

