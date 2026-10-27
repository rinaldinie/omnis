use std::collections::HashMap;
use serde_json::{Map, Value};
use omnis_sdk::{Game, GameMetadataPatch, MetadataProvider, MetadataSearchRequest};

use super::types::*;

struct ArtworkPrerequisites {
    should_fetch_cover: bool,
    should_fetch_background: bool,
    remote_cover_to_cache: Option<String>,
    remote_bg_to_cache: Option<String>,
}

/// Resolves metadata field priority, queries providers according to pipeline configuration, and applies fallbacks
pub struct MetadataPipelineResolver;

impl MetadataPipelineResolver {
    /// Resolve and merge metadata patches from all configured providers according to pipeline rules
    pub async fn resolve_metadata(
        game: &Game,
        request: &MetadataSearchRequest,
        pipeline: &MetadataPipelineConfig,
        providers: &HashMap<String, Box<dyn MetadataProvider>>,
        enabled: &HashMap<String, bool>,
        settings: &HashMap<String, Map<String, Value>>,
        fallback_fn: impl Fn(&str, &str) -> GameMetadataPatch,
    ) -> GameMetadataPatch {
        let artwork_pre = Self::evaluate_artwork_prerequisites(game, pipeline);
        let mut final_patch = GameMetadataPatch::default();

        if pipeline.preserve_existing_artwork {
            if artwork_pre.remote_cover_to_cache.is_some() && !Self::has_local_artwork(game.cover_image_path.as_deref()) {
                final_patch.cover_url = artwork_pre.remote_cover_to_cache.clone();
            }
            if artwork_pre.remote_bg_to_cache.is_some() && !Self::has_local_artwork(game.background_image_path.as_deref()) {
                final_patch.background_url = artwork_pre.remote_bg_to_cache.clone();
            }
        }

        let store_native_id = match game.library_id.to_lowercase().as_str() {
            "steam" => "steam",
            "gog" => "gog",
            _ => "steam",
        };

        let effective_details_source = Self::resolve_source_id(&pipeline.details_source, store_native_id);
        let effective_cover_source = Self::resolve_source_id(&pipeline.cover_source, store_native_id);
        let effective_background_source = Self::resolve_source_id(&pipeline.background_source, store_native_id);
        let effective_score_source = Self::resolve_source_id(&pipeline.score_source, store_native_id);

        // 1. Fetch Primary Details & Descriptions (Store-First)
        let details_patch = Self::fetch_details_with_fallback(
            request,
            providers,
            enabled,
            settings,
            effective_details_source,
        ).await;

        let mut details_cover_fallback = None;
        let mut details_bg_fallback = None;

        if let Some(ref patch) = details_patch {
            Self::merge_primary_details(&mut final_patch, game, patch);

            if artwork_pre.should_fetch_cover {
                if effective_cover_source == effective_details_source || effective_cover_source == store_native_id {
                    final_patch.cover_url = patch.cover_url.clone();
                } else {
                    details_cover_fallback = patch.cover_url.clone();
                }
            }

            if artwork_pre.should_fetch_background {
                if effective_background_source == effective_details_source || effective_background_source == store_native_id {
                    final_patch.background_url = patch.background_url.clone();
                } else {
                    details_bg_fallback = patch.background_url.clone();
                }
            }
        }

        // 2. Resolve High-Res Artwork if dedicated provider configured
        Self::resolve_dedicated_artwork(
            &mut final_patch,
            request,
            providers,
            enabled,
            settings,
            effective_cover_source,
            effective_background_source,
            effective_details_source,
            &artwork_pre,
            details_cover_fallback,
            details_bg_fallback,
        ).await;

        // 3. Resolve Critic & Community Scores if needed
        Self::resolve_scores(
            &mut final_patch,
            game,
            request,
            providers,
            enabled,
            settings,
            effective_score_source,
            effective_details_source,
        ).await;

        // 4. Query enabled external/enrichment providers that contribute extra_metadata (e.g. HowLongToBeat)
        Self::merge_enrichment_metadata(&mut final_patch, request, providers, enabled, settings).await;

        // 5. Generate aesthetic fallback only if fields are still empty
        Self::apply_fallback_if_needed(&mut final_patch, game, &fallback_fn);

        final_patch
    }

    fn resolve_source_id<'a>(source: &'a str, store_native_id: &'a str) -> &'a str {
        if source == "store_native" {
            store_native_id
        } else {
            source
        }
    }

    fn has_local_artwork(path: Option<&str>) -> bool {
        path.map(|p| {
            let p_trim = p.trim();
            !p_trim.is_empty() && !p_trim.starts_with("http://") && !p_trim.starts_with("https://")
        })
        .unwrap_or(false)
    }

