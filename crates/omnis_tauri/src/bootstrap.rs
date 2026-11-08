//! Application bootstrap coordinator: directory layout, service wiring, and lifecycle hooks

use crate::media_scope::MediaScope;
use crate::migration;
use crate::services::{AchievementService, ActiveGameManager};
use crate::store::StoreAccountManager;
use crate::tray;
use crate::types::{AppState, ImageCache};
use omnis_core::{
    Database, EventBus, MarketplaceManager, MetadataDownloader, PluginHost, SecretVault,
};
use omnis_plugin_epic::EpicLibraryPlugin;
use omnis_plugin_gog::GogCloudPlugin;
use omnis_plugin_steam::SteamPlugin;
use omnis_plugin_xbox::XboxCloudPlugin;
use omnis_sdk::constants::{events, storage};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::Manager;
use tracing::info;

pub struct AppPaths {
    pub app_dir: PathBuf,
    pub covers_dir: PathBuf,
    pub backgrounds_dir: PathBuf,
    pub plugins_dir: PathBuf,
    pub themes_dir: PathBuf,
}

pub struct AppBootstrap;

impl AppBootstrap {
    /// Initializes application directory tree and handles legacy data migrations
    pub fn init_directories(tauri_fallback: Option<PathBuf>) -> AppPaths {
        let (app_dir, is_portable) = migration::resolve_app_dir(tauri_fallback);
        info!(
            "Omnis Data Directory: {} (Portable: {})",
            app_dir.display(),
            is_portable
        );

        migration::migrate_all_legacy_data(&app_dir);

        let cache_dir = app_dir.join(storage::CACHE_DIR);
        let covers_dir = cache_dir.join(storage::COVERS_DIR);
        let backgrounds_dir = cache_dir.join(storage::BACKGROUNDS_DIR);
        let plugins_dir = app_dir.join(storage::PLUGINS_DIR);
        let themes_dir = app_dir.join(storage::THEMES_DIR);
        let trailers_dir = app_dir.join(storage::TRAILERS_DIR);

        let _ = std::fs::create_dir_all(&covers_dir);
        let _ = std::fs::create_dir_all(&backgrounds_dir);
        let _ = std::fs::create_dir_all(&plugins_dir);
        let _ = std::fs::create_dir_all(&themes_dir);
        let _ = std::fs::create_dir_all(&trailers_dir);

        AppPaths {
            app_dir,
            covers_dir,
            backgrounds_dir,
            plugins_dir,
            themes_dir,
        }
    }

    /// Opens SQLite database and relocates artwork paths if moved
    pub fn init_database(app_dir: &Path) -> Arc<Database> {
        let db_path = app_dir.join(storage::DATABASE_FILE);
        let db = Arc::new(Database::open(&db_path).expect("Failed to open SQLite database"));

        let app_dir_str = app_dir.to_string_lossy();
        let _ = db.relocate_image_paths(&app_dir_str);

        db
    }

    /// Initializes plugin host, marketplace manager, and metadata downloader
    pub fn init_plugins(
        plugins_dir: &Path,
        db: Arc<Database>,
    ) -> (
        Arc<PluginHost>,
        Arc<MetadataDownloader>,
        Arc<MarketplaceManager>,
    ) {
        let event_bus = EventBus::new(256);
        let mut host = PluginHost::new(event_bus.clone(), db);
        host.register_plugin(Box::new(SteamPlugin::new()));
        host.register_plugin(Box::new(EpicLibraryPlugin::new()));
        host.register_plugin(Box::new(GogCloudPlugin::new()));
        host.register_plugin(Box::new(XboxCloudPlugin::new()));

        let downloader = Arc::new(MetadataDownloader::new());
        let marketplace = Arc::new(MarketplaceManager::new());

        let plugins_dir_buf = plugins_dir.to_path_buf();
        let downloader_clone = downloader.clone();
        let marketplace_clone = marketplace.clone();
        tauri::async_runtime::block_on(async {
            let _ = host.initialize_all().await;
            downloader_clone
                .set_plugins_dir(plugins_dir_buf.clone())
                .await;
            marketplace_clone.set_plugins_dir(plugins_dir_buf).await;
        });

        (Arc::new(host), downloader, marketplace)
    }

