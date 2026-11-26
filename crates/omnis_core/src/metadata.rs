use crate::db::Database;
use omnis_sdk::{GameMetadataPatch, MetadataSearchRequest};
use std::ops::Deref;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tracing::{info, warn};
use uuid::Uuid;

pub mod gog;
pub mod igdb;
pub mod opencritic;
pub mod steam;
pub mod steamgriddb;
pub mod types;
pub mod utils;

pub use gog::GogMetadataProvider;
pub use igdb::IgdbMetadataProvider;
pub use opencritic::OpenCriticProvider;
pub use steam::SteamMetadataProvider;
pub use steamgriddb::SteamGridDbProvider;
pub use types::*;
pub use utils::*;

pub mod fallback;
pub mod hltb;
pub mod media;
pub mod registry;
pub mod resolver;
pub mod search;
pub mod storage;

pub use fallback::FallbackMetadataGenerator;
pub use hltb::{HltbEnrichmentService, HowLongToBeatProvider};
pub use media::{HttpMediaDownloader, MediaDownloader};
pub use registry::{MetadataRegistry, ProviderRegistry};
pub use resolver::MetadataPipelineResolver;
pub use search::MetadataSearchEngine;
pub use storage::MediaStorageManager;

// ============================================================================
// 4. Metadata Pipeline & Engine Manager
// ============================================================================
pub struct MetadataDownloader {
    pub client: reqwest::Client,
    pub registry: Arc<ProviderRegistry>,
    pub media: Arc<HttpMediaDownloader>,
    pub cancel_requested: Arc<AtomicBool>,
}

impl Default for MetadataDownloader {
    fn default() -> Self {
        Self::new()
    }
}

impl Deref for MetadataDownloader {
    type Target = ProviderRegistry;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.registry
    }
}

