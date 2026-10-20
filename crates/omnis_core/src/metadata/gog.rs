use crate::metadata::types::MetadataCandidateDto;
use crate::metadata::utils::extract_year;
use crate::metadata::{html_to_plain_text, url_encode};
use async_trait::async_trait;
use omnis_sdk::{
    GameMetadataPatch, MetadataField, MetadataProvider, MetadataSearchRequest,
};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

pub struct GogMetadataProvider {
    client: reqwest::Client,
    plugin_dir: Option<PathBuf>,
}

impl GogMetadataProvider {
    pub fn new(client: reqwest::Client) -> Self {
        Self {
            client,
            plugin_dir: None,
        }
    }

    pub fn with_plugin_dir(mut self, path: PathBuf) -> Self {
        self.plugin_dir = Some(path);
        self
    }

    pub async fn search_candidates(
        &self,
        title: &str,
        limit: usize,
    ) -> Result<Vec<MetadataCandidateDto>, String> {
        let catalog_url = format!(
            "https://catalog.gog.com/v1/catalog?limit={}&query=like:{}",
            limit,
            url_encode(title)
        );
        let resp = self
            .client
            .get(&catalog_url)
            .send()
            .await
            .map_err(|e| format!("GOG Catalog request error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("GOG Catalog returned HTTP {}", resp.status()));
        }

        let json = resp
            .json::<Value>()
            .await
            .map_err(|e| format!("Failed to parse GOG catalog response: {}", e))?;

        let mut results = Vec::new();
        if let Some(products) = json.get("products").and_then(|v| v.as_array()) {
            for prod in products.iter().take(limit) {
                let id = prod
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| prod.get("id").and_then(|v| v.as_u64()).map(|n| n.to_string()))
                    .unwrap_or_default();

                let name = prod
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or(title)
                    .to_string();

                let cover_vert = prod
                    .get("coverVertical")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let cover_horiz = prod
                    .get("coverHorizontal")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let release_date = prod
                    .get("releaseDate")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let release_year = release_date.as_deref().and_then(extract_year);

                let mut genres = Vec::new();
                if let Some(g_arr) = prod.get("genres").and_then(|v| v.as_array()) {
                    for g in g_arr {
                        if let Some(g_name) = g.get("name").and_then(|v| v.as_str()) {
                            genres.push(g_name.to_string());
                        }
                    }
                }

                let mut developers = Vec::new();
                if let Some(d_arr) = prod.get("developers").and_then(|v| v.as_array()) {
                    for d in d_arr {
                        if let Some(d_name) = d.as_str() {
                            developers.push(d_name.to_string());
                        }
                    }
                }

                let mut publishers = Vec::new();
                if let Some(p_arr) = prod.get("publishers").and_then(|v| v.as_array()) {
                    for p in p_arr {
                        if let Some(p_name) = p.as_str() {
                            publishers.push(p_name.to_string());
                        }
                    }
                }

                let desc = format!("Titolo ufficiale GOG Store DRM-Free: {}", name);
                let raw_patch = GameMetadataPatch {
                    description: Some(desc.clone()),
                    release_date: release_date.clone(),
                    cover_url: cover_vert.clone(),
                    background_url: cover_horiz.clone(),
                    icon_url: None,
                    critic_score: None,
                    community_score: None,
                    genres,
                    developers,
                    publishers,
                    tags: Vec::new(),
                };

                results.push(MetadataCandidateDto {
                    provider_id: "gog".to_string(),
                    provider_game_id: id,
                    title: name,
                    release_year,
                    cover_url: cover_vert,
                    background_url: cover_horiz,
                    description: Some(desc),
                    raw_patch,
                });
            }
        }

        Ok(results)
    }
}

#[async_trait]
impl MetadataProvider for GogMetadataProvider {
    fn id(&self) -> &str {
        "gog"
    }

    fn name(&self) -> &str {
        "GOG Store & Galaxy Catalog"
    }

    fn description(&self) -> &str {
        "Recupera artwork ufficiali DRM-Free, locandine verticali e panoramiche dal catalogo GOG."
    }

    fn author(&self) -> &str {
        "GOG / CD PROJEKT"
    }

    fn website(&self) -> Option<&str> {
        Some("https://www.gog.com")
    }

    fn requires_api_key(&self) -> bool {
        false
    }

    fn is_builtin(&self) -> bool {
        true
    }

    fn version(&self) -> Option<&str> {
        Some("1.0.0 (Built-in)")
    }

    fn plugin_path(&self) -> Option<&Path> {
        self.plugin_dir.as_deref()
    }

    fn supported_fields(&self) -> Vec<MetadataField> {
        vec![
            MetadataField::CoverImage,
            MetadataField::BackgroundImage,
            MetadataField::Description,
            MetadataField::ReleaseDate,
            MetadataField::Genres,
            MetadataField::Developers,
            MetadataField::Publishers,
        ]
    }

