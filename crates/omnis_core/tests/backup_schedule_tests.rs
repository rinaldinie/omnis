use chrono::{Duration, TimeZone, Utc};
use omnis_core::{
    calculate_next_backup_utc, create_backup, inspect_backup, is_backup_due, rotate_backups,
    BackupFrequency, BackupOptions, BackupScheduleConfig, Database,
};
use omnis_sdk::constants::storage;
use std::fs;
use std::path::PathBuf;
use std::thread::sleep;
use std::time::Duration as StdDuration;

fn create_temp_test_dir(prefix: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("{}_{}", prefix, uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).expect("Failed to create temp test directory");
    dir
}

#[test]
fn test_calculate_next_backup_frequencies() {
    let now = Utc.with_ymd_and_hms(2026, 11, 1, 12, 0, 0).unwrap();

    // 1. Test Disabled returns None
    assert_eq!(
        calculate_next_backup_utc(Some("2026-11-01T10:00:00+00:00"), &BackupFrequency::Disabled, now),
        None
    );
    assert_eq!(
        calculate_next_backup_utc(None, &BackupFrequency::Disabled, now),
        None
    );

    // 2. Test Daily with Some(t) returns t + 24 hours
    let t_str = "2026-06-01T12:00:00+00:00";
    let t_dt = chrono::DateTime::parse_from_rfc3339(t_str)
        .unwrap()
        .with_timezone(&Utc);
    let expected_daily = (t_dt + Duration::hours(24)).to_rfc3339();
    assert_eq!(
        calculate_next_backup_utc(Some(t_str), &BackupFrequency::Daily, now),
        Some(expected_daily)
    );

    // 3. Test Weekly with Some(t) returns t + 7 days
    let expected_weekly = (t_dt + Duration::days(7)).to_rfc3339();
    assert_eq!(
        calculate_next_backup_utc(Some(t_str), &BackupFrequency::Weekly, now),
        Some(expected_weekly)
    );

    // 4. Test Monthly with Some(t) returns t + 30 days (June has 30 days)
    let expected_monthly = (t_dt + Duration::days(30)).to_rfc3339();
    assert_eq!(
        calculate_next_backup_utc(Some(t_str), &BackupFrequency::Monthly, now),
        Some(expected_monthly)
    );

    // 5. Test when last_backup is None (returns now formatted)
    let expected_now = Some(now.to_rfc3339());
    assert_eq!(
        calculate_next_backup_utc(None, &BackupFrequency::Daily, now),
        expected_now
    );
    assert_eq!(
        calculate_next_backup_utc(None, &BackupFrequency::Weekly, now),
        expected_now
    );
    assert_eq!(
        calculate_next_backup_utc(None, &BackupFrequency::Monthly, now),
        expected_now
    );
}

#[test]
fn test_is_backup_due_logic() {
    let now = Utc.with_ymd_and_hms(2026, 11, 1, 12, 0, 0).unwrap();
    let dest_dir = Some(PathBuf::from("/tmp/omnis_backups"));

    // 1. Returns false if frequency is Disabled
    let disabled_cfg = BackupScheduleConfig {
        frequency: BackupFrequency::Disabled,
        destination_dir: dest_dir.clone(),
        last_backup_utc: None,
        ..Default::default()
    };
    assert!(!is_backup_due(&disabled_cfg, now));

    // 2. Returns false if destination_dir is None
    let no_dest_cfg = BackupScheduleConfig {
        frequency: BackupFrequency::Daily,
        destination_dir: None,
        last_backup_utc: None,
        ..Default::default()
    };
    assert!(!is_backup_due(&no_dest_cfg, now));

    // 3. Returns true if destination_dir is Some and last_backup_utc is None
    let due_initial = BackupScheduleConfig {
        frequency: BackupFrequency::Daily,
        destination_dir: dest_dir.clone(),
        last_backup_utc: None,
        ..Default::default()
    };
    assert!(is_backup_due(&due_initial, now));

    // 4. Returns false if last_backup_utc was 1 hour ago and frequency is Daily
    let one_hour_ago = (now - Duration::hours(1)).to_rfc3339();
    let daily_1h_ago = BackupScheduleConfig {
        frequency: BackupFrequency::Daily,
        destination_dir: dest_dir.clone(),
        last_backup_utc: Some(one_hour_ago),
        ..Default::default()
    };
    assert!(!is_backup_due(&daily_1h_ago, now));

    // 5. Returns true if last_backup_utc was 25 hours ago and frequency is Daily
    let twenty_five_hours_ago = (now - Duration::hours(25)).to_rfc3339();
    let daily_25h_ago = BackupScheduleConfig {
        frequency: BackupFrequency::Daily,
        destination_dir: dest_dir,
        last_backup_utc: Some(twenty_five_hours_ago),
        ..Default::default()
    };
    assert!(is_backup_due(&daily_25h_ago, now));
}