impl MetadataDownloader {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(12))
            .user_agent("OmnisGameLibrary/0.1.0 (Windows NT 10.0; Win64; x64)")
            .build()
            .unwrap_or_default();

        let registry = Arc::new(ProviderRegistry::new(client.clone()));
        let media = Arc::new(HttpMediaDownloader::new(client.clone()));

        Self {
            client,
            registry,
            media,
            cancel_requested: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Construct a MetadataDownloader with explicit registry and media services (for mocking and tests)
    pub fn with_services(
        client: reqwest::Client,
        registry: Arc<ProviderRegistry>,
        media: Arc<HttpMediaDownloader>,
    ) -> Self {
        Self {
            client,
            registry,
            media,
            cancel_requested: Arc::new(AtomicBool::new(false)),
        }
    }

    // Inherent forwarders to media downloader
    #[inline]
    pub async fn download_image_bytes(&self, url: &str) -> Result<Vec<u8>, String> {
        self.media.download_image_bytes(url).await
    }

    #[inline]
    pub async fn download_image_with_fallbacks(
        &self,
        url: &str,
        appid_hint: Option<&str>,
    ) -> Result<Vec<u8>, String> {
        self.media
            .download_image_with_fallbacks(url, appid_hint)
            .await
    }

    /// Search for metadata candidates across online providers (Steam, GOG, and enabled external providers)
    /// Search for metadata candidates across online providers (Steam, GOG, and enabled external providers)
    pub async fn search_candidates(
        &self,
        title: &str,
        provider_id: Option<&str>,
    ) -> Result<Vec<MetadataCandidateDto>, String> {
        MetadataSearchEngine::search_candidates(
            &self.client,
            &self.registry,
            title,
            provider_id,
            |t, l| self.generate_fallback_metadata(t, l),
        )
        .await
    }

    /// Primary enrichment routine combining multiple providers via the priority pipeline
    pub async fn download_for_game(
        &self,
        db: &Database,
        game_id: Uuid,
        cache_dir: &Path,
    ) -> Result<GameMetadataPatch, String> {
        let game = db
            .get_game_by_id(game_id)
            .map_err(|e| format!("Database error fetching game: {}", e))?
            .ok_or_else(|| format!("Game {} not found in database", game_id))?;

        info!(
            "Avvio Scaricamento per '{}' (ID: {})...",
            game.title, game.id
        );

        let request = MetadataSearchRequest {
            title: game.title.clone(),
            external_id: Some(game.external_id.clone()),
            library_id: game.library_id.clone(),
        };

        let pipeline = self.registry.pipeline_config.read().await.clone();
        let settings_guard = self.registry.settings_cache.read().await;
        let enabled_guard = self.registry.enabled_providers.read().await;
        let providers_guard = self.registry.providers.read().await;

        let mut final_patch = MetadataPipelineResolver::resolve_metadata(
            &game,
            &request,
            &pipeline,
            &providers_guard,
            &enabled_guard,
            &settings_guard,
            |t, l| self.generate_fallback_metadata(t, l),
        )
        .await;

        MediaStorageManager::cache_game_artwork(
            self.media.as_ref(),
            game_id,
            &game.library_id,
            &game.external_id,
            cache_dir,
            &mut final_patch,
        )
        .await;
        if let Err(e) = db.apply_metadata_patch(game_id, &final_patch) {
            return Err(format!("Failed to save metadata to SQLite: {}", e));
        }

        info!("Scaricamento completato con successo per '{}'", game.title);
        Ok(final_patch)
    }

    /// Batch enrich all games in database, invoking progress callback on each completion
    pub async fn download_for_all<F>(
        self: Arc<Self>,
        db: Arc<Database>,
        cache_dir: &Path,
        progress_cb: F,
    ) -> Result<usize, String>
    where
        F: Fn(usize, usize, &str) + Send + Sync + 'static,
    {
        let game_ids = db.get_all_game_ids().map_err(|e| e.to_string())?;
        self.download_for_games(db, game_ids, cache_dir, progress_cb)
            .await
            .map(|ids| ids.len())
    }

    /// Batch enrich a specific list of games by UUID, invoking progress callback on each completion
    pub async fn download_for_games<F>(
        self: Arc<Self>,
        db: Arc<Database>,
        game_ids: Vec<Uuid>,
        cache_dir: &Path,
        progress_cb: F,
    ) -> Result<Vec<Uuid>, String>
    where
        F: Fn(usize, usize, &str) + Send + Sync + 'static,
    {
        const BATCH_METADATA_CONCURRENCY: usize = 3;

        self.cancel_requested.store(false, Ordering::SeqCst);
        let total = game_ids.len();
        if total == 0 {
            return Ok(Vec::new());
        }

        let cache_dir = cache_dir.to_path_buf();
        let mut pending = game_ids.into_iter();
        let mut in_flight = tokio::task::JoinSet::new();
        let mut enriched_ids = Vec::new();
        let mut completed = 0usize;

        loop {
            while !self.cancel_requested.load(Ordering::SeqCst)
                && in_flight.len() < BATCH_METADATA_CONCURRENCY
            {
                let Some(id) = pending.next() else {
                    break;
                };
                let downloader = Arc::clone(&self);
                let db_task = Arc::clone(&db);
                let cache_task = cache_dir.clone();
                in_flight.spawn(async move {
                    let game_title = db_task
                        .get_game_by_id(id)
                        .ok()
                        .flatten()
                        .map(|g| g.title);
                    let Some(title) = game_title else {
                        return (id, None, Ok(()));
                    };
                    let res = downloader
                        .download_for_game(&db_task, id, &cache_task)
                        .await
                        .map(|_| ());
                    (id, Some(title), res)
                });
            }

            let Some(joined) = in_flight.join_next().await else {
                break;
            };

            completed += 1;
            match joined {
                Ok((id, Some(title), Ok(()))) => {
                    enriched_ids.push(id);
                    progress_cb(completed, total, &title);
                }
                Ok((_, Some(title), Err(err))) => {
                    warn!("Failed metadata for '{}': {}", title, err);
                    progress_cb(completed, total, &title);
                }
                Ok((_, None, _)) => {}
                Err(err) => {
                    warn!("Batch metadata task failed: {}", err);
                }
            }
        }

        if self.cancel_requested.load(Ordering::SeqCst) {
            info!(
                "Arricchimento per selezione interrotto dall'utente dopo {} giochi (totale: {})",
                enriched_ids.len(),
                total
            );
        }

        Ok(enriched_ids)
    }

    /// Request cancellation of any ongoing batch metadata download
    pub fn cancel_download(&self) {
        self.cancel_requested.store(true, Ordering::SeqCst);
    }

    /// Check if cancellation was requested
    pub fn is_cancel_requested(&self) -> bool {
        self.cancel_requested.load(Ordering::SeqCst)
    }

    #[inline]
    pub fn generate_fallback_metadata(&self, title: &str, library: &str) -> GameMetadataPatch {
        FallbackMetadataGenerator::generate(title, library)
    }
}

#[cfg(test)]
mod tests;
