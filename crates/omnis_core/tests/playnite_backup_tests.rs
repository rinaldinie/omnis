use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Instant;

use omnis_core::{
    execute_playnite_backup_import, inspect_playnite_backup,
    Database, PlayniteBackupImportOptions, PlayniteBackupInspection,
};
use omnis_sdk::constants::stores;
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

// ============================================================================
// Synthetic Test Harness & Generators
// ============================================================================

#[derive(Clone, Default)]
struct SyntheticGame {
    name: String,
    game_id: Option<String>,
    plugin_id: Option<[u8; 16]>,
    playtime: Option<i64>,
    play_count: Option<i32>,
    favorite: Option<bool>,
    last_activity: Option<String>,
    completion: Option<String>,
    cover_image: Option<String>,
    background_image: Option<String>,
    tags: Option<Vec<String>>,
    categories: Option<Vec<String>>,
}

impl SyntheticGame {
    fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            ..Default::default()
        }
    }

    fn with_game_id(mut self, gid: &str) -> Self {
        self.game_id = Some(gid.to_string());
        self
    }

    fn with_plugin_id(mut self, pid: [u8; 16]) -> Self {
        self.plugin_id = Some(pid);
        self
    }

    fn with_playtime(mut self, seconds: i64) -> Self {
        self.playtime = Some(seconds);
        self
    }

    fn with_play_count(mut self, count: i32) -> Self {
        self.play_count = Some(count);
        self
    }

    fn with_favorite(mut self, fav: bool) -> Self {
        self.favorite = Some(fav);
        self
    }

    fn with_last_activity(mut self, activity: &str) -> Self {
        self.last_activity = Some(activity.to_string());
        self
    }

    fn with_completion(mut self, status: &str) -> Self {
        self.completion = Some(status.to_string());
        self
    }

    fn with_cover(mut self, path: &str) -> Self {
        self.cover_image = Some(path.to_string());
        self
    }

    fn with_background(mut self, path: &str) -> Self {
        self.background_image = Some(path.to_string());
        self
    }

    fn with_tags(mut self, tags: Vec<&str>) -> Self {
        self.tags = Some(tags.into_iter().map(|s| s.to_string()).collect());
        self
    }

    fn with_categories(mut self, cats: Vec<&str>) -> Self {
        self.categories = Some(cats.into_iter().map(|s| s.to_string()).collect());
        self
    }
}

// Well-known store GUIDs in .NET little-endian byte ordering
fn manual_guid() -> [u8; 16] {
    Uuid::nil().to_bytes_le()
}

fn steam_guid() -> [u8; 16] {
    Uuid::parse_str("cb91dfc9-b977-43bf-8e70-55f46e410fab").unwrap().to_bytes_le()
}

fn gog_guid() -> [u8; 16] {
    Uuid::parse_str("aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e").unwrap().to_bytes_le()
}

fn epic_guid() -> [u8; 16] {
    Uuid::parse_str("00000002-dbd1-46c6-b5d0-b1cb55d14e34").unwrap().to_bytes_le()
}

fn xbox_guid() -> [u8; 16] {
    Uuid::parse_str("7e4fbb5e-2304-4c2c-9721-402f4586f6a7").unwrap().to_bytes_le()
}

fn origin_guid() -> [u8; 16] {
    Uuid::parse_str("85dd7072-76de-42bc-9c2b-000e60e4e843").unwrap().to_bytes_le()
}

fn amazon_guid() -> [u8; 16] {
    Uuid::parse_str("402674cd-4af6-4886-b6ec-0e695bfa0688").unwrap().to_bytes_le()
}

/// Helper to serialize a SyntheticGame into LiteDB BSON document bytes
fn serialize_game_doc(game: &SyntheticGame) -> Vec<u8> {
    let mut body = Vec::new();

    // 1. _id (Binary GUID)
    body.push(0x05);
    body.extend_from_slice(b"_id\0");
    body.extend_from_slice(&16u32.to_le_bytes());
    body.push(0x04);
    let id_bytes = Uuid::new_v4().to_bytes_le();
    body.extend_from_slice(&id_bytes);

    // 2. Name (String)
    body.push(0x02);
    body.extend_from_slice(b"Name\0");
    let name_c = format!("{}\0", game.name);
    body.extend_from_slice(&(name_c.len() as u32).to_le_bytes());
    body.extend_from_slice(name_c.as_bytes());

    // 3. GameId (String)
    if let Some(ref gid) = game.game_id {
        body.push(0x02);
        body.extend_from_slice(b"GameId\0");
        let gid_c = format!("{}\0", gid);
        body.extend_from_slice(&(gid_c.len() as u32).to_le_bytes());
        body.extend_from_slice(gid_c.as_bytes());
    }

    // 4. PluginId (Binary GUID)
    if let Some(ref pid) = game.plugin_id {
        body.push(0x05);
        body.extend_from_slice(b"PluginId\0");
        body.extend_from_slice(&16u32.to_le_bytes());
        body.push(0x04);
        body.extend_from_slice(pid);
    }

    // 5. Playtime (Int64)
    if let Some(pt) = game.playtime {
        body.push(0x12);
        body.extend_from_slice(b"Playtime\0");
        body.extend_from_slice(&pt.to_le_bytes());
    }

    // 6. PlayCount (Int32)
    if let Some(pc) = game.play_count {
        body.push(0x10);
        body.extend_from_slice(b"PlayCount\0");
        body.extend_from_slice(&pc.to_le_bytes());
    }

    // 7. Favorite (Bool)
    if let Some(fav) = game.favorite {
        body.push(0x08);
        body.extend_from_slice(b"Favorite\0");
        body.push(if fav { 0x01 } else { 0x00 });
    }

    // 8. LastActivity (String)
    if let Some(ref la) = game.last_activity {
        body.push(0x02);
        body.extend_from_slice(b"LastActivity\0");
        let la_c = format!("{}\0", la);
        body.extend_from_slice(&(la_c.len() as u32).to_le_bytes());
        body.extend_from_slice(la_c.as_bytes());
    }

    // 9. CompletionStatus (String)
    if let Some(ref cs) = game.completion {
        body.push(0x02);
        body.extend_from_slice(b"CompletionStatus\0");
        let cs_c = format!("{}\0", cs);
        body.extend_from_slice(&(cs_c.len() as u32).to_le_bytes());
        body.extend_from_slice(cs_c.as_bytes());
    }

    // 10. CoverImage (String)
    if let Some(ref cov) = game.cover_image {
        body.push(0x02);
        body.extend_from_slice(b"CoverImage\0");
        let cov_c = format!("{}\0", cov);
        body.extend_from_slice(&(cov_c.len() as u32).to_le_bytes());
        body.extend_from_slice(cov_c.as_bytes());
    }

    // 11. BackgroundImage (String)
    if let Some(ref bg) = game.background_image {
        body.push(0x02);
        body.extend_from_slice(b"BackgroundImage\0");
        let bg_c = format!("{}\0", bg);
        body.extend_from_slice(&(bg_c.len() as u32).to_le_bytes());
        body.extend_from_slice(bg_c.as_bytes());
    }

    // 12. Tags (Array of Strings)
    if let Some(ref tags) = game.tags {
        let mut arr_doc = Vec::new();
        for (idx, tag) in tags.iter().enumerate() {
            arr_doc.push(0x02);
            let idx_str = format!("{}\0", idx);
            arr_doc.extend_from_slice(idx_str.as_bytes());
            let tag_c = format!("{}\0", tag);
            arr_doc.extend_from_slice(&(tag_c.len() as u32).to_le_bytes());
            arr_doc.extend_from_slice(tag_c.as_bytes());
        }
        let arr_total = (4 + arr_doc.len() + 1) as u32;
        body.push(0x04);
        body.extend_from_slice(b"Tags\0");
        body.extend_from_slice(&arr_total.to_le_bytes());
        body.extend_from_slice(&arr_doc);
        body.push(0x00);
    }

    // 13. Categories (Array of Strings)
    if let Some(ref cats) = game.categories {
        let mut arr_doc = Vec::new();
        for (idx, cat) in cats.iter().enumerate() {
            arr_doc.push(0x02);
            let idx_str = format!("{}\0", idx);
            arr_doc.extend_from_slice(idx_str.as_bytes());
            let cat_c = format!("{}\0", cat);
            arr_doc.extend_from_slice(&(cat_c.len() as u32).to_le_bytes());
            arr_doc.extend_from_slice(cat_c.as_bytes());
        }
        let arr_total = (4 + arr_doc.len() + 1) as u32;
        body.push(0x04);
        body.extend_from_slice(b"Categories\0");
        body.extend_from_slice(&arr_total.to_le_bytes());
        body.extend_from_slice(&arr_doc);
        body.push(0x00);
    }

    let total_doc_len = (4 + body.len() + 1) as u32;
    let mut doc = Vec::with_capacity(total_doc_len as usize);
    doc.extend_from_slice(&total_doc_len.to_le_bytes());
    doc.extend_from_slice(&body);
    doc.push(0x00);
    doc
}

