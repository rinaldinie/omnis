use async_trait::async_trait;
use chrono::Datelike;
use omnis_sdk::{
    GameMetadataPatch, MetadataField, MetadataProvider, MetadataSearchRequest,
    PluginSettingsSchema, SettingField, SettingGroup, SettingType,
};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Cache item for Twitch OAuth2 Application Access Token
#[derive(Debug, Clone)]
pub struct TwitchTokenCache {
    pub access_token: String,
    pub expires_at: Instant,
}

impl TwitchTokenCache {
    pub fn new(access_token: impl Into<String>, expires_in: Duration) -> Self {
        Self {
            access_token: access_token.into(),
            expires_at: Instant::now() + expires_in,
        }
    }

    /// Check if the cached token is still valid with the given proactive refresh buffer
    pub fn is_valid(&self, buffer: Duration) -> bool {
        self.expires_at > Instant::now() + buffer
    }

    /// Returns true if the token is expired or within the proactive refresh buffer window
    pub fn needs_refresh(&self, buffer: Duration) -> bool {
        !self.is_valid(buffer)
    }
}

#[derive(Debug, Deserialize)]
struct TwitchTokenResponse {
    pub access_token: String,
    pub expires_in: u64,
    #[serde(default)]
    #[allow(dead_code)]
    pub token_type: Option<String>,
}

