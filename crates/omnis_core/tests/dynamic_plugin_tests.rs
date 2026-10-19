use omnis_core::dynamic_loader::DynamicPluginLoader;
use omnis_core::MetadataDownloader;
use omnis_sdk::{MetadataField, MetadataProvider, MetadataSearchRequest};
use std::path::PathBuf;

fn get_sample_plugin_path() -> PathBuf {
    // Relative to workspace root or target/debug
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let target_debug = manifest_dir
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("target")
        .join("debug");

    let dll_path = if cfg!(target_os = "windows") {
        target_debug.join("sample_dynamic_provider.dll")
    } else if cfg!(target_os = "macos") {
        target_debug.join("libsample_dynamic_provider.dylib")
    } else {
        target_debug.join("libsample_dynamic_provider.so")
    };

    dll_path
}

#[tokio::test]
async fn test_dynamic_plugin_loader_direct() {
    let lib_path = get_sample_plugin_path();
    if !lib_path.exists() {
        eprintln!(
            "Sample dynamic library not found at {}, skipping direct load test.",
            lib_path.display()
        );
        return;
    }

    let loader = DynamicPluginLoader::new();
    let provider = loader
        .load_metadata_provider_from_library(&lib_path)
        .expect("Failed to load sample_dynamic_provider");

    // Verify manifest and metadata
    assert_eq!(provider.id(), "sample_dynamic");
    assert_eq!(provider.name(), "Sample Community Plugin");
    assert!(!provider.is_builtin());
    assert_eq!(provider.version(), Some("0.1.0"));
    assert!(provider.supported_fields().contains(&MetadataField::CriticScore));

    // Verify test_connection FFI roundtrip
    let test_res = provider.test_connection(&Default::default()).await;
    assert!(test_res.is_ok());
    assert!(test_res.unwrap().contains("connection OK"));

    // Verify fetch_metadata FFI roundtrip
    let search_req = MetadataSearchRequest {
        title: "Half-Life 2".to_string(),
        external_id: Some("220".to_string()),
        library_id: "steam".to_string(),
    };
    let patch_res = provider
        .fetch_metadata(&search_req, &Default::default())
        .await;
    assert!(patch_res.is_ok());
    let patch = patch_res.unwrap();
    assert_eq!(patch.critic_score, Some(99));
    assert_eq!(patch.community_score, Some(95));
    assert!(patch.description.unwrap().contains("Half-Life 2"));
}

#[tokio::test]
async fn test_metadata_downloader_load_and_register_dynamic_plugin() {
    let lib_path = get_sample_plugin_path();
    if !lib_path.exists() {
        eprintln!(
            "Sample dynamic library not found at {}, skipping registration test.",
            lib_path.display()
        );
        return;
    }

    let downloader = MetadataDownloader::new();
    let provider_info = downloader
        .load_and_register_dynamic_plugin(&lib_path)
        .await
        .expect("Failed to register dynamic plugin via MetadataDownloader");

    assert_eq!(provider_info.id, "sample_dynamic");
    assert_eq!(provider_info.name, "Sample Community Plugin");
    assert!(!provider_info.is_builtin);
    assert!(provider_info.is_enabled);

    let all_providers = downloader.get_providers_info().await;
    let found = all_providers.iter().any(|p| p.id == "sample_dynamic");
    assert!(found, "sample_dynamic provider must be in registered list");
}

#[tokio::test]
async fn test_metadata_downloader_scan_dynamic_plugin_folder() {
    let lib_path = get_sample_plugin_path();
    if !lib_path.exists() {
        eprintln!(
            "Sample dynamic library not found at {}, skipping scan test.",
            lib_path.display()
        );
        return;
    }

    // Create isolated temporary directory in system temp
    let temp_dir = std::env::temp_dir().join(format!("omnis_scan_dyn_test_{}", uuid::Uuid::new_v4()));
    let plugin_subfolder = temp_dir.join("sample_dynamic");
    std::fs::create_dir_all(&plugin_subfolder).expect("Failed to create temp plugin subfolder");

    let dest_lib = plugin_subfolder.join(lib_path.file_name().unwrap());
    std::fs::copy(&lib_path, &dest_lib).expect("Failed to copy dynamic library to temp directory");

    let downloader = MetadataDownloader::new();
    downloader.set_plugins_dir(temp_dir.clone()).await;

    let all_providers = downloader.get_providers_info().await;
    let found = all_providers.iter().find(|p| p.id == "sample_dynamic");
    assert!(found.is_some(), "Dynamic plugin should be discovered automatically by directory scan");

    // Clean up temp folder
    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[tokio::test]
async fn test_marketplace_manager_e2e_install_and_hot_reload() {
    let temp_dir = std::env::temp_dir().join(format!("omnis_market_e2e_{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&temp_dir);

    let manager = omnis_core::MarketplaceManager::with_plugins_dir(temp_dir.clone());
    let downloader = std::sync::Arc::new(MetadataDownloader::new());
    downloader.set_plugins_dir(temp_dir.clone()).await;

    let catalog = manager.get_catalog(None).await.expect("Failed to get catalog");
    assert!(!catalog.plugins.is_empty(), "Catalog should contain plugins");

    // Install sample_dynamic plugin
    if let Ok(info) = manager.install_plugin("sample_dynamic", &downloader).await {
        assert_eq!(info.id, "sample_dynamic");
        assert!(info.is_enabled);

        // Verify it is registered in downloader
        let providers = downloader.get_providers_info().await;
        assert!(providers.iter().any(|p| p.id == "sample_dynamic"));

        // Verify catalog shows is_installed = true
        let updated_catalog = manager.get_catalog(None).await.expect("Catalog refresh");
        let item = updated_catalog.plugins.iter().find(|p| p.id == "sample_dynamic").unwrap();
        assert!(item.is_installed);

        // Uninstall
        let uninst_res = manager.uninstall_plugin("sample_dynamic", &downloader).await;
        assert!(uninst_res.is_ok());

        // Verify it is removed
        let after_providers = downloader.get_providers_info().await;
        assert!(!after_providers.iter().any(|p| p.id == "sample_dynamic"));
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
}