/// Helper to assemble a valid LiteDB file buffer with Header and Data pages
fn build_litedb_buffer(games: &[SyntheticGame]) -> Vec<u8> {
    let mut docs = Vec::new();
    for g in games {
        docs.push(serialize_game_doc(g));
    }

    let page_size = 4096;
    let mut total_pages = 2;
    let mut current_page_used = 32;
    for doc in &docs {
        if current_page_used + doc.len() > page_size {
            total_pages += 1;
            current_page_used = 32 + doc.len() + 16;
        } else {
            current_page_used += doc.len() + 16;
        }
    }

    let mut buf = vec![0u8; page_size * total_pages];
    // Page 0: Header Page
    buf[4] = 0x01;
    buf[25..25 + 27].copy_from_slice(b"** This is a LiteDB file **");
    buf[52] = 7;
    buf[59..63].copy_from_slice(&1u32.to_le_bytes());

    // Data pages
    let mut current_page = 1;
    let mut page_pos = 32;
    buf[current_page * page_size + 4] = 0x04;

    for doc in docs {
        if page_pos + doc.len() > page_size {
            current_page += 1;
            page_pos = 32;
            buf[current_page * page_size + 4] = 0x04;
        }
        let dest = current_page * page_size + page_pos;
        buf[dest..dest + doc.len()].copy_from_slice(&doc);
        page_pos += doc.len() + 16;
    }

    buf
}

/// Helper to build synthetic ZIP archives on disk
struct SyntheticBackupBuilder {
    games: Vec<SyntheticGame>,
    files: Vec<(String, Vec<u8>)>,
    corrupt_litedb: bool,
    skip_games_db: bool,
}

impl SyntheticBackupBuilder {
    fn new() -> Self {
        Self {
            games: Vec::new(),
            files: Vec::new(),
            corrupt_litedb: false,
            skip_games_db: false,
        }
    }

    fn add_game(mut self, game: SyntheticGame) -> Self {
        self.games.push(game);
        self
    }

    fn add_file(mut self, path: &str, content: &[u8]) -> Self {
        self.files.push((path.to_string(), content.to_vec()));
        self
    }

    fn with_corrupt_games_db(mut self) -> Self {
        self.corrupt_litedb = true;
        self
    }

    fn without_games_db(mut self) -> Self {
        self.skip_games_db = true;
        self
    }

    fn write_to_file(&self, path: &Path) {
        let file = File::create(path).expect("failed to create zip file");
        let mut zip = ZipWriter::new(file);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        if !self.skip_games_db {
            zip.start_file("library/games.db", opts).expect("failed to start library/games.db");
            if self.corrupt_litedb {
                zip.write_all(b"NOT_A_VALID_LITEDB_MAGIC_HEADER_GARBAGE_BYTES_12345")
                    .expect("failed to write corrupt db");
            } else {
                let buf = build_litedb_buffer(&self.games);
                zip.write_all(&buf).expect("failed to write games.db");
            }
        }

        for (rel_path, content) in &self.files {
            zip.start_file(rel_path, opts).expect("failed to start extra file");
            zip.write_all(content).expect("failed to write extra file");
        }

        zip.finish().expect("failed to finish zip");
    }
}

// ============================================================================
// Database Record & Test Environment Helpers
// ============================================================================

#[allow(dead_code)]
struct TestGameRecord {
    id: String,
    library_id: String,
    external_id: String,
    title: String,
    playtime_seconds: u64,
    play_count: i32,
    is_favorite: i32,
    last_activity: Option<String>,
    cover_image_path: Option<String>,
    background_image_path: Option<String>,
    completion_status: Option<String>,
}

fn create_test_db() -> Database {
    let db = Database::new_in_memory().expect("failed to create in-memory db");
    db.migrate().expect("failed to migrate db");
    db
}

fn seed_game(
    db: &Database,
    id: Uuid,
    library_id: &str,
    external_id: &str,
    title: &str,
    playtime_seconds: u64,
    play_count: i32,
    is_favorite: i32,
    last_activity: Option<&str>,
    cover: Option<&str>,
    bg: Option<&str>,
    completion: Option<&str>,
) {
    let now = chrono::Utc::now().to_rfc3339();
    let conn = db.writer();
    conn.execute(
        "INSERT INTO games (
            id, library_id, external_id, title, sorting_title,
            playtime_seconds, play_count, is_favorite, last_activity,
            cover_image_path, background_image_path, completion_status,
            added_timestamp, modified_timestamp
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14);",
        rusqlite::params![
            id.to_string(),
            library_id,
            external_id,
            title,
            title.to_lowercase(),
            playtime_seconds as i64,
            play_count,
            is_favorite,
            last_activity,
            cover,
            bg,
            completion.unwrap_or("NotPlayed"),
            now,
            now,
        ],
    ).expect("failed to seed game");
}

