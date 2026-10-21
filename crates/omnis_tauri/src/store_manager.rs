//! Store account and cloud synchronization manager for Omnis Game Library
//!
//! Handles OAuth authentication flows, secure OS keyring storage (with local memory fallback),
//! and library catalog synchronization for cloud store platforms (GOG Galaxy, Xbox Live / Game Pass).

use chrono::{DateTime, Utc};
use omnis_core::{Database, SecretVault};
use omnis_sdk::models::{DiscoveredGame, StoreAccountDto, StoreSyncProgressPayload};
use omnis_sdk::plugin::{CloudStorePlugin, StoreAccountSession};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Manages cloud store accounts, OAuth authentication, credentials in envelope-encrypted SQLite vault, and catalog synchronization.
#[derive(Clone)]
pub struct StoreAccountManager {
    plugins: Arc<RwLock<HashMap<String, Arc<dyn CloudStorePlugin>>>>,
    db: Arc<Database>,
    vault: Arc<SecretVault>,
    local_cache: Arc<RwLock<HashMap<String, StoreAccountSession>>>,
    last_syncs: Arc<tokio::sync::RwLock<HashMap<String, DateTime<Utc>>>>,
    syncing_stores: Arc<RwLock<std::collections::HashSet<String>>>,
}

impl StoreAccountManager {
    /// Create a new StoreAccountManager bound to the given database and envelope vault (Requirement D1, D3)
    pub fn new(db: Arc<Database>, vault: Arc<SecretVault>) -> Self {
        let mgr = Self {
            plugins: Arc::new(RwLock::new(HashMap::new())),
            db,
            vault,
            local_cache: Arc::new(RwLock::new(HashMap::new())),
            last_syncs: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
            syncing_stores: Arc::new(RwLock::new(std::collections::HashSet::new())),
        };
        // Migrate legacy keyring entries to envelope-encrypted SQLite vault (Requirement D4)
        mgr.migrate_legacy_keyring();
        mgr
    }

    /// Mark a store as currently syncing. Returns true if lock was acquired, false if already syncing.
    pub fn mark_syncing(&self, store_id: &str) -> bool {
        let mut guard = match self.syncing_stores.write() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        guard.insert(store_id.to_string())
    }

    /// Unmark a store after sync completes or fails.
    pub fn unmark_syncing(&self, store_id: &str) {
        let mut guard = match self.syncing_stores.write() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        guard.remove(store_id);
    }

