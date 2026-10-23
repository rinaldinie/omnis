// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod active_game;
pub mod commands;
pub mod store_manager;
pub mod tray;
pub mod types;

pub use active_game::*;
pub use commands::*;
pub use tray::*;
pub use types::*;

use omnis_core::{Database, EventBus, MarketplaceManager, MetadataDownloader, PluginHost};
use omnis_plugin_steam::SteamPlugin;
use std::sync::Arc;
use tracing::info;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    info!("Inizializzazione Omnis Game Library (Epic Games Launcher V2 / Tauri Engine)...");

    let app_dir = get_app_dir();
    let cache_dir = app_dir.join("cache");
    let covers_dir = cache_dir.join("covers");
    let backgrounds_dir = cache_dir.join("backgrounds");
    let plugins_dir = app_dir.join("plugins");
    let themes_dir = app_dir.join("themes");
    let trailers_dir = app_dir.join("trailers");
    let _ = std::fs::create_dir_all(&covers_dir);
    let _ = std::fs::create_dir_all(&backgrounds_dir);
    let _ = std::fs::create_dir_all(&plugins_dir);
    let _ = std::fs::create_dir_all(&themes_dir);
    let _ = std::fs::create_dir_all(&trailers_dir);

    let db_path = app_dir.join("library.db");
    let db = Arc::new(Database::open(&db_path).expect("Impossibile aprire il database SQLite"));

    let event_bus = EventBus::new(256);
    let mut host = PluginHost::new(event_bus.clone(), db.clone());
    host.register_plugin(Box::new(SteamPlugin::new()));

    let downloader = Arc::new(MetadataDownloader::new());
    let marketplace = Arc::new(MarketplaceManager::new());

    let runtime = tokio::runtime::Runtime::new().expect("Impossibile inizializzare Tokio runtime");
    let _guard = runtime.enter();
    runtime.block_on(async {
        let _ = host.initialize_all().await;
        downloader.set_plugins_dir(plugins_dir.clone()).await;
        marketplace.set_plugins_dir(plugins_dir.clone()).await;
    });

    let vault = Arc::new(omnis_core::SecretVault::new(&app_dir).unwrap_or_else(|e| {
        tracing::warn!("SecretVault initialization warning: {}. Using fallback.", e);
        omnis_core::SecretVault::from_key([0x42; 32])
    }));
    let store_account_manager = Arc::new(store_manager::StoreAccountManager::new(
        db.clone(),
        vault.clone(),
    ));
    store_account_manager.register_plugin(Arc::new(omnis_plugin_gog::GogCloudPlugin::new()));
    store_account_manager.register_plugin(Arc::new(omnis_plugin_xbox::XboxCloudPlugin::new()));
    store_account_manager.register_plugin(Arc::new(omnis_plugin_steam::SteamPlugin::new()));
    store_account_manager.register_plugin(Arc::new(omnis_plugin_epic::EpicLibraryPlugin::new()));

    let host = Arc::new(host);
    let image_cache = Arc::new(ImageCache::new());
    let active_game_manager = Arc::new(active_game::ActiveGameManager::new());

    let state = AppState {
        db: db.clone(),
        host,
        downloader,
        marketplace,
        app_dir,
        covers_dir,
        backgrounds_dir,
        plugins_dir,
        themes_dir,
        image_cache,
        store_account_manager,
        trailer_cache: Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
        active_game_manager: active_game_manager.clone(),
        minimize_to_tray: Arc::new(std::sync::atomic::AtomicBool::new(true)),
    };

    // Check if an installed game is already running and re-attach session on startup (Requirement B2)
    let active_mgr_startup = active_game_manager.clone();
    let db_startup = db.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            let active_mgr = active_mgr_startup.clone();
            let db_ref = db_startup.clone();
            tauri::async_runtime::spawn(async move {
                active_mgr.check_and_reattach(&db_ref).await;
            });

            // If started with --fullscreen, enter fullscreen mode immediately
            let is_fullscreen = std::env::args().any(|arg| arg == "--fullscreen" || arg == "-f");
            if is_fullscreen {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_fullscreen(true);
                }
            }

            // Initialize System Tray
            if let Err(e) = tray::setup_tray(&app.handle()) {
                tracing::error!("Impossibile inizializzare il system tray: {}", e);
            }

            // Listen for library and game events to update tray menu
            let app_handle = app.handle().clone();
            use tauri::Listener;
            let h1 = app_handle.clone();
            app.listen("library-updated", move |_| {
                tray::update_tray_menu(&h1);
            });
            let h2 = app_handle.clone();
            app.listen("game-started", move |_| {
                tray::update_tray_menu(&h2);
            });
            let h3 = app_handle.clone();
            app.listen("game-stopped", move |_| {
                tray::update_tray_menu(&h3);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                use tauri::Manager;
                let state = window.state::<AppState>();
                if state
                    .minimize_to_tray
                    .load(std::sync::atomic::Ordering::SeqCst)
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_games,
            get_counts,
            sync_library,
            download_metadata,
            download_all_metadata,
            download_batch_metadata,
            cancel_metadata_download,
            enrich_single_game,
            refresh_game_howlongtobeat,
            get_metadata_providers,
            refresh_metadata_providers,
            save_provider_settings,
            toggle_provider,
            test_provider_connection,
            get_metadata_pipeline_config,
            save_metadata_pipeline_config,
            get_marketplace_catalog,
            install_marketplace_plugin,
            uninstall_marketplace_plugin,
            launch_game,
            get_running_game,
            kill_running_game,
            open_folder,
            open_external_url,
            open_game_install_dir,
            uninstall_game,
            create_desktop_shortcut,
            verify_game_files,
            remove_game_from_library,
            set_minimize_to_tray,
            window_start_dragging,
            window_minimize,
            window_unminimize,
            window_set_focus,
            window_toggle_maximize,
            window_toggle_fullscreen,
            window_set_fullscreen,
            is_fullscreen_launch,
            window_close,
            get_themes,
            save_custom_theme,
            add_custom_game,
            get_game,
            update_game_metadata,
            search_metadata_candidates,
            apply_metadata_candidate,
            pick_executable_file,
            pick_directory,
            find_executables_in_folder,
            pick_image_file,
            start_store_login,
            get_store_accounts,
            disconnect_store_account,
            sync_store_library,
            save_store_api_key,
            save_store_integration_settings,
            get_store_integration_settings,
            clear_library,
            get_game_trailer_url,
            get_vault_status,
            get_slot_widgets,
            get_game_achievements,
            refresh_game_achievements,
        ])
        .run(tauri::generate_context!())
        .expect("Errore durante l'esecuzione dell'applicazione Tauri");
}
