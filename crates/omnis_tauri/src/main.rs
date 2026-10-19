pub mod commands;
pub mod store_manager;
pub mod types;

pub use commands::*;
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
    runtime.block_on(async {
        let _ = host.initialize_all().await;
        downloader.set_plugins_dir(plugins_dir.clone()).await;
        marketplace.set_plugins_dir(plugins_dir.clone()).await;
    });

    let store_account_manager = Arc::new(store_manager::StoreAccountManager::new(db.clone()));
    store_account_manager.register_plugin(Arc::new(omnis_plugin_gog::GogCloudPlugin::new()));
    store_account_manager.register_plugin(Arc::new(omnis_plugin_xbox::XboxCloudPlugin::new()));
    store_account_manager.register_plugin(Arc::new(omnis_plugin_steam::SteamPlugin::new()));
    store_account_manager.register_plugin(Arc::new(omnis_plugin_epic::EpicLibraryPlugin::new()));

    let host = Arc::new(host);
    let image_cache = Arc::new(ImageCache::new());

    let state = AppState {
        db,
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
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_games,
            get_counts,
            sync_library,
            download_metadata,
            download_all_metadata,
            enrich_single_game,
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
            open_folder,
            window_start_dragging,
            window_minimize,
            window_toggle_maximize,
            window_toggle_fullscreen,
            window_set_fullscreen,
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
            clear_library,
            get_game_trailer_url,
        ])
        .run(tauri::generate_context!())
        .expect("Errore durante l'esecuzione dell'applicazione Tauri");
}
