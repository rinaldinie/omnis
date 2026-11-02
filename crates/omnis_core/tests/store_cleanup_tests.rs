use omnis_core::db::Database;
use uuid::Uuid;

struct TempDir(std::path::PathBuf);

impl TempDir {
    fn path(&self) -> &std::path::Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn tempdir() -> std::io::Result<TempDir> {
    let p = std::env::temp_dir().join(format!("omnis_test_cleanup_{}", Uuid::new_v4()));
    std::fs::create_dir_all(&p)?;
    Ok(TempDir(p))
}

#[test]
fn test_delete_games_by_library_isolation_and_uninstalled_filter() {
    let dir = tempdir().expect("tempdir");
    let db_path = dir.path().join("test_cleanup.db");
    let db = Database::open(&db_path).expect("open database");

    // 1. Insert 3 games: 2 for 'steam' (1 installed, 1 uninstalled), 1 for 'epic' (uninstalled)
    let steam_installed = Uuid::new_v4();
    let steam_uninstalled = Uuid::new_v4();
    let epic_uninstalled = Uuid::new_v4();

    let now = chrono::Utc::now().to_rfc3339();
    db.writer()
        .execute(
            "INSERT INTO games (id, library_id, external_id, title, sorting_title, is_installed, added_timestamp, modified_timestamp)
             VALUES (?1, 'steam', 'app_1', 'Steam Installed', 'Steam Installed', 1, ?4, ?4),
                    (?2, 'steam', 'app_2', 'Steam Uninstalled', 'Steam Uninstalled', 0, ?4, ?4),
                    (?3, 'epic', 'epic_1', 'Epic Uninstalled', 'Epic Uninstalled', 0, ?4, ?4)",
            rusqlite::params![
                steam_installed.to_string(),
                steam_uninstalled.to_string(),
                epic_uninstalled.to_string(),
                now
            ],
        )
        .expect("insert games");

    db.reload_search_index().expect("reload search index");
    assert_eq!(
        db.search_games("Steam Uninstalled").expect("search").len(),
        1
    );

    // 2. Delete only uninstalled games for Steam
    let deleted_uninstalled = db
        .delete_games_by_library("steam", true)
        .expect("delete uninstalled steam");
    assert_eq!(deleted_uninstalled, 1);

    // Verify steam_installed still exists, steam_uninstalled is gone, epic_uninstalled is untouched
    assert!(db.get_game_by_id(steam_installed).expect("query").is_some());
    assert!(db
        .get_game_by_id(steam_uninstalled)
        .expect("query")
        .is_none());
    assert!(db
        .get_game_by_id(epic_uninstalled)
        .expect("query")
        .is_some());

    // Verify in-memory search index was pruned
    assert_eq!(
        db.search_games("Steam Uninstalled").expect("search").len(),
        0
    );
    assert_eq!(db.search_games("Steam Installed").expect("search").len(), 1);

    // 3. Delete all games for Steam
    let deleted_all = db
        .delete_games_by_library("steam", false)
        .expect("delete all steam");
    assert_eq!(deleted_all, 1);

    // Verify steam_installed is now gone, and epic_uninstalled remains
    assert!(db.get_game_by_id(steam_installed).expect("query").is_none());
    assert!(db
        .get_game_by_id(epic_uninstalled)
        .expect("query")
        .is_some());

    // Verify in-memory search index was pruned
    assert_eq!(db.search_games("Steam Installed").expect("search").len(), 0);
    assert_eq!(
        db.search_games("Epic Uninstalled").expect("search").len(),
        1
    );
}
