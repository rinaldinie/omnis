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

        let store_native_id = match game.library_id.trim().to_lowercase().as_str() {
            "steam" => Some("steam"),
            "gog" => Some("gog"),
            "epic" => Some("epic"),
            "xbox" => Some("xbox"),
            // Console games have no PC storefront: IGDB is their reference catalog
            "switch" => Some("igdb"),
            _ => None,
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
        Self::resolve_field(
            MetadataField::Name,
            &field_rules,
            final_patch.name.is_none(),
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| p.name.as_ref().filter(|s| !s.trim().is_empty()).cloned(),
            |val, _| final_patch.name = Some(val),
        )
        .await;

        // 2. Description
        let needs_desc = final_patch.description.is_none()
            && (!pipeline.preserve_existing_artwork
                || game
                    .description
                    .as_ref()
                    .map(|d| d.trim().is_empty())
                    .unwrap_or(true));
        Self::resolve_field(
            MetadataField::Description,
            &field_rules,
            needs_desc,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| p.description.as_ref().filter(|s| !s.trim().is_empty()).cloned(),
            |val, _| final_patch.description = Some(val),
        )
        .await;

        // 3. Release Date
        let needs_rd = final_patch.release_date.is_none()
            && (!pipeline.preserve_existing_artwork
                || game
                    .release_date
                    .as_ref()
                    .map(|r| r.trim().is_empty())
                    .unwrap_or(true));
        Self::resolve_field(
            MetadataField::ReleaseDate,
            &field_rules,
            needs_rd,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| p.release_date.as_ref().filter(|s| !s.trim().is_empty()).cloned(),
            |val, _| final_patch.release_date = Some(val),
        )
        .await;

        // 4. Genres
        let needs_genres = final_patch.genres.is_empty()
            && (!pipeline.preserve_existing_artwork || game.genres.is_empty());
        Self::resolve_field(
            MetadataField::Genres,
            &field_rules,
            needs_genres,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| if !p.genres.is_empty() { Some(p.genres.clone()) } else { None },
            |val, _| final_patch.genres = val,
        )
        .await;

        // 5. Developers
        let needs_devs = final_patch.developers.is_empty()
            && (!pipeline.preserve_existing_artwork || game.developers.is_empty());
        Self::resolve_field(
            MetadataField::Developers,
            &field_rules,
            needs_devs,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| if !p.developers.is_empty() { Some(p.developers.clone()) } else { None },
            |val, _| final_patch.developers = val,
        )
        .await;

        // 6. Publishers
        let needs_pubs = final_patch.publishers.is_empty()
            && (!pipeline.preserve_existing_artwork || game.publishers.is_empty());
        Self::resolve_field(
            MetadataField::Publishers,
            &field_rules,
            needs_pubs,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| if !p.publishers.is_empty() { Some(p.publishers.clone()) } else { None },
            |val, _| final_patch.publishers = val,
        )
        .await;

        // 7. Features
        let needs_feats = final_patch.features.is_empty()
            && (!pipeline.preserve_existing_artwork || game.features.is_empty());
        Self::resolve_field(
            MetadataField::Features,
            &field_rules,
            needs_feats,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| if !p.features.is_empty() { Some(p.features.clone()) } else { None },
            |val, _| final_patch.features = val,
        )
        .await;

        // 8. Tags
        let needs_tags = final_patch.tags.is_empty()
            && (!pipeline.preserve_existing_artwork || game.tags.is_empty());
        Self::resolve_field(
            MetadataField::Tags,
            &field_rules,
            needs_tags,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| if !p.tags.is_empty() { Some(p.tags.clone()) } else { None },
            |val, _| final_patch.tags = val,
        )
        .await;

        // 9. Series
        let needs_series = final_patch.series.is_none()
            && (!pipeline.preserve_existing_artwork
                || game.series.as_deref().unwrap_or("").trim().is_empty());
        Self::resolve_field(
            MetadataField::Series,
            &field_rules,
            needs_series,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| p.series.as_ref().filter(|s| !s.trim().is_empty()).cloned(),
            |val, _| final_patch.series = Some(val),
        )
        .await;

        // 10. Age Rating
        let needs_ar = final_patch.age_rating.is_none()
            && (!pipeline.preserve_existing_artwork
                || game
                    .age_rating
                    .as_deref()
                    .unwrap_or("")
                    .trim()
                    .is_empty());
        Self::resolve_field(
            MetadataField::AgeRating,
            &field_rules,
            needs_ar,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| p.age_rating.as_ref().filter(|s| !s.trim().is_empty()).cloned(),
            |val, _| final_patch.age_rating = Some(val),
        )
        .await;

        // 11. Links
        let needs_links = final_patch.custom_links.is_empty()
            && (!pipeline.preserve_existing_artwork || game.custom_links.is_empty());
        Self::resolve_field(
            MetadataField::Links,
            &field_rules,
            needs_links,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| if !p.custom_links.is_empty() { Some(p.custom_links.clone()) } else { None },
            |val, _| final_patch.custom_links = val,
        )
        .await;

        // 12. Critic Score
        let needs_cs = final_patch.critic_score.is_none()
            && (!pipeline.preserve_existing_artwork || game.critic_score.is_none());
        Self::resolve_field(
            MetadataField::CriticScore,
            &field_rules,
            needs_cs,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| p.critic_score,
            |val, p| {
                final_patch.critic_score = Some(val);
                if final_patch.community_score.is_none() && p.community_score.is_some() {
                    final_patch.community_score = p.community_score;
                }
            },
        )
        .await;

        // 13. Community Score
        let needs_comms = final_patch.community_score.is_none()
            && (!pipeline.preserve_existing_artwork || game.community_score.is_none());
        Self::resolve_field(
            MetadataField::CommunityScore,
            &field_rules,
            needs_comms,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| p.community_score,
            |val, _| final_patch.community_score = Some(val),
        )
        .await;

        // 14. Cover Image
        Self::resolve_field(
            MetadataField::CoverImage,
            &field_rules,
            artwork_pre.should_fetch_cover && final_patch.cover_url.is_none(),
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| p.cover_url.clone(),
            |val, _| final_patch.cover_url = Some(val),
        )
        .await;

        // 15. Icon
        let needs_icon = final_patch.icon_url.is_none()
            && (!pipeline.preserve_existing_artwork
                || game
                    .icon_image_path
                    .as_deref()
                    .unwrap_or("")
                    .trim()
                    .is_empty());
        Self::resolve_field(
            MetadataField::Icon,
            &field_rules,
            needs_icon,
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| p.icon_url.clone(),
            |val, _| final_patch.icon_url = Some(val),
        )
        .await;

        // 16. Background Image
        Self::resolve_field(
            MetadataField::BackgroundImage,
            &field_rules,
            artwork_pre.should_fetch_background && final_patch.background_url.is_none(),
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| p.background_url.clone(),
            |val, _| final_patch.background_url = Some(val),
        )
        .await;

        // 17. Install Size
        Self::resolve_field(
            MetadataField::InstallSize,
            &field_rules,
            final_patch.install_size_bytes.is_none(),
            store_native_id,
            request,
            providers,
            enabled,
            settings,
            &mut cache,
            |p| p.install_size_bytes,
            |val, _| final_patch.install_size_bytes = Some(val),
        )
        .await;

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

    async fn resolve_field<T, F, V>(
        field: MetadataField,
        field_rules: &HashMap<MetadataField, FieldPipelineRule>,
        should_resolve: bool,
        store_native_id: Option<&str>,
        request: &MetadataSearchRequest,
        providers: &HashMap<String, Box<dyn MetadataProvider>>,
        enabled: &HashMap<String, bool>,
        settings: &HashMap<String, Map<String, Value>>,
        cache: &mut HashMap<String, Option<GameMetadataPatch>>,
        extract: F,
        mut apply: V,
    ) where
        F: Fn(&GameMetadataPatch) -> Option<T>,
        V: FnMut(T, &GameMetadataPatch),
    {
        if let Some(rule) = field_rules.get(&field) {
            if rule.enabled && should_resolve {
                for src in &rule.sources {
                    if let Some(p) = Self::get_or_fetch_provider(
                        src,
                        store_native_id,
                        request,
                        providers,
                        enabled,
                        settings,
                        cache,
                    )
                    .await
                    {
                        if let Some(val) = extract(&p) {
                            apply(val, &p);
                            break;
                        }
                    }
                }
            }
        }
    }

    async fn get_or_fetch_provider(
        source_id: &str,
        store_native_id: Option<&str>,
        request: &MetadataSearchRequest,
        providers: &HashMap<String, Box<dyn MetadataProvider>>,
        enabled: &HashMap<String, bool>,
        settings: &HashMap<String, Map<String, Value>>,
        cache: &mut HashMap<String, Option<GameMetadataPatch>>,
    ) -> Option<GameMetadataPatch> {
        let eff_id = match Self::resolve_source_id(source_id, store_native_id) {
            Some(id) => id,
            None => return None,
        };
        if let Some(cached) = cache.get(eff_id) {
            return cached.clone();
        }

        if !enabled.get(eff_id).copied().unwrap_or(true)
            || !Self::provider_applies_to(eff_id, &request.library_id)
        {
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

    /// PC storefront catalogs only list PC games: asked about a console title they answer
    /// with an unrelated "closest" product (GOG returns "Stellaris" for "Metroid Dread"),
    /// so they are skipped for libraries of emulated console games.
    pub(crate) fn provider_applies_to(provider_id: &str, library_id: &str) -> bool {
        const PC_STOREFRONTS: &[&str] = &["steam", "gog", "epic", "xbox"];
        const CONSOLE_LIBRARIES: &[&str] = &["switch"];

        let is_console = CONSOLE_LIBRARIES
            .iter()
            .any(|l| library_id.eq_ignore_ascii_case(l));
        !(is_console && PC_STOREFRONTS.contains(&provider_id))
    }

    pub(crate) fn resolve_source_id<'a>(
        source: &'a str,
        store_native_id: Option<&'a str>,
    ) -> Option<&'a str> {
        if source == "store_native" || source == "official_store" {
            store_native_id
        } else {
            Some(source)
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

#[cfg(test)]
mod tests {
    use super::MetadataPipelineResolver as Resolver;

    #[test]
    fn pc_storefronts_are_skipped_for_console_libraries() {
        for store in ["steam", "gog", "epic", "xbox"] {
            assert!(!Resolver::provider_applies_to(store, "switch"));
            assert!(Resolver::provider_applies_to(store, "steam"));
            assert!(Resolver::provider_applies_to(store, "custom"));
        }
        for provider in ["igdb", "steamgriddb", "hltb", "opencritic"] {
            assert!(Resolver::provider_applies_to(provider, "switch"));
        }
    }

    #[test]
    fn official_store_resolves_to_native_store_provider() {
        assert_eq!(
            Resolver::resolve_source_id("official_store", Some("steam")),
            Some("steam")
        );
        assert_eq!(
            Resolver::resolve_source_id("official_store", Some("gog")),
            Some("gog")
        );
        assert_eq!(
            Resolver::resolve_source_id("official_store", Some("epic")),
            Some("epic")
        );
        assert_eq!(
            Resolver::resolve_source_id("official_store", Some("xbox")),
            Some("xbox")
        );
        assert_eq!(
            Resolver::resolve_source_id("official_store", Some("igdb")),
            Some("igdb")
        );
        assert_eq!(Resolver::resolve_source_id("official_store", None), None);

        // store_native backwards compatibility
        assert_eq!(
            Resolver::resolve_source_id("store_native", Some("steam")),
            Some("steam")
        );
        assert_eq!(Resolver::resolve_source_id("store_native", None), None);

        // Explicit providers resolve to themselves
        assert_eq!(Resolver::resolve_source_id("steam", None), Some("steam"));
        assert_eq!(
            Resolver::resolve_source_id("igdb", Some("steam")),
            Some("igdb")
        );
        assert_eq!(
            Resolver::resolve_source_id("steamgriddb", Some("gog")),
            Some("steamgriddb")
        );
    }
}