    fn evaluate_artwork_prerequisites(game: &Game, pipeline: &MetadataPipelineConfig) -> ArtworkPrerequisites {
        let has_existing_local_cover = Self::has_local_artwork(game.cover_image_path.as_deref());
        let has_existing_local_bg = Self::has_local_artwork(game.background_image_path.as_deref());

        let remote_cover_to_cache = game.cover_image_path.as_ref().and_then(|p| {
            let p_trim = p.trim();
            if p_trim.starts_with("http://") || p_trim.starts_with("https://") {
                Some(p_trim.to_string())
            } else {
                None
            }
        });

        let remote_bg_to_cache = game.background_image_path.as_ref().and_then(|p| {
            let p_trim = p.trim();
            if p_trim.starts_with("http://") || p_trim.starts_with("https://") {
                Some(p_trim.to_string())
            } else {
                None
            }
        });

        let has_low_res_steam_banner_bg = game
            .background_image_path
            .as_ref()
            .map(|p| p.ends_with("/header.jpg") || p.ends_with("\\header.jpg"))
            .unwrap_or(false);

        let should_fetch_cover = if pipeline.preserve_existing_artwork {
            !has_existing_local_cover && remote_cover_to_cache.is_none()
        } else {
            true
        };

        let should_fetch_background = if pipeline.preserve_existing_artwork {
            (!has_existing_local_bg && remote_bg_to_cache.is_none()) || has_low_res_steam_banner_bg
        } else {
            true
        };

        ArtworkPrerequisites {
            should_fetch_cover,
            should_fetch_background,
            remote_cover_to_cache,
            remote_bg_to_cache,
        }
    }

    async fn fetch_details_with_fallback(
        request: &MetadataSearchRequest,
        providers: &HashMap<String, Box<dyn MetadataProvider>>,
        enabled: &HashMap<String, bool>,
        settings: &HashMap<String, Map<String, Value>>,
        primary_source: &str,
    ) -> Option<GameMetadataPatch> {
        if enabled.get(primary_source).copied().unwrap_or(true) {
            if let Some(prov) = providers.get(primary_source) {
                let s = settings.get(primary_source).cloned().unwrap_or_default();
                if let Ok(patch) = prov.fetch_metadata(request, &s).await {
                    return Some(patch);
                }
            }
        }

        let alt_store = if primary_source == "steam" { "gog" } else { "steam" };
        if enabled.get(alt_store).copied().unwrap_or(true) {
            if let Some(prov) = providers.get(alt_store) {
                let s = settings.get(alt_store).cloned().unwrap_or_default();
                if let Ok(patch) = prov.fetch_metadata(request, &s).await {
                    return Some(patch);
                }
            }
        }

        None
    }

    fn merge_primary_details(final_patch: &mut GameMetadataPatch, game: &Game, patch: &GameMetadataPatch) {
        if game.description.as_ref().map(|d| d.trim().is_empty()).unwrap_or(true) {
            final_patch.description = patch.description.clone();
        }
        if game.release_date.as_ref().map(|r| r.trim().is_empty()).unwrap_or(true) {
            final_patch.release_date = patch.release_date.clone();
        }
        if game.genres.is_empty() {
            final_patch.genres = patch.genres.clone();
        }
        if game.features.is_empty() || !patch.features.is_empty() {
            final_patch.features = patch.features.clone();
        }
        if game.developers.is_empty() {
            final_patch.developers = patch.developers.clone();
        }
        if game.publishers.is_empty() {
            final_patch.publishers = patch.publishers.clone();
        }
        if game.critic_score.is_none() {
            final_patch.critic_score = patch.critic_score;
        }
        if game.community_score.is_none() {
            final_patch.community_score = patch.community_score;
        }
    }

    async fn resolve_dedicated_artwork(
        final_patch: &mut GameMetadataPatch,
        request: &MetadataSearchRequest,
        providers: &HashMap<String, Box<dyn MetadataProvider>>,
        enabled: &HashMap<String, bool>,
        settings: &HashMap<String, Map<String, Value>>,
        cover_source: &str,
        bg_source: &str,
        details_source: &str,
        artwork_pre: &ArtworkPrerequisites,
        details_cover_fallback: Option<String>,
        details_bg_fallback: Option<String>,
    ) {
        if artwork_pre.should_fetch_cover && final_patch.cover_url.is_none() {
            if cover_source != details_source && enabled.get(cover_source).copied().unwrap_or(false) {
                if let Some(prov) = providers.get(cover_source) {
                    let s = settings.get(cover_source).cloned().unwrap_or_default();
                    if let Ok(cov_patch) = prov.fetch_metadata(request, &s).await {
                        if cov_patch.cover_url.is_some() {
                            final_patch.cover_url = cov_patch.cover_url;
                        }
                    }
                }
            }
            if final_patch.cover_url.is_none() {
                final_patch.cover_url = details_cover_fallback.or(artwork_pre.remote_cover_to_cache.clone());
            }
        }

        if artwork_pre.should_fetch_background && final_patch.background_url.is_none() {
            if bg_source != details_source && enabled.get(bg_source).copied().unwrap_or(false) {
                if let Some(prov) = providers.get(bg_source) {
                    let s = settings.get(bg_source).cloned().unwrap_or_default();
                    if let Ok(bg_patch) = prov.fetch_metadata(request, &s).await {
                        if bg_patch.background_url.is_some() {
                            final_patch.background_url = bg_patch.background_url;
                        }
                    }
                }
            }
            if final_patch.background_url.is_none() {
                final_patch.background_url = details_bg_fallback.or(artwork_pre.remote_bg_to_cache.clone());
            }
        }
    }

