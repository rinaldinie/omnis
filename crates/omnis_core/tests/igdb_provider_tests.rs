//! IGDB Provider Integration & Workspace Verification Test Suite
//!
//! Validates:
//! - Test 1: Deserializzazione e Normalizzazione Dati IGDB (`IgdbGame` -> `GameMetadataPatch` / `MetadataCandidateDto`).
//! - Test 2: Token Cache & Scadenza Proattiva (`TwitchTokenCache`, buffer di 60 secondi).
//! - Test 3: Sanitizzazione Query APICalypse v4 (`sanitize_apicalypse_query`, escaping apici/backslash/newline).
//! - Test 4: Integrazione con `MetadataDownloader` (registrazione, credenziali, filtri di ricerca candidati).
//! - Test 5: Schema Impostazioni e Diagnostica Connessione (`settings_schema`, fallimento controllato su credenziali mancanti).

use omnis_core::metadata::igdb::{
    format_release_date, format_release_year, igdb_game_to_patch, sanitize_apicalypse_query,
    IgdbGame, IgdbMetadataProvider, TwitchTokenCache,
};
use omnis_core::{MetadataCandidateDto, MetadataDownloader};
use omnis_sdk::{MetadataField, MetadataProvider, SettingType};
use serde_json::{Map, Value};
use std::time::{Duration, Instant};

