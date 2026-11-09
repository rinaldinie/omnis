use omnis_sdk::{Game, GameMetadataPatch, MetadataField, MetadataProvider, MetadataSearchRequest};
use serde_json::{Map, Value};
use std::collections::HashMap;

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
            if artwork_pre.remote_cover_to_cache.is_some()
                && !Self::has_local_artwork(game.cover_image_path.as_deref())
            {
                final_patch.cover_url = artwork_pre.remote_cover_to_cache.clone();
            }
            if artwork_pre.remote_bg_to_cache.is_some()
                && !Self::has_local_artwork(game.background_image_path.as_deref())
            {
                final_patch.background_url = artwork_pre.remote_bg_to_cache.clone();
            }
        }

        let store_native_id = match game.library_id.to_lowercase().as_str() {
            "steam" => "steam",
            "gog" => "gog",
            "epic" => "epic",
            "xbox" => "xbox",
            _ => "steam",
        };

        // Populate field rules combining user overrides and modern defaults
        let field_rules = if pipeline.fields.is_empty() {
            default_field_rules()
        } else {
            let mut rules = pipeline.fields.clone();
            for (f, def) in default_field_rules() {
                rules.entry(f).or_insert(def);
            }
            rules
        };

        let mut cache: HashMap<String, Option<GameMetadataPatch>> = HashMap::new();

        // 1. Name
        if let Some(rule) = field_rules.get(&MetadataField::Name) {
            if rule.enabled && final_patch.name.is_none() {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if let Some(ref name) = p.name {
                            if !name.trim().is_empty() {
                                final_patch.name = Some(name.clone());
                                break;
                            }
                        }
                    }
                }
            }
        }

        // 2. Description
        if let Some(rule) = field_rules.get(&MetadataField::Description) {
            let needs_desc = final_patch.description.is_none()
                && (!pipeline.preserve_existing_artwork
                    || game
                        .description
                        .as_ref()
                        .map(|d| d.trim().is_empty())
                        .unwrap_or(true));
            if rule.enabled && needs_desc {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if let Some(ref d) = p.description {
                            if !d.trim().is_empty() {
                                final_patch.description = Some(d.clone());
                                break;
                            }
                        }
                    }
                }
            }
        }

        // 3. Release Date
        if let Some(rule) = field_rules.get(&MetadataField::ReleaseDate) {
            let needs_rd = final_patch.release_date.is_none()
                && (!pipeline.preserve_existing_artwork
                    || game
                        .release_date
                        .as_ref()
                        .map(|r| r.trim().is_empty())
                        .unwrap_or(true));
            if rule.enabled && needs_rd {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if let Some(ref rd) = p.release_date {
                            if !rd.trim().is_empty() {
                                final_patch.release_date = Some(rd.clone());
                                break;
                            }
                        }
                    }
                }
            }
        }

        // 4. Genres
        if let Some(rule) = field_rules.get(&MetadataField::Genres) {
            let needs_genres = final_patch.genres.is_empty()
                && (!pipeline.preserve_existing_artwork || game.genres.is_empty());
            if rule.enabled && needs_genres {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if !p.genres.is_empty() {
                            final_patch.genres = p.genres.clone();
                            break;
                        }
                    }
                }
            }
        }

        // 5. Developers
        if let Some(rule) = field_rules.get(&MetadataField::Developers) {
            let needs_devs = final_patch.developers.is_empty()
                && (!pipeline.preserve_existing_artwork || game.developers.is_empty());
            if rule.enabled && needs_devs {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if !p.developers.is_empty() {
                            final_patch.developers = p.developers.clone();
                            break;
                        }
                    }
                }
            }
        }

        // 6. Publishers
        if let Some(rule) = field_rules.get(&MetadataField::Publishers) {
            let needs_pubs = final_patch.publishers.is_empty()
                && (!pipeline.preserve_existing_artwork || game.publishers.is_empty());
            if rule.enabled && needs_pubs {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if !p.publishers.is_empty() {
                            final_patch.publishers = p.publishers.clone();
                            break;
                        }
                    }
                }
            }
        }

        // 7. Features
        if let Some(rule) = field_rules.get(&MetadataField::Features) {
            let needs_feats = final_patch.features.is_empty()
                && (!pipeline.preserve_existing_artwork || game.features.is_empty());
            if rule.enabled && needs_feats {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if !p.features.is_empty() {
                            final_patch.features = p.features.clone();
                            break;
                        }
                    }
                }
            }
        }

        // 8. Tags
        if let Some(rule) = field_rules.get(&MetadataField::Tags) {
            let needs_tags = final_patch.tags.is_empty()
                && (!pipeline.preserve_existing_artwork || game.tags.is_empty());
            if rule.enabled && needs_tags {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if !p.tags.is_empty() {
                            final_patch.tags = p.tags.clone();
                            break;
                        }
                    }
                }
            }
        }

        // 9. Series
        if let Some(rule) = field_rules.get(&MetadataField::Series) {
            let needs_series = final_patch.series.is_none()
                && (!pipeline.preserve_existing_artwork
                    || game.series.as_deref().unwrap_or("").trim().is_empty());
            if rule.enabled && needs_series {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if let Some(ref s) = p.series {
                            if !s.trim().is_empty() {
                                final_patch.series = Some(s.clone());
                                break;
                            }
                        }
                    }
                }
            }
        }

        // 10. Age Rating
        if let Some(rule) = field_rules.get(&MetadataField::AgeRating) {
            let needs_ar = final_patch.age_rating.is_none()
                && (!pipeline.preserve_existing_artwork
                    || game
                        .age_rating
                        .as_deref()
                        .unwrap_or("")
                        .trim()
                        .is_empty());
            if rule.enabled && needs_ar {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if let Some(ref ar) = p.age_rating {
                            if !ar.trim().is_empty() {
                                final_patch.age_rating = Some(ar.clone());
                                break;
                            }
                        }
                    }
                }
            }
        }

        // 11. Links
        if let Some(rule) = field_rules.get(&MetadataField::Links) {
            let needs_links = final_patch.custom_links.is_empty()
                && (!pipeline.preserve_existing_artwork || game.custom_links.is_empty());
            if rule.enabled && needs_links {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if !p.custom_links.is_empty() {
                            final_patch.custom_links = p.custom_links.clone();
                            break;
                        }
                    }
                }
            }
        }

        // 12. Critic Score
        if let Some(rule) = field_rules.get(&MetadataField::CriticScore) {
            let needs_cs = final_patch.critic_score.is_none()
                && (!pipeline.preserve_existing_artwork || game.critic_score.is_none());
            if rule.enabled && needs_cs {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if let Some(score) = p.critic_score {
                            final_patch.critic_score = Some(score);
                            if final_patch.community_score.is_none() && p.community_score.is_some()
                            {
                                final_patch.community_score = p.community_score;
                            }
                            break;
                        }
                    }
                }
            }
        }

        // 13. Community Score
        if let Some(rule) = field_rules.get(&MetadataField::CommunityScore) {
            let needs_comms = final_patch.community_score.is_none()
                && (!pipeline.preserve_existing_artwork || game.community_score.is_none());
            if rule.enabled && needs_comms {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if let Some(score) = p.community_score {
                            final_patch.community_score = Some(score);
                            break;
                        }
                    }
                }
            }
        }

        // 14. Cover Image
        if let Some(rule) = field_rules.get(&MetadataField::CoverImage) {
            if rule.enabled && artwork_pre.should_fetch_cover && final_patch.cover_url.is_none() {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if let Some(ref cov) = p.cover_url {
                            final_patch.cover_url = Some(cov.clone());
                            break;
                        }
                    }
                }
            }
        }

        // 15. Icon
        if let Some(rule) = field_rules.get(&MetadataField::Icon) {
            let needs_icon = final_patch.icon_url.is_none()
                && (!pipeline.preserve_existing_artwork
                    || game
                        .icon_image_path
                        .as_deref()
                        .unwrap_or("")
                        .trim()
                        .is_empty());
            if rule.enabled && needs_icon {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if let Some(ref icon) = p.icon_url {
                            final_patch.icon_url = Some(icon.clone());
                            break;
                        }
                    }
                }
            }
        }

        // 16. Background Image
        if let Some(rule) = field_rules.get(&MetadataField::BackgroundImage) {
            if rule.enabled
                && artwork_pre.should_fetch_background
                && final_patch.background_url.is_none()
            {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if let Some(ref bg) = p.background_url {
                            final_patch.background_url = Some(bg.clone());
                            break;
                        }
                    }
                }
            }
        }

        // 17. Install Size
        if let Some(rule) = field_rules.get(&MetadataField::InstallSize) {
            if rule.enabled && final_patch.install_size_bytes.is_none() {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        &mut cache,
                    )
                    .await
                    {
                        if let Some(size) = p.install_size_bytes {
                            final_patch.install_size_bytes = Some(size);
                            break;
                        }
                    }
                }
            }
        }

        // Fallback artwork from remote cache URLs if still unset
        if final_patch.cover_url.is_none() {
            final_patch.cover_url = artwork_pre.remote_cover_to_cache;
        }
        if final_patch.background_url.is_none() {
            final_patch.background_url = artwork_pre.remote_bg_to_cache;
        }

        // Enrichment metadata (e.g. HowLongToBeat)
        Self::merge_enrichment_metadata(
            &mut final_patch,
            request,
            providers,
            enabled,
            settings,
            &pipeline.provider_priority,
        )
        .await;

        // Aesthetic fallback if essential fields are still absent
        Self::apply_fallback_if_needed(&mut final_patch, game, &fallback_fn);

        final_patch
    }

    async fn get_or_fetch_provider(
        source_id: &str,
        store_native_id: &str,
        request: &MetadataSearchRequest,
        providers: &HashMap<String, Box<dyn MetadataProvider>>,
        enabled: &HashMap<String, bool>,
        settings: &HashMap<String, Map<String, Value>>,
        cache: &mut HashMap<String, Option<GameMetadataPatch>>,
    ) -> Option<GameMetadataPatch> {
        let eff_id = Self::resolve_source_id(source_id, store_native_id);
        if let Some(cached) = cache.get(eff_id) {
            return cached.clone();
        }

        if !enabled.get(eff_id).copied().unwrap_or(true) {
            cache.insert(eff_id.to_string(), None);
            return None;
        }

        if let Some(prov) = providers.get(eff_id) {
            let s = settings.get(eff_id).cloned().unwrap_or_default();
            match prov.fetch_metadata(request, &s).await {
                Ok(patch) => {
                    cache.insert(eff_id.to_string(), Some(patch.clone()));
                    Some(patch)
                }
                Err(_) => {
                    cache.insert(eff_id.to_string(), None);
                    None
                }
            }
        } else {
            cache.insert(eff_id.to_string(), None);
            None
        }
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

    fn evaluate_artwork_prerequisites(
        game: &Game,
        pipeline: &MetadataPipelineConfig,
    ) -> ArtworkPrerequisites {
        let has_existing_local_cover = Self::has_local_artwork(game.cover_image_path.as_deref());
        let has_existing_local_bg = Self::has_local_artwork(game.background_image_path.as_deref());

        let has_low_res_cover = game
            .cover_image_path
            .as_ref()
            .map(|p| {
                let p_low = p.to_lowercase();
                p_low.contains("_glx_logo")
                    || p_low.contains("icon.png")
                    || p_low.ends_with("/header.jpg")
                    || p_low.ends_with("\\header.jpg")
            })
            .unwrap_or(false);

        let remote_cover_to_cache = game.cover_image_path.as_ref().and_then(|p| {
            let p_trim = p.trim();
            if (p_trim.starts_with("http://") || p_trim.starts_with("https://"))
                && !has_low_res_cover
            {
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

        let remote_bg_to_cache = game.background_image_path.as_ref().and_then(|p| {
            let p_trim = p.trim();
            if (p_trim.starts_with("http://") || p_trim.starts_with("https://"))
                && !has_low_res_steam_banner_bg
            {
                Some(p_trim.to_string())
            } else {
                None
            }
        });

        let should_fetch_cover = if pipeline.preserve_existing_artwork {
            (!has_existing_local_cover && remote_cover_to_cache.is_none()) || has_low_res_cover
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

    async fn merge_enrichment_metadata(
        final_patch: &mut GameMetadataPatch,
        request: &MetadataSearchRequest,
        providers: &HashMap<String, Box<dyn MetadataProvider>>,
        enabled: &HashMap<String, bool>,
        settings: &HashMap<String, Map<String, Value>>,
        priority_order: &[String],
    ) {
        for prov_id in priority_order {
            if prov_id != "steam"
                && prov_id != "gog"
                && prov_id != "epic"
                && enabled.get(prov_id).copied().unwrap_or(true)
            {
                if let Some(prov) = providers.get(prov_id) {
                    let s = settings.get(prov_id).cloned().unwrap_or_default();
                    if let Ok(p_patch) = prov.fetch_metadata(request, &s).await {
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
                                    current_merged.entry(k).or_insert(v);
                                }
                                final_patch.extra_metadata =
                                    Some(serde_json::to_string(&current_merged).unwrap_or(extra));
                            } else if final_patch.extra_metadata.is_none() {
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
    }
}