    async fn resolve_scores(
        final_patch: &mut GameMetadataPatch,
        game: &Game,
        request: &MetadataSearchRequest,
        providers: &HashMap<String, Box<dyn MetadataProvider>>,
        enabled: &HashMap<String, bool>,
        settings: &HashMap<String, Map<String, Value>>,
        score_source: &str,
        details_source: &str,
    ) {
        if game.critic_score.is_none() && final_patch.critic_score.is_none() {
            if score_source != details_source && enabled.get(score_source).copied().unwrap_or(false) {
                if let Some(prov) = providers.get(score_source) {
                    let s = settings.get(score_source).cloned().unwrap_or_default();
                    if let Ok(sc_patch) = prov.fetch_metadata(request, &s).await {
                        if sc_patch.critic_score.is_some() {
                            final_patch.critic_score = sc_patch.critic_score;
                            final_patch.community_score = sc_patch.community_score;
                        }
                    }
                }
            }
        }
    }

    async fn merge_enrichment_metadata(
        final_patch: &mut GameMetadataPatch,
        request: &MetadataSearchRequest,
        providers: &HashMap<String, Box<dyn MetadataProvider>>,
        enabled: &HashMap<String, bool>,
        settings: &HashMap<String, Map<String, Value>>,
    ) {
        for (prov_id, prov) in providers {
            if prov_id != "steam" && prov_id != "gog" && prov_id != "epic" {
                if enabled.get(prov_id).copied().unwrap_or(true) {
                    let s = settings.get(prov_id).cloned().unwrap_or_default();
                    if let Ok(p_patch) = prov.fetch_metadata(request, &s).await {
                        if let Some(extra) = p_patch.extra_metadata {
                            let mut current_merged: serde_json::Map<String, serde_json::Value> = final_patch
                                .extra_metadata
                                .as_deref()
                                .and_then(|s| serde_json::from_str(s).ok())
                                .unwrap_or_default();
                            if let Ok(incoming) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&extra) {
                                for (k, v) in incoming {
                                    current_merged.insert(k, v);
                                }
                                final_patch.extra_metadata = Some(serde_json::to_string(&current_merged).unwrap_or(extra));
                            } else {
                                final_patch.extra_metadata = Some(extra);
                            }
                        }
                    }
                }
            }
        }
    }

    fn apply_fallback_if_needed(
        final_patch: &mut GameMetadataPatch,
        game: &Game,
        fallback_fn: &impl Fn(&str, &str) -> GameMetadataPatch,
    ) {
        let needs_fallback_desc = final_patch.description.is_none()
            && game.description.as_ref().map(|d| d.trim().is_empty()).unwrap_or(true);
        let needs_fallback_rd = final_patch.release_date.is_none()
            && game.release_date.as_ref().map(|r| r.trim().is_empty()).unwrap_or(true);
        let needs_fallback_genres = final_patch.genres.is_empty() && game.genres.is_empty();
        let needs_fallback_devs = final_patch.developers.is_empty() && game.developers.is_empty();
        let needs_fallback_pubs = final_patch.publishers.is_empty() && game.publishers.is_empty();
        let needs_fallback_scores = final_patch.critic_score.is_none() && game.critic_score.is_none();

        if needs_fallback_desc
            || needs_fallback_genres
            || needs_fallback_rd
            || needs_fallback_devs
            || needs_fallback_pubs
            || needs_fallback_scores
        {
            let fallback = fallback_fn(&game.title, &game.library_id);
            if needs_fallback_desc {
                final_patch.description = fallback.description;
            }
            if needs_fallback_rd {
                final_patch.release_date = fallback.release_date;
            }
            if needs_fallback_genres {
                final_patch.genres = fallback.genres;
            }
            if needs_fallback_devs {
                final_patch.developers = fallback.developers;
            }
            if needs_fallback_pubs {
                final_patch.publishers = fallback.publishers;
            }
            if needs_fallback_scores {
                final_patch.critic_score = fallback.critic_score;
                final_patch.community_score = fallback.community_score;
            }
        }
    }
}
