use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use omnis_core::{Database, SecretVault};
use omnis_sdk::models::StoreAccountDto;
use omnis_sdk::plugin::{CloudStorePlugin, StoreAccountSession};

use crate::store_manager::{StoreAccountManager, StoreIntegrationSettingsDto};

/// Handles secure session storage, envelope encryption in SQLite, legacy keyring migration, and store settings
pub struct StoreSessionVault;

impl StoreSessionVault {
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

    /// Save full store integration configuration options (Playnite parity)
    pub fn save_integration_settings(
        &self,
        settings: &StoreIntegrationSettingsDto,
    ) -> Result<(), String> {
        let store_id = &settings.store_id;

        // Strict validation for Steam
        if store_id == "steam" {
            if settings.connect_account {
                let key = settings.api_key.as_deref().unwrap_or("").trim();
                if key.is_empty() {
                    return Err("La Steam Web API Key è obbligatoria per connettere l'account Steam.".to_string());
                }
                let acc_id = settings.account_id.as_deref().unwrap_or("").trim();
                if acc_id.is_empty() {
                    return Err("L'ID Account Steam (SteamID64 di 17 cifre) è obbligatorio.".to_string());
                }
                if !acc_id.chars().all(|c| c.is_ascii_digit()) || acc_id.len() < 16 {
                    return Err("L'ID Account Steam deve essere numerico (SteamID64 di 17 cifre).".to_string());
                }

                // Update active session for Steam with verified API Key & User ID
                let existing_avatar = self.load_session("steam").ok().flatten().and_then(|s| s.avatar_url.clone());
                let session = StoreAccountSession {
                    store_id: "steam".to_string(),
                    user_id: acc_id.to_string(),
                    username: format!("Steam ID {}", acc_id),
                    avatar_url: existing_avatar,
                    access_token: key.to_string(),
                    refresh_token: Some(format!("steam_session:{}", acc_id)),
                    expires_at: None,
                };
                self.save_session("steam", &session)?;
            } else {
                // If user toggles off connect_account for steam, remove session
                let _ = self.delete_session("steam");
            }
        }

        // Encrypt and persist integration settings in Vault
        let secret_id = format!("store_settings:{}", store_id);
        let json = serde_json::to_string(settings).map_err(|e| e.to_string())?;
        let (nonce, ciphertext) = self
            .vault
            .encrypt(&secret_id, json.as_bytes())
            .map_err(|e| format!("Vault encryption error: {}", e))?;
        self.db
            .store_secret(&secret_id, &nonce, &ciphertext)
            .map_err(|e| format!("DB error storing settings: {}", e))?;

        Ok(())
    }

    /// Retrieve store integration configuration options (Playnite parity)
    pub fn get_integration_settings(
        &self,
        store_id: &str,
    ) -> Result<StoreIntegrationSettingsDto, String> {
        let secret_id = format!("store_settings:{}", store_id);
        if let Some((nonce, ciphertext)) = self.db.get_secret(&secret_id).map_err(|e| e.to_string())? {
            if let Ok(decrypted) = self.vault.decrypt(&secret_id, &nonce, &ciphertext) {
                if let Ok(settings) = serde_json::from_slice::<StoreIntegrationSettingsDto>(&decrypted) {
                    return Ok(settings);
                }
            }
        }

        // Return defaults based on active session
        let session = self.load_session(store_id).ok().flatten();
        let has_key = session.as_ref().map(|s| {
            !s.access_token.starts_with("steam_session:") && !s.access_token.trim().is_empty()
        });
        let is_connected = if store_id == "steam" {
            session.is_some() && has_key == Some(true)
        } else {
            session.is_some()
        };

        let (account_id, api_key) = if store_id == "steam" {
            if let Some(ref s) = session {
                let key = if has_key == Some(true) {
                    Some(s.access_token.clone())
                } else {
                    None
                };
                (Some(s.user_id.clone()), key)
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        Ok(StoreIntegrationSettingsDto {
            store_id: store_id.to_string(),
            import_installed: true,
            connect_account: is_connected,
            import_uninstalled: true,
            ignore_other_accounts: true,
            account_id,
            api_key,
            import_free_items: Some(false),
            import_family_sharing: Some(true),
            import_game_pass: Some(true),
            custom_client_path: None,
        })
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
}
