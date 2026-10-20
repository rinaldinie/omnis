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

#[tokio::test]
async fn test_marketplace_real_zip_install_and_sha256_validation() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let omnis_plugins_dir = manifest_dir
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("omnis-plugins");

    let dist_zip = omnis_plugins_dir.join("dist").join("howlongtobeat-v1.1.0.zip");
    if !dist_zip.exists() {
        eprintln!(
            "Dist zip not found at {}, skipping real zip test.",
            dist_zip.display()
        );
        return;
    }

    // Read the zip to calculate real SHA-256
    let bytes = std::fs::read(&dist_zip).expect("Failed to read howlongtobeat zip");
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let real_sha256 = format!("{:x}", hasher.finalize());

    let zip_file_url = format!("file:///{}", dist_zip.to_string_lossy().replace('\\', "/"));
    let platform_key = if cfg!(target_os = "windows") {
        "windows-x86_64"
    } else {
        "linux-x86_64"
    };

    let temp_dir = std::env::temp_dir().join(format!("omnis_market_zip_test_{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&temp_dir);

    let downloader = std::sync::Arc::new(MetadataDownloader::new());
    downloader.set_plugins_dir(temp_dir.clone()).await;

    // 1. Test TAMPERED SHA-256 rejection
    let tampered_catalog_json = serde_json::json!({
        "version": "1.0.0",
        "updated_at": "2026-10-20T10:00:00Z",
        "plugins": [
            {
                "id": "howlongtobeat",
                "name": "HowLongToBeat Community Extension",
                "description": "Test plugin",
                "author": "HLTB Community",
                "version": "1.1.0",
                "plugin_type": "metadata",
                "requires_api_key": false,
                "platforms": {
                    platform_key: {
                        "download_url": zip_file_url,
                        "filename": "howlongtobeat-v1.1.0.zip",
                        "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
                        "size_bytes": bytes.len() as u64
                    }
                }
            }
        ]
    });

    let tampered_cat_path = temp_dir.join("tampered_catalog.json");
    std::fs::write(&tampered_cat_path, serde_json::to_string_pretty(&tampered_catalog_json).unwrap()).unwrap();

    let manager_tampered = omnis_core::MarketplaceManager::with_plugins_dir(temp_dir.clone());
    let _ = manager_tampered.get_catalog(Some(tampered_cat_path.to_str().unwrap())).await.unwrap();
    let install_tampered_res = manager_tampered.install_plugin("howlongtobeat", &downloader).await;
    assert!(install_tampered_res.is_err(), "Installation with invalid SHA-256 MUST fail!");
    let err_msg = install_tampered_res.err().unwrap();
    assert!(
        err_msg.contains("Verifica integrità SHA-256 fallita"),
        "Error message should mention SHA-256 failure: {}",
        err_msg
    );

    // 2. Test VALID SHA-256 acceptance & real ZIP extraction
    let valid_catalog_json = serde_json::json!({
        "version": "1.0.0",
        "updated_at": "2026-10-20T10:00:00Z",
        "plugins": [
            {
                "id": "howlongtobeat",
                "name": "HowLongToBeat Community Extension",
                "description": "Test plugin",
                "author": "HLTB Community",
                "version": "1.1.0",
                "plugin_type": "metadata",
                "requires_api_key": false,
                "platforms": {
                    platform_key: {
                        "download_url": zip_file_url,
                        "filename": "howlongtobeat-v1.1.0.zip",
                        "sha256": real_sha256,
                        "size_bytes": bytes.len() as u64
                    }
                }
            }
        ]
    });

    let valid_cat_path = temp_dir.join("valid_catalog.json");
    std::fs::write(&valid_cat_path, serde_json::to_string_pretty(&valid_catalog_json).unwrap()).unwrap();

    let manager_valid = omnis_core::MarketplaceManager::with_plugins_dir(temp_dir.clone());
    let _ = manager_valid.get_catalog(Some(valid_cat_path.to_str().unwrap())).await.unwrap();

    let install_valid_res = manager_valid.install_plugin("howlongtobeat", &downloader).await;
    assert!(
        install_valid_res.is_ok(),
        "Installation with valid SHA-256 and real ZIP must succeed: {:?}",
        install_valid_res.err()
    );

    let provider_info = install_valid_res.unwrap();
    assert_eq!(provider_info.id, "howlongtobeat");
    assert!(provider_info.is_enabled);

    // Verify extracted files in target_dir
    let installed_plugin_dir = temp_dir.join("howlongtobeat");
    assert!(
        installed_plugin_dir.join("manifest.json").exists(),
        "manifest.json must be extracted from zip"
    );

    // Clean up
    let _ = manager_valid.uninstall_plugin("howlongtobeat", &downloader).await;
    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[tokio::test]
async fn test_howlongtobeat_times_formatting_and_variance() {
    use omnis_core::metadata::ExternalMetadataProvider;

    // 1. Test duration formatting
    assert_eq!(ExternalMetadataProvider::format_hltb_duration(0), "--");
    assert_eq!(ExternalMetadataProvider::format_hltb_duration(1800), "30 Min");
    assert_eq!(ExternalMetadataProvider::format_hltb_duration(84940), "23½ Ore");
    assert_eq!(ExternalMetadataProvider::format_hltb_duration(175042), "48½ Ore");
    assert_eq!(ExternalMetadataProvider::format_hltb_duration(343125), "95½ Ore");
    assert_eq!(ExternalMetadataProvider::format_hltb_duration(3600), "1 Ore");
    assert_eq!(ExternalMetadataProvider::format_hltb_duration(7200), "2 Ore");

    // 2. Test curated matches
    let (w_main, w_extra, w_comp) = ExternalMetadataProvider::fallback_hltb_times("The Witcher 3: Wild Hunt");
    assert_eq!(w_main, "51½ Ore");
    assert_eq!(w_extra, "103 Ore");
    assert_eq!(w_comp, "173 Ore");

    let (p_main, p_extra, p_comp) = ExternalMetadataProvider::fallback_hltb_times("Portal 2");
    assert_eq!(p_main, "8½ Ore");
    assert_eq!(p_extra, "11½ Ore");
    assert_eq!(p_comp, "14 Ore");

    // 3. Test non-curated fallback has distinct variance per title
    let (game_a_main, _, _) = ExternalMetadataProvider::fallback_hltb_times("Random Indie Puzzle Adventure");
    let (game_b_main, _, _) = ExternalMetadataProvider::fallback_hltb_times("Cosmic Space Odyssey 4");
    assert_ne!(
        game_a_main, game_b_main,
        "Fallback times should vary dynamically across different game titles"
    );

    // 4. Test ExternalMetadataProvider roundtrip
    let manifest = omnis_sdk::PluginManifest {
        id: "howlongtobeat".to_string(),
        name: "HowLongToBeat Community Extension".to_string(),
        version: "1.1.0".to_string(),
        author: "HLTB Community".to_string(),
        description: "Test".to_string(),
        plugin_type: "metadata".to_string(),
        website: None,
        key_help_url: None,
        requires_api_key: false,
        supported_fields: vec![],
        entry_point: None,
        settings_schema: None,
        permissions: vec![],
        ui_slots: vec![],
    };
    let client = reqwest::Client::new();
    let provider = ExternalMetadataProvider::new(manifest, PathBuf::from("/tmp"), client);

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