    /// Check if a store is currently synchronizing in background.
    pub fn is_store_syncing(&self, store_id: &str) -> bool {
        let guard = match self.syncing_stores.read() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };
        guard.contains(store_id)
    }

    /// Update or configure API key for a store (e.g. Steam Web API Key)
    pub fn set_api_key(&self, store_id: &str, api_key: &str) -> Result<(), String> {
        let trimmed = api_key.trim();
        if let Some(mut session) = self.load_session(store_id)? {
            session.access_token = trimmed.to_string();
            self.save_session(store_id, &session)?;
        } else {
            let session = StoreAccountSession {
                store_id: store_id.to_string(),
                user_id: String::new(),
                username: format!("Account {}", store_id.to_uppercase()),
                avatar_url: None,
                access_token: trimmed.to_string(),
                refresh_token: None,
                expires_at: None,
            };
            self.save_session(store_id, &session)?;
        }
        Ok(())
    }

    /// Returns true if master key is stored in filesystem fallback instead of OS keyring (Requirement D3)
    pub fn is_fallback(&self) -> bool {
        self.vault.is_fallback()
    }

    /// Idempotent migration from legacy keyring storage to envelope-encrypted SQLite vault (Requirement D4)
    pub fn migrate_legacy_keyring(&self) {
        for store_id in &["steam", "epic", "gog", "xbox"] {
            if let Ok(entry) = keyring::Entry::new("omnis_store_accounts", store_id) {
                if let Ok(json) = entry.get_password() {
                    if let Ok(session) = serde_json::from_str::<StoreAccountSession>(&json) {
                        tracing::info!("Migrating legacy keyring session for {} to encrypted vault", store_id);
                        if self.save_session(store_id, &session).is_ok() {
                            let _ = entry.delete_password();
                        }
                    }
                }
            }
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

    /// Persist a store account session using envelope encryption (AES-256-GCM + secret_id as AAD) in SQLite (Requirement D1)
    pub fn save_session(&self, store_id: &str, session: &StoreAccountSession) -> Result<(), String> {
        let json = serde_json::to_string(session).map_err(|e| e.to_string())?;
        let secret_id = format!("store_account:{}", store_id);

        // 1. Update memory fallback cache
        {
            let mut cache = match self.local_cache.write() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            cache.insert(store_id.to_string(), session.clone());
        }

        // 2. Encrypt with master key using secret_id as AAD and persist in SQLite
        let (nonce, ciphertext) = self
            .vault
            .encrypt(&secret_id, json.as_bytes())
            .map_err(|e| format!("Vault encryption error for {}: {}", store_id, e))?;

        self.db
            .store_secret(&secret_id, &nonce, &ciphertext)
            .map_err(|e| format!("DB store_secret error for {}: {}", store_id, e))?;

        Ok(())
    }

    /// Retrieve an existing session from envelope-encrypted SQLite vault, falling back to local memory cache (Requirement D1)
    pub fn load_session(&self, store_id: &str) -> Result<Option<StoreAccountSession>, String> {
        // 1. Check local memory cache first
        {
            let cache = match self.local_cache.read() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            if let Some(session) = cache.get(store_id) {
                return Ok(Some(session.clone()));
            }
        }

        // 2. Query encrypted secret from SQLite and decrypt using secret_id as AAD
        let secret_id = format!("store_account:{}", store_id);
        if let Some((nonce, ciphertext)) = self.db.get_secret(&secret_id).map_err(|e| e.to_string())? {
            let decrypted = self
                .vault
                .decrypt(&secret_id, &nonce, &ciphertext)
                .map_err(|e| format!("Vault decryption error for {}: {}", store_id, e))?;

            let session = serde_json::from_slice::<StoreAccountSession>(&decrypted)
                .map_err(|e| format!("Session deserialization error for {}: {}", store_id, e))?;

            // Populate memory cache
            let mut cache = match self.local_cache.write() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            cache.insert(store_id.to_string(), session.clone());
            return Ok(Some(session));
        }

        Ok(None)
    }

    /// Remove a store account session from SQLite, memory cache, and legacy keyring
    pub fn delete_session(&self, store_id: &str) -> Result<(), String> {
        // 1. Remove from memory cache
        {
            let mut cache = match self.local_cache.write() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            cache.remove(store_id);
        }

        // 2. Remove encrypted secret from SQLite
        let secret_id = format!("store_account:{}", store_id);
        self.db.delete_secret(&secret_id).map_err(|e| e.to_string())?;

        // 3. Remove from legacy OS keyring if lingering
        if let Ok(entry) = keyring::Entry::new("omnis_store_accounts", store_id) {
            let _ = entry.delete_password();
        }

        Ok(())
    }

    /// Retrieve summary status of all supported stores (Steam, Epic, GOG, Xbox)
    pub async fn get_store_accounts(&self) -> Result<Vec<StoreAccountDto>, String> {
        let mut accounts = Vec::new();

        // 1. Steam
        let steam_session = self.load_session("steam")?;
        let steam_sync = self.last_syncs.read().await.get("steam").cloned();
        let steam_has_key = steam_session.as_ref().map(|s| {
            !s.access_token.starts_with("steam_session:") && !s.access_token.trim().is_empty()
        });
        accounts.push(StoreAccountDto {
            store_id: "steam".to_string(),
            name: "Steam".to_string(),
            is_connected: steam_session.is_some(),
            username: steam_session.as_ref().map(|s| s.username.clone()),
            avatar_url: steam_session.as_ref().and_then(|s| s.avatar_url.clone()),
            last_sync: steam_sync,
            has_api_key: steam_has_key,
            is_syncing: self.is_store_syncing("steam"),
        });

        // 2. Epic Games Store
        let epic_session = self.load_session("epic")?;
        let epic_sync = self.last_syncs.read().await.get("epic").cloned();
        accounts.push(StoreAccountDto {
            store_id: "epic".to_string(),
            name: "Epic Games Store".to_string(),
            is_connected: epic_session.is_some(),
            username: epic_session.as_ref().map(|s| s.username.clone()),
            avatar_url: epic_session.as_ref().and_then(|s| s.avatar_url.clone()),
            last_sync: epic_sync,
            has_api_key: None,
            is_syncing: self.is_store_syncing("epic"),
        });

        // 3. GOG Galaxy
        let gog_session = self.load_session("gog")?;
        let gog_sync = self.last_syncs.read().await.get("gog").cloned();
        accounts.push(StoreAccountDto {
            store_id: "gog".to_string(),
            name: "GOG Galaxy".to_string(),
            is_connected: gog_session.is_some(),
            username: gog_session.as_ref().map(|s| s.username.clone()),
            avatar_url: gog_session.as_ref().and_then(|s| s.avatar_url.clone()),
            last_sync: gog_sync,
            has_api_key: None,
            is_syncing: self.is_store_syncing("gog"),
        });

        // 4. Xbox Live / PC Game Pass
        let xbox_session = self.load_session("xbox")?;
        let xbox_sync = self.last_syncs.read().await.get("xbox").cloned();
        accounts.push(StoreAccountDto {
            store_id: "xbox".to_string(),
            name: "Xbox / PC Game Pass".to_string(),
            is_connected: xbox_session.is_some(),
            username: xbox_session.as_ref().map(|s| s.username.clone()),
            avatar_url: xbox_session.as_ref().and_then(|s| s.avatar_url.clone()),
            last_sync: xbox_sync,
            has_api_key: None,
            is_syncing: self.is_store_syncing("xbox"),
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

        let mut builder = WebviewWindowBuilder::new(app_handle, &label, window_url)
            .title(format!("Accesso {}", plugin.name()))
            .inner_size(850.0, 700.0)
            .resizable(true)
            .center();

        if store_id == "epic" {
            let epic_script = r#"
                (function() {
                    function extractAndForwardEpicCode() {
                        try {
                            const bodyText = document.body ? document.body.innerText : '';
                            if (bodyText && (bodyText.includes('authorizationCode') || bodyText.includes('exchangeCode'))) {
                                const parsed = JSON.parse(bodyText);
                                const code = parsed.authorizationCode || parsed.exchangeCode;
                                if (code) {
                                    window.location.href = 'https://localhost/launcher/authorized?code=' + encodeURIComponent(code);
                                } else if (parsed.redirectUrl && parsed.redirectUrl.includes('code=')) {
                                    window.location.href = parsed.redirectUrl;
                                }
                            }
                        } catch (e) {}
                    }

                    if (document.readyState === 'complete' || document.readyState === 'interactive') {
                        extractAndForwardEpicCode();
                    } else {
                        window.addEventListener('DOMContentLoaded', extractAndForwardEpicCode);
                        window.addEventListener('load', extractAndForwardEpicCode);
                    }
                    const timer = setInterval(extractAndForwardEpicCode, 300);
                    setTimeout(() => clearInterval(timer), 30000);
                })();
            "#;
            builder = builder.initialization_script(epic_script);
        }

        let builder = builder.on_navigation(move |url| {
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
        if !self.mark_syncing(store_id) {
            tracing::info!("Store {} is already synchronizing", store_id);
            return Ok(0);
        }
        struct SyncGuard<'a>(&'a StoreAccountManager, &'a str);
        impl Drop for SyncGuard<'_> {
            fn drop(&mut self) {
                self.0.unmark_syncing(self.1);
            }
        }
        let _guard = SyncGuard(self, store_id);

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
                message: Some(format!("Connessione a {} e recupero catalogo cloud...", plugin.name())),
            },
        );

        // Fetch catalog from remote store
        let (mut games, remote_error) = match plugin.sync_games(&session).await {
            Ok(g) => (g, None),
            Err(e) => {
                let err_str = e.to_string();
                tracing::warn!("Remote sync warning for {}: {}", store_id, err_str);
                (Vec::new(), Some(err_str))
            }
        };

        // Emit intermediate progress after remote catalog fetch
        let _ = app_handle.emit(
            "store-sync-progress",
            StoreSyncProgressPayload {
                store_id: store_id.to_string(),
                current: games.len(),
                total: games.len(),
                status: "syncing".to_string(),
                message: Some(format!(
                    "Trovati {} titoli cloud da {}. Verifica installazioni locali...",
                    games.len(),
                    plugin.name()
                )),
            },
        );

        // If the plugin has local scan capabilities (e.g. Steam, Epic), merge local installed games
        if let Ok(local_games) = plugin.scan().await {
            if !local_games.is_empty() {
                let mut local_map: HashMap<String, DiscoveredGame> = local_games
                    .into_iter()
                    .map(|g| (g.external_id.clone(), g))
                    .collect();

                for game in games.iter_mut() {
                    if let Some(mut local) = local_map.remove(&game.external_id) {
                        local.playtime_seconds = local.playtime_seconds.max(game.playtime_seconds);
                        if local.cover_image_path.is_none() {
                            local.cover_image_path = game.cover_image_path.clone();
                        }
                        if local.background_image_path.is_none() {
                            local.background_image_path = game.background_image_path.clone();
                        }
                        if local.last_activity.is_none() {
                            local.last_activity = game.last_activity;
                        }
                        local.is_installed = true;
                        *game = local;
                    }
                }

                for (_, local) in local_map {
                    games.push(local);
                }
            }
        }

        // Emit progress before SQLite ingestion
        let _ = app_handle.emit(
            "store-sync-progress",
            StoreSyncProgressPayload {
                store_id: store_id.to_string(),
                current: games.len(),
                total: games.len(),
                status: "syncing".to_string(),
                message: Some(format!(
                    "Salvataggio di {} giochi nel database...",
                    games.len()
                )),
            },
        );

        // If both remote sync and local scan yielded no games and there was a remote error, report the error
        if games.is_empty() {
            if let Some(ref err_msg) = remote_error {
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
                return Err(err_msg.clone());
            }
        }

        // Ingest into SQLite database
        let count = match self.db.ingest_discovered_batch(&games) {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("Errore salvataggio giochi per {}: {}", plugin.name(), e);
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

        // Update last sync time
        self.last_syncs
            .write()
            .await
            .insert(store_id.to_string(), Utc::now());

        let completion_message = if let Some(ref err_msg) = remote_error {
            format!(
                "Sincronizzati {} giochi locali da {}. (Nota catalogo cloud: {})",
                games.len(),
                plugin.name(),
                err_msg
            )
        } else {
            format!(
                "Sincronizzati {} giochi da {}",
                games.len(),
                plugin.name()
            )
        };

        // Emit completion
        let _ = app_handle.emit(
            "store-sync-progress",
            StoreSyncProgressPayload {
                store_id: store_id.to_string(),
                current: games.len(),
                total: games.len(),
                status: "completed".to_string(),
                message: Some(completion_message),
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
        let mut connected_count = 0;
        for acc in accounts {
            if acc.is_connected {
                connected_count += 1;
                match self.sync_store(app_handle, &acc.store_id).await {
                    Ok(count) => total_synced += count,
                    Err(err) => {
                        tracing::warn!("Errore sync store {}: {}", acc.store_id, err);
                    }
                }
            }
        }
        if connected_count == 0 {
            let _ = app_handle.emit(
                "store-sync-progress",
                StoreSyncProgressPayload {
                    store_id: "all".to_string(),
                    current: 0,
                    total: 0,
                    status: "completed".to_string(),
                    message: Some("Nessun account store collegato da sincronizzare.".to_string()),
                },
            );
        }
        Ok(total_synced)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
            assert!(!acc.is_connected, "Account {} should be disconnected", acc.store_id);
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
        let steam_after = accounts_after.iter().find(|a| a.store_id == "steam").unwrap();
        assert!(steam_after.is_connected);
        assert_eq!(steam_after.has_api_key, Some(true));

        let loaded = manager.load_session("steam").unwrap().unwrap();
        assert_eq!(loaded.access_token, api_key);
        assert_eq!(loaded.user_id, "76561198000000000");

        let _ = manager.delete_session("steam");
    }
}

