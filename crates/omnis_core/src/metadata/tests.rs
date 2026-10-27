use super::*;

#[tokio::test]
    async fn test_steam_metadata_download() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        db.seed_sample_games().expect("Failed to seed");

        let games = db.get_all_games().expect("Failed to get games");
        let cyberpunk = games
            .iter()
            .find(|g| g.title.contains("Cyberpunk"))
            .expect("Cyberpunk not found");

        let temp_cache = std::env::temp_dir().join("omnis_test_cache");
        let _ = std::fs::create_dir_all(&temp_cache);

        let downloader = MetadataDownloader::new();
        let patch_result = downloader
            .download_for_game(&db, cyberpunk.id, &temp_cache)
            .await;

        assert!(
            patch_result.is_ok(),
            "Download failed: {:?}",
            patch_result.err()
        );
        let patch = patch_result.unwrap();

        assert!(patch.critic_score.is_some());
        assert!(patch.description.is_some());
        assert!(!patch.genres.is_empty());

        let updated_game = db.get_game_by_id(cyberpunk.id).unwrap().unwrap();
        assert!(updated_game.critic_score.is_some());
        assert!(updated_game.description.is_some());
        println!(
            "Enriched game: {} with score {:?}",
            updated_game.title, updated_game.critic_score
        );

        let _ = std::fs::remove_dir_all(&temp_cache);
    }

    #[tokio::test]
    async fn test_plugins_scaffolding_and_dynamic_discovery() {
        let temp_plugins =
            std::env::temp_dir().join(format!("omnis_test_plugins_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_plugins);

        let downloader = MetadataDownloader::new();
        downloader.set_plugins_dir(temp_plugins.clone()).await;

        // Verify scaffolding created README.txt and metacritic_provider
        assert!(
            temp_plugins.join("README.txt").exists(),
            "README.txt was not scaffolded"
        );
        assert!(
            temp_plugins
                .join("metacritic_provider")
                .join("manifest.json")
                .exists(),
            "manifest.json was not scaffolded"
        );

        // Verify provider was dynamically loaded
        let providers = downloader.get_providers_info().await;
        let metacritic = providers.iter().find(|p| p.id == "metacritic_provider");
        assert!(
            metacritic.is_some(),
            "metacritic_provider was not dynamically registered"
        );

        let meta = metacritic.unwrap();
        assert_eq!(
            meta.is_builtin, false,
            "metacritic_provider must have is_builtin = false"
        );
        assert_eq!(meta.name, "Metacritic Community Scraper");
        assert!(meta.version.is_some());
        assert!(meta.plugin_path.is_some());

        let _ = std::fs::remove_dir_all(&temp_plugins);
    }

    #[tokio::test]
    async fn test_metadata_candidate_search() {
        let downloader = MetadataDownloader::new();
        let candidates = downloader.search_candidates("Portal", Some("steam")).await;
        assert!(
            candidates.is_ok(),
            "Candidate search returned error: {:?}",
            candidates.err()
        );
        let list = candidates.unwrap();
        assert!(
            !list.is_empty(),
            "Should return at least one candidate for 'Portal'"
        );
        let first = &list[0];
        assert_eq!(first.provider_id, "steam");
        assert!(!first.title.is_empty());
        assert!(first.raw_patch.description.is_some() || first.description.is_some());
    }

    #[tokio::test]
    async fn test_igdb_provider_registration_and_settings() {
        let temp_dir =
            std::env::temp_dir().join(format!("omnis_igdb_test_{}", uuid::Uuid::new_v4()));
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

        let providers = downloader.get_providers_info().await;

        let igdb = providers.iter().find(|p| p.id == "igdb");
        assert!(
            igdb.is_some(),
            "IGDB provider must be registered in MetadataDownloader"
        );

        let igdb_info = igdb.unwrap();
        assert_eq!(igdb_info.name, "IGDB (Internet Game Database)");
        assert!(!igdb_info.is_builtin);
        assert!(igdb_info.requires_api_key);
        assert!(
            !igdb_info.has_configured_key,
            "Initially credentials should not be configured"
        );

        // Save valid client_id and client_secret
        let mut settings = Map::new();
        settings.insert(
            "client_id".to_string(),
            Value::String("twitch_test_id".to_string()),
        );
        settings.insert(
            "client_secret".to_string(),
            Value::String("twitch_test_secret".to_string()),
        );
        downloader
            .save_provider_settings("igdb", settings)
            .await
            .expect("Failed to save settings");

        let updated_providers = downloader.get_providers_info().await;
        let updated_igdb = updated_providers.iter().find(|p| p.id == "igdb").unwrap();
        assert!(
            updated_igdb.has_configured_key,
            "has_configured_key should be true when both client_id and client_secret are provided"
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_pipeline_score_steam_when_details_not_steam() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        db.seed_sample_games().expect("Failed to seed");
        let games = db.get_all_games().expect("Failed to get games");
        let portal = games
            .iter()
            .find(|g| g.title.contains("Portal"))
            .expect("Portal not found");

        let temp_cache =
            std::env::temp_dir().join(format!("omnis_test_pipe_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_cache);

        let downloader = MetadataDownloader::new();
        let mut cfg = downloader.get_pipeline_config().await;
        cfg.details_source = "metacritic_provider".to_string();
        cfg.score_source = "steam".to_string();
        downloader.save_pipeline_config(cfg).await.unwrap();

        let patch_result = downloader
            .download_for_game(&db, portal.id, &temp_cache)
            .await;
        assert!(patch_result.is_ok());
        let patch = patch_result.unwrap();
        assert!(patch.critic_score.is_some(), "Steam score should be fetched when score_source is steam even if details_source != steam");

        let _ = std::fs::remove_dir_all(&temp_cache);
    }

    #[tokio::test]
    async fn test_pipeline_preserve_existing_artwork() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        db.seed_sample_games().expect("Failed to seed");
        let games = db.get_all_games().expect("Failed to get games");
        let portal = games
            .iter()
            .find(|g| g.title.contains("Portal"))
            .expect("Portal not found");

        let custom_cover = "C:\\existing_steam_cover.jpg".to_string();
        let custom_bg = "C:\\existing_steam_bg.jpg".to_string();
        let manual_patch = GameMetadataPatch {
            cover_url: Some(custom_cover.clone()),
            background_url: Some(custom_bg.clone()),
            ..Default::default()
        };
        db.apply_metadata_patch(portal.id, &manual_patch)
            .expect("Failed to apply manual patch");

        let saved = db.get_game_by_id(portal.id).unwrap().unwrap();
        assert_eq!(
            saved.cover_image_path.as_deref(),
            Some("C:\\existing_steam_cover.jpg")
        );
        assert_eq!(
            saved.background_image_path.as_deref(),
            Some("C:\\existing_steam_bg.jpg")
        );

        let temp_cache =
            std::env::temp_dir().join(format!("omnis_test_pipe_preserve_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_cache);

        let downloader = MetadataDownloader::new();
        let cfg = downloader.get_pipeline_config().await;
        assert!(
            cfg.preserve_existing_artwork,
            "preserve_existing_artwork should default to true"
        );

        let patch_result = downloader
            .download_for_game(&db, portal.id, &temp_cache)
            .await;
        assert!(patch_result.is_ok());

        let reloaded = db.get_game_by_id(portal.id).unwrap().unwrap();
        assert_eq!(
            reloaded.cover_image_path.as_deref(),
            Some("C:\\existing_steam_cover.jpg"),
            "Existing cover must be preserved"
        );
        assert_eq!(
            reloaded.background_image_path.as_deref(),
            Some("C:\\existing_steam_bg.jpg"),
            "Existing background must be preserved"
        );

        let _ = std::fs::remove_dir_all(&temp_cache);
    }

    #[tokio::test]
    async fn test_download_for_all_cancellation() {
        let db = Arc::new(Database::open_in_memory().expect("Failed to open DB"));
        db.seed_sample_games().expect("Failed to seed");

        let temp_cache =
            std::env::temp_dir().join(format!("omnis_test_cancel_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_cache);

        let downloader = Arc::new(MetadataDownloader::new());
        let downloader_clone = downloader.clone();

        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            downloader_clone.cancel_download();
        });

        let total_enriched = downloader
            .download_for_all(db, &temp_cache, |_cur, _tot, _title| {})
            .await;
        assert!(total_enriched.is_ok());
        assert!(total_enriched.unwrap() < 4);

        let _ = std::fs::remove_dir_all(&temp_cache);
    }

    #[tokio::test]
    async fn test_download_for_games_batch() {
        let db = Arc::new(Database::open_in_memory().expect("Failed to open DB"));
        db.seed_sample_games().expect("Failed to seed");
        let all_games = db.get_all_games().expect("Failed to get games");
        assert!(all_games.len() >= 2);

        let target_ids: Vec<uuid::Uuid> = all_games.iter().take(2).map(|g| g.id).collect();

        let temp_cache =
            std::env::temp_dir().join(format!("omnis_test_batch_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_cache);

        let downloader = Arc::new(MetadataDownloader::new());
        let total_enriched = downloader
            .download_for_games(db, target_ids, &temp_cache, |_cur, _tot, _title| {})
            .await;

        assert!(total_enriched.is_ok());
        let count = total_enriched.unwrap();
        assert_eq!(count, 2);

        let _ = std::fs::remove_dir_all(&temp_cache);
    }

    #[tokio::test]
    async fn test_remote_cover_caching_and_path_nesting() {
        let db = Database::open_in_memory().expect("Failed to open DB");
        db.seed_sample_games().expect("Failed to seed");
        let games = db.get_all_games().expect("Failed to get games");
        let portal = games
            .iter()
            .find(|g| g.title.contains("Portal"))
            .expect("Portal not found");

        let remote_url =
            "https://cdn.cloudflare.steamstatic.com/steam/apps/400/header.jpg".to_string();
        let manual_patch = GameMetadataPatch {
            cover_url: Some(remote_url.clone()),
            ..Default::default()
        };
        db.apply_metadata_patch(portal.id, &manual_patch)
            .expect("Failed to apply remote URL patch");

        let saved = db.get_game_by_id(portal.id).unwrap().unwrap();
        assert_eq!(saved.cover_image_path.as_deref(), Some(remote_url.as_str()));

        let temp_cache =
            std::env::temp_dir().join(format!("omnis_test_nesting_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_cache);

        let downloader = MetadataDownloader::new();
        // Even with preserve_existing_artwork = true, remote URLs should be downloaded and cached locally!
        let patch_result = downloader
            .download_for_game(&db, portal.id, &temp_cache)
            .await;
        assert!(
            patch_result.is_ok(),
            "Download failed: {:?}",
            patch_result.err()
        );

        let reloaded = db.get_game_by_id(portal.id).unwrap().unwrap();
        let cover_path = reloaded
            .cover_image_path
            .expect("Game must have a cover image path");
        assert!(
            !cover_path.starts_with("http"),
            "Cover image path must be converted to local path: {}",
            cover_path
        );
        assert!(
            !cover_path.contains("covers/covers") && !cover_path.contains("covers\\covers"),
            "Path must NOT be double-nested: {}",
            cover_path
        );
        assert!(
            std::path::Path::new(&cover_path).exists(),
            "Downloaded local cover file must exist on disk: {}",
            cover_path
        );

        let _ = std::fs::remove_dir_all(&temp_cache);
    }

    #[tokio::test]
    async fn test_steam_fallback_resolution() {
        let downloader = MetadataDownloader::new();
        // Test fallback for a non-existent 2x image that should fall back to header.jpg or capsule
        let invalid_steam_2x =
            "https://steamcdn-a.akamaihd.net/steam/apps/400/library_600x900_2x.jpg";
        let res = downloader
            .download_image_with_fallbacks(invalid_steam_2x, Some("400"))
            .await;
        assert!(
            res.is_ok(),
            "Fallback download for Steam app 400 must succeed: {:?}",
            res.err()
        );
        assert!(!res.unwrap().is_empty());
    }

    #[test]
    fn test_generate_fallback_metadata_facade() {
        let downloader = MetadataDownloader::new();
        let patch = downloader.generate_fallback_metadata("Baldur's Gate 3", "gog");
        assert!(patch.genres.contains(&"RPG".to_string()));
        assert!(patch.genres.contains(&"Open World Adventure".to_string()));
        assert_eq!(patch.publishers, vec!["GOG".to_string()]);
        assert_eq!(patch.developers, vec!["Official Developer".to_string()]);
        assert!(patch.description.unwrap().contains("Baldur's Gate 3"));
    }
