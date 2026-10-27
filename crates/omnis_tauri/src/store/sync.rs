use chrono::Utc;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use omnis_sdk::constants::events;
use omnis_sdk::models::{DiscoveredGame, StoreSyncProgressPayload};
use omnis_sdk::plugin::{CloudStorePlugin, StoreAccountSession};

use crate::store_manager::StoreAccountManager;

/// Handles library synchronization from connected cloud store accounts, progress reporting, and catalog batch updates
pub struct StoreCatalogSyncEngine;

impl StoreCatalogSyncEngine {
    /// Synchronize owned game library from a connected cloud store
    pub async fn sync_store(mgr: &StoreAccountManager, app_handle: &AppHandle, store_id: &str) -> Result<usize, String> {
        if !mgr.mark_syncing(store_id) {
            tracing::info!("Store {} is already synchronizing", store_id);
            return Ok(0);
        }
        struct SyncGuard<'a>(&'a StoreAccountManager, &'a str);
        impl Drop for SyncGuard<'_> {
            fn drop(&mut self) {
                self.0.unmark_syncing(self.1);
            }
        }
        let _guard = SyncGuard(mgr, store_id);

        let mut session = mgr
            .load_session(store_id)?
            .ok_or_else(|| format!("Nessun account connesso per {}", store_id))?;

        let plugin = mgr
            .get_plugin(store_id)
            .await
            .ok_or_else(|| format!("Plugin non trovato per {}", store_id))?;

        // 1. Refresh OAuth session if expired
        Self::ensure_fresh_session(mgr, app_handle, store_id, plugin.as_ref(), &mut session).await?;

        // 2. Report initial sync progress
        Self::emit_sync_progress(
            app_handle,
            store_id,
            0,
            0,
            "syncing",
            Some(format!("Connessione a {} e recupero catalogo cloud...", plugin.name())),
        );

        // 3. Fetch catalog from remote store
        let (mut games, remote_error) = match plugin.sync_games(&session).await {
            Ok(g) => (g, None),
            Err(e) => {
                let err_str = e.to_string();
                tracing::warn!("Remote sync warning for {}: {}", store_id, err_str);
                (Vec::new(), Some(err_str))
            }
        };

        Self::emit_sync_progress(
            app_handle,
            store_id,
            games.len(),
            games.len(),
            "syncing",
            Some(format!(
                "Trovati {} titoli cloud da {}. Verifica installazioni locali...",
                games.len(),
                plugin.name()
            )),
        );

        // 4. Merge locally discovered/installed games
        if let Ok(local_games) = plugin.scan().await {
            Self::merge_local_and_remote_catalogs(&mut games, local_games);
        }

        Self::emit_sync_progress(
            app_handle,
            store_id,
            games.len(),
            games.len(),
            "syncing",
            Some(format!("Salvataggio di {} giochi nel database...", games.len())),
        );

        // 5. Ingest into database
        if games.is_empty() {
            if let Some(ref err_msg) = remote_error {
                Self::emit_sync_progress(app_handle, store_id, 0, 0, "error", Some(err_msg.clone()));
                return Err(err_msg.clone());
            }
        }

        let count = match mgr.db.ingest_discovered_batch(&games) {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("Errore salvataggio giochi per {}: {}", plugin.name(), e);
                Self::emit_sync_progress(app_handle, store_id, 0, 0, "error", Some(err_msg.clone()));
                return Err(err_msg);
            }
        };

        // 6. Update last sync timestamp and emit completion
        mgr.last_syncs
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
            format!("Sincronizzati {} giochi da {}", games.len(), plugin.name())
        };

        Self::emit_sync_progress(app_handle, store_id, games.len(), games.len(), "completed", Some(completion_message));

        let _ = app_handle.emit(
            events::LIBRARY_UPDATED,
            serde_json::json!({
                "store_id": store_id,
                "count": count
            }),
        );

        tracing::info!("Successfully synced {} games from {}", count, store_id);
        Ok(count)
    }

    /// Synchronize all connected cloud stores sequentially
    pub async fn sync_all_connected(mgr: &StoreAccountManager, app_handle: &AppHandle) -> Result<usize, String> {
        let accounts = mgr.get_store_accounts().await?;
        let mut total = 0;

        for account in accounts {
            if account.is_connected {
                match Self::sync_store(mgr, app_handle, &account.store_id).await {
                    Ok(count) => total += count,
                    Err(e) => {
                        tracing::warn!("Sync failed for {}: {}", account.store_id, e);
                    }
                }
            }
        }

        Ok(total)
    }

    /// Refreshes OAuth access token if expired, persisting updated session
    async fn ensure_fresh_session(
        mgr: &StoreAccountManager,
        app_handle: &AppHandle,
        store_id: &str,
        plugin: &dyn CloudStorePlugin,
        session: &mut StoreAccountSession,
    ) -> Result<(), String> {
        if !session.is_expired() {
            return Ok(());
        }

        if let Some(ref refresh_tok) = session.refresh_token {
            match plugin.refresh_session(refresh_tok).await {
                Ok(new_session) => {
                    mgr.save_session(store_id, &new_session)?;
                    *session = new_session;
                    Ok(())
                }
                Err(e) => {
                    let err_msg = format!("Errore nel rinnovo della sessione per {}: {}", store_id, e);
                    Self::emit_sync_progress(app_handle, store_id, 0, 0, "error", Some(err_msg.clone()));
                    Err(err_msg)
                }
            }
        } else {
            let err_msg = "Sessione scaduta e nessun refresh token disponibile. Effettuare nuovamente il login.";
            Self::emit_sync_progress(app_handle, store_id, 0, 0, "error", Some(err_msg.to_string()));
            Err(err_msg.to_string())
        }
    }

    /// Seamlessly reconciles remote cloud games with locally detected installations
    fn merge_local_and_remote_catalogs(
        remote_games: &mut Vec<DiscoveredGame>,
        local_games: Vec<DiscoveredGame>,
    ) {
        if local_games.is_empty() {
            return;
        }

        let mut local_map: HashMap<String, DiscoveredGame> = local_games
            .into_iter()
            .map(|g| (g.external_id.clone(), g))
            .collect();

        for game in remote_games.iter_mut() {
            if let Some(mut local) = local_map.remove(&game.external_id) {
                local.playtime_seconds = local.playtime_seconds.max(game.playtime_seconds);
                if local.cover_image_path.is_none() {
                    local.cover_image_path = game.cover_image_path.clone();
                }
                if local.background_image_path.is_none() {
                    local.background_image_path = game.background_image_path.clone();
                }
                local.last_activity = match (local.last_activity, game.last_activity) {
                    (Some(l), Some(r)) => Some(l.max(r)),
                    (Some(l), None) => Some(l),
                    (None, Some(r)) => Some(r),
                    (None, None) => None,
                };
                local.is_installed = true;
                *game = local;
            }
        }

        for (_, local) in local_map {
            remote_games.push(local);
        }
    }

    /// Emits typed sync progress event to Tauri web frontend
    fn emit_sync_progress(
        app_handle: &AppHandle,
        store_id: &str,
        current: usize,
        total: usize,
        status: &str,
        message: Option<String>,
    ) {
        let _ = app_handle.emit(
            "store-sync-progress",
            StoreSyncProgressPayload {
                store_id: store_id.to_string(),
                current,
                total,
                status: status.to_string(),
                message,
            },
        );
    }
}