    /// Initializes secure vault and cloud store account manager with built-in integrations
    pub fn init_store_accounts(app_dir: &Path, db: Arc<Database>) -> Arc<StoreAccountManager> {
        let vault = Arc::new(SecretVault::new(app_dir).unwrap_or_else(|e| {
            tracing::error!(
                "SecretVault initialization failed: {}. Using ephemeral in-memory key.",
                e
            );
            SecretVault::ephemeral()
        }));

        let store_account_manager = Arc::new(StoreAccountManager::new(db, vault));
        store_account_manager.register_plugin(Arc::new(GogCloudPlugin::new()));
        store_account_manager.register_plugin(Arc::new(XboxCloudPlugin::new()));
        store_account_manager.register_plugin(Arc::new(SteamPlugin::new()));
        store_account_manager.register_plugin(Arc::new(EpicLibraryPlugin::new()));

        store_account_manager
    }

    /// Constructs the root AppState composing all infrastructure and domain services
    pub fn build_state(app: &tauri::App) -> AppState {
        let tauri_fallback = app.path().app_data_dir().ok();
        let paths = Self::init_directories(tauri_fallback);
        let db = Self::init_database(&paths.app_dir);
        let (host, downloader, marketplace) = Self::init_plugins(&paths.plugins_dir, db.clone());
        let store_account_manager = Self::init_store_accounts(&paths.app_dir, db.clone());

        let media_scope = Arc::new(MediaScope::new(app.asset_protocol_scope()));
        let cache_dir = paths.app_dir.join(storage::CACHE_DIR);
        media_scope.allow_directory(&cache_dir);
        media_scope.allow_directory(&paths.app_dir.join(storage::TRAILERS_DIR));
        media_scope.allow_directory(&paths.covers_dir);
        media_scope.allow_directory(&paths.backgrounds_dir);
        media_scope.allow_directory(&paths.themes_dir);
        match db.get_all_games() {
            Ok(games) => games.iter().for_each(|g| media_scope.allow_game_media(g)),
            Err(e) => tracing::warn!("Failed to load games for asset scope: {}", e),
        }

        let image_cache = Arc::new(ImageCache::new());
        let active_game_manager = Arc::new(ActiveGameManager::new());
        let achievement_service = Arc::new(AchievementService::new());

        AppState {
            db,
            host,
            downloader,
            marketplace,
            app_dir: paths.app_dir,
            covers_dir: paths.covers_dir,
            backgrounds_dir: paths.backgrounds_dir,
            plugins_dir: paths.plugins_dir,
            themes_dir: paths.themes_dir,
            image_cache,
            media_scope,
            store_account_manager,
            trailer_cache: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
            active_game_manager,
            minimize_to_tray: Arc::new(AtomicBool::new(true)),
            achievement_service,
            sync_achievements_on_game_exit: Arc::new(AtomicBool::new(true)),
        }
    }

    /// Main setup hook called during Tauri application bootstrapping
    pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
        let state = Self::build_state(app);

        let active_mgr = state.active_game_manager.clone();
        let db_ref = state.db.clone();
        let db_steam = state.db.clone();
        let db_backup = state.db.clone();
        let app_dir_backup = state.app_dir.clone();
        let sync_on_exit = state.sync_achievements_on_game_exit.clone();

        app.manage(state);

        // Spawn automated background backup scheduler
        crate::services::spawn_backup_scheduler(db_backup, app_dir_backup, app.handle().clone());

        // Check if an installed game is already running and re-attach session on startup
        tauri::async_runtime::spawn(async move {
            active_mgr.check_and_reattach(&db_ref).await;
        });

        // Sync unrecorded Steam sessions from local gameprocess_log.txt on startup
        let app_handle_steam = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            let res = tokio::task::spawn_blocking(move || {
                crate::services::sync_local_steam_sessions(&db_steam).map_err(|e| e.to_string())
            })
            .await;