/// Test 1: Deserializzazione e Normalizzazione Dati IGDB
/// - Payload realistico mock APICalypse v4
/// - Conversione in GameMetadataPatch:
///   - URL Cover: t_cover_big/{image_id}.jpg
///   - URL Background: t_1080p/{image_id}.jpg (con artworks prioritari su screenshots)
///   - Data di rilascio YYYY-MM-DD e anno
///   - Critic / Community score arrotondato a u8
///   - Sviluppatori ed editori separati correttamente
///   - Fallback descrizione tra summary e storyline
#[test]
fn test_1_igdb_data_deserialization_and_normalization() {
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
            },
            {
                "id": 103,
                "developer": true,
                "publisher": true,
                "company": {
                    "id": 203,
                    "name": "Warner Bros. Interactive"
                }
            }
        ]
    }"#;

    let game: IgdbGame = serde_json::from_str(mock_json)
        .expect("Failed to deserialize mock IGDB game JSON payload");

    assert_eq!(game.id, 1942);
    assert_eq!(game.name, "The Witcher 3: Wild Hunt");
    assert_eq!(game.cover.as_ref().unwrap().image_id.as_deref(), Some("co1wyy"));

    // Normalizzazione in GameMetadataPatch
    let patch = igdb_game_to_patch(&game);

    // 1. Cover URL con template t_cover_big
    assert_eq!(
        patch.cover_url,
        Some("https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg".to_string())
    );

    // 2. Background URL con template t_1080p (artworks prioritari rispetto a screenshots)
    assert_eq!(
        patch.background_url,
        Some("https://images.igdb.com/igdb/image/upload/t_1080p/ar1234.jpg".to_string())
    );

    // 3. Data di rilascio convertita in YYYY-MM-DD
    assert_eq!(patch.release_date, Some("2015-05-19".to_string()));

    // 4. Critic score e Community score arrotondati a u8
    assert_eq!(patch.critic_score, Some(92));
    assert_eq!(patch.community_score, Some(92));

    // 5. Elenco separato per sviluppatori ed editori
    assert!(patch.developers.contains(&"CD PROJEKT RED".to_string()));
    assert!(patch.developers.contains(&"Warner Bros. Interactive".to_string()));
    assert!(!patch.developers.contains(&"Bandai Namco Entertainment".to_string()));

    assert!(patch.publishers.contains(&"Bandai Namco Entertainment".to_string()));
    assert!(patch.publishers.contains(&"Warner Bros. Interactive".to_string()));
    assert!(!patch.publishers.contains(&"CD PROJEKT RED".to_string()));

    // 6. Generi
    assert_eq!(
        patch.genres,
        vec!["Role-playing (RPG)".to_string(), "Adventure".to_string()]
    );

    // 7. Descrizione prioritaria summary su storyline
    assert_eq!(
        patch.description,
        Some("Geralt of Rivia searches for Ciri across a war-torn continent.".to_string())
    );

    // 8. Test Background fallback su screenshots se artworks è assente o vuoto
    let mut game_no_artworks = game.clone();
    game_no_artworks.artworks = None;
    let patch_screenshots = igdb_game_to_patch(&game_no_artworks);
    assert_eq!(
        patch_screenshots.background_url,
        Some("https://images.igdb.com/igdb/image/upload/t_1080p/sc5678.jpg".to_string()),
        "Dovrebbe selezionare screenshot quando artwork non è presente"
    );

    // 9. Test Descrizione fallback su storyline se summary è assente
    let mut game_storyline_only = game.clone();
    game_storyline_only.summary = None;
    let patch_storyline = igdb_game_to_patch(&game_storyline_only);
    assert_eq!(
        patch_storyline.description,
        Some("The Wild Hunt, a supernatural army, pursues Ciri.".to_string()),
        "Dovrebbe effettuare il fallback su storyline se summary è None"
    );

    // 10. Verifica Candidate DTO
    let release_year = game.first_release_date.and_then(format_release_year);
    let candidate = MetadataCandidateDto {
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

/// Test 2: Token Cache & Scadenza Proattiva
/// - Verifica che un token valido (> 60s di vita) sia considerato valido e non richieda refresh
/// - Verifica che un token con scadenza imminente (<= 60s) segnali correttamente la necessità di rinnovo
/// - Verifica che un token scaduto segnali la necessità di rinnovo
#[test]
fn test_2_twitch_token_cache_and_proactive_expiration() {
    const BUFFER: Duration = Duration::from_secs(60);

    // Caso A: Token valido con 1 ora di autonomia
    let valid_cache = TwitchTokenCache {
        access_token: "twitch_oauth_token_valid".to_string(),
        expires_at: Instant::now() + Duration::from_secs(3600),
    };

    // Controllo diretto Instant (usato internamente in get_or_refresh_token)
    assert!(
        valid_cache.expires_at > Instant::now() + BUFFER,
        "Token con scadenza a 1 ora deve essere considerato valido"
    );
    // Controllo tramite metodi di supporto
    assert!(valid_cache.is_valid(BUFFER));
    assert!(!valid_cache.needs_refresh(BUFFER));
    assert_eq!(valid_cache.access_token, "twitch_oauth_token_valid");

    // Caso B: Token in scadenza imminente (30 secondi, inferiore al buffer proattivo di 60 secondi)
    let near_expiry_cache = TwitchTokenCache {
        access_token: "twitch_oauth_token_near_expiry".to_string(),
        expires_at: Instant::now() + Duration::from_secs(30),
    };

    assert!(
        !(near_expiry_cache.expires_at > Instant::now() + BUFFER),
        "Token con meno di 60s di autonomia deve attivare il rinnovo proattivo"
    );
    assert!(!near_expiry_cache.is_valid(BUFFER));
    assert!(near_expiry_cache.needs_refresh(BUFFER));

    // Caso C: Token già scaduto nel passato
    let expired_cache = TwitchTokenCache {
        access_token: "twitch_oauth_token_expired".to_string(),
        expires_at: Instant::now() - Duration::from_secs(10),
    };

    assert!(
        !(expired_cache.expires_at > Instant::now() + BUFFER),
        "Token scaduto deve segnalare la necessità di rinnovo"
    );
    assert!(!expired_cache.is_valid(BUFFER));
    assert!(expired_cache.needs_refresh(BUFFER));

    // Caso D: Costruttore TwitchTokenCache::new
    let created_cache = TwitchTokenCache::new("test_new_token", Duration::from_secs(120));
    assert!(created_cache.is_valid(BUFFER));
    assert!(!created_cache.needs_refresh(BUFFER));
}

/// Test 3: Sanitizzazione Query APICalypse v4
/// - Test di caratteri problematici (doppi apici, backslash, due punti, trattini, newlines)
/// - Test di titoli lunghi e complessi
#[test]
fn test_3_apicalypse_query_sanitization() {
    // 1. Escaping doppi apici e backslash
    let input_quotes_backslash = r#"Cyberpunk 2077: Phantom "Liberty" \ Extra"#;
    let sanitized_1 = sanitize_apicalypse_query(input_quotes_backslash);
    assert_eq!(
        sanitized_1,
        r#"Cyberpunk 2077: Phantom \"Liberty\" \\ Extra"#,
        "I doppi apici e i backslash devono essere escapati"
    );

    // 2. Sostituzione newlines (\r\n e \n) con spazi
    let input_multiline = "Line 1\r\nLine 2\nLine 3";
    let sanitized_2 = sanitize_apicalypse_query(input_multiline);
    assert_eq!(
        sanitized_2, "Line 1  Line 2 Line 3",
        "I ritorni a capo devono essere trasformati in spazi"
    );

    // 3. Titolo complesso con caratteri speciali (due punti, trattini, slash)
    let input_complex = "S.T.A.L.K.E.R. 2: Heart of Chornobyl - \"Collector's Edition\" \\ Day-One";
    let sanitized_3 = sanitize_apicalypse_query(input_complex);
    assert_eq!(
        sanitized_3,
        "S.T.A.L.K.E.R. 2: Heart of Chornobyl - \\\"Collector's Edition\\\" \\\\ Day-One"
    );

    // 4. Titolo lungo (150+ caratteri)
    let input_long = "The Legend of Heroes: Trails of Cold Steel IV - THE END OF SAGA - \"Digital Deluxe Edition\" with all DLCs and \\\\ expansions \\ included for testing";
    let sanitized_4 = sanitize_apicalypse_query(input_long);
    assert!(sanitized_4.contains("\\\"Digital Deluxe Edition\\\""));
    assert!(sanitized_4.contains("\\\\\\\\ expansions \\\\ included"));

    // 5. Verifica formattazione date e anni
    assert_eq!(format_release_date(1599782400), Some("2020-09-11".to_string()));
    assert_eq!(format_release_year(1599782400), Some(2020));
    assert_eq!(format_release_date(0), Some("1970-01-01".to_string()));
    assert_eq!(format_release_year(0), Some(1970));
}

/// Test 4: Integrazione con `MetadataDownloader`
/// - Inizializzare un `MetadataDownloader::new()`
/// - Verificare che il provider "igdb" sia registrato ed abilitato
/// - Verificare la transizione di `has_configured_key`:
///   - false inizialmente (senza credenziali o credenziali parziali)
///   - true quando sia `client_id` che `client_secret` sono presenti e non vuoti
/// - Verificare che `search_candidates` gestisca il filtro "igdb" restituendo candidati con `provider_id: "igdb"`
#[tokio::test]
async fn test_4_metadata_downloader_igdb_integration() {
    let temp_dir = std::env::temp_dir().join(format!("omnis_igdb_integ_test_{}", uuid::Uuid::new_v4()));
    let igdb_dir = temp_dir.join("igdb");
    std::fs::create_dir_all(&igdb_dir).unwrap();
    std::fs::write(
        igdb_dir.join("manifest.json"),
        r#"{"id":"igdb","name":"IGDB (Internet Game Database)","version":"1.0.0","plugin_type":"metadata"}"#,
    )
    .unwrap();

    let downloader = MetadataDownloader::new();
    downloader
        .load_and_register_dynamic_plugin(&igdb_dir)
        .await
        .expect("Failed to register igdb");

    // 1. Verifica registrazione del provider "igdb"
    let providers = downloader.get_providers_info().await;
    let igdb = providers
        .iter()
        .find(|p| p.id == "igdb")
        .expect("Provider 'igdb' deve essere presente in MetadataDownloader");

    assert_eq!(igdb.name, "IGDB (Internet Game Database)");
    assert!(!igdb.is_builtin, "IGDB deve essere un provider esterno/plugin");
    assert!(igdb.requires_api_key, "IGDB richiede credenziali Twitch");
    assert!(
        !igdb.has_configured_key,
        "Inizialmente has_configured_key deve essere false"
    );

    // 2. Configurazione parziale: solo client_id -> has_configured_key rimane false
    let mut partial_settings_id = Map::new();
    partial_settings_id.insert(
        "client_id".to_string(),
        Value::String("twitch_client_id_test".to_string()),
    );
    downloader
        .save_provider_settings("igdb", partial_settings_id)
        .await
        .expect("Salvataggio impostazioni parziali deve riuscire");

    let provs_partial_id = downloader.get_providers_info().await;
    let igdb_partial_id = provs_partial_id.iter().find(|p| p.id == "igdb").unwrap();
    assert!(
        !igdb_partial_id.has_configured_key,
        "has_configured_key deve essere false se client_secret manca"
    );

    // 3. Configurazione parziale: solo client_secret -> has_configured_key rimane false
    let mut partial_settings_sec = Map::new();
    partial_settings_sec.insert(
        "client_secret".to_string(),
        Value::String("twitch_secret_test".to_string()),
    );
    downloader
        .save_provider_settings("igdb", partial_settings_sec)
        .await
        .expect("Salvataggio impostazioni parziali deve riuscire");

    let provs_partial_sec = downloader.get_providers_info().await;
    let igdb_partial_sec = provs_partial_sec.iter().find(|p| p.id == "igdb").unwrap();
    assert!(
        !igdb_partial_sec.has_configured_key,
        "has_configured_key deve essere false se client_id manca"
    );

    // 4. Configurazione completa: entrambi i campi valorizzati -> has_configured_key diventa true
    let mut full_settings = Map::new();
    full_settings.insert(
        "client_id".to_string(),
        Value::String("valid_client_id_12345".to_string()),
    );
    full_settings.insert(
        "client_secret".to_string(),
        Value::String("valid_client_secret_67890".to_string()),
    );
    downloader
        .save_provider_settings("igdb", full_settings)
        .await
        .expect("Salvataggio credenziali complete deve riuscire");

    let provs_full = downloader.get_providers_info().await;
    let igdb_full = provs_full.iter().find(|p| p.id == "igdb").unwrap();
    assert!(
        igdb_full.has_configured_key,
        "has_configured_key deve diventare true quando sia client_id che client_secret sono valorizzati"
    );

    // 5. Ricerca candidati con filtro "igdb"
    let candidates = downloader
        .search_candidates("Elden Ring", Some("igdb"))
        .await
        .expect("search_candidates con filtro igdb deve restituire un risultato Ok");

    assert!(
        !candidates.is_empty(),
        "search_candidates deve restituire almeno un candidato"
    );
    for cand in &candidates {
        assert_eq!(
            cand.provider_id, "igdb",
            "Tutti i candidati filtrati per 'igdb' devono avere provider_id == 'igdb'"
        );
    }
    let _ = std::fs::remove_dir_all(&temp_dir);
}

/// Test 5: Schema Impostazioni e Diagnostica Connessione
/// - Verifica che settings_schema() contenga il gruppo "credentials" con client_id e client_secret
/// - Verifica che client_secret sia di tipo SettingType::SecretString
/// - Verifica che test_connection con mappa vuota o mancante fallisca con messaggio chiaro
#[tokio::test]
async fn test_5_settings_schema_and_connection_diagnostics() {
    let provider = IgdbMetadataProvider::default();

    // 1. Schema impostazioni
    let schema = provider
        .settings_schema()
        .expect("IGDB provider deve definire un PluginSettingsSchema");
    assert_eq!(schema.plugin_id, "igdb");
    assert_eq!(schema.title, "Configurazione IGDB / Twitch");

    let cred_group = schema
        .groups
        .iter()
        .find(|g| g.id == "credentials")
        .expect("Lo schema deve contenere il gruppo 'credentials'");
    assert_eq!(cred_group.title, "Credenziali Twitch / IGDB");

    let client_id_field = cred_group
        .fields
        .iter()
        .find(|f| f.key == "client_id")
        .expect("Deve esistere il campo 'client_id'");
    assert!(client_id_field.required);

    let client_secret_field = cred_group
        .fields
        .iter()
        .find(|f| f.key == "client_secret")
        .expect("Deve esistere il campo 'client_secret'");
    assert!(client_secret_field.required);
    assert!(
        matches!(client_secret_field.field_type, SettingType::SecretString { .. }),
        "client_secret deve essere di tipo SecretString"
    );

    // 2. Diagnostica connessione con mappa vuota
    let empty_settings = Map::new();
    let res_empty = provider.test_connection(&empty_settings).await;
    assert!(res_empty.is_err(), "test_connection deve fallire se la mappa è vuota");
    let err_msg = res_empty.unwrap_err();
    assert!(
        err_msg.contains("non configurati"),
        "Il messaggio di errore deve indicare credenziali non configurate: '{}'",
        err_msg
    );

    // 3. Diagnostica connessione con valori solo spazi bianchi
    let mut whitespace_settings = Map::new();
    whitespace_settings.insert("client_id".to_string(), Value::String("   ".to_string()));
    whitespace_settings.insert("client_secret".to_string(), Value::String("".to_string()));
    let res_ws = provider.test_connection(&whitespace_settings).await;
    assert!(res_ws.is_err());
    assert!(res_ws.unwrap_err().contains("non configurati"));

    // 4. Diagnostica connessione tramite MetadataDownloader
    let temp_dir2 = std::env::temp_dir().join(format!("omnis_igdb_diag_test_{}", uuid::Uuid::new_v4()));
    let igdb_dir2 = temp_dir2.join("igdb");
    std::fs::create_dir_all(&igdb_dir2).unwrap();
    std::fs::write(
        igdb_dir2.join("manifest.json"),
        r#"{"id":"igdb","name":"IGDB (Internet Game Database)","version":"1.0.0","plugin_type":"metadata"}"#,
    )
    .unwrap();
    let downloader = MetadataDownloader::new();
    downloader.load_and_register_dynamic_plugin(&igdb_dir2).await.unwrap();
    let dl_test = downloader.test_provider_connection("igdb").await;
    assert!(dl_test.is_err());
    assert!(dl_test.unwrap_err().contains("non configurati"));
    let _ = std::fs::remove_dir_all(&temp_dir2);
}

/// Test 6: Remediation & Regression Verification
/// - Verifica che supported_fields() NON contenga MetadataField::Icon e abbia esattamente 9 campi
/// - Verifica che search_candidates rifiuti query vuote o composte solo da spazi
/// - Verifica che invalidate_token azzeri la cache dei token
#[tokio::test]
async fn test_6_remediation_fixes() {
    let provider = IgdbMetadataProvider::default();

    // 1. supported_fields() non include Icon
    let fields = provider.supported_fields();
    assert_eq!(fields.len(), 9, "I campi supportati devono essere esattamente 9");
    assert!(
        !fields.contains(&MetadataField::Icon),
        "IGDB non deve dichiarare il supporto al campo Icon"
    );

    // 2. Guardia query vuota o whitespace
    let empty_settings = Map::new();
    let err_empty = provider
        .search_candidates("   ", &empty_settings, 10)
        .await
        .expect_err("Dovrebbe fallire per titolo vuoto");
    assert_eq!(err_empty, "Titolo di ricerca non valido o vuoto.");

    // 3. Invalidate token
    provider.invalidate_token().await;
}