fn fetch_game(db: &Database, id: Uuid) -> TestGameRecord {
    let conn = db.reader();
    conn.query_row(
        "SELECT id, library_id, external_id, title, playtime_seconds, play_count, is_favorite, last_activity, cover_image_path, background_image_path, completion_status FROM games WHERE id = ?1;",
        rusqlite::params![id.to_string()],
        |row| {
            Ok(TestGameRecord {
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
        },
    ).expect("game record not found")
}

struct TempTestEnv {
    path: PathBuf,
}

impl TempTestEnv {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("omnis_playnite_test_{}", Uuid::new_v4()));
        fs::create_dir_all(&path).expect("failed to create temp dir");
        Self { path }
    }

    fn file_path(&self, name: &str) -> PathBuf {
        self.path.join(name)
    }

    fn cache_dir(&self) -> PathBuf {
        self.path.join("image_cache")
    }
}

impl Drop for TempTestEnv {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn find_real_backup_path() -> Option<PathBuf> {
    let candidates = [
        PathBuf::from("PlayniteBackup-2026-10-24-10-43-43.zip"),
        PathBuf::from("../../PlayniteBackup-2026-10-24-10-43-43.zip"),
        PathBuf::from("/mnt/d/progetti/omnis/omnis/PlayniteBackup-2026-10-24-10-43-43.zip"),
    ];
    for p in &candidates {
        if p.exists() {
            return Some(p.clone());
        }
    }
    None
}

// ============================================================================
// Requirement 1: inspect_playnite_backup Validation
// ============================================================================

#[test]
fn test_inspect_playnite_backup_accurate_counts_and_metrics() {
    let env = TempTestEnv::new();
    let zip_path = env.file_path("test_inspection.zip");
    let db = create_test_db();

    let id_g1 = Uuid::new_v4();
    let id_g2 = Uuid::new_v4();
    let id_g3 = Uuid::new_v4();
    let id_g4 = Uuid::new_v4();

    // Omnis games:
    // Game 1: Steam App 101, playtime 100, no cover, no background
    seed_game(&db, id_g1, stores::STEAM, "101", "Game One", 100, 2, 0, None, None, None, None);
    // Game 2: Steam App 102, playtime 800, has cover, no background
    seed_game(&db, id_g2, stores::STEAM, "102", "Game Two", 800, 5, 1, None, Some("/omnis/cov2.jpg"), None, None);
    // Game 3: GOG 201, playtime 500, has cover, has background
    seed_game(&db, id_g3, stores::GOG, "201", "Game Three", 500, 3, 0, None, Some("/omnis/cov3.jpg"), Some("/omnis/bg3.jpg"), None);
    // Game 4: Manual "Custom RPG", playtime 0, no cover, no background
    seed_game(&db, id_g4, stores::MANUAL, "manual:custom-rpg", "Custom RPG", 0, 0, 0, None, None, None, None);

    // Backup games:
    // Game 1 (Steam 101): Playtime 600 (>100 -> update), cover in zip, bg in zip
    // Game 2 (Steam 102): Playtime 300 (<800 -> NO update), cover in zip, bg in zip
    // Game 3 (GOG 201): Playtime 500 (==500 -> NO update), cover in zip, bg in zip
    // Game 4 (Manual "Custom RPG"): Playtime 120 (>0 -> update), cover in zip, NO bg
    // Game 5 (Epic 301): UNCATALOGUED. Playtime 2000, cover and bg in zip.
    // Game 6 (Xbox 401): UNCATALOGUED. Playtime 100.
    SyntheticBackupBuilder::new()
        .add_game(
            SyntheticGame::new("Game One")
                .with_game_id("101")
                .with_plugin_id(steam_guid())
                .with_playtime(600)
                .with_cover("files/g1_cov.jpg")
                .with_background("files/g1_bg.jpg"),
        )
        .add_game(
            SyntheticGame::new("Game Two")
                .with_game_id("102")
                .with_plugin_id(steam_guid())
                .with_playtime(300)
                .with_cover("files/g2_cov.jpg")
                .with_background("files/g2_bg.jpg"),
        )
        .add_game(
            SyntheticGame::new("Game Three")
                .with_game_id("201")
                .with_plugin_id(gog_guid())
                .with_playtime(500)
                .with_cover("files/g3_cov.jpg")
                .with_background("files/g3_bg.jpg"),
        )
        .add_game(
            SyntheticGame::new("Custom RPG")
                .with_plugin_id(manual_guid())
                .with_playtime(120)
                .with_cover("files/g4_cov.jpg"),
        )
        .add_game(
            SyntheticGame::new("Uncatalogued Epic Game")
                .with_game_id("301")
                .with_plugin_id(epic_guid())
                .with_playtime(2000)
                .with_cover("files/g5_cov.jpg")
                .with_background("files/g5_bg.jpg"),
        )
        .add_game(
            SyntheticGame::new("Uncatalogued Xbox Game")
                .with_game_id("401")
                .with_plugin_id(xbox_guid())
                .with_playtime(100),
        )
        .add_file("libraryfiles/files/g1_cov.jpg", b"COVER_1")
        .add_file("libraryfiles/files/g1_bg.jpg", b"BG_1")
        .add_file("libraryfiles/files/g2_cov.jpg", b"COVER_2")
        .add_file("libraryfiles/files/g2_bg.jpg", b"BG_2")
        .add_file("libraryfiles/files/g3_cov.jpg", b"COVER_3")
        .add_file("libraryfiles/files/g3_bg.jpg", b"BG_3")
        .add_file("libraryfiles/files/g4_cov.jpg", b"COVER_4")
        .add_file("libraryfiles/files/g5_cov.jpg", b"COVER_5")
        .add_file("libraryfiles/files/g5_bg.jpg", b"BG_5")
        .write_to_file(&zip_path);

    let inspection: PlayniteBackupInspection = inspect_playnite_backup(&zip_path, &db)
        .expect("Inspection failed");

    // Total games in backup: 6
    assert_eq!(inspection.total_games_in_backup, 6);
    // Matching games: 4 (G1, G2, G3, G4)
    assert_eq!(inspection.matching_games_in_library, 4);
    // Non-matching games: 2 (G5, G6)
    assert_eq!(inspection.non_matching_games, 2);
    // Playtime updates available: G1 (600 > 100), G4 (120 > 0) => 2
    assert_eq!(inspection.playtime_updates_available, 2);
    // Missing covers available: G1 (missing in DB, present in ZIP), G4 (missing in DB, present in ZIP).
    // G2 and G3 already have covers in DB => 2
    assert_eq!(inspection.missing_covers_available, 2);
    // Missing backgrounds available: G1 (missing in DB, present in ZIP), G2 (missing in DB, present in ZIP).
    // G3 already has bg in DB, G4 has no bg in ZIP => 2
    assert_eq!(inspection.missing_backgrounds_available, 2);

    // Verify sample matches structure
    assert_eq!(inspection.sample_matches.len(), 4);
    let sample_g1 = inspection.sample_matches.iter().find(|s| s.title == "Game One").unwrap();
    assert_eq!(sample_g1.library_id, stores::STEAM);
    assert_eq!(sample_g1.external_id, "101");
    assert_eq!(sample_g1.existing_playtime_seconds, 100);
    assert_eq!(sample_g1.backup_playtime_seconds, 600);
    assert!(sample_g1.has_playtime_update);
    assert!(sample_g1.cover_available);
    assert!(sample_g1.background_available);

    let sample_g2 = inspection.sample_matches.iter().find(|s| s.title == "Game Two").unwrap();
    assert_eq!(sample_g2.existing_playtime_seconds, 800);
    assert_eq!(sample_g2.backup_playtime_seconds, 300);
    assert!(!sample_g2.has_playtime_update);
    assert!(!sample_g2.cover_available, "Game Two already has cover in DB");
    assert!(sample_g2.background_available);
}

// ============================================================================
// Requirement 2: Strict Library-Only Matching & Filtering
// ============================================================================

#[test]
fn test_strict_library_only_never_inserts_uncatalogued_games() {
    let env = TempTestEnv::new();
    let zip_path = env.file_path("test_strict_filtering.zip");
    let cache_dir = env.cache_dir();
    let db = create_test_db();

    // Omnis library starts with exactly 2 games
    let id_a = Uuid::new_v4();
    let id_b = Uuid::new_v4();
    seed_game(&db, id_a, stores::STEAM, "steam_777", "Catalogued Steam Game", 300, 1, 0, None, None, None, None);
    seed_game(&db, id_b, stores::GOG, "gog_888", "Catalogued GOG Game", 500, 2, 0, None, None, None, None);

    let initial_games = db.get_all_games().unwrap();
    assert_eq!(initial_games.len(), 2, "Library must strictly start with 2 games");

    // Playnite backup contains 1 matching game and 5 uncatalogued items across different stores
    SyntheticBackupBuilder::new()
        .add_game(
            SyntheticGame::new("Catalogued Steam Game")
                .with_game_id("steam_777")
                .with_plugin_id(steam_guid())
                .with_playtime(1200),
        )
        .add_game(
            SyntheticGame::new("Uncatalogued Epic Game")
                .with_game_id("epic_999")
                .with_plugin_id(epic_guid())
                .with_playtime(5000),
        )
        .add_game(
            SyntheticGame::new("Uncatalogued Xbox Game")
                .with_game_id("xbox_111")
                .with_plugin_id(xbox_guid())
                .with_playtime(2500),
        )
        .add_game(
            SyntheticGame::new("Uncatalogued Origin Game")
                .with_game_id("origin_222")
                .with_plugin_id(origin_guid())
                .with_playtime(3500),
        )
        .add_game(
            SyntheticGame::new("Uncatalogued Amazon Game")
                .with_game_id("amazon_333")
                .with_plugin_id(amazon_guid())
                .with_playtime(4500),
        )
        .add_game(
            SyntheticGame::new("Uncatalogued Manual Homebrew")
                .with_game_id("manual:homebrew")
                .with_plugin_id(manual_guid())
                .with_playtime(100),
        )
        .write_to_file(&zip_path);

    let options = PlayniteBackupImportOptions {
        image_cache_dir: Some(cache_dir),
        import_images: true,
        update_playtime: true,
        dry_run: false,
    };

    let mut progress_count = 0;
    let stats = execute_playnite_backup_import(&zip_path, &db, &options, |curr, total, _| {
        progress_count = curr;
        assert!(curr <= total);
    }).expect("Import execution failed");

    // Verify stats
    assert_eq!(stats.total_read, 6);
    assert_eq!(stats.games_merged, 1);
    assert_eq!(stats.games_created, 0, "Import MUST NEVER create new game records");
    assert_eq!(stats.playtime_updated, 1);
    assert_eq!(progress_count, 6);

    // CRUCIAL: Database total game count MUST NOT INCREASE!
    let games_after = db.get_all_games().unwrap();
    assert_eq!(
        games_after.len(),
        2,
        "Omnis games count must remain strictly 2, uncatalogued games must never be inserted"
    );

    // Explicitly verify each uncatalogued game does not exist in SQLite
    {
        let conn = db.reader();
        for uncatalogued_id in &["epic_999", "xbox_111", "origin_222", "amazon_333", "manual:homebrew"] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM games WHERE external_id = ?1;",
                    rusqlite::params![uncatalogued_id],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(count, 0, "External ID {} was illegally inserted into games table!", uncatalogued_id);
        }
    }