    async fn fetch_metadata(
        &self,
        request: &MetadataSearchRequest,
        _settings: &Map<String, Value>,
    ) -> Result<GameMetadataPatch, String> {
        // 1. If external_id is numeric and library is GOG, query GOG products API directly
        if request.library_id.eq_ignore_ascii_case("gog") {
            if let Some(ref ext_id) = request.external_id {
                if ext_id.chars().all(|c| c.is_ascii_digit()) && !ext_id.is_empty() {
                    let url = format!("https://api.gog.com/products/{}?expand=description", ext_id);
                    if let Ok(resp) = self.client.get(&url).send().await {
                        if resp.status().is_success() {
                            if let Ok(data) = resp.json::<Value>().await {
                                let desc = data
                                    .get("description")
                                    .and_then(|v| v.get("lead"))
                                    .and_then(|v| v.as_str())
                                    .map(html_to_plain_text);

                                let mut cover_url = None;
                                let mut bg_url = None;

                                if let Some(images) = data.get("images").and_then(|v| v.as_object()) {
                                    if let Some(bg) = images.get("background").and_then(|v| v.as_str()) {
                                        let clean_bg = if bg.starts_with("//") {
                                            format!("https:{}", bg)
                                        } else {
                                            bg.to_string()
                                        };
                                        bg_url = Some(clean_bg);
                                    }
                                    if let Some(logo) = images.get("logo2x").or_else(|| images.get("logo")).and_then(|v| v.as_str()) {
                                        let clean_logo = if logo.starts_with("//") {
                                            format!("https:{}", logo)
                                        } else {
                                            logo.to_string()
                                        };
                                        cover_url = Some(clean_logo);
                                    }
                                }

                                return Ok(GameMetadataPatch {
                                    description: desc,
                                    release_date: None,
                                    cover_url,
                                    background_url: bg_url,
                                    icon_url: None,
                                    critic_score: None,
                                    community_score: None,
                                    genres: Vec::new(),
                                    developers: Vec::new(),
                                    publishers: Vec::new(),
                                    tags: Vec::new(),
                                });
                            }
                        }
                    }
                }
            }
        }

        // 2. Search GOG Catalog API v1 by title
        let catalog_url = format!(
            "https://catalog.gog.com/v1/catalog?limit=1&query=like:{}",
            url_encode(&request.title)
        );
        let resp = self
            .client
            .get(&catalog_url)
            .send()
            .await
            .map_err(|e| format!("GOG Catalog request error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("GOG Catalog returned HTTP {}", resp.status()));
        }

        let json = resp
            .json::<Value>()
            .await
            .map_err(|e| format!("Failed to parse GOG catalog response: {}", e))?;

        let first = json
            .get("products")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .ok_or_else(|| format!("Nessun gioco trovato su GOG per '{}'", request.title))?;

        let cover_vert = first.get("coverVertical").and_then(|v| v.as_str()).map(|s| s.to_string());
        let cover_horiz = first.get("coverHorizontal").and_then(|v| v.as_str()).map(|s| s.to_string());

        let mut genres = Vec::new();
        if let Some(g_arr) = first.get("genres").and_then(|v| v.as_array()) {
            for g in g_arr {
                if let Some(name) = g.get("name").and_then(|v| v.as_str()) {
                    genres.push(name.to_string());
                }
            }
        }

        let mut developers = Vec::new();
        if let Some(d_arr) = first.get("developers").and_then(|v| v.as_array()) {
            for d in d_arr {
                if let Some(name) = d.as_str() {
                    developers.push(name.to_string());
                }
            }
        }

        let mut publishers = Vec::new();
        if let Some(p_arr) = first.get("publishers").and_then(|v| v.as_array()) {
            for p in p_arr {
                if let Some(name) = p.as_str() {
                    publishers.push(name.to_string());
                }
            }
        }

        let release_date = first.get("releaseDate").and_then(|v| v.as_str()).map(|s| s.to_string());

        Ok(GameMetadataPatch {
            description: None,
            release_date,
            cover_url: cover_vert,
            background_url: cover_horiz,
            icon_url: None,
            critic_score: None,
            community_score: None,
            genres,
            developers,
            publishers,
            tags: Vec::new(),
        })
    }

    async fn test_connection(&self, _settings: &Map<String, Value>) -> Result<String, String> {
        let url = "https://catalog.gog.com/v1/catalog?limit=1&query=like:Witcher";
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Errore di rete GOG Catalog: {}", e))?;
        if resp.status().is_success() {
            Ok("Connessione a GOG Catalog API verificata con successo (200 OK).".to_string())
        } else {
            Err(format!("GOG Catalog API ha risposto con codice HTTP {}", resp.status()))
        }
    }
}
