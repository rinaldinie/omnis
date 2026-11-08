use super::*;
use chrono::Utc;
use omnis_core::{Database, SecretVault};
use omnis_sdk::plugin::StoreAccountSession;
use std::sync::Arc;

fn make_test_manager() -> (StoreAccountManager, Arc<Database>) {
    let db = Arc::new(Database::open_in_memory().unwrap());
    db.migrate().unwrap();
    let vault = Arc::new(SecretVault::from_key([0x55; 32]));
    let manager = StoreAccountManager::new(db.clone(), vault);
    (manager, db)
}

#[test]
fn test_session_save_load_delete() {
    let (manager, _db) = make_test_manager();
    let test_store = "test_store_crud";

    let session = StoreAccountSession {
        store_id: test_store.to_string(),
        user_id: "user123".to_string(),
        username: "TestGamer".to_string(),
        avatar_url: Some("https://example.com/avatar.jpg".to_string()),
        access_token: "token_abc".to_string(),
        refresh_token: Some("refresh_xyz".to_string()),
        expires_at: Some(Utc::now().timestamp() + 3600),
    };

    // Save
    let res = manager.save_session(test_store, &session);
    assert!(res.is_ok());

    // Load
    let loaded = manager.load_session(test_store).unwrap();
    assert!(loaded.is_some());
    let loaded_session = loaded.unwrap();
    assert_eq!(loaded_session.username, "TestGamer");
    assert_eq!(loaded_session.access_token, "token_abc");

    // Delete
    let del_res = manager.delete_session(test_store);
    assert!(del_res.is_ok());

    let after_delete = manager.load_session(test_store).unwrap();
    assert!(after_delete.is_none());
}

#[tokio::test]
async fn test_get_store_accounts() {
    let (manager, _db) = make_test_manager();

    // Ensure clean state before test
    let _ = manager.delete_session("gog");
    let _ = manager.delete_session("xbox");
    let _ = manager.delete_session("steam");
    let _ = manager.delete_session("epic");

    let accounts = manager.get_store_accounts().await.unwrap();
    assert_eq!(accounts.len(), 4);
    let ids: Vec<_> = accounts.iter().map(|a| a.store_id.as_str()).collect();
    assert_eq!(ids, vec!["steam", "epic", "gog", "xbox"]);

    // When not logged in, all are disconnected
    for acc in &accounts {
        assert!(
            !acc.is_connected,
            "Account {} should be disconnected",
            acc.store_id
        );
    }

    // When logged in, gog is connected
    let session = StoreAccountSession {
        store_id: "gog".to_string(),
        user_id: "user123".to_string(),
        username: "GogUser".to_string(),
        avatar_url: None,
        access_token: "tok".to_string(),
        refresh_token: None,
        expires_at: None,
    };
    manager.save_session("gog", &session).unwrap();

    let accounts_after = manager.get_store_accounts().await.unwrap();
    let gog_after = accounts_after.iter().find(|a| a.store_id == "gog").unwrap();
    assert!(gog_after.is_connected);
    assert_eq!(gog_after.username.as_deref(), Some("GogUser"));

    // Clean up
    let _ = manager.delete_session("gog");
}

#[test]
fn test_plugin_registration() {
    let (manager, _db) = make_test_manager();

    manager.register_plugin(Arc::new(omnis_plugin_gog::GogCloudPlugin::new()));
    manager.register_plugin(Arc::new(omnis_plugin_xbox::XboxCloudPlugin::new()));
    manager.register_plugin(Arc::new(omnis_plugin_steam::SteamPlugin::new()));
    manager.register_plugin(Arc::new(omnis_plugin_epic::EpicLibraryPlugin::new()));

    let gog = manager.get_plugin_sync("gog");
    assert!(gog.is_some());
    assert_eq!(gog.unwrap().id(), "gog");

    let xbox = manager.get_plugin_sync("xbox");
    assert!(xbox.is_some());
    assert_eq!(xbox.unwrap().id(), "xbox");

    let steam = manager.get_plugin_sync("steam");
    assert!(steam.is_some());
    assert_eq!(steam.unwrap().id(), "steam");

    let epic = manager.get_plugin_sync("epic");
    assert!(epic.is_some());
    assert_eq!(epic.unwrap().id(), "epic");

    let unknown = manager.get_plugin_sync("unknown");
    assert!(unknown.is_none());
}

#[test]
fn test_concurrent_session_cache_access() {
    let (manager_inst, _db) = make_test_manager();
    let manager = Arc::new(manager_inst);

    let mut handles = Vec::new();
    for i in 0..10 {
        let mgr = manager.clone();
        handles.push(std::thread::spawn(move || {
            let store_id = format!("store_test_{}", i);
            let session = StoreAccountSession {
                store_id: store_id.clone(),
                user_id: format!("user_{}", i),
                username: format!("User{}", i),
                avatar_url: None,
                access_token: "tok".to_string(),
                refresh_token: None,
                expires_at: None,
            };
            mgr.save_session(&store_id, &session).unwrap();
            let loaded = mgr.load_session(&store_id).unwrap();
            assert!(loaded.is_some());
            assert_eq!(loaded.unwrap().username, format!("User{}", i));
            mgr.delete_session(&store_id).unwrap();
        }));
    }

    for h in handles {
        h.join().unwrap();
    }
}