    // Verify matched game was indeed updated
    let rec_a = fetch_game(&db, id_a);
    assert_eq!(rec_a.playtime_seconds, 1200);

    // Verify unmatched game B was untouched
    let rec_b = fetch_game(&db, id_b);
    assert_eq!(rec_b.playtime_seconds, 500);
}

// ============================================================================
// Requirement 3: Non-Destructive Merging Semantics
// ============================================================================

#[test]
fn test_non_destructive_playtime_merge() {
    let env = TempTestEnv::new();
    let zip_path = env.file_path("test_playtime.zip");
    let db = create_test_db();

    let id_higher = Uuid::new_v4();
    let id_lower = Uuid::new_v4();
    let id_equal = Uuid::new_v4();
    let id_none = Uuid::new_v4();

    // Existing records:
    // Higher in backup: 1000s in DB -> 4000s in backup (should update to 4000)
    seed_game(&db, id_higher, stores::STEAM, "p_1", "Higher In Backup", 1000, 1, 0, None, None, None, None);
    // Lower in backup: 5000s in DB -> 2000s in backup (should preserve 5000)
    seed_game(&db, id_lower, stores::STEAM, "p_2", "Lower In Backup", 5000, 1, 0, None, None, None, None);
    // Equal in backup: 3000s in DB -> 3000s in backup (should preserve 3000)
    seed_game(&db, id_equal, stores::STEAM, "p_3", "Equal In Backup", 3000, 1, 0, None, None, None, None);
    // None in backup: 2500s in DB -> None in backup (should preserve 2500)
    seed_game(&db, id_none, stores::STEAM, "p_4", "None In Backup", 2500, 1, 0, None, None, None, None);

    SyntheticBackupBuilder::new()
        .add_game(SyntheticGame::new("Higher In Backup").with_game_id("p_1").with_plugin_id(steam_guid()).with_playtime(4000))
        .add_game(SyntheticGame::new("Lower In Backup").with_game_id("p_2").with_plugin_id(steam_guid()).with_playtime(2000))
        .add_game(SyntheticGame::new("Equal In Backup").with_game_id("p_3").with_plugin_id(steam_guid()).with_playtime(3000))
        .add_game(SyntheticGame::new("None In Backup").with_game_id("p_4").with_plugin_id(steam_guid()))
        .write_to_file(&zip_path);

    let options = PlayniteBackupImportOptions {
        image_cache_dir: None,
        import_images: false,
        update_playtime: true,
        dry_run: false,
    };

    let stats = execute_playnite_backup_import(&zip_path, &db, &options, |_, _, _| {}).unwrap();
    assert_eq!(stats.playtime_updated, 1);

    assert_eq!(fetch_game(&db, id_higher).playtime_seconds, 4000, "Higher playtime must be updated");
    assert_eq!(fetch_game(&db, id_lower).playtime_seconds, 5000, "Lower playtime must be preserved");
    assert_eq!(fetch_game(&db, id_equal).playtime_seconds, 3000, "Equal playtime must be preserved");
    assert_eq!(fetch_game(&db, id_none).playtime_seconds, 2500, "Existing playtime must be preserved when backup is None");

    // Test with update_playtime = false
    let id_opt_off = Uuid::new_v4();
    seed_game(&db, id_opt_off, stores::STEAM, "p_off", "Opt Off", 500, 1, 0, None, None, None, None);

    let zip_opt = env.file_path("test_opt_off.zip");
    SyntheticBackupBuilder::new()
        .add_game(SyntheticGame::new("Opt Off").with_game_id("p_off").with_plugin_id(steam_guid()).with_playtime(9999))
        .write_to_file(&zip_opt);

    let options_disabled = PlayniteBackupImportOptions {
        image_cache_dir: None,
        import_images: false,
        update_playtime: false,
        dry_run: false,
    };
    let stats_dis = execute_playnite_backup_import(&zip_opt, &db, &options_disabled, |_, _, _| {}).unwrap();
    assert_eq!(stats_dis.playtime_updated, 0);
    assert_eq!(fetch_game(&db, id_opt_off).playtime_seconds, 500, "Playtime must not update when update_playtime is false");
}

