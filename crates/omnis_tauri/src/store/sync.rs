//! Library synchronization from connected cloud store accounts, progress reporting, and catalog batch updates

use chrono::Utc;
use omnis_core::metadata::{HttpMediaDownloader, MediaStorageManager};
use omnis_sdk::constants::events;
use omnis_sdk::models::{DiscoveredGame, StoreSyncProgressPayload};
use omnis_sdk::plugin::{CloudStorePlugin, StoreAccountSession};
use omnis_sdk::GameMetadataPatch;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

use super::manager::StoreAccountManager;

impl StoreAccountManager {
    /// Synchronize owned game library from a connected cloud store
    pub async fn sync_store(
        &self,
        app_handle: &AppHandle,
        store_id: &str,
    ) -> Result<usize, String> {
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

        // 1. Refresh OAuth session if expired
        self.ensure_fresh_session(app_handle, store_id, plugin.as_ref(), &mut session)
            .await?;

        // 2. Report initial sync progress
        Self::emit_sync_progress(
            app_handle,
            store_id,
            0,
            0,
            "syncing",
            Some(format!(
                "Connessione a {} e recupero catalogo cloud...",
                plugin.name()
            )),
        );

        // 3. Fetch catalog from remote store
        let (mut games, remote_error) = match plugin.sync_games(&session).await {
            Ok(g) => (g, None),
            Err(omnis_sdk::PluginError::SessionExpired(msg)) => {
                tracing::info!(
                    "Store {} reported session expired ({}), attempting immediate token refresh...",
                    store_id,
                    msg
                );
                match self.refresh_session(store_id).await {
                    Ok(new_session) => {
                        session = new_session;
                        match plugin.sync_games(&session).await {
                            Ok(g) => (g, None),
                            Err(e) => (Vec::new(), Some(e.to_string())),
                        }
                    }
                    Err(refresh_err) => (Vec::new(), Some(format!("{}: {}", msg, refresh_err))),
                }
            }
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
            Some(format!(
                "Salvataggio di {} giochi nel database...",
                games.len()
            )),
        );

        // 5. Ingest into database
        if games.is_empty() {
            if let Some(ref err_msg) = remote_error {
                Self::emit_sync_progress(
                    app_handle,
                    store_id,
                    0,
                    0,
                    "error",
                    Some(err_msg.clone()),
                );
                return Err(err_msg.clone());
            }
        }

        let count = match self.db.ingest_discovered_batch(&games) {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("Errore salvataggio giochi per {}: {}", plugin.name(), e);
                Self::emit_sync_progress(
                    app_handle,
                    store_id,
                    0,
                    0,
                    "error",
                    Some(err_msg.clone()),
                );
                return Err(err_msg);
            }
        };

        // 5b. Cache remote cover and background artwork locally so all stores behave like Steam
        self.cache_store_artwork(app_handle, store_id).await;

        // 6. Update last sync timestamp and emit completion
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
            format!("Sincronizzati {} giochi da {}", games.len(), plugin.name())
        };

        Self::emit_sync_progress(
            app_handle,
            store_id,
            games.len(),
            games.len(),
            "completed",
            Some(completion_message),
        );

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
    pub async fn sync_all_connected(
        &self,
        app_handle: &AppHandle,
    ) -> Result<usize, String> {
        let accounts = self.get_store_accounts().await?;
        let mut total = 0;

        for account in accounts {
            if account.is_connected {
                match self.sync_store(app_handle, &account.store_id).await {
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
        &self,
        app_handle: &AppHandle,
        store_id: &str,
        _plugin: &dyn CloudStorePlugin,
        session: &mut StoreAccountSession,
    ) -> Result<(), String> {
        if !session.is_expired() {
            return Ok(());
        }

        match self.refresh_session(store_id).await {
            Ok(new_session) => {
                *session = new_session;
                Ok(())
            }
            Err(err_msg) => {
                Self::emit_sync_progress(
                    app_handle,
                    store_id,
                    0,
                    0,
                    "error",
                    Some(err_msg.clone()),
                );
                Err(err_msg)
            }
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

    /// Downloads and caches remote cover/background URLs locally for games belonging to `store_id`.
    async fn cache_store_artwork(&self, app_handle: &AppHandle, store_id: &str) {
        let Some(ref cache_dir) = self.cache_dir else {
            return;
        };

        let games = match self.db.get_all_games() {
            Ok(g) => g,
            Err(e) => {
                tracing::warn!("Failed to query games for artwork caching: {}", e);
                return;
            }
        };

        let is_remote = |opt: &Option<String>| -> bool {
            opt.as_deref()
                .map(|s| {
                    let t = s.trim();
                    t.starts_with("http://") || t.starts_with("https://")
                })
                .unwrap_or(false)
        };

        let pending: Vec<_> = games
            .into_iter()
            .filter(|g| {
                g.library_id.eq_ignore_ascii_case(store_id)
                    && (is_remote(&g.cover_image_path) || is_remote(&g.background_image_path))
            })
            .collect();

        if pending.is_empty() {
            return;
        }

        let total = pending.len();
        Self::emit_sync_progress(
            app_handle,
            store_id,
            0,
            total,
            "syncing",
            Some(format!("Download copertine in locale (0/{})...", total)),
        );

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_default();
        let media = Arc::new(HttpMediaDownloader::new(client));
        let semaphore = Arc::new(Semaphore::new(8));
        let mut tasks = JoinSet::new();

        for game in pending {
            let media = Arc::clone(&media);
            let db = Arc::clone(&self.db);
            let cache_dir = cache_dir.clone();
            let sem = Arc::clone(&semaphore);

            tasks.spawn(async move {
                let _permit = sem.acquire_owned().await.ok()?;
                let mut patch = GameMetadataPatch::default();
                if is_remote(&game.cover_image_path) {
                    patch.cover_url = game.cover_image_path.clone();
                }
                if is_remote(&game.background_image_path) {
                    patch.background_url = game.background_image_path.clone();
                }

                MediaStorageManager::cache_game_artwork(
                    media.as_ref(),
                    game.id,
                    &game.library_id,
                    &game.external_id,
                    &cache_dir,
                    &mut patch,
                )
                .await;

                // Only persist fields that resolved to a local file path
                let has_local_cover = patch
                    .cover_url
                    .as_deref()
                    .map(|u| !u.starts_with("http://") && !u.starts_with("https://"))
                    .unwrap_or(false);
                let has_local_bg = patch
                    .background_url
                    .as_deref()
                    .map(|u| !u.starts_with("http://") && !u.starts_with("https://"))
                    .unwrap_or(false);

                if !has_local_cover {
                    patch.cover_url = None;
                }
                if !has_local_bg {
                    patch.background_url = None;
                }

                if patch.cover_url.is_some() || patch.background_url.is_some() {
                    if let Err(e) = db.apply_metadata_patch(game.id, &patch) {
                        tracing::warn!("Failed to save cached artwork paths for {}: {}", game.id, e);
                    }
                }
                Some(())
            });
        }

        let mut completed = 0usize;
        while tasks.join_next().await.is_some() {
            completed += 1;
            if completed.is_multiple_of(10) || completed == total {
                Self::emit_sync_progress(
                    app_handle,
                    store_id,
                    completed,
                    total,
                    "syncing",
                    Some(format!(
                        "Download copertine in locale ({}/{})...",
                        completed, total
                    )),
                );
            }
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
