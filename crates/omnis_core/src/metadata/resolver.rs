use std::collections::HashMap;
use serde_json::{Map, Value};
use omnis_sdk::{Game, GameMetadataPatch, MetadataProvider, MetadataSearchRequest};

use super::types::*;

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
        let has_existing_local_cover = game
            .cover_image_path
            .as_ref()
            .map(|p| {
                let p_trim = p.trim();
                !p_trim.is_empty()
                    && !p_trim.starts_with("http://")
                    && !p_trim.starts_with("https://")
            })
            .unwrap_or(false);

        let has_existing_local_bg = game
            .background_image_path
            .as_ref()
            .map(|p| {
                let p_trim = p.trim();
                !p_trim.is_empty()
                    && !p_trim.starts_with("http://")
                    && !p_trim.starts_with("https://")
            })
            .unwrap_or(false);

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

        // If current background is a low-res Steam header banner (460x215) and we are preserving artwork,
        // do not block high-res background retrieval from providers (IGDB / Steam Store hero).
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

        let mut final_patch = GameMetadataPatch::default();
        let mut details_cover_fallback = None;
        let mut details_bg_fallback = None;

        if pipeline.preserve_existing_artwork {
            if !has_existing_local_cover && remote_cover_to_cache.is_some() {
                final_patch.cover_url = remote_cover_to_cache.clone();
            }
            if !has_existing_local_bg
                && remote_bg_to_cache.is_some()
                && !has_low_res_steam_banner_bg
            {
                final_patch.background_url = remote_bg_to_cache.clone();
            }
        }

        // Store-Native resolution: determine store-native provider from game.library_id
        let store_native_id = match game.library_id.to_lowercase().as_str() {
            "steam" => "steam",
            "gog" => "gog",
            _ => "steam", // Steam Store search by title is universal PC catalog
        };

        let effective_details_source = if pipeline.details_source == "store_native" {
            store_native_id
        } else {
            pipeline.details_source.as_str()
        };
        let effective_cover_source = if pipeline.cover_source == "store_native" {
            store_native_id
        } else {
            pipeline.cover_source.as_str()
        };
        let effective_background_source = if pipeline.background_source == "store_native" {
            store_native_id
        } else {
            pipeline.background_source.as_str()
        };
        let effective_score_source = if pipeline.score_source == "store_native" {
            store_native_id
        } else {
            pipeline.score_source.as_str()
        };

        // 1. Fetch Primary Details & Descriptions (Store-First)
        let mut details_patch: Option<GameMetadataPatch> = None;
        if enabled
            .get(effective_details_source)
            .copied()
            .unwrap_or(true)
        {
            if let Some(prov) = providers.get(effective_details_source) {
                let settings = settings
                    .get(effective_details_source)
                    .cloned()
                    .unwrap_or_default();
                if let Ok(patch) = prov.fetch_metadata(&request, &settings).await {
                    details_patch = Some(patch);
                }
            }
        }

        // Fallback: If primary store had no match, try the alternative built-in store
        if details_patch.is_none() {
            let alt_store = if effective_details_source == "steam" {
                "gog"
            } else {
                "steam"
            };
            if enabled.get(alt_store).copied().unwrap_or(true) {
                if let Some(prov) = providers.get(alt_store) {
                    let settings = settings.get(alt_store).cloned().unwrap_or_default();
                    if let Ok(patch) = prov.fetch_metadata(&request, &settings).await {
                        details_patch = Some(patch);
                    }
                }
            }
        }

        if let Some(ref patch) = details_patch {
            if game
                .description
                .as_ref()
                .map(|d| d.trim().is_empty())
                .unwrap_or(true)
            {
                final_patch.description = patch.description.clone();
            }
            if game
                .release_date
                .as_ref()
                .map(|r| r.trim().is_empty())
                .unwrap_or(true)
            {
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

            if should_fetch_cover {
                if effective_cover_source == effective_details_source
                    || effective_cover_source == store_native_id
                {
                    final_patch.cover_url = patch.cover_url.clone();
                } else {
                    details_cover_fallback = patch.cover_url.clone();
                }
            }

            if should_fetch_background {
                if effective_background_source == effective_details_source
                    || effective_background_source == store_native_id
                {
                    final_patch.background_url = patch.background_url.clone();
                } else {
                    details_bg_fallback = patch.background_url.clone();
                }
            }
        }

        // 2. Resolve High-Res Artwork if dedicated provider configured
        if should_fetch_cover && final_patch.cover_url.is_none() {
            if effective_cover_source != effective_details_source
                && enabled
                    .get(effective_cover_source)
                    .copied()
                    .unwrap_or(false)
            {
                if let Some(prov) = providers.get(effective_cover_source) {
                    let settings = settings
                        .get(effective_cover_source)
                        .cloned()
                        .unwrap_or_default();
                    if let Ok(cov_patch) = prov.fetch_metadata(&request, &settings).await {
                        if cov_patch.cover_url.is_some() {
                            final_patch.cover_url = cov_patch.cover_url;
                        }
                    }
                }
            }
            if final_patch.cover_url.is_none() {
                final_patch.cover_url = details_cover_fallback.or(remote_cover_to_cache.clone());
            }
        }

        if should_fetch_background && final_patch.background_url.is_none() {
            if effective_background_source != effective_details_source
                && enabled
                    .get(effective_background_source)
                    .copied()
                    .unwrap_or(false)
            {
                if let Some(prov) = providers.get(effective_background_source) {
                    let settings = settings
                        .get(effective_background_source)
                        .cloned()
                        .unwrap_or_default();
                    if let Ok(bg_patch) = prov.fetch_metadata(&request, &settings).await {
                        if bg_patch.background_url.is_some() {
                            final_patch.background_url = bg_patch.background_url;
                        }
                    }
                }
            }
            if final_patch.background_url.is_none() {
                final_patch.background_url = details_bg_fallback.or(remote_bg_to_cache.clone());
            }
        }

        // 3. Resolve Critic & Community Scores if needed
        if game.critic_score.is_none() && final_patch.critic_score.is_none() {
            if effective_score_source != effective_details_source
                && enabled
                    .get(effective_score_source)
                    .copied()
                    .unwrap_or(false)
            {
                if let Some(prov) = providers.get(effective_score_source) {
                    let settings = settings
                        .get(effective_score_source)
                        .cloned()
                        .unwrap_or_default();
                    if let Ok(sc_patch) = prov.fetch_metadata(&request, &settings).await {
                        if sc_patch.critic_score.is_some() {
                            final_patch.critic_score = sc_patch.critic_score;
                            final_patch.community_score = sc_patch.community_score;
                        }
                    }
                }
            }
        }

        // 3b. Query enabled external/enrichment providers that contribute extra_metadata (e.g. HowLongToBeat)
        for (prov_id, prov) in &*providers {
            if prov_id != "steam" && prov_id != "gog" && prov_id != "epic" {
                if enabled.get(prov_id).copied().unwrap_or(true) {
                    let settings = settings.get(prov_id).cloned().unwrap_or_default();
                    if let Ok(p_patch) = prov.fetch_metadata(&request, &settings).await {
                        if let Some(extra) = p_patch.extra_metadata {
                            let mut current_merged: serde_json::Map<String, serde_json::Value> =
                                final_patch
                                    .extra_metadata
                                    .as_deref()
                                    .and_then(|s| serde_json::from_str(s).ok())
                                    .unwrap_or_default();
                            if let Ok(incoming) = serde_json::from_str::<
                                serde_json::Map<String, serde_json::Value>,
                            >(&extra)
                            {
                                for (k, v) in incoming {
                                    current_merged.insert(k, v);
                                }
                                final_patch.extra_metadata =
                                    Some(serde_json::to_string(&current_merged).unwrap_or(extra));
                            } else {
                                final_patch.extra_metadata = Some(extra);
                            }
                        }
                    }
                }
            }
        }


        // 4. Generate aesthetic fallback only if fields are still empty
        let needs_fallback_desc = final_patch.description.is_none()
            && game
                .description
                .as_ref()
                .map(|d| d.trim().is_empty())
                .unwrap_or(true);
        let needs_fallback_rd = final_patch.release_date.is_none()
            && game
                .release_date
                .as_ref()
                .map(|r| r.trim().is_empty())
                .unwrap_or(true);
        let needs_fallback_genres = final_patch.genres.is_empty() && game.genres.is_empty();
        let needs_fallback_devs = final_patch.developers.is_empty() && game.developers.is_empty();
        let needs_fallback_pubs = final_patch.publishers.is_empty() && game.publishers.is_empty();
        let needs_fallback_scores =
            final_patch.critic_score.is_none() && game.critic_score.is_none();

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

        final_patch
    }
}