#[test]
fn test_non_destructive_play_count_merge() {
    let env = TempTestEnv::new();
    let zip_path = env.file_path("test_play_count.zip");
    let db = create_test_db();

    let id_1 = Uuid::new_v4();
    let id_2 = Uuid::new_v4();
    let id_3 = Uuid::new_v4();

    // Case 1: DB=5, Backup=20 -> max is 20
    seed_game(&db, id_1, stores::STEAM, "pc_1", "PC One", 0, 5, 0, None, None, None, None);
    // Case 2: DB=35, Backup=10 -> max is 35 (preserved!)
    seed_game(&db, id_2, stores::STEAM, "pc_2", "PC Two", 0, 35, 0, None, None, None, None);
    // Case 3: DB=15, Backup=None -> preserved 15
    seed_game(&db, id_3, stores::STEAM, "pc_3", "PC Three", 0, 15, 0, None, None, None, None);

    SyntheticBackupBuilder::new()
        .add_game(SyntheticGame::new("PC One").with_game_id("pc_1").with_plugin_id(steam_guid()).with_play_count(20))
        .add_game(SyntheticGame::new("PC Two").with_game_id("pc_2").with_plugin_id(steam_guid()).with_play_count(10))
        .add_game(SyntheticGame::new("PC Three").with_game_id("pc_3").with_plugin_id(steam_guid()))
        .write_to_file(&zip_path);

    let options = PlayniteBackupImportOptions::default();
    execute_playnite_backup_import(&zip_path, &db, &options, |_, _, _| {}).unwrap();

    assert_eq!(fetch_game(&db, id_1).play_count, 20, "Play count should take max(5, 20)");
    assert_eq!(fetch_game(&db, id_2).play_count, 35, "Play count should preserve max(35, 10)");
    assert_eq!(fetch_game(&db, id_3).play_count, 15, "Play count should preserve existing if backup is None");
}

#[test]
fn test_non_destructive_favorite_merge() {
    let env = TempTestEnv::new();
    let zip_path = env.file_path("test_favorite.zip");
    let db = create_test_db();

    let id_fav_promoted = Uuid::new_v4();
    let id_fav_preserved = Uuid::new_v4();
    let id_fav_remains_one = Uuid::new_v4();
    let id_fav_remains_zero = Uuid::new_v4();

    // 1. Existing=0, Backup=true -> becomes 1
    seed_game(&db, id_fav_promoted, stores::STEAM, "fav_1", "Fav 1", 0, 0, 0, None, None, None, None);
    // 2. Existing=1, Backup=false -> stays 1 (never reset to 0!)
    seed_game(&db, id_fav_preserved, stores::STEAM, "fav_2", "Fav 2", 0, 0, 1, None, None, None, None);
    // 3. Existing=1, Backup=true -> remains 1
    seed_game(&db, id_fav_remains_one, stores::STEAM, "fav_3", "Fav 3", 0, 0, 1, None, None, None, None);
    // 4. Existing=0, Backup=false -> remains 0
    seed_game(&db, id_fav_remains_zero, stores::STEAM, "fav_4", "Fav 4", 0, 0, 0, None, None, None, None);

    SyntheticBackupBuilder::new()
        .add_game(SyntheticGame::new("Fav 1").with_game_id("fav_1").with_plugin_id(steam_guid()).with_favorite(true))
        .add_game(SyntheticGame::new("Fav 2").with_game_id("fav_2").with_plugin_id(steam_guid()).with_favorite(false))
        .add_game(SyntheticGame::new("Fav 3").with_game_id("fav_3").with_plugin_id(steam_guid()).with_favorite(true))
        .add_game(SyntheticGame::new("Fav 4").with_game_id("fav_4").with_plugin_id(steam_guid()).with_favorite(false))
        .write_to_file(&zip_path);

    execute_playnite_backup_import(&zip_path, &db, &PlayniteBackupImportOptions::default(), |_, _, _| {}).unwrap();

    assert_eq!(fetch_game(&db, id_fav_promoted).is_favorite, 1, "Favorite should be promoted to 1");
    assert_eq!(fetch_game(&db, id_fav_preserved).is_favorite, 1, "Favorite must never be demoted from 1 to 0");
    assert_eq!(fetch_game(&db, id_fav_remains_one).is_favorite, 1, "Favorite remains 1");
    assert_eq!(fetch_game(&db, id_fav_remains_zero).is_favorite, 0, "Favorite remains 0");
}