#[tokio::test]
async fn test_store_sync_concurrency_lock() {
    let (manager, _db) = make_test_manager();
    assert!(!manager.is_store_syncing("steam"));

    // First lock acquisition succeeds
    assert!(manager.mark_syncing("steam"));
    assert!(manager.is_store_syncing("steam"));

    // Second lock acquisition for same store fails (preventing duplicate simultaneous syncs)
    assert!(!manager.mark_syncing("steam"));

    // Another store can lock concurrently
    assert!(manager.mark_syncing("epic"));
    assert!(manager.is_store_syncing("epic"));

    // Releasing unlock
    manager.unmark_syncing("steam");
    assert!(!manager.is_store_syncing("steam"));
    assert!(manager.is_store_syncing("epic"));
    manager.unmark_syncing("epic");
    assert!(!manager.is_store_syncing("epic"));
}

#[tokio::test]
async fn test_set_and_query_api_key() {
    let (manager, _db) = make_test_manager();
    let _ = manager.delete_session("steam");

    // Save session from OpenID login (token starts with steam_session:)
    let session = StoreAccountSession {
        store_id: "steam".to_string(),
        user_id: "76561198000000000".to_string(),
        username: "Gamer".to_string(),
        avatar_url: None,
        access_token: "steam_session:76561198000000000".to_string(),
        refresh_token: None,
        expires_at: None,
    };
    manager.save_session("steam", &session).unwrap();

    let accounts = manager.get_store_accounts().await.unwrap();
    let steam_acc = accounts.iter().find(|a| a.store_id == "steam").unwrap();
    assert!(steam_acc.is_connected);
    assert_eq!(steam_acc.has_api_key, Some(false));

    // Now set real Steam Web API Key
    let api_key = "1234567890ABCDEF1234567890ABCDEF";
    manager.set_api_key("steam", api_key).unwrap();

    let accounts_after = manager.get_store_accounts().await.unwrap();
    let steam_after = accounts_after
        .iter()
        .find(|a| a.store_id == "steam")
        .unwrap();
    assert!(steam_after.is_connected);
    assert_eq!(steam_after.has_api_key, Some(true));

    let loaded = manager.load_session("steam").unwrap().unwrap();
    assert_eq!(loaded.access_token, api_key);
    assert_eq!(loaded.user_id, "76561198000000000");

    let _ = manager.delete_session("steam");
}

#[tokio::test]
async fn test_store_integration_settings_steam_validation() {
    let (manager, _db) = make_test_manager();
    let _ = manager.delete_session("steam");

    // 1. Missing API Key when connecting Steam must fail
    let invalid_cfg = StoreIntegrationSettingsDto {
        store_id: "steam".to_string(),
        import_installed: true,
        connect_account: true,
        import_uninstalled: true,
        ignore_other_accounts: true,
        account_id: Some("76561198016913702".to_string()),
        api_key: None,
        import_free_items: Some(false),
        import_family_sharing: Some(true),
        import_game_pass: None,
        custom_client_path: None,
    };
    let res = manager.save_integration_settings(&invalid_cfg);
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("API Key"));

    // 2. Missing Account ID must fail
    let invalid_id_cfg = StoreIntegrationSettingsDto {
        store_id: "steam".to_string(),
        import_installed: true,
        connect_account: true,
        import_uninstalled: true,
        ignore_other_accounts: true,
        account_id: Some("invalid_not_number".to_string()),
        api_key: Some("1234567890ABCDEF1234567890ABCDEF".to_string()),
        import_free_items: Some(false),
        import_family_sharing: Some(true),
        import_game_pass: None,
        custom_client_path: None,
    };
    let res2 = manager.save_integration_settings(&invalid_id_cfg);
    assert!(res2.is_err());

    // 3. Valid Steam configuration succeeds and sets session
    let valid_cfg = StoreIntegrationSettingsDto {
        store_id: "steam".to_string(),
        import_installed: true,
        connect_account: true,
        import_uninstalled: true,
        ignore_other_accounts: true,
        account_id: Some("76561198016913702".to_string()),
        api_key: Some("1234567890ABCDEF1234567890ABCDEF".to_string()),
        import_free_items: Some(false),
        import_family_sharing: Some(true),
        import_game_pass: None,
        custom_client_path: None,
    };
    assert!(manager.save_integration_settings(&valid_cfg).is_ok());

    let retrieved = manager.get_integration_settings("steam").unwrap();
    assert_eq!(retrieved.account_id, Some("76561198016913702".to_string()));
    assert_eq!(
        retrieved.api_key,
        Some("1234567890ABCDEF1234567890ABCDEF".to_string())
    );
    assert!(retrieved.connect_account);

    let session = manager.load_session("steam").unwrap().unwrap();
    assert_eq!(session.user_id, "76561198016913702");
    assert_eq!(session.access_token, "1234567890ABCDEF1234567890ABCDEF");

    let _ = manager.delete_session("steam");
}

