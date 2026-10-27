use super::*;

#[test]
fn test_seed_catalog_parsing() {
    let catalog: MarketplaceCatalog =
        serde_json::from_str(EMBEDDED_SEED_CATALOG).expect("Marketplace seed JSON must be valid");
    assert_eq!(catalog.plugins.len(), 5);

    let ids: Vec<&str> = catalog.plugins.iter().map(|p| p.id.as_str()).collect();
    assert!(ids.contains(&"igdb"));
    assert!(ids.contains(&"steamgriddb"));
    assert!(ids.contains(&"opencritic"));
    assert!(ids.contains(&"howlongtobeat"));
    assert!(ids.contains(&"retro_achievements"));
}

#[test]
fn test_version_comparison() {
    assert!(is_newer_version("1.1.0", "1.0.0"));
    assert!(is_newer_version("2.0.0", "1.9.9"));
    assert!(is_newer_version("1.0.1", "1.0.0"));
    assert!(!is_newer_version("1.0.0", "1.0.0"));
    assert!(!is_newer_version("1.0.0", "1.1.0"));
}

#[test]
fn test_current_platform_key() {
    let key = current_platform_key();
    assert!(!key.is_empty());
    if cfg!(target_os = "windows") {
        assert_eq!(key, "windows-x86_64");
    } else if cfg!(target_os = "linux") {
        assert_eq!(key, "linux-x86_64");
    }
}

#[tokio::test]
async fn test_marketplace_manager_lifecycle() {
    let temp_dir = std::env::temp_dir().join(format!("omnis_market_test_{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&temp_dir);

    let manager = MarketplaceManager::with_plugins_dir(temp_dir.clone());
    let downloader = Arc::new(crate::metadata::MetadataDownloader::new());
    downloader.set_plugins_dir(temp_dir.clone()).await;

    // 1. Initial catalog fetch
    let catalog = manager.get_catalog(None).await.expect("Catalog should load");
    assert_eq!(catalog.plugins.len(), 5);
    let hltb = catalog.plugins.iter().find(|p| p.id == "howlongtobeat").unwrap();
    assert!(!hltb.is_installed);

    // 2. Install mock plugin
    let provider_info = manager
        .install_plugin("howlongtobeat", &downloader)
        .await
        .expect("Installation of mock plugin must succeed");
    assert_eq!(provider_info.id, "howlongtobeat");

    // 3. Catalog reflects installation
    let catalog_after = manager.get_catalog(None).await.expect("Catalog should refresh");
    let hltb_after = catalog_after.plugins.iter().find(|p| p.id == "howlongtobeat").unwrap();
    assert!(hltb_after.is_installed);
    assert_eq!(hltb_after.installed_version.as_deref(), Some("1.1.0"));

    // 4. Uninstall plugin
    manager
        .uninstall_plugin("howlongtobeat", &downloader)
        .await
        .expect("Uninstallation must succeed");

    let catalog_final = manager.get_catalog(None).await.expect("Catalog should refresh");
    let hltb_final = catalog_final.plugins.iter().find(|p| p.id == "howlongtobeat").unwrap();
    assert!(!hltb_final.is_installed);

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[tokio::test]
async fn test_marketplace_install_retro_achievements() {
    let temp_dir =
        std::env::temp_dir().join(format!("omnis_market_ra_test_{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&temp_dir);

    let manager = MarketplaceManager::with_plugins_dir(temp_dir.clone());
    let downloader = Arc::new(crate::metadata::MetadataDownloader::new());
    downloader.set_plugins_dir(temp_dir.clone()).await;

    if let Ok(info) = manager.install_plugin("retro_achievements", &downloader).await {
        assert_eq!(info.id, "retro_achievements");
        assert!(info.is_enabled);

        let catalog = manager.get_catalog(None).await.expect("Catalog refresh");
        let item = catalog.plugins.iter().find(|p| p.id == "retro_achievements").unwrap();
        assert!(item.is_installed);

        let _ = manager.uninstall_plugin("retro_achievements", &downloader).await;
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_validate_plugin_id() {
    assert!(validate_plugin_id("steam_metadata").is_ok());
    assert!(validate_plugin_id("how-long-to-beat-123").is_ok());
    assert!(validate_plugin_id("").is_err());
    assert!(validate_plugin_id("../traversal").is_err());
    assert!(validate_plugin_id("plugin/nested").is_err());
    assert!(validate_plugin_id("plugin\\nested").is_err());
    assert!(validate_plugin_id("plugin name").is_err());
}