#[test]
fn test_non_destructive_last_activity_and_completion_status_merge() {
    let env = TempTestEnv::new();
    let zip_path = env.file_path("test_activity.zip");
    let db = create_test_db();

    let id_newer = Uuid::new_v4();
    let id_older = Uuid::new_v4();
    let id_db_none = Uuid::new_v4();
    let id_backup_none = Uuid::new_v4();
    let id_comp_update = Uuid::new_v4();
    let id_comp_preserve = Uuid::new_v4();

    // Newer in backup:
    seed_game(&db, id_newer, stores::STEAM, "act_1", "Act 1", 0, 0, 0, Some("2026-01-01T00:00:00Z"), None, None, None);
    // Older in backup:
    seed_game(&db, id_older, stores::STEAM, "act_2", "Act 2", 0, 0, 0, Some("2026-06-01T00:00:00Z"), None, None, None);
    // DB is None, backup has value:
    seed_game(&db, id_db_none, stores::STEAM, "act_3", "Act 3", 0, 0, 0, None, None, None, None);
    // Backup is None, DB has value:
    seed_game(&db, id_backup_none, stores::STEAM, "act_4", "Act 4", 0, 0, 0, Some("2026-03-01T00:00:00Z"), None, None, None);
    // Completion update:
    seed_game(&db, id_comp_update, stores::STEAM, "act_5", "Act 5", 0, 0, 0, None, None, None, Some("NotPlayed"));
    // Completion preserve:
    seed_game(&db, id_comp_preserve, stores::STEAM, "act_6", "Act 6", 0, 0, 0, None, None, None, Some("Playing"));

    SyntheticBackupBuilder::new()
        .add_game(SyntheticGame::new("Act 1").with_game_id("act_1").with_plugin_id(steam_guid()).with_last_activity("2026-09-01T00:00:00Z"))
        .add_game(SyntheticGame::new("Act 2").with_game_id("act_2").with_plugin_id(steam_guid()).with_last_activity("2025-01-01T00:00:00Z"))
        .add_game(SyntheticGame::new("Act 3").with_game_id("act_3").with_plugin_id(steam_guid()).with_last_activity("2026-05-01T00:00:00Z"))
        .add_game(SyntheticGame::new("Act 4").with_game_id("act_4").with_plugin_id(steam_guid()))
        .add_game(SyntheticGame::new("Act 5").with_game_id("act_5").with_plugin_id(steam_guid()).with_completion("Completed"))
        .add_game(SyntheticGame::new("Act 6").with_game_id("act_6").with_plugin_id(steam_guid()))
        .write_to_file(&zip_path);

    execute_playnite_backup_import(&zip_path, &db, &PlayniteBackupImportOptions::default(), |_, _, _| {}).unwrap();

    assert_eq!(fetch_game(&db, id_newer).last_activity.as_deref(), Some("2026-09-01T00:00:00Z"), "Newer activity should overwrite");
    assert_eq!(fetch_game(&db, id_older).last_activity.as_deref(), Some("2026-06-01T00:00:00Z"), "Older backup activity must NOT overwrite newer");
    assert_eq!(fetch_game(&db, id_db_none).last_activity.as_deref(), Some("2026-05-01T00:00:00Z"), "None activity should take backup value");
    assert_eq!(fetch_game(&db, id_backup_none).last_activity.as_deref(), Some("2026-03-01T00:00:00Z"), "Existing activity preserved when backup is None");
    assert_eq!(fetch_game(&db, id_comp_update).completion_status.as_deref(), Some("Completed"), "Completion should be updated");
    assert_eq!(fetch_game(&db, id_comp_preserve).completion_status.as_deref(), Some("Playing"), "Completion preserved when backup has None");
}

#[test]
fn test_tags_and_categories_synced_on_merge() {
    let env = TempTestEnv::new();
    let zip_path = env.file_path("test_tags.zip");
    let db = create_test_db();

    let id = Uuid::new_v4();
    seed_game(&db, id, stores::STEAM, "tag_game", "Tag Game", 0, 0, 0, None, None, None, None);

    SyntheticBackupBuilder::new()
        .add_game(
            SyntheticGame::new("Tag Game")
                .with_game_id("tag_game")
                .with_plugin_id(steam_guid())
                .with_tags(vec!["Cyberpunk", "Atmospheric"])
                .with_categories(vec!["Favorites2026"]),
        )
        .write_to_file(&zip_path);

    let stats = execute_playnite_backup_import(&zip_path, &db, &PlayniteBackupImportOptions::default(), |_, _, _| {}).unwrap();
    assert_eq!(stats.tags_added, 2);
    assert_eq!(stats.categories_added, 1);

    // Verify relations in sqlite
    let conn = db.reader();
    let tag_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM game_tags WHERE game_id = ?1;",
        rusqlite::params![id.to_string()],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(tag_count, 2);

    let cat_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM game_categories WHERE game_id = ?1;",
        rusqlite::params![id.to_string()],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(cat_count, 1);
}

// ============================================================================
// Requirement 4: Image Extraction and Non-Destructive Preservation
// ============================================================================

#[test]
fn test_image_extraction_to_cache_and_preservation_of_existing() {
    let env = TempTestEnv::new();
    let zip_path = env.file_path("test_images.zip");
    let cache_dir = env.cache_dir();
    let db = create_test_db();

    let id_missing = Uuid::new_v4();
    let id_existing = Uuid::new_v4();

    // Game 1: Missing cover and background in DB
    seed_game(&db, id_missing, stores::STEAM, "img_1", "Game Missing Images", 0, 0, 0, None, None, None, None);
    // Game 2: Already has cover and background set in DB
    seed_game(
        &db,
        id_existing,
        stores::STEAM,
        "img_2",
        "Game Existing Images",
        0,
        0,
        0,
        None,
        Some("/my/custom/existing_cover.png"),
        Some("/my/custom/existing_bg.png"),
        None,
    );

    SyntheticBackupBuilder::new()
        .add_game(
            SyntheticGame::new("Game Missing Images")
                .with_game_id("img_1")
                .with_plugin_id(steam_guid())
                .with_cover("sub/img1_cov.jpg")
                .with_background("sub/img1_bg.jpg"),
        )
        .add_game(
            SyntheticGame::new("Game Existing Images")
                .with_game_id("img_2")
                .with_plugin_id(steam_guid())
                .with_cover("sub/img2_cov.jpg")
                .with_background("sub/img2_bg.jpg"),
        )
        .add_file("libraryfiles/sub/img1_cov.jpg", b"BINARY_IMAGE_DATA_COVER_1")
        .add_file("libraryfiles/sub/img1_bg.jpg", b"BINARY_IMAGE_DATA_BG_1")
        .add_file("libraryfiles/sub/img2_cov.jpg", b"BINARY_IMAGE_DATA_COVER_2")
        .add_file("libraryfiles/sub/img2_bg.jpg", b"BINARY_IMAGE_DATA_BG_2")
        .write_to_file(&zip_path);

    let options = PlayniteBackupImportOptions {
        image_cache_dir: Some(cache_dir.clone()),
        import_images: true,
        update_playtime: true,
        dry_run: false,
    };

    let stats = execute_playnite_backup_import(&zip_path, &db, &options, |_, _, _| {}).unwrap();
    // Only missing images should be cached (1 cover + 1 background = 2)
    assert_eq!(stats.images_cached, 2);

    // 1. Missing game images must be extracted
    let rec_missing = fetch_game(&db, id_missing);
    assert!(rec_missing.cover_image_path.is_some(), "Cover must be extracted");
    assert!(rec_missing.background_image_path.is_some(), "Background must be extracted");

    let extracted_cov = rec_missing.cover_image_path.unwrap();
    let extracted_bg = rec_missing.background_image_path.unwrap();

    assert!(Path::new(&extracted_cov).exists(), "Extracted cover file must exist on disk");
    assert!(Path::new(&extracted_bg).exists(), "Extracted bg file must exist on disk");

    assert_eq!(fs::read(&extracted_cov).unwrap(), b"BINARY_IMAGE_DATA_COVER_1");
    assert_eq!(fs::read(&extracted_bg).unwrap(), b"BINARY_IMAGE_DATA_BG_1");

    // 2. Existing game images must NEVER be overwritten
    let rec_existing = fetch_game(&db, id_existing);
    assert_eq!(
        rec_existing.cover_image_path.as_deref(),
        Some("/my/custom/existing_cover.png"),
        "Existing cover must be preserved"
    );
    assert_eq!(
        rec_existing.background_image_path.as_deref(),
        Some("/my/custom/existing_bg.png"),
        "Existing background must be preserved"
    );

    // Verify cache directory does NOT contain extracted files for game 2
    let unexpected_cov = cache_dir.join(format!("{}_cover.jpg", id_existing));
    let unexpected_bg = cache_dir.join(format!("{}_bg.jpg", id_existing));
    assert!(!unexpected_cov.exists(), "Cache file for existing cover must not be created");
    assert!(!unexpected_bg.exists(), "Cache file for existing bg must not be created");
}

