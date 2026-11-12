//! Store account and cloud synchronization manager for Omnis Game Library
//!
//! Clean Architecture coordinator composing:
//! - StoreSessionVault: secure session storage, envelope encryption, and settings
//! - OAuthLoginService: Tauri webview OAuth popup management
//! - StoreCatalogSyncEngine: library sync and progress reporting

use chrono::{DateTime, Utc};
use omnis_core::{Database, SecretVault};
use omnis_sdk::plugin::{CloudStorePlugin, StoreAccountSession};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter};

use super::oauth::{OAuthLoginService, OAuthSessionHandler};

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

    /// Loads a store session, automatically renewing the token if expired and a refresh token is present.
    pub async fn get_valid_session(
        &self,
        store_id: &str,
    ) -> Result<Option<StoreAccountSession>, String> {
        let session = self.load_session(store_id)?;
        let session = match session {
            Some(s) => s,
            None => return Ok(None),
        };

        if session.is_expired() && session.refresh_token.is_some() {
            tracing::info!(
                "Session for store '{}' is expired (expires_at={:?}); attempting automatic token refresh...",
                store_id,
                session.expires_at
            );
            return self.refresh_session(store_id).await.map(Some);
        }

        Ok(Some(session))
    }

    /// Explicitly refreshes the OAuth session for a store using its stored refresh token.
    pub async fn refresh_session(&self, store_id: &str) -> Result<StoreAccountSession, String> {
        let existing = self
            .load_session(store_id)?
            .ok_or_else(|| format!("Nessuna sessione trovata per lo store '{store_id}'"))?;

        let refresh_tok = existing.refresh_token.as_ref().ok_or_else(|| {
            format!(
                "Sessione per '{store_id}' scaduta e nessun refresh token disponibile. Effettuare nuovamente il login."
            )
        })?;

        let plugin = self
            .get_plugin_sync(store_id)
            .ok_or_else(|| format!("Plugin non trovato per lo store '{store_id}'"))?;

        let mut new_session = plugin
            .refresh_session(refresh_tok)
            .await
            .map_err(|e| format!("Errore nel rinnovo della sessione per '{store_id}': {e}"))?;

        // Preserve username/avatar if refreshed session returned fallback placeholder
        if new_session.username.starts_with("GOG User ")
            && !existing.username.is_empty()
            && !existing.username.starts_with("GOG User ")
        {
            new_session.username = existing.username.clone();
        }
        if new_session.avatar_url.is_none() && existing.avatar_url.is_some() {
            new_session.avatar_url = existing.avatar_url.clone();
        }

        self.save_session(store_id, &new_session)?;
        tracing::info!(
            "Successfully refreshed and persisted session for store '{}'",
            store_id
        );
        Ok(new_session)
    }

    pub fn start_login(&self, app_handle: &AppHandle, store_id: &str) -> Result<(), String> {
        let plugin = self
            .get_plugin_sync(store_id)
            .ok_or_else(|| format!("Plugin non trovato per lo store {}", store_id))?;
        OAuthLoginService::start_login(app_handle, plugin, store_id, Arc::new(self.clone()))
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
