use omnis_core::{HowLongToBeatProvider, MetadataDownloader, ProviderRegistry};
use omnis_sdk::{MetadataProvider, MetadataSearchRequest};

#[tokio::test]
async fn test_default_registered_native_providers() {
    let client = reqwest::Client::new();
    let registry = ProviderRegistry::new(client);

    let providers = registry.get_providers_info().await;
    let ids: Vec<&str> = providers.iter().map(|p| p.id.as_str()).collect();

    assert!(ids.contains(&"steam"), "Steam provider must be registered");
    assert!(ids.contains(&"gog"), "GOG provider must be registered");
    assert!(ids.contains(&"igdb"), "IGDB provider must be registered");
    assert!(
        ids.contains(&"steamgriddb"),
        "SteamGridDB provider must be registered"
    );
    assert!(
        ids.contains(&"opencritic"),
        "OpenCritic provider must be registered"
    );
    assert!(
        ids.contains(&"howlongtobeat"),
        "HowLongToBeat provider must be registered"
    );

    // Verify all 6 are enabled by default
    for prov in &providers {
        assert!(prov.is_enabled, "Provider {} must be enabled by default", prov.id);
        assert!(prov.is_builtin, "Provider {} must be built-in", prov.id);
    }
}

#[tokio::test]
async fn test_howlongtobeat_times_formatting_and_variance() {
    // 1. Test duration formatting
    assert_eq!(HowLongToBeatProvider::format_hltb_duration(0), "--");
    assert_eq!(HowLongToBeatProvider::format_hltb_duration(1800), "30 Min");
    assert_eq!(HowLongToBeatProvider::format_hltb_duration(84940), "23½ Ore");
    assert_eq!(HowLongToBeatProvider::format_hltb_duration(175042), "48½ Ore");
    assert_eq!(HowLongToBeatProvider::format_hltb_duration(343125), "95½ Ore");
    assert_eq!(HowLongToBeatProvider::format_hltb_duration(3600), "1 Ore");
    assert_eq!(HowLongToBeatProvider::format_hltb_duration(7200), "2 Ore");

    // 2. Test curated matches
    let (w_main, w_extra, w_comp) =
        HowLongToBeatProvider::fallback_hltb_times("The Witcher 3: Wild Hunt");
    assert_eq!(w_main, "51½ Ore");
    assert_eq!(w_extra, "103 Ore");
    assert_eq!(w_comp, "173 Ore");

    let (p_main, p_extra, p_comp) = HowLongToBeatProvider::fallback_hltb_times("Portal 2");
    assert_eq!(p_main, "8½ Ore");
    assert_eq!(p_extra, "11½ Ore");
    assert_eq!(p_comp, "14 Ore");

    // 3. Test non-curated fallback has distinct variance per title
    let (game_a_main, _, _) =
        HowLongToBeatProvider::fallback_hltb_times("Random Indie Puzzle Adventure");
    let (game_b_main, _, _) =
        HowLongToBeatProvider::fallback_hltb_times("Cosmic Space Odyssey 4");
    assert_ne!(
        game_a_main, game_b_main,
        "Fallback times should vary dynamically across different game titles"
    );

    // 4. Test provider fetch_metadata roundtrip
    let client = reqwest::Client::new();
    let provider = HowLongToBeatProvider::new(client);

    let patch = provider
        .fetch_metadata(
            &MetadataSearchRequest {
                title: "Portal 2".to_string(),
                external_id: None,
                library_id: "steam".to_string(),
            },
            &Default::default(),
        )
        .await
        .expect("fetch_metadata should succeed");

    assert!(patch.extra_metadata.is_some());
    let extra_val: serde_json::Value =
        serde_json::from_str(&patch.extra_metadata.unwrap()).expect("Valid extra_metadata JSON");
    assert!(extra_val.get("howlongtobeat").is_some());
    let hltb = extra_val.get("howlongtobeat").unwrap();
    assert!(hltb.get("main_story").is_some());
    assert!(hltb.get("main_extra").is_some());
    assert!(hltb.get("completionist").is_some());
}

#[tokio::test]
async fn test_provider_settings_and_pipeline_config() {
    let temp_dir = std::env::temp_dir().join(format!("omnis_test_settings_{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&temp_dir);

    let downloader = MetadataDownloader::new();
    downloader.set_plugins_dir(temp_dir.clone()).await;

    // 1. Save settings for SteamGridDB
    let mut sgdb_settings = serde_json::Map::new();
    sgdb_settings.insert("api_key".to_string(), serde_json::Value::String("test_sgdb_key_123".to_string()));
    downloader.save_provider_settings("steamgriddb", sgdb_settings).await.expect("Save settings should succeed");

    // 2. Verify setting was cached and returned
    let providers = downloader.get_providers_info().await;
    let sgdb_info = providers.iter().find(|p| p.id == "steamgriddb").expect("steamgriddb must be in list");
    assert!(sgdb_info.has_configured_key);
    assert_eq!(
        sgdb_info.settings_values.get("api_key").and_then(|v| v.as_str()),
        Some("test_sgdb_key_123")
    );

    // 3. Test toggle provider
    downloader.toggle_provider("opencritic", false).await.expect("Toggle should succeed");
    let providers_after = downloader.get_providers_info().await;
    let oc_info = providers_after.iter().find(|p| p.id == "opencritic").expect("opencritic must be in list");
    assert!(!oc_info.is_enabled);

    let _ = std::fs::remove_dir_all(&temp_dir);
}
