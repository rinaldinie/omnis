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
    let catalog = manager
        .get_catalog(None)
        .await
        .expect("Catalog should load");
    assert_eq!(catalog.plugins.len(), 5);
    let hltb = catalog
        .plugins
        .iter()
        .find(|p| p.id == "howlongtobeat")
        .unwrap();
    assert!(!hltb.is_installed);

    // 2. Install mock plugin
    let provider_info = manager
        .install_plugin("howlongtobeat", &downloader)
        .await
        .expect("Installation of mock plugin must succeed");
    assert_eq!(provider_info.id, "howlongtobeat");

    // 3. Catalog reflects installation
    let catalog_after = manager
        .get_catalog(None)
        .await
        .expect("Catalog should refresh");
    let hltb_after = catalog_after
        .plugins
        .iter()
        .find(|p| p.id == "howlongtobeat")
        .unwrap();
    assert!(hltb_after.is_installed);
    assert_eq!(hltb_after.installed_version.as_deref(), Some("1.1.0"));

    // 4. Uninstall plugin
    manager
        .uninstall_plugin("howlongtobeat", &downloader)
        .await
        .expect("Uninstallation must succeed");

    let catalog_final = manager
        .get_catalog(None)
        .await
        .expect("Catalog should refresh");
    let hltb_final = catalog_final
        .plugins
        .iter()
        .find(|p| p.id == "howlongtobeat")
        .unwrap();
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

    if let Ok(info) = manager
        .install_plugin("retro_achievements", &downloader)
        .await
    {
        assert_eq!(info.id, "retro_achievements");
        assert!(info.is_enabled);

        let catalog = manager.get_catalog(None).await.expect("Catalog refresh");
        let item = catalog
            .plugins
            .iter()
            .find(|p| p.id == "retro_achievements")
            .unwrap();
        assert!(item.is_installed);

        let _ = manager
            .uninstall_plugin("retro_achievements", &downloader)
            .await;
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

fn asset(url: &str, sha256: Option<&str>) -> MarketplacePlatformAsset {
    MarketplacePlatformAsset {
        download_url: url.to_string(),
        filename: "plugin.zip".to_string(),
        sha256: sha256.map(str::to_string),
        size_bytes: None,
    }
}

#[tokio::test]
async fn test_download_rejects_plain_http() {
    let client = reqwest::Client::new();
    let a = asset("http://example.com/plugin.zip", Some(&"a".repeat(64)));
    let err = PluginPackageInstaller::download_or_read_asset(&client, "p", &a)
        .await
        .unwrap_err();
    assert!(err.contains("non consentito"));
}

#[tokio::test]
async fn test_download_requires_sha256_for_https() {
    let client = reqwest::Client::new();
    for sha in [None, Some(""), Some("   ")] {
        let a = asset("https://example.invalid/plugin.zip", sha);
        let err = PluginPackageInstaller::download_or_read_asset(&client, "p", &a)
            .await
            .unwrap_err();
        assert!(err.contains("SHA-256"), "unexpected error: {err}");
    }
}

#[tokio::test]
async fn test_download_rejects_unknown_scheme_and_allows_mock() {
    let client = reqwest::Client::new();
    let a = asset("ftp://example.com/plugin.zip", None);
    assert!(
        PluginPackageInstaller::download_or_read_asset(&client, "p", &a)
            .await
            .is_err()
    );
    let a = asset("mock://plugin.zip", None);
    assert_eq!(
        PluginPackageInstaller::download_or_read_asset(&client, "p", &a)
            .await
            .unwrap(),
        None
    );
}

#[test]
fn test_verify_sha256() {
    let bytes = b"omnis";
    let digest = {
        use sha2::{Digest, Sha256};
        format!("{:x}", Sha256::digest(bytes))
    };
    assert!(PluginPackageInstaller::verify_sha256(bytes, &digest, "p").is_ok());
    assert!(PluginPackageInstaller::verify_sha256(bytes, &digest.to_uppercase(), "p").is_ok());
    assert!(PluginPackageInstaller::verify_sha256(bytes, &"0".repeat(64), "p").is_err());
    assert!(PluginPackageInstaller::verify_sha256(bytes, "", "p").is_err());
    assert!(PluginPackageInstaller::verify_sha256(bytes, "not-a-hash", "p").is_err());
}
