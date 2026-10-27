use crate::metadata::types::MetadataCandidateDto;
use crate::metadata::utils::extract_year;
use crate::metadata::{html_to_plain_text, url_encode};
use async_trait::async_trait;
use omnis_sdk::{
    GameMetadataPatch, MetadataField, MetadataProvider, MetadataSearchRequest,
};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

fn normalize_gog_url(s: &str) -> String {
    let trimmed = s.trim();
    if trimmed.starts_with("//") {
        format!("https:{}", trimmed)
    } else {
        trimmed.to_string()
    }
}

// ============================================================================
// GOG API Typed DTOs
// ============================================================================

#[derive(Debug, Deserialize)]
struct GogProductDetailsDto {
    description: Option<GogDescriptionLeadDto>,
    images: Option<GogProductImagesDto>,
}

#[derive(Debug, Deserialize)]
struct GogDescriptionLeadDto {
    lead: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GogProductImagesDto {
    background: Option<String>,
    logo2x: Option<String>,
    logo: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GogCatalogResponseDto {
    #[serde(default)]
    products: Vec<GogCatalogProductDto>,
}

#[derive(Debug, Deserialize)]
struct GogCatalogProductDto {
    id: Value,
    title: Option<String>,
    #[serde(rename = "coverVertical")]
    cover_vertical: Option<String>,
    image: Option<String>,
    #[serde(rename = "coverHorizontal")]
    cover_horizontal: Option<String>,
    #[serde(rename = "galaxyBackgroundImage")]
    galaxy_background_image: Option<String>,
    #[serde(rename = "releaseDate")]
    release_date: Option<String>,
    #[serde(default)]
    genres: Vec<GogNamedItemDto>,
    #[serde(default)]
    developers: Vec<String>,
    #[serde(default)]
    publishers: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct GogNamedItemDto {
    name: Option<String>,
}

impl GogCatalogProductDto {
    fn id_string(&self) -> String {
        match &self.id {
            Value::String(s) => s.clone(),
            Value::Number(n) => n.to_string(),
            _ => String::new(),
        }
    }

    fn cover_vertical_url(&self) -> Option<String> {
        self.cover_vertical
            .as_deref()
            .or(self.image.as_deref())
            .map(normalize_gog_url)
    }

    fn cover_horizontal_url(&self) -> Option<String> {
        self.cover_horizontal
            .as_deref()
            .or(self.galaxy_background_image.as_deref())
            .map(normalize_gog_url)
    }

    fn genres_list(&self) -> Vec<String> {
        self.genres.iter().filter_map(|g| g.name.clone()).collect()
    }
}

// ============================================================================
// GOG Metadata Provider (External / Built-in Plugin)
// ============================================================================

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

        let catalog_resp: GogCatalogResponseDto = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse GOG catalog response: {}", e))?;

        let results = catalog_resp
            .products
            .into_iter()
            .take(limit)
            .map(|prod| {
                let id = prod.id_string();
                let name = prod.title.unwrap_or_else(|| title.to_string());
                let cover_vert = prod.cover_vertical_url();
                let cover_horiz = prod.cover_horizontal_url();
                let release_date = prod.release_date;
                let release_year = release_date.as_deref().and_then(extract_year);
                let genres = prod.genres_list();
                let developers = prod.developers;
                let publishers = prod.publishers;
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
                    features: Vec::new(),
                    extra_metadata: None,
                };

                MetadataCandidateDto {
                    provider_id: "gog".to_string(),
                    provider_game_id: id,
                    title: name,
                    release_year,
                    cover_url: cover_vert,
                    background_url: cover_horiz,
                    description: Some(desc),
                    raw_patch,
                }
            })
            .collect();

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
                            if let Ok(data) = resp.json::<GogProductDetailsDto>().await {
                                let desc = data.description.and_then(|d| d.lead).map(html_to_plain_text);
                                let mut cover_url = None;
                                let mut bg_url = None;

                                if let Some(images) = data.images {
                                    if let Some(bg) = images.background {
                                        bg_url = Some(normalize_gog_url(&bg));
                                    }
                                    if let Some(logo) = images.logo2x.or(images.logo) {
                                        cover_url = Some(normalize_gog_url(&logo));
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
                                    features: Vec::new(),
                                    extra_metadata: None,
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

        let catalog_resp: GogCatalogResponseDto = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse GOG catalog response: {}", e))?;

        let first = catalog_resp
            .products
            .into_iter()
            .next()
            .ok_or_else(|| format!("Nessun gioco trovato su GOG per '{}'", request.title))?;

        Ok(GameMetadataPatch {
            description: None,
            release_date: first.release_date,
            cover_url: first.cover_vertical_url(),
            background_url: first.cover_horizontal_url(),
            icon_url: None,
            critic_score: None,
            community_score: None,
            genres: first.genres_list(),
            developers: first.developers,
            publishers: first.publishers,
            tags: Vec::new(),
            features: Vec::new(),
            extra_metadata: None,
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
            Err(format!(
                "GOG Catalog API ha risposto con codice HTTP {}",
                resp.status()
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gog_catalog_deserialization() {
        let json = r#"{
            "products": [
                {
                    "id": "1207658924",
                    "title": "The Witcher 3: Wild Hunt",
                    "coverVertical": "//images.gog.com/vertical.jpg",
                    "coverHorizontal": "//images.gog.com/horizontal.jpg",
                    "releaseDate": "2015-05-18",
                    "genres": [
                        { "name": "Role-playing" }
                    ],
                    "developers": ["CD PROJEKT RED"],
                    "publishers": ["CD PROJEKT RED"]
                }
            ]
        }"#;

        let parsed: GogCatalogResponseDto =
            serde_json::from_str(json).expect("Failed to parse GOG catalog");
        assert_eq!(parsed.products.len(), 1);
        let prod = &parsed.products[0];
        assert_eq!(prod.id_string(), "1207658924");
        assert_eq!(prod.title.as_deref(), Some("The Witcher 3: Wild Hunt"));
        assert_eq!(
            prod.cover_vertical_url().as_deref(),
            Some("https://images.gog.com/vertical.jpg")
        );
        assert_eq!(
            prod.cover_horizontal_url().as_deref(),
            Some("https://images.gog.com/horizontal.jpg")
        );
        assert_eq!(prod.genres_list(), vec!["Role-playing"]);
        assert_eq!(prod.developers, vec!["CD PROJEKT RED"]);
    }
}