#[test]
fn test_image_import_options_and_dry_run() {
    let env = TempTestEnv::new();
    let zip_path = env.file_path("test_images_toggle.zip");
    let cache_dir = env.cache_dir();
    let db = create_test_db();

    let id = Uuid::new_v4();
    seed_game(&db, id, stores::STEAM, "img_toggle", "Toggle Game", 100, 1, 0, None, None, None, None);

    SyntheticBackupBuilder::new()
        .add_game(
            SyntheticGame::new("Toggle Game")
                .with_game_id("img_toggle")
                .with_plugin_id(steam_guid())
                .with_playtime(500)
                .with_cover("sub/toggle_cov.jpg"),
        )
        .add_file("libraryfiles/sub/toggle_cov.jpg", b"IMAGE_BYTES")
        .write_to_file(&zip_path);

    // Dry Run Test
    let dry_options = PlayniteBackupImportOptions {
        image_cache_dir: Some(cache_dir.clone()),
        import_images: true,
        update_playtime: true,
        dry_run: true,
    };
    let dry_stats = execute_playnite_backup_import(&zip_path, &db, &dry_options, |_, _, _| {}).unwrap();
    assert_eq!(dry_stats.games_merged, 1);
    assert_eq!(dry_stats.images_cached, 1);
    assert_eq!(dry_stats.playtime_updated, 1);

    // Verify DB was NOT mutated by dry run
    let rec_dry = fetch_game(&db, id);
    assert_eq!(rec_dry.playtime_seconds, 100);
    assert!(rec_dry.cover_image_path.is_none());
    assert!(!cache_dir.exists(), "Cache directory should not be created in dry run");

    // Test import_images = false
    let no_img_options = PlayniteBackupImportOptions {
        image_cache_dir: Some(cache_dir.clone()),
        import_images: false,
        update_playtime: true,
        dry_run: false,
    };
    let live_stats = execute_playnite_backup_import(&zip_path, &db, &no_img_options, |_, _, _| {}).unwrap();
    assert_eq!(live_stats.images_cached, 0);
    assert_eq!(live_stats.playtime_updated, 1);

    let rec_live = fetch_game(&db, id);
    assert_eq!(rec_live.playtime_seconds, 500, "Playtime should update");
    assert!(rec_live.cover_image_path.is_none(), "Cover must not be imported when import_images is false");
}

// ============================================================================
// Manual Games Matching Fallback & Store Game Isolation
// ============================================================================

#[test]
fn test_manual_game_fallback_matching_by_title_and_store_isolation() {
    let env = TempTestEnv::new();
    let zip_path = env.file_path("test_matching.zip");
    let db = create_test_db();

    let id_manual = Uuid::new_v4();
    let id_steam = Uuid::new_v4();

    // 1. Manual game: matched by title collation
    seed_game(&db, id_manual, stores::MANUAL, "manual:custom-adventure", "Custom Adventure", 50, 1, 0, None, None, None, None);
    // 2. Steam game with same title as in backup, but DIFFERENT external_id
    seed_game(&db, id_steam, stores::STEAM, "steam_real_id", "Same Name Game", 100, 1, 0, None, None, None, None);

    SyntheticBackupBuilder::new()
        // Manual game with case difference: "  custom ADVENTURE  " and no GameId
        .add_game(
            SyntheticGame::new("  custom ADVENTURE  ")
                .with_plugin_id(manual_guid())
                .with_playtime(400),
        )
        // Store game with different GameId: must NOT match id_steam by title
        .add_game(
            SyntheticGame::new("Same Name Game")
                .with_game_id("steam_different_id")
                .with_plugin_id(steam_guid())
                .with_playtime(900),
        )
        .write_to_file(&zip_path);

    let inspection = inspect_playnite_backup(&zip_path, &db).unwrap();
    // Only the manual game matches; the Steam game with different external_id must NOT match by title
    assert_eq!(inspection.matching_games_in_library, 1);
    assert_eq!(inspection.non_matching_games, 1);

    let stats = execute_playnite_backup_import(&zip_path, &db, &PlayniteBackupImportOptions::default(), |_, _, _| {}).unwrap();
    assert_eq!(stats.games_merged, 1);
    assert_eq!(stats.playtime_updated, 1);

    // Manual game was updated via normalized title match
    assert_eq!(fetch_game(&db, id_manual).playtime_seconds, 400);

    // Steam game was NOT touched because external_id differed
    assert_eq!(fetch_game(&db, id_steam).playtime_seconds, 100);
}

// ============================================================================
// Requirement 6: Edge Cases & Error Handling
// ============================================================================

#[test]
fn test_edge_cases_error_handling() {
    let env = TempTestEnv::new();
    let db = create_test_db();

    // 1. Non-existent file path returns Err
    let non_existent = env.file_path("does_not_exist.zip");
    assert!(inspect_playnite_backup(&non_existent, &db).is_err());
    assert!(execute_playnite_backup_import(&non_existent, &db, &PlayniteBackupImportOptions::default(), |_, _, _| {}).is_err());

    // 2. Invalid or non-ZIP file returns Err
    let corrupt_file = env.file_path("not_a_zip.zip");
    fs::write(&corrupt_file, b"This is just a plain text file, definitely not a ZIP file!").unwrap();
    assert!(inspect_playnite_backup(&corrupt_file, &db).is_err());
    assert!(execute_playnite_backup_import(&corrupt_file, &db, &PlayniteBackupImportOptions::default(), |_, _, _| {}).is_err());

    // 3. ZIP without library/games.db returns Err
    let no_db_zip = env.file_path("no_games_db.zip");
    SyntheticBackupBuilder::new()
        .without_games_db()
        .add_file("readme.txt", b"No games.db here")
        .write_to_file(&no_db_zip);

    let inspect_err = inspect_playnite_backup(&no_db_zip, &db);
    assert!(inspect_err.is_err());
    assert!(inspect_err.unwrap_err().to_string().contains("games.db"));

    let import_err = execute_playnite_backup_import(&no_db_zip, &db, &PlayniteBackupImportOptions::default(), |_, _, _| {});
    assert!(import_err.is_err());
    assert!(import_err.unwrap_err().to_string().contains("games.db"));

    // 4. ZIP with corrupt library/games.db (not valid LiteDB magic) returns Err
    let corrupt_db_zip = env.file_path("corrupt_games_db.zip");
    SyntheticBackupBuilder::new()
        .with_corrupt_games_db()
        .write_to_file(&corrupt_db_zip);

    assert!(inspect_playnite_backup(&corrupt_db_zip, &db).is_err());
    assert!(execute_playnite_backup_import(&corrupt_db_zip, &db, &PlayniteBackupImportOptions::default(), |_, _, _| {}).is_err());

    // 5. Completely empty ZIP file returns Err
    let empty_zip = env.file_path("empty.zip");
    {
        let file = File::create(&empty_zip).unwrap();
        let zip = ZipWriter::new(file);
        zip.finish().unwrap();
    }
    assert!(inspect_playnite_backup(&empty_zip, &db).is_err());
    assert!(execute_playnite_backup_import(&empty_zip, &db, &PlayniteBackupImportOptions::default(), |_, _, _| {}).is_err());
}