#[test]
fn test_backup_schedule_database_integration() {
    let temp_dir = create_temp_test_dir("omnis_backup_db_test");
    let db_path = temp_dir.join("test.db");
    let db = Database::open(&db_path).expect("Failed to initialize temporary database");

    // 1. Read default schedule: verify frequency is Disabled, max_rotations is 10, destination_dir is None
    let default_schedule = db
        .get_backup_schedule()
        .expect("Failed to get default backup schedule");
    assert_eq!(default_schedule.frequency, BackupFrequency::Disabled);
    assert_eq!(default_schedule.max_rotations, 10);
    assert_eq!(default_schedule.destination_dir, None);
    assert_eq!(default_schedule.last_backup_utc, None);

    // 2. Save updated schedule: Daily, max_rotations 15 (should clamp to 10), destination_dir Some(PathBuf::from("/tmp/omnis_backups"))
    let updated_config = BackupScheduleConfig {
        frequency: BackupFrequency::Daily,
        destination_dir: Some(PathBuf::from("/tmp/omnis_backups")),
        max_rotations: 15,
        last_backup_utc: None,
        include_artwork: true,
        updated_at: Utc::now().to_rfc3339(),
    };
    db.save_backup_schedule(&updated_config)
        .expect("Failed to save backup schedule");

    // 3. Retrieve schedule and assert max_rotations == 10
    let saved_schedule = db
        .get_backup_schedule()
        .expect("Failed to retrieve updated schedule");
    assert_eq!(saved_schedule.frequency, BackupFrequency::Daily);
    assert_eq!(
        saved_schedule.max_rotations, 10,
        "max_rotations must be clamped to 10"
    );
    assert_eq!(
        saved_schedule.destination_dir,
        Some(PathBuf::from("/tmp/omnis_backups"))
    );
    assert!(saved_schedule.include_artwork);

    // 4. Call record_backup_completed and verify last_backup_utc is updated
    let completion_timestamp = "2026-11-01T15:30:00+00:00";
    db.record_backup_completed(completion_timestamp)
        .expect("Failed to record backup completion");

    let post_completion = db
        .get_backup_schedule()
        .expect("Failed to retrieve schedule after completion");
    assert_eq!(
        post_completion.last_backup_utc.as_deref(),
        Some(completion_timestamp)
    );
    assert_eq!(post_completion.frequency, BackupFrequency::Daily);
    assert_eq!(post_completion.max_rotations, 10);
    assert_eq!(
        post_completion.destination_dir,
        Some(PathBuf::from("/tmp/omnis_backups"))
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_backup_rotation_strictly_capped_at_10() {
    let temp_dir = create_temp_test_dir("omnis_rotation_strict_test");
    let hostname = "testhost";

    // Create 15 fake backup files matching the host format omnis_backup_testhost_20260101_00000{i}.zip with differing modified times
    let mut created_paths = Vec::new();
    for i in 1..=15 {
        let file_name = format!("omnis_backup_testhost_20260101_0000{:02}.zip", i);
        let file_path = temp_dir.join(&file_name);
        fs::write(&file_path, format!("fake backup bundle {}", i)).unwrap();
        // Give each file a distinct modification time by sleeping briefly
        sleep(StdDuration::from_millis(20));
        created_paths.push(file_path);
    }

    // Call rotate_backups requesting keep=12 (which is above max 10)
    let pruned = rotate_backups(&temp_dir, hostname, 12).expect("Rotation should succeed");
    assert_eq!(
        pruned, 5,
        "Should prune exactly 5 oldest files when requesting keep=12 (clamped to 10)"
    );

    let mut remaining_entries: Vec<String> = fs::read_dir(&temp_dir)
        .unwrap()
        .filter_map(|e| e.ok().map(|entry| entry.file_name().to_string_lossy().to_string()))
        .collect();
    remaining_entries.sort();

    assert_eq!(
        remaining_entries.len(),
        10,
        "Exactly 10 newest files must remain on disk"
    );

    // The first 5 created files (01 through 05) should have been pruned
    for i in 1..=5 {
        let pruned_file = format!("omnis_backup_testhost_20260101_0000{:02}.zip", i);
        assert!(
            !temp_dir.join(&pruned_file).exists(),
            "Older backup {} should have been pruned",
            pruned_file
        );
    }

    // The newest 10 files (06 through 15) should still exist
    for i in 6..=15 {
        let kept_file = format!("omnis_backup_testhost_20260101_0000{:02}.zip", i);
        assert!(
            temp_dir.join(&kept_file).exists(),
            "Newer backup {} should be retained",
            kept_file
        );
    }

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_backup_options_and_rotation_integration() {
    let app_dir = create_temp_test_dir("omnis_options_app");
    let dest_dir = create_temp_test_dir("omnis_options_dest");

    let db_path = app_dir.join(storage::DATABASE_FILE);
    let db = Database::open(&db_path).expect("Failed to create test database");

    // Insert sample games
    {
        let conn = db.writer();
        conn.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, added_timestamp, modified_timestamp)
             VALUES ('game_1', 'steam', '101', 'Silksong', 'silksong', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, added_timestamp, modified_timestamp)
             VALUES ('game_2', 'gog', '102', 'Cyberpunk 2077', 'cyberpunk 2077', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();
    }

    // 1. Create first backup with keep_last: Some(1)
    let options = BackupOptions {
        destination_dir: dest_dir.clone(),
        include_artwork: false,
        keep_last: Some(1),
    };

    let backup_1 = create_backup(&db, &app_dir, &options).expect("First backup should succeed");
    assert!(backup_1.backup_path.exists(), "Backup 1 file should exist");
    assert_eq!(backup_1.total_games, 2);
    assert!(backup_1.file_size_bytes > 0);

    let entries_after_first: Vec<_> = fs::read_dir(&dest_dir).unwrap().collect();
    assert_eq!(entries_after_first.len(), 1, "Exactly 1 backup should exist");

    // Sleep > 1 second so the second backup filename timestamp (%Y%m%d_%H%M%S) is unique
    sleep(StdDuration::from_millis(1200));

    // 2. Create second backup with keep_last: Some(1)
    let backup_2 = create_backup(&db, &app_dir, &options).expect("Second backup should succeed");
    assert!(backup_2.backup_path.exists(), "Backup 2 file should exist");
    assert_ne!(
        backup_1.backup_path, backup_2.backup_path,
        "Filenames should differ across seconds"
    );

    // 3. Verify rotation pruned backup_1 and retained backup_2
    let entries_after_second: Vec<PathBuf> = fs::read_dir(&dest_dir)
        .unwrap()
        .filter_map(|e| e.ok().map(|entry| entry.path()))
        .collect();
    assert_eq!(
        entries_after_second.len(),
        1,
        "Only 1 backup should remain after keep_last=1 rotation"
    );
    assert_eq!(
        entries_after_second[0], backup_2.backup_path,
        "Only backup 2 should remain"
    );
    assert!(
        !backup_1.backup_path.exists(),
        "Backup 1 should have been deleted by rotation"
    );

    // 4. Verify manifest integrity of the retained backup
    let inspection = inspect_backup(&backup_2.backup_path).expect("Inspection should succeed");
    assert_eq!(inspection.manifest.format_version, 1);
    assert_eq!(inspection.manifest.total_games, 2);
    assert!(!inspection.manifest.include_artwork);
    assert!(!inspection.manifest.hostname.is_empty());
    assert!(inspection.has_database);
    assert!(inspection.has_settings);

    let _ = fs::remove_dir_all(&app_dir);
    let _ = fs::remove_dir_all(&dest_dir);
}
