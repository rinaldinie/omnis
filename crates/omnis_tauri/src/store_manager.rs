//! Store account and cloud synchronization manager for Omnis Game Library
//!
//! Clean Architecture coordinator composing:
//! - StoreSessionVault: secure session storage, envelope encryption, and settings
//! - OAuthLoginService: Tauri webview OAuth popup management
//! - StoreCatalogSyncEngine: library sync and progress reporting

use chrono::{DateTime, Utc};
use omnis_core::{Database, SecretVault};
use omnis_sdk::models::StoreAccountDto;
use omnis_sdk::plugin::{CloudStorePlugin, StoreAccountSession};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tauri::AppHandle;

#[path = "store/oauth.rs"]
pub mod oauth;
#[path = "store/session.rs"]
pub mod session;
#[path = "store/sync.rs"]
pub mod sync;

#[cfg(test)]
#[path = "store/tests.rs"]
mod tests;

pub use oauth::{OAuthLoginService, OAuthSessionHandler};
pub use session::StoreSessionVault;
pub use sync::StoreCatalogSyncEngine;

/// Integration settings DTO matching Playnite store configuration options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreIntegrationSettingsDto {
    pub store_id: String,
    pub import_installed: bool,
    pub connect_account: bool,
    pub import_uninstalled: bool,
    pub ignore_other_accounts: bool,
    // Steam specific
    #[serde(default)]
    pub account_id: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub import_free_items: Option<bool>,
    #[serde(default)]
    pub import_family_sharing: Option<bool>,
    // Xbox specific
    #[serde(default)]
    pub import_game_pass: Option<bool>,
    // Advanced
    #[serde(default)]
    pub custom_client_path: Option<String>,
}

/// High-level coordinator composing session vault, OAuth service, and sync engine
#[derive(Clone)]
pub struct StoreAccountManager {
    pub(crate) plugins: Arc<RwLock<HashMap<String, Arc<dyn CloudStorePlugin>>>>,
    pub(crate) db: Arc<Database>,
    pub(crate) vault: Arc<SecretVault>,
    pub(crate) local_cache: Arc<RwLock<HashMap<String, StoreAccountSession>>>,
    pub(crate) last_syncs: Arc<tokio::sync::RwLock<HashMap<String, DateTime<Utc>>>>,
    pub(crate) syncing_stores: Arc<RwLock<std::collections::HashSet<String>>>,
}

impl StoreAccountManager {
    /// Create a new StoreAccountManager bound to the given database and envelope vault
    pub fn new(db: Arc<Database>, vault: Arc<SecretVault>) -> Self {
        let mgr = Self {
            plugins: Arc::new(RwLock::new(HashMap::new())),
            db,
            vault,
            local_cache: Arc::new(RwLock::new(HashMap::new())),
            last_syncs: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
            syncing_stores: Arc::new(RwLock::new(std::collections::HashSet::new())),
        };
        // Migrate legacy keyring entries to envelope-encrypted SQLite vault
        mgr.migrate_legacy_keyring();
        mgr
    }

    #[inline]
    pub fn mark_syncing(&self, store_id: &str) -> bool {
        StoreSessionVault::mark_syncing(self, store_id)
    }

    #[inline]
    pub fn unmark_syncing(&self, store_id: &str) {
        StoreSessionVault::unmark_syncing(self, store_id)
    }

    #[inline]
    pub fn is_store_syncing(&self, store_id: &str) -> bool {
        StoreSessionVault::is_store_syncing(self, store_id)
    }

    #[inline]
    pub fn set_api_key(&self, store_id: &str, api_key: &str) -> Result<(), String> {
        StoreSessionVault::set_api_key(self, store_id, api_key)
    }

    #[inline]
    pub fn save_integration_settings(
        &self,
        store_id: &str,
        settings: &StoreIntegrationSettingsDto,
    ) -> Result<(), String> {
        StoreSessionVault::save_integration_settings(self, store_id, settings)
    }

    #[inline]
    pub fn get_integration_settings(
        &self,
        store_id: &str,
    ) -> Result<StoreIntegrationSettingsDto, String> {
        StoreSessionVault::get_integration_settings(self, store_id)
    }

    #[inline]
    pub fn is_fallback(&self) -> bool {
        StoreSessionVault::is_fallback(self)
    }

    #[inline]
    pub fn migrate_legacy_keyring(&self) {
        StoreSessionVault::migrate_legacy_keyring(self)
    }

    pub fn register_plugin(&self, plugin: Arc<dyn CloudStorePlugin>) {
        let mut plugins = self.plugins.write().unwrap();
        plugins.insert(plugin.id().to_string(), plugin);
    }

    pub async fn get_plugin(&self, store_id: &str) -> Option<Arc<dyn CloudStorePlugin>> {
        let plugins = self.plugins.read().unwrap();
        plugins.get(store_id).cloned()
    }

    pub fn get_plugin_sync(&self, store_id: &str) -> Option<Arc<dyn CloudStorePlugin>> {
        let plugins = self.plugins.read().unwrap();
        plugins.get(store_id).cloned()
    }

    #[inline]
    pub fn save_session(&self, store_id: &str, session: &StoreAccountSession) -> Result<(), String> {
        StoreSessionVault::save_session(self, store_id, session)
    }

    #[inline]
    pub fn load_session(&self, store_id: &str) -> Result<Option<StoreAccountSession>, String> {
        StoreSessionVault::load_session(self, store_id)
    }

    #[inline]
    pub fn delete_session(&self, store_id: &str) -> Result<(), String> {
        StoreSessionVault::delete_session(self, store_id)
    }

    #[inline]
    pub async fn get_store_accounts(&self) -> Result<Vec<StoreAccountDto>, String> {
        StoreSessionVault::get_store_accounts(self).await
    }

    pub fn start_login(&self, app_handle: &AppHandle, store_id: &str) -> Result<(), String> {
        let plugin = self
            .get_plugin_sync(store_id)
            .ok_or_else(|| format!("Plugin non trovato per lo store {}", store_id))?;
        OAuthLoginService::start_login(app_handle, plugin, store_id, Arc::new(self.clone()))
    }

    #[inline]
    pub async fn sync_store(&self, app_handle: &AppHandle, store_id: &str) -> Result<usize, String> {
        StoreCatalogSyncEngine::sync_store(self, app_handle, store_id).await
    }

    #[inline]
    pub async fn sync_all_connected(&self, app_handle: &AppHandle) -> Result<usize, String> {
        StoreCatalogSyncEngine::sync_all_connected(self, app_handle).await
    }
}

#[async_trait::async_trait]
impl OAuthSessionHandler for StoreAccountManager {
    async fn on_session_authenticated(
        &self,
        app: &AppHandle,
        store_id: &str,
        session: StoreAccountSession,
    ) {
        if let Err(e) = self.save_session(store_id, &session) {
            tracing::error!("Errore nel salvataggio della sessione {}: {}", store_id, e);
        }
        let _ = app.emit(
            "store-account-connected",
            serde_json::json!({
                "store_id": store_id,
                "username": session.username,
            }),
        );
        if let Err(e) = self.sync_store(app, store_id).await {
            tracing::error!("Errore sincronizzazione iniziale store {}: {}", store_id, e);
        }
    }
}