// ============================================================================
// Requirement 5: Real Backup Archive Integration
// ============================================================================

#[test]
fn test_real_backup_archive_integration() {
    let backup_path = match find_real_backup_path() {
        Some(p) => p,
        None => {
            eprintln!("Playnite backup archive not found in workspace, skipping real archive integration test");
            return;
        }
    };

    let env = TempTestEnv::new();
    let cache_dir = env.cache_dir();
    let db = create_test_db();

    // Pre-populate Omnis with 2 real games known to exist in PlayniteBackup-2026-10-24-10-43-43.zip:
    // 1. "Hyper Light Drifter" (Amazon store: 402674cd-4af6-4886-b6ec-0e695bfa0688, GameId: b515a0c1-b73d-4201-aae3-1ef8fb1faf5e)
    //    In backup: Cover & Background exist, Playtime is 0
    let id_hld = Uuid::new_v4();
    seed_game(
        &db,
        id_hld,
        "amazon",
        "b515a0c1-b73d-4201-aae3-1ef8fb1faf5e",
        "Hyper Light Drifter",
        0,
        0,
        0,
        None,
        None,
        None,
        None,
    );

    // 2. "First Descendant Final Technical Test" (Steam store, AppId: 2074930)
    //    In backup: Playtime is 1980 seconds
    let id_fd = Uuid::new_v4();
    seed_game(
        &db,
        id_fd,
        stores::STEAM,
        "2074930",
        "First Descendant Final Technical Test",
        60, // Set existing playtime lower (60s) to test playtime merge
        1,
        0,
        None,
        None,
        None,
        None,
    );

    // 3. Local unmatched game: must remain completely untouched and count must stay 3
    let id_unmatched = Uuid::new_v4();
    seed_game(
        &db,
        id_unmatched,
        stores::MANUAL,
        "manual:unmatched-local",
        "Unmatched Local Game",
        999,
        5,
        1,
        None,
        None,
        None,
        None,
    );

    // Verify initial count is exactly 3
    assert_eq!(db.get_all_games().unwrap().len(), 3);

    // 1. Measure inspection speed and correctness
    let start_inspect = Instant::now();
    let inspection = inspect_playnite_backup(&backup_path, &db).expect("Failed to inspect real backup archive");
    let elapsed_inspect = start_inspect.elapsed();
    println!("Real backup inspection took: {:?}", elapsed_inspect);

    // Check inspection results
    assert!(
        inspection.total_games_in_backup >= 2060 && inspection.total_games_in_backup <= 2070,
        "Expected ~2064 games in real backup, got {}",
        inspection.total_games_in_backup
    );
    assert_eq!(inspection.matching_games_in_library, 2, "Only HLD and First Descendant should match");
    assert_eq!(
        inspection.non_matching_games,
        inspection.total_games_in_backup - 2
    );
    assert_eq!(
        inspection.unmatched_in_library.len(),
        1,
        "Only Unmatched Local Game should be unmatched in library"
    );
    assert_eq!(
        inspection.unmatched_in_library[0].title,
        "Unmatched Local Game"
    );
    assert!(
        inspection.playtime_updates_available >= 1,
        "First Descendant (1980s > 60s) should offer playtime update"
    );
    assert!(
        inspection.missing_covers_available >= 1,
        "HLD should have cover image available from zip"
    );

    let hld_sample = inspection
        .sample_matches
        .iter()
        .find(|s| s.title == "Hyper Light Drifter")
        .expect("Hyper Light Drifter should be present in sample matches");
    assert_eq!(hld_sample.library_id, "amazon");
    assert_eq!(hld_sample.external_id, "b515a0c1-b73d-4201-aae3-1ef8fb1faf5e");
    assert!(hld_sample.cover_available, "HLD cover must be available in zip");

    // 2. Execute live import from the real archive
    let options = PlayniteBackupImportOptions {
        image_cache_dir: Some(cache_dir.clone()),
        import_images: true,
        update_playtime: true,
        dry_run: false,
    };

    let mut reported_progress_total = 0;
    let expected_total = inspection.total_games_in_backup;
    let stats = execute_playnite_backup_import(&backup_path, &db, &options, |curr, total, _name| {
        if curr == total {
            reported_progress_total = curr;
        }
    }).expect("Real archive import execution failed");

    // Verify import statistics
    assert_eq!(stats.total_read, expected_total);
    assert_eq!(stats.games_merged, 2);
    assert_eq!(stats.games_created, 0, "No new games should be created from real backup");
    assert!(stats.playtime_updated >= 1);
    assert!(stats.images_cached >= 1);
    assert_eq!(reported_progress_total, expected_total);

    // Verify DB count: strictly unchanged! 1580 uncatalogued items were NOT inserted!
    let games_after = db.get_all_games().unwrap();
    assert_eq!(
        games_after.len(),
        3,
        "Real archive must not insert uncatalogued games! Count must remain 3"
    );

    // Verify First Descendant playtime was updated to 1980
    let rec_fd = fetch_game(&db, id_fd);
    assert_eq!(rec_fd.playtime_seconds, 1980, "First Descendant playtime should update to 1980");

    // Verify Hyper Light Drifter cover was extracted to cache
    let rec_hld = fetch_game(&db, id_hld);
    assert!(rec_hld.cover_image_path.is_some(), "HLD cover must be extracted");
    let cover_file = PathBuf::from(rec_hld.cover_image_path.unwrap());
    assert!(cover_file.exists(), "Extracted HLD cover must exist on disk");
    assert!(fs::metadata(&cover_file).unwrap().len() > 1000, "HLD cover must be a valid non-empty file");

    // Verify unmatched local game was untouched
    let rec_unmatched = fetch_game(&db, id_unmatched);
    assert_eq!(rec_unmatched.playtime_seconds, 999);
    assert_eq!(rec_unmatched.is_favorite, 1);
}

#[test]
fn test_steam_library_match_with_user_data_if_available() {
    let backup_path = PathBuf::from("/mnt/d/progetti/omnis/omnis/PlayniteBackup-2026-10-24-10-43-43.zip");
    let db_path = PathBuf::from("/mnt/c/Users/rinal/AppData/Roaming/Omnis Game Library/library.db");
    if !backup_path.exists() || !db_path.exists() {
        return;
    }

    let db = Database::open(&db_path).expect("Failed to open user library.db");
    let inspection = inspect_playnite_backup(&backup_path, &db).expect("Inspection failed");

    // All 368 user Steam games should match properly (368 out of 369)
    assert!(
        inspection.matching_games_in_library >= 368,
        "Expected at least 368 matches, got {}",
        inspection.matching_games_in_library
    );
    assert!(inspection.total_games_in_backup >= 2060);
    assert_eq!(inspection.unmatched_in_library.len(), 1);
    assert_eq!(inspection.unmatched_in_library[0].title, "Ubisoft Connect Services");
}