#[tokio::test]
async fn test_disconnect_store_account_with_settings_reset() {
    let (manager, _db) = make_test_manager();

    let steam_cfg = StoreIntegrationSettingsDto {
        store_id: "steam".to_string(),
        import_installed: true,
        connect_account: true,
        import_uninstalled: true,
        ignore_other_accounts: true,
        account_id: Some("76561198016913702".to_string()),
        api_key: Some("1234567890ABCDEF1234567890ABCDEF".to_string()),
        import_free_items: Some(false),
        import_family_sharing: Some(true),
        import_game_pass: None,
        custom_client_path: None,
    };
    assert!(manager.save_integration_settings(&steam_cfg).is_ok());

    let session = manager.load_session("steam").unwrap();
    assert!(session.is_some());

    let deleted = manager.disconnect_account("steam", Some("keep")).unwrap();
    assert_eq!(deleted, 0);

    assert!(manager.load_session("steam").unwrap().is_none());

    let settings = manager.get_integration_settings("steam").unwrap();
    assert!(!settings.connect_account);
    assert_eq!(settings.api_key, None);
    assert_eq!(settings.account_id, None);
}

struct MockRefreshablePlugin;

#[async_trait::async_trait]
impl omnis_sdk::LibraryPlugin for MockRefreshablePlugin {
    fn id(&self) -> &str {
        "mock_oauth"
    }
    fn name(&self) -> &str {
        "Mock OAuth Store"
    }
    async fn scan(&self) -> Result<Vec<omnis_sdk::DiscoveredGame>, omnis_sdk::PluginError> {
        Ok(vec![])
    }
}

#[async_trait::async_trait]
impl omnis_sdk::CloudStorePlugin for MockRefreshablePlugin {
    fn login_url(&self) -> String {
        "https://example.com/login".to_string()
    }
    fn is_redirect_url(&self, _url: &str) -> bool {
        false
    }
    async fn exchange_code(&self, _url: &str) -> Result<StoreAccountSession, omnis_sdk::PluginError> {
        unimplemented!()
    }
    async fn refresh_session(&self, refresh_token: &str) -> Result<StoreAccountSession, omnis_sdk::PluginError> {
        Ok(StoreAccountSession {
            store_id: "mock_oauth".to_string(),
            user_id: "user123".to_string(),
            username: "GOG User 12345".to_string(),
            avatar_url: None,
            access_token: format!("refreshed_{refresh_token}"),
            refresh_token: Some("new_refresh_tok".to_string()),
            expires_at: Some(Utc::now().timestamp() + 3600),
        })
    }
    async fn sync_games(
        &self,
        _session: &StoreAccountSession,
    ) -> Result<Vec<omnis_sdk::DiscoveredGame>, omnis_sdk::PluginError> {
        Ok(vec![])
    }
}

#[tokio::test]
async fn test_get_valid_session_auto_refresh() {
    let (manager, _db) = make_test_manager();
    manager.register_plugin(Arc::new(MockRefreshablePlugin));

    // 1. Expired session with refresh token
    let expired_session = StoreAccountSession {
        store_id: "mock_oauth".to_string(),
        user_id: "user123".to_string(),
        username: "OriginalGamer".to_string(),
        avatar_url: Some("https://example.com/avatar.jpg".to_string()),
        access_token: "old_expired_access_tok".to_string(),
        refresh_token: Some("refresh_token_abc".to_string()),
        expires_at: Some(Utc::now().timestamp() - 600), // Expired 10 min ago
    };
    manager.save_session("mock_oauth", &expired_session).unwrap();

    // Call get_valid_session -> should auto-refresh
    let valid_session = manager.get_valid_session("mock_oauth").await.unwrap();
    assert!(valid_session.is_some());
    let s = valid_session.unwrap();
    assert_eq!(s.access_token, "refreshed_refresh_token_abc");
    assert_eq!(s.refresh_token, Some("new_refresh_tok".to_string()));
    // Original username and avatar preserved
    assert_eq!(s.username, "OriginalGamer");
    assert_eq!(s.avatar_url, Some("https://example.com/avatar.jpg".to_string()));

    // Verify it was persisted to storage
    let loaded = manager.load_session("mock_oauth").unwrap().unwrap();
    assert_eq!(loaded.access_token, "refreshed_refresh_token_abc");

    // 2. Now it is valid (not expired). Calling again should return cached without re-refreshing
    let valid_again = manager.get_valid_session("mock_oauth").await.unwrap().unwrap();
    assert_eq!(valid_again.access_token, "refreshed_refresh_token_abc");
}