            match res {
                Ok(Ok(count)) if count > 0 => {
                    tracing::info!(
                        "Synchronized {} unrecorded Steam sessions on startup",
                        count
                    );
                    use tauri::Emitter;
                    let _ = app_handle_steam.emit(events::LIBRARY_UPDATED, ());
                }
                Ok(Err(e)) => {
                    tracing::warn!("Steam session startup sync error: {}", e);
                }
                _ => {}
            }
        });

        // If started with --fullscreen, enter fullscreen mode immediately
        let is_fullscreen = crate::commands::is_fullscreen_requested(std::env::args());
        if is_fullscreen {
            use tauri::Emitter;
            if let Some(window) = app.get_webview_window("main") {
                crate::services::window_service::ensure_fullscreen_geometry(&window.as_ref().window());
                let _ = window.emit(events::APP_SET_FULLSCREEN, true);

                // Remote streaming (Moonlight/Sunshine) and virtual display adapters often negotiate
                // resolution changes 100-500ms after the initial process spawn.
                // Re-assert geometry after 350ms and 800ms to guarantee zero edge overflow.
                let w1 = window.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(350)).await;
                    if w1.is_fullscreen().unwrap_or(false) {
                        crate::services::window_service::ensure_fullscreen_geometry(&w1.as_ref().window());
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(450)).await;
                    if w1.is_fullscreen().unwrap_or(false) {
                        crate::services::window_service::ensure_fullscreen_geometry(&w1.as_ref().window());
                    }
                });
            }
        }

        // Initialize System Tray
        if let Err(e) = tray::setup_tray(app.handle()) {
            tracing::error!("Failed to initialize system tray: {}", e);
        }

        // Listen for library and game events to update tray menu
        let app_handle = app.handle().clone();
        use tauri::Listener;
        let h1 = app_handle.clone();
        app.listen(events::LIBRARY_UPDATED, move |_| {
            tray::update_tray_menu(&h1);
        });
        let h2 = app_handle.clone();
        app.listen(events::GAME_STARTED, move |_| {
            tray::update_tray_menu(&h2);
        });
        let h3 = app_handle.clone();
        app.listen(events::GAME_STOPPED, move |event| {
            tray::update_tray_menu(&h3);

            if sync_on_exit.load(std::sync::atomic::Ordering::SeqCst) {
                let game_id = serde_json::from_str::<serde_json::Value>(event.payload())
                    .ok()
                    .and_then(|v| v.get("game_id")?.as_str().map(str::to_owned))
                    .and_then(|id| uuid::Uuid::parse_str(&id).ok());
                if let Some(game_id) = game_id {
                    tauri::async_runtime::spawn(crate::services::run_post_session_sync(
                        h3.clone(),
                        game_id,
                    ));
                }
            }
        });

        Ok(())
    }

    /// Handles single-instance second launch activation and argument forwarding
    pub fn handle_single_instance(app: &tauri::AppHandle, argv: &[String]) {
        use tauri::Emitter;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            crate::services::window_service::force_foreground(&window.as_ref().window());
            if crate::commands::is_fullscreen_requested(argv) {
                crate::services::window_service::ensure_fullscreen_geometry(&window.as_ref().window());
                let _ = app.emit(events::APP_SET_FULLSCREEN, true);
                let _ = window.emit(events::APP_SET_FULLSCREEN, true);
            }
        }
    }

    /// Handles window events (tray minimization, resolution / scale factor changes in fullscreen)
    pub fn handle_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
        if window.label() != "main" {
            return;
        }
        match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let state = window.state::<AppState>();
                if state
                    .minimize_to_tray
                    .load(std::sync::atomic::Ordering::SeqCst)
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            tauri::WindowEvent::ScaleFactorChanged { .. }
                if window.is_fullscreen().unwrap_or(false) =>
            {
                crate::services::window_service::ensure_fullscreen_geometry(window);
            }
            _ => {}
        }
    }
}