// ============================================================================
// APICalypse v4 IGDB Models (Resilient deserialization with serde defaults)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IgdbGame {
    #[serde(default)]
    pub id: u64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub storyline: Option<String>,
    #[serde(default)]
    pub first_release_date: Option<i64>,
    #[serde(default)]
    pub total_rating: Option<f64>,
    #[serde(default)]
    pub rating: Option<f64>,
    #[serde(default)]
    pub cover: Option<IgdbImage>,
    #[serde(default)]
    pub artworks: Option<Vec<IgdbImage>>,
    #[serde(default)]
    pub screenshots: Option<Vec<IgdbImage>>,
    #[serde(default)]
    pub genres: Option<Vec<IgdbGenre>>,
    #[serde(default)]
    pub involved_companies: Option<Vec<IgdbInvolvedCompany>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IgdbImage {
    #[serde(default)]
    pub id: Option<u64>,
    #[serde(default)]
    pub image_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IgdbGenre {
    #[serde(default)]
    pub id: Option<u64>,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IgdbInvolvedCompany {
    #[serde(default)]
    pub id: Option<u64>,
    #[serde(default)]
    pub developer: Option<bool>,
    #[serde(default)]
    pub publisher: Option<bool>,
    #[serde(default)]
    pub company: Option<IgdbCompany>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IgdbCompany {
    #[serde(default)]
    pub id: Option<u64>,
    #[serde(default)]
    pub name: Option<String>,
}

// ============================================================================
// Helper Utilities for IGDB / APICalypse
// ============================================================================

/// Sanitize search title for APICalypse query escaping quotes and backslashes
pub fn sanitize_apicalypse_query(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace(['\r', '\n'], " ")
}

/// Convert Unix timestamp in seconds to ISO date string (YYYY-MM-DD)
pub fn format_release_date(timestamp: i64) -> Option<String> {
    chrono::DateTime::from_timestamp(timestamp, 0).map(|dt| dt.format("%Y-%m-%d").to_string())
}

/// Extract release year from Unix timestamp
pub fn format_release_year(timestamp: i64) -> Option<i32> {
    chrono::DateTime::from_timestamp(timestamp, 0).map(|dt| dt.year())
}

/// Map an `IgdbGame` payload into a canonical `GameMetadataPatch`
pub fn igdb_game_to_patch(game: &IgdbGame) -> GameMetadataPatch {
    let description = game.summary.clone().or_else(|| game.storyline.clone());
    let release_date = game.first_release_date.and_then(format_release_date);

    let score_float = game.total_rating.or(game.rating);
    let critic_score = score_float.map(|r| r.round().clamp(0.0, 100.0) as u8);
    let community_score = critic_score;

    let cover_url = game
        .cover
        .as_ref()
        .and_then(|c| c.image_id.as_deref())
        .map(|id| format!("https://images.igdb.com/igdb/image/upload/t_cover_big/{}.jpg", id));

    let bg_image_id = game
        .artworks
        .as_deref()
        .and_then(|arr| arr.iter().find_map(|img| img.image_id.as_deref()))
        .or_else(|| {
            game.screenshots
                .as_deref()
                .and_then(|arr| arr.iter().find_map(|img| img.image_id.as_deref()))
        });
    let background_url = bg_image_id
        .map(|id| format!("https://images.igdb.com/igdb/image/upload/t_1080p/{}.jpg", id));

    let genres = game
        .genres
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter_map(|g| g.name.clone())
        .collect::<Vec<_>>();

    let mut developers = Vec::new();
    let mut publishers = Vec::new();

    if let Some(ref companies) = game.involved_companies {
        for inv in companies {
            if let Some(ref comp) = inv.company {
                if let Some(ref name) = comp.name {
                    if inv.developer == Some(true) && !developers.contains(name) {
                        developers.push(name.clone());
                    }
                    if inv.publisher == Some(true) && !publishers.contains(name) {
                        publishers.push(name.clone());
                    }
                }
            }
        }
    }

    GameMetadataPatch {
        description,
        release_date,
        cover_url,
        background_url,
        icon_url: None,
        critic_score,
        community_score,
        genres,
        developers,
        publishers,
        tags: Vec::new(),
    }
}

/// Helper function to extract and trim credentials from settings map
fn extract_credentials(settings: &Map<String, Value>) -> Result<(&str, &str), String> {
    let client_id = settings
        .get("client_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("");
    let client_secret = settings
        .get("client_secret")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("");

    if client_id.is_empty() || client_secret.is_empty() {
        return Err("Twitch Client ID o Secret non configurati.".to_string());
    }

    Ok((client_id, client_secret))
}

// ============================================================================
// IGDB Metadata Provider Implementation
// ============================================================================

#[derive(Clone)]
pub struct IgdbMetadataProvider {
    client: reqwest::Client,
    token_cache: Arc<RwLock<Option<TwitchTokenCache>>>,
    plugin_dir: Option<PathBuf>,
}

impl IgdbMetadataProvider {
    pub fn new(client: reqwest::Client) -> Self {
        Self {
            client,
            token_cache: Arc::new(RwLock::new(None)),
            plugin_dir: None,
        }
    }

    pub fn with_plugin_dir(mut self, path: PathBuf) -> Self {
        self.plugin_dir = Some(path);
        self
    }

    pub fn set_plugin_dir(&mut self, path: PathBuf) {
        self.plugin_dir = Some(path);
    }

    /// Retrieve valid OAuth2 bearer token from cache or refresh it from Twitch endpoint
    pub async fn get_or_refresh_token(
        &self,
        client_id: &str,
        client_secret: &str,
    ) -> Result<String, String> {
        const BUFFER_SECS: u64 = 60;

        // Fast path: check existing valid token under read lock
        {
            let read = self.token_cache.read().await;
            if let Some(ref cache) = *read {
                if cache.is_valid(Duration::from_secs(BUFFER_SECS)) {
                    return Ok(cache.access_token.clone());
                }
            }
        }

        // Slow path: acquire write lock and perform double check
        let mut write = self.token_cache.write().await;
        if let Some(ref cache) = *write {
            if cache.is_valid(Duration::from_secs(BUFFER_SECS)) {
                return Ok(cache.access_token.clone());
            }
        }

        let body = format!(
            "client_id={}&client_secret={}&grant_type=client_credentials",
            crate::metadata::url_encode(client_id),
            crate::metadata::url_encode(client_secret)
        );

        let resp = self
            .client
            .post("https://id.twitch.tv/oauth2/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(|e| format!("Errore di rete durante autenticazione Twitch: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!(
                "Autenticazione Twitch fallita (HTTP {}): {}",
                status, err_body
            ));
        }

        let token_data: TwitchTokenResponse = resp
            .json()
            .await
            .map_err(|e| format!("Errore nel parsing del token Twitch: {}", e))?;

        let expires_at = Instant::now() + Duration::from_secs(token_data.expires_in);
        let token = token_data.access_token.clone();

        *write = Some(TwitchTokenCache {
            access_token: token_data.access_token,
            expires_at,
        });

        Ok(token)
    }

    /// Invalidate the cached Twitch OAuth2 token
    pub async fn invalidate_token(&self) {
        let mut guard = self.token_cache.write().await;
        *guard = None;
    }

    /// Helper candidate search for phase 2 and interactive resolution
    pub async fn search_candidates(
        &self,
        title: &str,
        settings: &Map<String, Value>,
        limit: usize,
    ) -> Result<Vec<crate::metadata::MetadataCandidateDto>, String> {
        if title.trim().is_empty() {
            return Err("Titolo di ricerca non valido o vuoto.".to_string());
        }

        let (client_id, client_secret) = extract_credentials(settings)?;
        let access_token = self.get_or_refresh_token(client_id, client_secret).await?;

        let sanitized_title = sanitize_apicalypse_query(title);
        let clamped_limit = limit.clamp(1, 50);

        let query = format!(
            "fields name, summary, storyline, total_rating, rating, first_release_date, \
            cover.image_id, artworks.image_id, screenshots.image_id, genres.name, \
            involved_companies.company.name, involved_companies.developer, involved_companies.publisher; \
            search \"{}\"; limit {};",
            sanitized_title, clamped_limit
        );

        let resp = self
            .client
            .post("https://api.igdb.com/v4/games")
            .header("Client-ID", client_id)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Accept", "application/json")
            .body(query)
            .send()
            .await
            .map_err(|e| format!("Errore di rete ricerca IGDB: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            if status == StatusCode::UNAUTHORIZED {
                self.invalidate_token().await;
            }
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!(
                "IGDB API search ha risposto con codice HTTP {}: {}",
                status, err_body
            ));
        }

        let games: Vec<IgdbGame> = resp
            .json()
            .await
            .map_err(|e| format!("Errore nel parsing dei risultati IGDB: {}", e))?;

        let candidates = games
            .into_iter()
            .map(|game| {
                let patch = igdb_game_to_patch(&game);
                let release_year = game.first_release_date.and_then(format_release_year);
                crate::metadata::MetadataCandidateDto {
                    provider_id: "igdb".to_string(),
                    provider_game_id: game.id.to_string(),
                    title: game.name,
                    release_year,
                    cover_url: patch.cover_url.clone(),
                    background_url: patch.background_url.clone(),
                    description: patch.description.clone(),
                    raw_patch: patch,
                }
            })
            .collect();

        Ok(candidates)
    }
}

impl Default for IgdbMetadataProvider {
    fn default() -> Self {
        Self::new(reqwest::Client::new())
    }
}

#[async_trait]
impl MetadataProvider for IgdbMetadataProvider {
    fn id(&self) -> &str {
        "igdb"
    }

    fn name(&self) -> &str {
        "IGDB (Internet Game Database)"
    }

    fn description(&self) -> &str {
        "Database videoludico globale con sinossi ufficiali, date di rilascio, generi, sviluppatori, voti della critica e artwork in alta definizione."
    }

    fn author(&self) -> &str {
        "Omnis Community"
    }

    fn website(&self) -> Option<&str> {
        Some("https://www.igdb.com")
    }

    fn key_help_url(&self) -> Option<&str> {
        Some("https://dev.twitch.tv/console/apps")
    }

    fn requires_api_key(&self) -> bool {
        true
    }

    fn is_builtin(&self) -> bool {
        false
    }

    fn plugin_path(&self) -> Option<&Path> {
        self.plugin_dir.as_deref()
    }

    fn supported_fields(&self) -> Vec<MetadataField> {
        vec![
            MetadataField::CoverImage,
            MetadataField::BackgroundImage,
            MetadataField::CriticScore,
            MetadataField::CommunityScore,
            MetadataField::Description,
            MetadataField::ReleaseDate,
            MetadataField::Genres,
            MetadataField::Developers,
            MetadataField::Publishers,
        ]
    }

    fn settings_schema(&self) -> Option<PluginSettingsSchema> {
        Some(PluginSettingsSchema {
            plugin_id: "igdb".to_string(),
            title: "Configurazione IGDB / Twitch".to_string(),
            groups: vec![SettingGroup {
                id: "credentials".to_string(),
                title: "Credenziali Twitch / IGDB".to_string(),
                fields: vec![
                    SettingField {
                        key: "client_id".to_string(),
                        label: "Twitch Client ID".to_string(),
                        description: Some("Client ID della tua applicazione registrata su Twitch Developer Console".to_string()),
                        required: true,
                        field_type: SettingType::String {
                            default: None,
                            placeholder: Some("Inserisci Twitch Client ID...".into()),
                            regex: None,
                        },
                    },
                    SettingField {
                        key: "client_secret".to_string(),
                        label: "Twitch Client Secret".to_string(),
                        description: Some("Client Secret associato al tuo Client ID su Twitch Developer Console".to_string()),
                        required: true,
                        field_type: SettingType::SecretString {
                            placeholder: Some("Inserisci Twitch Client Secret...".into()),
                        },
                    },
                ],
            }],
        })
    }

    async fn fetch_metadata(
        &self,
        request: &MetadataSearchRequest,
        settings: &Map<String, Value>,
    ) -> Result<GameMetadataPatch, String> {
        if request.title.trim().is_empty() {
            return Err("Titolo di ricerca non valido o vuoto.".to_string());
        }

        let (client_id, client_secret) = extract_credentials(settings)?;
        let access_token = self.get_or_refresh_token(client_id, client_secret).await?;

        let sanitized_title = sanitize_apicalypse_query(&request.title);

        let query = format!(
            "fields name, summary, storyline, total_rating, rating, first_release_date, \
            cover.image_id, artworks.image_id, screenshots.image_id, genres.name, \
            involved_companies.company.name, involved_companies.developer, involved_companies.publisher; \
            search \"{}\"; limit 1;",
            sanitized_title
        );

        let resp = self
            .client
            .post("https://api.igdb.com/v4/games")
            .header("Client-ID", client_id)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Accept", "application/json")
            .body(query)
            .send()
            .await
            .map_err(|e| format!("Errore di rete ricerca IGDB: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            if status == StatusCode::UNAUTHORIZED {
                self.invalidate_token().await;
            }
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!(
                "IGDB API ha risposto con codice HTTP {}: {}",
                status, err_body
            ));
        }

        let games: Vec<IgdbGame> = resp
            .json()
            .await
            .map_err(|e| format!("Errore nel parsing della risposta IGDB: {}", e))?;

        let first_game = games
            .into_iter()
            .next()
            .ok_or_else(|| format!("Nessun gioco trovato su IGDB per '{}'", request.title))?;

        Ok(igdb_game_to_patch(&first_game))
    }

    async fn test_connection(&self, settings: &Map<String, Value>) -> Result<String, String> {
        let (client_id, client_secret) = extract_credentials(settings)?;

        let body = format!(
            "client_id={}&client_secret={}&grant_type=client_credentials",
            crate::metadata::url_encode(client_id),
            crate::metadata::url_encode(client_secret)
        );

        let resp = self
            .client
            .post("https://id.twitch.tv/oauth2/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(|e| format!("Errore di rete durante la verifica delle credenziali Twitch: {}", e))?;

        if resp.status().is_success() {
            if let Ok(token_data) = resp.json::<TwitchTokenResponse>().await {
                let mut write = self.token_cache.write().await;
                *write = Some(TwitchTokenCache {
                    access_token: token_data.access_token,
                    expires_at: Instant::now() + Duration::from_secs(token_data.expires_in),
                });
            }
            Ok("Connessione a Twitch/IGDB verificata con successo!".to_string())
        } else {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            if status.as_u16() == 400 || status.as_u16() == 401 || status.as_u16() == 403 {
                Err(format!(
                    "Credenziali Twitch non valide (HTTP {}): verificare Client ID e Secret.",
                    status
                ))
            } else {
                Err(format!(
                    "Twitch OAuth API ha restituito errore HTTP {}: {}",
                    status, err_text
                ))
            }
        }
    }
}

// ============================================================================
// Unit Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_apicalypse_query() {
        let raw = r#"Cyberpunk 2077: Phantom "Liberty" \ Extra"#;
        let sanitized = sanitize_apicalypse_query(raw);
        assert_eq!(
            sanitized,
            r#"Cyberpunk 2077: Phantom \"Liberty\" \\ Extra"#
        );

        let multiline = "Line 1\r\nLine 2\nLine 3";
        let sanitized_ml = sanitize_apicalypse_query(multiline);
        assert_eq!(sanitized_ml, "Line 1  Line 2 Line 3");
    }

    #[test]
    fn test_format_release_date_and_year() {
        // 1599782400 = 2020-09-11 00:00:00 UTC
        let ts = 1599782400;
        let date_str = format_release_date(ts);
        assert_eq!(date_str, Some("2020-09-11".to_string()));

        let year = format_release_year(ts);
        assert_eq!(year, Some(2020));

        // 0 = 1970-01-01
        assert_eq!(format_release_date(0), Some("1970-01-01".to_string()));
        assert_eq!(format_release_year(0), Some(1970));
    }

    #[test]
    fn test_deserialize_igdb_game_and_mapping() {
        let mock_json = r#"{
            "id": 1942,
            "name": "The Witcher 3: Wild Hunt",
            "summary": "Geralt of Rivia searches for Ciri across a war-torn continent.",
            "storyline": "The Wild Hunt, a supernatural army, pursues Ciri.",
            "first_release_date": 1431993600,
            "total_rating": 92.4,
            "rating": 91.8,
            "cover": {
                "id": 89001,
                "image_id": "co1wyy"
            },
            "artworks": [
                {
                    "id": 551,
                    "image_id": "ar1234"
                }
            ],
            "screenshots": [
                {
                    "id": 661,
                    "image_id": "sc5678"
                }
            ],
            "genres": [
                {
                    "id": 12,
                    "name": "Role-playing (RPG)"
                },
                {
                    "id": 31,
                    "name": "Adventure"
                }
            ],
            "involved_companies": [
                {
                    "id": 101,
                    "developer": true,
                    "publisher": false,
                    "company": {
                        "id": 201,
                        "name": "CD PROJEKT RED"
                    }
                },
                {
                    "id": 102,
                    "developer": false,
                    "publisher": true,
                    "company": {
                        "id": 202,
                        "name": "Bandai Namco Entertainment"
                    }
                }
            ]
        }"#;

        let game: IgdbGame = serde_json::from_str(mock_json)
            .expect("Failed to deserialize mock IGDB game JSON");

        assert_eq!(game.id, 1942);
        assert_eq!(game.name, "The Witcher 3: Wild Hunt");
        assert_eq!(game.cover.as_ref().unwrap().image_id.as_deref(), Some("co1wyy"));

        let patch = igdb_game_to_patch(&game);
        assert_eq!(
            patch.description,
            Some("Geralt of Rivia searches for Ciri across a war-torn continent.".to_string())
        );
        assert_eq!(patch.release_date, Some("2015-05-19".to_string()));
        assert_eq!(patch.critic_score, Some(92));
        assert_eq!(patch.community_score, Some(92));
        assert_eq!(
            patch.cover_url,
            Some("https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg".to_string())
        );
        assert_eq!(
            patch.background_url,
            Some("https://images.igdb.com/igdb/image/upload/t_1080p/ar1234.jpg".to_string())
        );
        assert_eq!(
            patch.genres,
            vec!["Role-playing (RPG)".to_string(), "Adventure".to_string()]
        );
        assert_eq!(patch.developers, vec!["CD PROJEKT RED".to_string()]);
        assert_eq!(patch.publishers, vec!["Bandai Namco Entertainment".to_string()]);

        // Candidate DTO test
        let release_year = game.first_release_date.and_then(format_release_year);
        assert_eq!(release_year, Some(2015));

        let candidate = crate::metadata::MetadataCandidateDto {
            provider_id: "igdb".to_string(),
            provider_game_id: game.id.to_string(),
            title: game.name.clone(),
            release_year,
            cover_url: patch.cover_url.clone(),
            background_url: patch.background_url.clone(),
            description: patch.description.clone(),
            raw_patch: patch,
        };

        assert_eq!(candidate.provider_id, "igdb");
        assert_eq!(candidate.provider_game_id, "1942");
        assert_eq!(candidate.release_year, Some(2015));
    }

    #[test]
    fn test_empty_or_minimal_igdb_game() {
        let minimal_json = r#"{"id": 42, "name": "Minimal Indie"}"#;
        let game: IgdbGame = serde_json::from_str(minimal_json).expect("Deserialization failed");
        assert_eq!(game.id, 42);
        assert_eq!(game.name, "Minimal Indie");

        let patch = igdb_game_to_patch(&game);
        assert_eq!(patch.description, None);
        assert_eq!(patch.release_date, None);
        assert_eq!(patch.cover_url, None);
        assert_eq!(patch.background_url, None);
        assert_eq!(patch.critic_score, None);
        assert!(patch.genres.is_empty());
        assert!(patch.developers.is_empty());
        assert!(patch.publishers.is_empty());
    }

    #[test]
    fn test_provider_metadata_and_schema() {
        let provider = IgdbMetadataProvider::default();
        assert_eq!(provider.id(), "igdb");
        assert_eq!(provider.name(), "IGDB (Internet Game Database)");
        assert!(provider.requires_api_key());
        assert!(!provider.is_builtin());
        assert_eq!(provider.website(), Some("https://www.igdb.com"));
        assert_eq!(provider.key_help_url(), Some("https://dev.twitch.tv/console/apps"));

        let fields = provider.supported_fields();
        assert_eq!(fields.len(), 9);
        assert!(!fields.contains(&MetadataField::Icon));
        assert!(fields.contains(&MetadataField::CoverImage));
        assert!(fields.contains(&MetadataField::BackgroundImage));
        assert!(fields.contains(&MetadataField::CriticScore));
        assert!(fields.contains(&MetadataField::Description));
        assert!(fields.contains(&MetadataField::ReleaseDate));
        assert!(fields.contains(&MetadataField::Genres));
        assert!(fields.contains(&MetadataField::Developers));
        assert!(fields.contains(&MetadataField::Publishers));

        let schema = provider.settings_schema().expect("Schema should exist");
        assert_eq!(schema.plugin_id, "igdb");
        assert_eq!(schema.groups.len(), 1);
        let group = &schema.groups[0];
        assert_eq!(group.id, "credentials");
        assert_eq!(group.fields.len(), 2);
        assert_eq!(group.fields[0].key, "client_id");
        assert!(group.fields[0].required);
        assert_eq!(group.fields[1].key, "client_secret");
        assert!(group.fields[1].required);
    }

    #[tokio::test]
    async fn test_invalidate_token() {
        let provider = IgdbMetadataProvider::default();
        {
            let mut guard = provider.token_cache.write().await;
            *guard = Some(TwitchTokenCache::new("dummy_token", Duration::from_secs(3600)));
        }
        assert!(provider.token_cache.read().await.is_some());

        provider.invalidate_token().await;
        assert!(provider.token_cache.read().await.is_none());
    }

    #[tokio::test]
    async fn test_empty_search_query_guard() {
        let provider = IgdbMetadataProvider::default();
        let settings = Map::new();

        let res_search = provider.search_candidates("   ", &settings, 5).await;
        assert!(res_search.is_err());
        assert_eq!(res_search.unwrap_err(), "Titolo di ricerca non valido o vuoto.");

        let req = MetadataSearchRequest {
            title: "\t \n".to_string(),
            external_id: None,
            library_id: "steam".to_string(),
        };
        let res_fetch = provider.fetch_metadata(&req, &settings).await;
        assert!(res_fetch.is_err());
        assert_eq!(res_fetch.unwrap_err(), "Titolo di ricerca non valido o vuoto.");
    }

    #[tokio::test]
    async fn test_connection_missing_credentials() {
        let provider = IgdbMetadataProvider::default();
        let settings = Map::new();
        let res = provider.test_connection(&settings).await;
        assert!(res.is_err());
        assert_eq!(res.unwrap_err(), "Twitch Client ID o Secret non configurati.");

        let mut settings_empty_vals = Map::new();
        settings_empty_vals.insert("client_id".to_string(), Value::String("   ".to_string()));
        settings_empty_vals.insert("client_secret".to_string(), Value::String("".to_string()));
        let res2 = provider.test_connection(&settings_empty_vals).await;
        assert!(res2.is_err());
        assert_eq!(res2.unwrap_err(), "Twitch Client ID o Secret non configurati.");
    }
}
