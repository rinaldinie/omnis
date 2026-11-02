use omnis_core::{
    create_backup, inspect_backup, restore_backup, rotate_backups, BackupOptions, Database,
};
use omnis_sdk::constants::storage;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

fn create_temp_test_dir(prefix: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("{}_{}", prefix, uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).expect("Failed to create temp test directory");
    dir
}

#[test]
fn test_backup_rotation() {
    let temp_dir = create_temp_test_dir("omnis_rotation_test");
    let hostname = "gaming-rig";

    // Create 5 synthetic backup files with staggered timestamps
    let file_names = vec![
        "omnis_backup_gaming-rig_20260101_100000.zip",
        "omnis_backup_gaming-rig_20260102_100000.zip",
        "omnis_backup_gaming-rig_20260103_100000.zip",
        "omnis_backup_gaming-rig_20260104_100000.zip",
        "omnis_backup_gaming-rig_20260105_100000.zip",
    ];

    for name in &file_names {
        let file_path = temp_dir.join(name);
        fs::write(&file_path, b"dummy backup data").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(15));
    }

    // Keep only last 2 backups
    let pruned = rotate_backups(&temp_dir, hostname, 2).expect("Rotation should succeed");
    assert_eq!(pruned, 3, "Should prune 3 older backups");

    let remaining: Vec<String> = fs::read_dir(&temp_dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();
    assert_eq!(remaining.len(), 2, "Exactly 2 backups should remain");

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_backup_and_restore_cycle_with_vacuum_and_security() {
    let app_dir = create_temp_test_dir("omnis_app_dir");
    let backup_dest_dir = create_temp_test_dir("omnis_dest_dir");

    let db_path = app_dir.join(storage::DATABASE_FILE);
    let db = Database::open(&db_path).expect("Failed to create test database");

    // 1. Insert test games into database
    {
        let conn = db.writer();
        conn.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, added_timestamp, modified_timestamp)
             VALUES ('game_1', 'steam', '101', 'Hollow Knight', 'Hollow Knight', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, added_timestamp, modified_timestamp)
             VALUES ('game_2', 'gog', '202', 'The Witcher 3', 'Witcher 3', '2026-01-02', '2026-01-02')",
            [],
        ).unwrap();
    }

    // 2. CRITICAL: Insert a secret token (OAuth session token) into the database
    db.store_secret(
        "steam_oauth_token",
        b"test_nonce_123",
        b"super_secret_oauth_token_bytes",
    )
    .expect("Failed to store test secret");

    assert!(
        db.get_secret("steam_oauth_token").unwrap().is_some(),
        "Secret should exist in local active database"
    );

    // 3. Create settings.json, custom theme, and artwork
    let settings_path = app_dir.join("settings.json");
    fs::write(&settings_path, r#"{"minimize_to_tray":true,"locale":"it"}"#).unwrap();

    let theme_dir = app_dir.join(storage::THEMES_DIR).join("cyberpunk");
    fs::create_dir_all(&theme_dir).unwrap();
    fs::write(
        theme_dir.join("theme.json"),
        r#"{"name":"Cyberpunk Theme"}"#,
    )
    .unwrap();

    let covers_dir = app_dir.join(storage::CACHE_DIR).join(storage::COVERS_DIR);
    fs::create_dir_all(&covers_dir).unwrap();
    fs::write(covers_dir.join("game_1.jpg"), b"fake_jpeg_image_bytes").unwrap();

    // 4. Execute create_backup with artwork
    let backup_options = BackupOptions {
        destination_dir: backup_dest_dir.clone(),
        include_artwork: true,
        keep_last: Some(5),
    };

    let backup_result =
        create_backup(&db, &app_dir, &backup_options).expect("create_backup should succeed");

    assert!(backup_result.backup_path.is_file());
    assert_eq!(
        backup_result
            .backup_path
            .extension()
            .and_then(|e| e.to_str()),
        Some("zip"),
        "Backup file must have .zip extension"
    );
    assert_eq!(backup_result.total_games, 2);
    assert!(backup_result.artwork_included);

    // 5. Inspect backup without mutating database
    let inspection =
        inspect_backup(&backup_result.backup_path).expect("inspect_backup should succeed");
    assert_eq!(inspection.manifest.total_games, 2);
    assert!(inspection.has_database);
    assert!(inspection.has_settings);
    assert!(inspection.has_artwork);
    assert!(inspection.custom_themes_count >= 1);

    // 6. VERIFY ZERO CREDENTIAL LEAKAGE in the generated backup
    {
        let file = File::open(&backup_result.backup_path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut db_entry = archive.by_name("database.db").unwrap();
        let temp_check_db = create_temp_test_dir("omnis_check_db").join("check.db");
        let mut out = File::create(&temp_check_db).unwrap();
        std::io::copy(&mut db_entry, &mut out).unwrap();
        drop(out);

        let check_conn = rusqlite::Connection::open(&temp_check_db).unwrap();
        let secret_count: usize = check_conn
            .query_row("SELECT COUNT(*) FROM secrets;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(
            secret_count, 0,
            "CRITICAL SECURITY FAILURE: Secrets table MUST be empty in the exported backup snapshot!"
        );

        let game_count: usize = check_conn
            .query_row("SELECT COUNT(*) FROM games;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(game_count, 2, "Games must be present in the snapshot");
    }

    // 7. Mutate active database and filesystem to simulate data loss or alteration
    {
        let conn = db.writer();
        conn.execute("DELETE FROM games;", []).unwrap();
    }
    fs::remove_file(&settings_path).unwrap();
    fs::remove_file(covers_dir.join("game_1.jpg")).unwrap();

    // Verify database currently has 0 games
    {
        let conn = db.reader();
        let current_count: usize = conn
            .query_row("SELECT COUNT(*) FROM games;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(current_count, 0);
    }

    // 8. Restore from backup
    let restore_result = restore_backup(&db, &app_dir, &backup_result.backup_path)
        .expect("restore_backup should succeed");

    assert_eq!(restore_result.games_restored, 2);
    assert!(restore_result.settings_restored);
    assert!(restore_result.artwork_restored);

    // 9. Verify restored database contents
    {
        let conn = db.reader();
        let restored_count: usize = conn
            .query_row("SELECT COUNT(*) FROM games;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(restored_count, 2, "Database must have 2 restored games");

        let title: String = conn
            .query_row("SELECT title FROM games WHERE id = 'game_1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(title, "Hollow Knight");
    }

    // 10. Verify settings and artwork were restored
    assert!(settings_path.is_file(), "settings.json must be restored");
    assert!(
        covers_dir.join("game_1.jpg").is_file(),
        "cover image must be restored"
    );

    // 11. Verify pre-restore safety backup was created
    let pre_restore_bak = app_dir.join("library.db.pre_restore_bak");
    assert!(
        pre_restore_bak.is_file(),
        "A .pre_restore_bak safety backup must be created before replacing database"
    );

    let _ = fs::remove_dir_all(&app_dir);
    let _ = fs::remove_dir_all(&backup_dest_dir);
}

#[test]
fn test_restore_fails_on_corrupt_database() {
    let app_dir = create_temp_test_dir("omnis_corrupt_test_app");
    let corrupt_dest_dir = create_temp_test_dir("omnis_corrupt_test_dest");

    let db_path = app_dir.join(storage::DATABASE_FILE);
    let db = Database::open(&db_path).expect("Failed to create test database");

    // Create an invalid .zip where database.db is corrupt
    let corrupt_backup_file = corrupt_dest_dir.join("corrupt.zip");
    let file = File::create(&corrupt_backup_file).unwrap();
    let mut zip = ZipWriter::new(file);

    let zip_opts =
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Valid manifest
    let manifest = omnis_core::BackupManifest {
        total_games: 5,
        ..Default::default()
    };
    zip.start_file("manifest.json", zip_opts).unwrap();
    zip.write_all(&serde_json::to_vec(&manifest).unwrap())
        .unwrap();

    // Corrupt database
    zip.start_file("database.db", zip_opts).unwrap();
    zip.write_all(b"NOT A VALID SQLITE DATABASE FILE HEADER GIBBERISH")
        .unwrap();

    zip.finish().unwrap();

    // Attempting restore must fail the PRAGMA quick_check integrity check
    let res = restore_backup(&db, &app_dir, &corrupt_backup_file);
    assert!(
        res.is_err(),
        "Restore must fail when database.db is corrupted"
    );

    let _ = fs::remove_dir_all(&app_dir);
    let _ = fs::remove_dir_all(&corrupt_dest_dir);
}
