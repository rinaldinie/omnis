use omnis_sdk::GameMetadataPatch;
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

use super::registry::ProviderRegistry;
use super::types::*;
use super::utils::*;

/// Dedicated candidate search engine across online stores and metadata APIs (Steam, GOG, IGDB, OpenCritic, SteamGridDB)
pub struct MetadataSearchEngine;

impl MetadataSearchEngine {
    /// Search for metadata candidates across online providers (Steam, GOG, and enabled external providers)
    pub async fn search_candidates(
        client: &reqwest::Client,
        registry: &Arc<ProviderRegistry>,
        title: &str,
        provider_id: Option<&str>,
        fallback_fn: impl Fn(&str, &str) -> GameMetadataPatch,
    ) -> Result<Vec<MetadataCandidateDto>, String> {
        let filter = provider_id.unwrap_or("all").to_lowercase();
        let (run_steam, run_gog, sgdb_key, oc_key, igdb_settings) = {
            let enabled_guard = registry.enabled_providers.read().await;
            let settings_guard = registry.settings_cache.read().await;

            let run_steam = (filter == "all" || filter == "steam")
                && enabled_guard.get("steam").copied().unwrap_or(true);
            let run_gog = (filter == "all" || filter == "gog")
                && enabled_guard.get("gog").copied().unwrap_or(true);

            let run_sgdb = filter == "steamgriddb"
                || (filter == "all" && enabled_guard.get("steamgriddb").copied().unwrap_or(false));
            let sgdb_key = if run_sgdb {
                settings_guard
                    .get("steamgriddb")
                    .and_then(|m| m.get("api_key"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            } else {
                None
            };

            let run_oc = filter == "opencritic"
                || (filter == "all" && enabled_guard.get("opencritic").copied().unwrap_or(false));
            let oc_key = if run_oc {
                settings_guard
                    .get("opencritic")
                    .and_then(|m| m.get("api_key"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            } else {
                None
            };

            let run_igdb = filter == "igdb"
                || (filter == "all" && enabled_guard.get("igdb").copied().unwrap_or(false));
            let igdb_settings = if run_igdb {
                Some(settings_guard.get("igdb").cloned().unwrap_or_default())
            } else {
                None
            };

            (run_steam, run_gog, sgdb_key, oc_key, igdb_settings)
        };

        let (steam_res, gog_res, sgdb_res, oc_res, igdb_res) = tokio::join!(
            async {
                if run_steam {
                    Self::search_steam(client, title).await
                } else {
                    Vec::new()
                }
            },
            async {
                if run_gog {
                    registry
                        .gog_provider
                        .search_candidates(title, 4)
                        .await
                        .unwrap_or_default()
                } else {
                    Vec::new()
                }
            },
            async {
                if let Some(ref key) = sgdb_key {
                    Self::search_steamgriddb(client, key, title).await
                } else {
                    Vec::new()
                }
            },
            async {
                if let Some(ref key) = oc_key {
                    Self::search_opencritic(client, key, title).await
                } else {
                    Vec::new()
                }
            },
            async {
                if let Some(ref settings) = igdb_settings {
                    registry
                        .igdb_provider
                        .search_candidates(title, settings, 8)
                        .await
                        .unwrap_or_default()
                } else {
                    Vec::new()
                }
            }
        );

        let mut candidates = Vec::new();
        candidates.extend(steam_res);
        candidates.extend(gog_res);
        candidates.extend(sgdb_res);
        candidates.extend(oc_res);
        candidates.extend(igdb_res);

        // 6. Guarantee candidates: if no online provider returned results, produce aesthetic fallback candidate
        if candidates.is_empty() {
            candidates.push(Self::generate_fallback(title, &filter, &fallback_fn));
        } else {
            let pipeline_guard = registry.pipeline_config.read().await;
            let priority_order = &pipeline_guard.provider_priority;
            candidates.sort_by_key(|c| {
                priority_order
                    .iter()
                    .position(|p| {
                        p.eq_ignore_ascii_case(&c.provider_id)
                            || (p == "howlongtobeat" && c.provider_id == "hltb")
                            || (p == "hltb" && c.provider_id == "howlongtobeat")
                    })
                    .unwrap_or(usize::MAX)
            });
        }

        Ok(candidates)
    }

    async fn search_steam(client: &reqwest::Client, title: &str) -> Vec<MetadataCandidateDto> {
        let mut results = Vec::new();
        let search_url = reqwest::Url::parse_with_params(
            "https://store.steampowered.com/api/storesearch/",
            &[("term", title), ("l", "italian"), ("cc", "IT")],
        );

        let Ok(url) = search_url else {
            return results;
        };

        let Ok(resp) = client.get(url).send().await else {
            return results;
        };

        let Ok(json) = resp.json::<Value>().await else {
            return results;
        };

        let Some(items) = json.get("items").and_then(|v| v.as_array()) else {
            return results;
        };

        let mut join_set = tokio::task::JoinSet::new();
        for (idx, item) in items.iter().take(5).enumerate() {
            if let Some(appid_num) = item.get("id").and_then(|v| v.as_u64()) {
                let appid = appid_num.to_string();
                let name = item
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(title)
                    .to_string();
                let client = client.clone();

                join_set.spawn(async move {
                    let cover_url = format!(
                        "https://shared.steamstatic.com/store_item_assets/steam/apps/{}/library_600x900_2x.jpg",
                        appid
                    );
                    let bg_url = format!(
                        "https://shared.steamstatic.com/store_item_assets/steam/apps/{}/library_hero.jpg",
                        appid
                    );

                    let mut desc = format!("Titolo Steam Store: {}", name);
                    let mut release_year = None;
                    let mut critic_score = None;
                    let mut release_date = None;
                    let mut genres = vec!["Azione".to_string()];
                    let mut developers = Vec::new();

                    let details_url = format!(
                        "https://store.steampowered.com/api/appdetails?appids={}&l=italian",
                        appid
                    );
                    if let Ok(Ok(d_resp)) = tokio::time::timeout(
                        std::time::Duration::from_millis(2000),
                        client.get(&details_url).send(),
                    )
                    .await
                    {
                        if let Ok(d_json) = d_resp.json::<Value>().await {
                            if let Some(data) = d_json.get(&appid).and_then(|v| v.get("data")) {
                                if let Some(sd) = data.get("short_description").and_then(|v| v.as_str())
                                {
                                    let plain = html_to_plain_text(sd);
                                    if !plain.is_empty() {
                                        desc = plain;
                                    }
                                }
                                if let Some(rd) = data
                                    .get("release_date")
                                    .and_then(|v| v.get("date"))
                                    .and_then(|v| v.as_str())
                                {
                                    release_date = Some(rd.to_string());
                                    release_year = extract_year(rd);
                                }
                                if let Some(meta) = data
                                    .get("metacritic")
                                    .and_then(|v| v.get("score"))
                                    .and_then(|v| v.as_u64())
                                {
                                    critic_score = Some(meta as u8);
                                }
                                if let Some(g_arr) = data.get("genres").and_then(|v| v.as_array()) {
                                    let g_parsed: Vec<String> = g_arr
                                        .iter()
                                        .filter_map(|g| {
                                            g.get("description")
                                                .and_then(|d| d.as_str())
                                                .map(|s| s.to_string())
                                        })
                                        .collect();
                                    if !g_parsed.is_empty() {
                                        genres = g_parsed;
                                    }
                                }
                                if let Some(d_arr) = data.get("developers").and_then(|v| v.as_array()) {
                                    developers = d_arr
                                        .iter()
                                        .filter_map(|d| d.as_str().map(|s| s.to_string()))
                                        .collect();
                                }
                            }
                        }
                    }

                    let raw_patch = GameMetadataPatch {
                        name: Some(name.clone()),
                        description: Some(desc.clone()),
                        release_date,
                        cover_url: Some(cover_url.clone()),
                        background_url: Some(bg_url.clone()),
                        icon_url: None,
                        critic_score,
                        community_score: None,
                        genres,
                        developers,
                        publishers: Vec::new(),
                        tags: Vec::new(),
                        features: Vec::new(),
                        extra_metadata: None,
                        ..Default::default()
                    };

                    (
                        idx,
                        MetadataCandidateDto {
                            provider_id: "steam".to_string(),
                            provider_game_id: appid,
                            title: name,
                            release_year,
                            cover_url: Some(cover_url),
                            background_url: Some(bg_url),
                            description: Some(desc),
                            raw_patch,
                        },
                    )
                });
            }
        }

        let mut indexed = Vec::new();
        while let Some(res) = join_set.join_next().await {
            if let Ok(item) = res {
                indexed.push(item);
            }
        }
        indexed.sort_by_key(|(idx, _)| *idx);
        results.extend(indexed.into_iter().map(|(_, dto)| dto));

        results
    }

    async fn search_steamgriddb(
        client: &reqwest::Client,
        api_key: &str,
        title: &str,
    ) -> Vec<MetadataCandidateDto> {
        let mut results = Vec::new();
        let encoded_term = url_encode(title);
        let url = format!(
            "https://www.steamgriddb.com/api/v2/search/autocomplete/{}",
            encoded_term
        );

        let Ok(resp) = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
        else {
            return results;
        };

        let Ok(json) = resp.json::<Value>().await else {
            return results;
        };

        let Some(data) = json.get("data").and_then(|v| v.as_array()) else {
            return results;
        };

        let mut join_set = tokio::task::JoinSet::new();
        for (idx, item) in data.iter().take(4).enumerate() {
            let id = item
                .get("id")
                .and_then(|v| v.as_u64())
                .map(|n| n.to_string())
                .unwrap_or_default();
            let name = item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(title)
                .to_string();
            let release_date_ts = item.get("release_date").and_then(|v| v.as_i64());
            let year = release_date_ts.and_then(|ts| {
                chrono::DateTime::from_timestamp(ts, 0).map(|dt| {
                    use chrono::Datelike;
                    dt.year()
                })
            });
            let client = client.clone();
            let auth_header = format!("Bearer {}", api_key);

            join_set.spawn(async move {
                let grid_url = format!("https://www.steamgriddb.com/api/v2/grids/game/{}", id);
                let hero_url = format!("https://www.steamgriddb.com/api/v2/heroes/game/{}", id);

                let grid_fut = async {
                    let g_resp = client
                        .get(&grid_url)
                        .header("Authorization", &auth_header)
                        .send()
                        .await
                        .ok()?;
                    let g_json = g_resp.json::<Value>().await.ok()?;
                    g_json
                        .get("data")
                        .and_then(|d| d.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|it| it.get("url"))
                        .and_then(|u| u.as_str())
                        .map(|s| s.to_string())
                };

                let hero_fut = async {
                    let h_resp = client
                        .get(&hero_url)
                        .header("Authorization", &auth_header)
                        .send()
                        .await
                        .ok()?;
                    let h_json = h_resp.json::<Value>().await.ok()?;
                    h_json
                        .get("data")
                        .and_then(|d| d.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|it| it.get("url"))
                        .and_then(|u| u.as_str())
                        .map(|s| s.to_string())
                };

                let (cover_url, bg_url) = tokio::join!(grid_fut, hero_fut);

                let desc = format!("Artwork HD verificata da SteamGridDB per {}", name);
                let raw_patch = GameMetadataPatch {
                    description: Some(desc.clone()),
                    cover_url: cover_url.clone(),
                    background_url: bg_url.clone(),
                    ..Default::default()
                };

                (
                    idx,
                    MetadataCandidateDto {
                        provider_id: "steamgriddb".to_string(),
                        provider_game_id: id,
                        title: name,
                        release_year: year,
                        cover_url,
                        background_url: bg_url,
                        description: Some(desc),
                        raw_patch,
                    },
                )
            });
        }

        let mut indexed = Vec::new();
        while let Some(res) = join_set.join_next().await {
            if let Ok(item) = res {
                indexed.push(item);
            }
        }
        indexed.sort_by_key(|(idx, _)| *idx);
        results.extend(indexed.into_iter().map(|(_, dto)| dto));

        results
    }

    async fn search_opencritic(
        client: &reqwest::Client,
        api_key: &str,
        title: &str,
    ) -> Vec<MetadataCandidateDto> {
        let mut results = Vec::new();
        let encoded_term = url_encode(title);
        let url = format!(
            "https://opencritic-api.p.rapidapi.com/game/search?criteria={}",
            encoded_term
        );

        let Ok(resp) = client
            .get(&url)
            .header("X-RapidAPI-Key", api_key)
            .header("X-RapidAPI-Host", "opencritic-api.p.rapidapi.com")
            .send()
            .await
        else {
            return results;
        };

        let Ok(json) = resp.json::<Value>().await else {
            return results;
        };

        let Some(arr) = json.as_array() else {
            return results;
        };

        for item in arr.iter().take(3) {
            let id = item
                .get("id")
                .and_then(|v| v.as_u64())
                .map(|n| n.to_string())
                .unwrap_or_default();
            let name = item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(title)
                .to_string();
            let score = item
                .get("topCriticScore")
                .and_then(|s| s.as_f64())
                .map(|s| s.round() as u8);
            let percent_rec = item
                .get("percentRecommended")
                .and_then(|s| s.as_f64())
                .map(|s| s.round() as u8);
            let desc = format!(
                "Recensioni aggregate da OpenCritic per {}. Critic Score: {:?}",
                name, score
            );

            let raw_patch = GameMetadataPatch {
                description: Some(desc.clone()),
                critic_score: score,
                community_score: percent_rec,
                ..Default::default()
            };

            results.push(MetadataCandidateDto {
                provider_id: "opencritic".to_string(),
                provider_game_id: id,
                title: name,
                release_year: None,
                cover_url: None,
                background_url: None,
                description: Some(desc),
                raw_patch,
            });
        }

        results
    }

    fn generate_fallback(
        title: &str,
        filter: &str,
        fallback_fn: &impl Fn(&str, &str) -> GameMetadataPatch,
    ) -> MetadataCandidateDto {
        let fallback = fallback_fn(title, "catalogo");
        MetadataCandidateDto {
            provider_id: if filter == "all" {
                "steam".to_string()
            } else {
                filter.to_string()
            },
            provider_game_id: format!("local_{}", Uuid::new_v4()),
            title: title.to_string(),
            release_year: Some(2023),
            cover_url: Some(
                "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600".to_string(),
            ),
            background_url: Some(
                "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1280".to_string(),
            ),
            description: fallback.description.clone(),
            raw_patch: fallback,
        }
    }
}
