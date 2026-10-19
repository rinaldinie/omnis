//! Store account and cloud synchronization manager for Omnis Game Library
//!
//! Handles OAuth authentication flows, secure OS keyring storage (with local memory fallback),
//! and library catalog synchronization for cloud store platforms (GOG Galaxy, Xbox Live / Game Pass).

use chrono::{DateTime, Utc};
use omnis_core::Database;
use omnis_sdk::models::{StoreAccountDto, StoreSyncProgressPayload};
use omnis_sdk::plugin::{CloudStorePlugin, StoreAccountSession};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Manages cloud store accounts, OAuth authentication, credentials in OS keyring, and catalog synchronization.
#[derive(Clone)]
pub struct StoreAccountManager {
    plugins: Arc<RwLock<HashMap<String, Arc<dyn CloudStorePlugin>>>>,
    db: Arc<Database>,
    local_cache: Arc<RwLock<HashMap<String, StoreAccountSession>>>,
    last_syncs: Arc<tokio::sync::RwLock<HashMap<String, DateTime<Utc>>>>,
}

impl StoreAccountManager {
    /// Create a new StoreAccountManager bound to the given database
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            plugins: Arc::new(RwLock::new(HashMap::new())),
            db,
            local_cache: Arc::new(RwLock::new(HashMap::new())),
            last_syncs: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        }
    }

    /// Register a cloud store plugin instance (e.g. GOG or Xbox)
    pub fn register_plugin(&self, plugin: Arc<dyn CloudStorePlugin>) {
        let id = plugin.id().to_string();
        let mut map = match self.plugins.write() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        map.insert(id, plugin);
    }

    /// Retrieve a registered plugin by store identifier asynchronously
    pub async fn get_plugin(&self, store_id: &str) -> Option<Arc<dyn CloudStorePlugin>> {
        self.get_plugin_sync(store_id)
    }

    /// Retrieve a registered plugin synchronously without blocking the runtime
    pub fn get_plugin_sync(&self, store_id: &str) -> Option<Arc<dyn CloudStorePlugin>> {
        let guard = match self.plugins.read() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        guard.get(store_id).cloned()
    }

    /// Persist a store account session to the OS keyring and memory fallback cache
    pub fn save_session(&self, store_id: &str, session: &StoreAccountSession) -> Result<(), String> {
        let json = serde_json::to_string(session).map_err(|e| e.to_string())?;

        // 1. Update memory fallback cache
        {
            let mut cache = match self.local_cache.write() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            cache.insert(store_id.to_string(), session.clone());
        }

        // 2. Persist in OS keyring
        match keyring::Entry::new("omnis_store_accounts", store_id) {
            Ok(entry) => {
                if let Err(e) = entry.set_password(&json) {
                    tracing::warn!(
                        "Keyring set_password failed for {}: {}. Kept in local_cache.",
                        store_id,
                        e
                    );
                }
            }
            Err(e) => {
                tracing::warn!(
                    "Keyring Entry::new failed for {}: {}. Kept in local_cache.",
                    store_id,
                    e
                );
            }
        }

        Ok(())
    }

    /// Retrieve an existing session from OS keyring, falling back to local memory cache
    pub fn load_session(&self, store_id: &str) -> Result<Option<StoreAccountSession>, String> {
        // 1. Check OS keyring first
        if let Ok(entry) = keyring::Entry::new("omnis_store_accounts", store_id) {
            match entry.get_password() {
                Ok(json) => {
                    if let Ok(session) = serde_json::from_str::<StoreAccountSession>(&json) {
                        let mut cache = match self.local_cache.write() {
                            Ok(g) => g,
                            Err(poisoned) => poisoned.into_inner(),
                        };
                        cache.insert(store_id.to_string(), session.clone());
                        return Ok(Some(session));
                    }
                }
                Err(keyring::Error::NoEntry) => {
                    // Entry not present in keyring, check cache
                }
                Err(e) => {
                    tracing::debug!(
                        "Keyring get_password failed for {}: {}. Falling back to local_cache.",
                        store_id,
                        e
                    );
                }
            }
        }

        // 2. Check local memory cache
        {
            let cache = match self.local_cache.read() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            if let Some(session) = cache.get(store_id) {
                return Ok(Some(session.clone()));
            }
        }

        Ok(None)
    }

    /// Remove a store account session from both OS keyring and memory cache
    pub fn delete_session(&self, store_id: &str) -> Result<(), String> {
        // 1. Remove from memory cache
        {
            let mut cache = match self.local_cache.write() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            cache.remove(store_id);
        }

        // 2. Remove from OS keyring
        if let Ok(entry) = keyring::Entry::new("omnis_store_accounts", store_id) {
            match entry.delete_password() {
                Ok(()) => {}
                Err(keyring::Error::NoEntry) => {}
                Err(e) => {
                    tracing::warn!("Keyring delete_password failed for {}: {}", store_id, e);
                }
            }
        }

        Ok(())
    }

    /// Retrieve summary status of all supported stores (GOG, Xbox, Steam, Epic)
    pub async fn get_store_accounts(&self) -> Result<Vec<StoreAccountDto>, String> {
        let mut accounts = Vec::new();

        // 1. GOG Galaxy
        let gog_session = self.load_session("gog")?;
        let gog_sync = self.last_syncs.read().await.get("gog").cloned();
        accounts.push(StoreAccountDto {
            store_id: "gog".to_string(),
            name: "GOG Galaxy".to_string(),
            is_connected: gog_session.is_some(),
            username: gog_session.as_ref().map(|s| s.username.clone()),
            avatar_url: gog_session.and_then(|s| s.avatar_url),
            last_sync: gog_sync,
        });

        // 2. Xbox Live / PC Game Pass
        let xbox_session = self.load_session("xbox")?;
        let xbox_sync = self.last_syncs.read().await.get("xbox").cloned();
        accounts.push(StoreAccountDto {
            store_id: "xbox".to_string(),
            name: "Xbox / PC Game Pass".to_string(),
            is_connected: xbox_session.is_some(),
            username: xbox_session.as_ref().map(|s| s.username.clone()),
            avatar_url: xbox_session.and_then(|s| s.avatar_url),
            last_sync: xbox_sync,
        });

        // 3. Steam
        let steam_detected = omnis_plugin_steam::vdf_parser::detect_steam_installation().is_some();
        let steam_sync = self.last_syncs.read().await.get("steam").cloned();
        accounts.push(StoreAccountDto {
            store_id: "steam".to_string(),
            name: "Steam".to_string(),
            is_connected: steam_detected,
            username: if steam_detected {
                Some("Client Locale".to_string())
            } else {
                None
            },
            avatar_url: None,
            last_sync: steam_sync,
        });

        // 4. Epic Games Store
        let epic_plugin = omnis_plugin_epic::EpicLibraryPlugin::new();
        let epic_detected = epic_plugin.detect_manifests_dir().exists();
        let epic_sync = self.last_syncs.read().await.get("epic").cloned();
        accounts.push(StoreAccountDto {
            store_id: "epic".to_string(),
            name: "Epic Games Store".to_string(),
            is_connected: epic_detected,
            username: if epic_detected {
                Some("Client Locale".to_string())
            } else {
                None
            },
            avatar_url: None,
            last_sync: epic_sync,
        });

        Ok(accounts)
    }

    /// Launch OAuth login popup window in Tauri webview
    pub fn start_login(&self, app_handle: &AppHandle, store_id: &str) -> Result<(), String> {
        let label = format!("store-login-{}", store_id);

        // Bring to focus if already open
        if let Some(window) = app_handle.get_webview_window(&label) {
            let _ = window.set_focus();
            return Ok(());
        }

        let plugin = self
            .get_plugin_sync(store_id)
            .ok_or_else(|| format!("Plugin non trovato per lo store {}", store_id))?;

        let login_url = plugin.login_url();
        let parsed_url: url::Url = login_url
            .parse()
            .map_err(|e: url::ParseError| format!("URL di login non valido: {}", e))?;

        let window_url = WebviewUrl::External(parsed_url);

        let manager = self.clone();
        let app_for_nav = app_handle.clone();
        let plugin_for_nav = plugin.clone();
        let store_id_for_nav = store_id.to_string();
        let label_for_nav = label.clone();

        let is_exchanging = Arc::new(AtomicBool::new(false));

        let builder = WebviewWindowBuilder::new(app_handle, &label, window_url)
            .title(format!("Accesso {}", plugin.name()))
            .inner_size(850.0, 700.0)
            .resizable(true)
            .center()
            .on_navigation(move |url| {
                if plugin_for_nav.is_redirect_url(url.as_str()) {
                    if is_exchanging.swap(true, Ordering::SeqCst) {
                        return false;
                    }

                    let manager = manager.clone();
                    let app = app_for_nav.clone();
                    let plugin = plugin_for_nav.clone();
                    let sid = store_id_for_nav.clone();
                    let lbl = label_for_nav.clone();
                    let url_str = url.as_str().to_string();

                    tokio::spawn(async move {
                        match plugin.exchange_code(&url_str).await {
                            Ok(session) => {
                                if let Err(e) = manager.save_session(&sid, &session) {
                                    tracing::error!(
                                        "Errore nel salvataggio della sessione {}: {}",
                                        sid,
                                        e
                                    );
                                }
                                if let Some(win) = app.get_webview_window(&lbl) {
                                    let _ = win.close();
                                }
                                let _ = app.emit(
                                    "store-account-connected",
                                    serde_json::json!({
                                        "store_id": sid,
                                        "username": session.username,
                                    }),
                                );
                                if let Err(e) = manager.sync_store(&app, &sid).await {
                                    tracing::error!(
                                        "Errore sincronizzazione iniziale store {}: {}",
                                        sid,
                                        e
                                    );
                                }
                            }
                            Err(e) => {
                                tracing::error!("Errore scambio codice OAuth per {}: {}", sid, e);
                                if let Some(win) = app.get_webview_window(&lbl) {
                                    let _ = win.close();
                                }
                                let _ = app.emit(
                                    "store-sync-progress",
                                    StoreSyncProgressPayload {
                                        store_id: sid,
                                        current: 0,
                                        total: 0,
                                        status: "error".to_string(),
                                        message: Some(format!("Errore autenticazione: {}", e)),
                                    },
                                );
                            }
                        }
                    });

                    false
                } else {
                    true
                }
            });

        match builder.build() {
            Ok(_) => Ok(()),
            Err(e) => {
                if let Some(existing) = app_handle.get_webview_window(&label) {
                    let _ = existing.set_focus();
                    Ok(())
                } else {
                    Err(e.to_string())
                }
            }
        }
    }

    /// Synchronize owned game library from a connected cloud store
    pub async fn sync_store(&self, app_handle: &AppHandle, store_id: &str) -> Result<usize, String> {
        let mut session = self
            .load_session(store_id)?
            .ok_or_else(|| format!("Nessun account connesso per {}", store_id))?;

        let plugin = self
            .get_plugin(store_id)
            .await
            .ok_or_else(|| format!("Plugin non trovato per {}", store_id))?;

        // Refresh token if expired
        if session.is_expired() {
            if let Some(ref refresh_tok) = session.refresh_token {
                match plugin.refresh_session(refresh_tok).await {
                    Ok(new_session) => {
                        self.save_session(store_id, &new_session)?;
                        session = new_session;
                    }
                    Err(e) => {
                        let err_msg = format!(
                            "Errore nel rinnovo della sessione per {}: {}",
                            store_id, e
                        );
                        let _ = app_handle.emit(
                            "store-sync-progress",
                            StoreSyncProgressPayload {
                                store_id: store_id.to_string(),
                                current: 0,
                                total: 0,
                                status: "error".to_string(),
                                message: Some(err_msg.clone()),
                            },
                        );
                        return Err(err_msg);
                    }
                }
            } else {
                let err_msg = "Sessione scaduta e nessun refresh token disponibile. Effettuare nuovamente il login.";
                let _ = app_handle.emit(
                    "store-sync-progress",
                    StoreSyncProgressPayload {
                        store_id: store_id.to_string(),
                        current: 0,
                        total: 0,
                        status: "error".to_string(),
                        message: Some(err_msg.to_string()),
                    },
                );
                return Err(err_msg.to_string());
            }
        }

        // Emit initial progress
        let _ = app_handle.emit(
            "store-sync-progress",
            StoreSyncProgressPayload {
                store_id: store_id.to_string(),
                current: 0,
                total: 0,
                status: "syncing".to_string(),
                message: Some("Connessione allo store...".to_string()),
            },
        );

        // Fetch catalog from remote store
        let games = match plugin.sync_games(&session).await {
            Ok(g) => g,
            Err(e) => {
                let err_msg = format!("Errore sincronizzazione giochi per {}: {}", store_id, e);
                let _ = app_handle.emit(
                    "store-sync-progress",
                    StoreSyncProgressPayload {
                        store_id: store_id.to_string(),
                        current: 0,
                        total: 0,
                        status: "error".to_string(),
                        message: Some(err_msg.clone()),
                    },
                );
                return Err(err_msg);
            }
        };

        // Ingest into SQLite database
        let count = self
            .db
            .ingest_discovered_batch(&games)
            .map_err(|e| e.to_string())?;

        // Update last sync time
        self.last_syncs
            .write()
            .await
            .insert(store_id.to_string(), Utc::now());

        // Emit completion
        let _ = app_handle.emit(
            "store-sync-progress",
            StoreSyncProgressPayload {
                store_id: store_id.to_string(),
                current: games.len(),
                total: games.len(),
                status: "completed".to_string(),
                message: Some(format!(
                    "Sincronizzati {} giochi da {}",
                    games.len(),
                    plugin.name()
                )),
            },
        );

        // Emit library updated for UI refresh
        let _ = app_handle.emit(
            "library-updated",
            serde_json::json!({
                "store_id": store_id,
                "count": count
            }),
        );

        Ok(games.len())
    }

    /// Synchronize all currently connected cloud accounts
    pub async fn sync_all_connected(&self, app_handle: &AppHandle) -> Result<usize, String> {
        let accounts = self.get_store_accounts().await?;
        let mut total_synced = 0;
        for acc in accounts {
            if acc.is_connected && (acc.store_id == "gog" || acc.store_id == "xbox") {
                match self.sync_store(app_handle, &acc.store_id).await {
                    Ok(count) => total_synced += count,
                    Err(err) => {
                        tracing::warn!("Errore sync store {}: {}", acc.store_id, err);
                    }
                }
            }
        }
        Ok(total_synced)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_save_load_delete() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let manager = StoreAccountManager::new(db);
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
        let db = Arc::new(Database::open_in_memory().unwrap());
        let manager = StoreAccountManager::new(db);

        // Ensure clean state before test
        let _ = manager.delete_session("gog");

        let accounts = manager.get_store_accounts().await.unwrap();
        assert_eq!(accounts.len(), 4);
        let ids: Vec<_> = accounts.iter().map(|a| a.store_id.as_str()).collect();
        assert_eq!(ids, vec!["gog", "xbox", "steam", "epic"]);

        // When not logged in, gog is disconnected
        let gog = accounts.iter().find(|a| a.store_id == "gog").unwrap();
        assert!(!gog.is_connected);

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
        let db = Arc::new(Database::open_in_memory().unwrap());
        let manager = StoreAccountManager::new(db);

        manager.register_plugin(Arc::new(omnis_plugin_gog::GogCloudPlugin::new()));
        manager.register_plugin(Arc::new(omnis_plugin_xbox::XboxCloudPlugin::new()));

        let gog = manager.get_plugin_sync("gog");
        assert!(gog.is_some());
        assert_eq!(gog.unwrap().id(), "gog");

        let xbox = manager.get_plugin_sync("xbox");
        assert!(xbox.is_some());
        assert_eq!(xbox.unwrap().id(), "xbox");

        let unknown = manager.get_plugin_sync("unknown");
        assert!(unknown.is_none());
    }

    #[test]
    fn test_concurrent_session_cache_access() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let manager = Arc::new(StoreAccountManager::new(db));

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
}

