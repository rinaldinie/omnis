// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod achievement_service;
pub mod active_game;
pub mod bootstrap;
pub mod builtin_themes;
pub mod candidate_applier;
pub mod commands;
pub mod launcher_service;
pub mod migration;
pub mod slot_resolver;
pub mod store_actions;
pub mod store_manager;
pub mod trailer_service;
pub mod tray;
pub mod types;

pub use achievement_service::*;
pub use active_game::*;
pub use bootstrap::*;
pub use candidate_applier::*;
pub use commands::*;
pub use launcher_service::*;
pub use slot_resolver::*;
pub use store_actions::*;
pub use trailer_service::*;
pub use tray::*;
pub use types::*;

use tracing::info;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    info!("Initializing Omnis Game Library...");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            AppBootstrap::handle_single_instance(app, &argv);
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| AppBootstrap::setup(app))
        .on_window_event(|window, event| {
            AppBootstrap::handle_window_event(window, event);
        })
        .invoke_handler(tauri::generate_handler![
            get_games,
            get_counts,
            get_global_statistics,
            get_game_statistics,
            sync_library,
            detect_stores,
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
            update_game_completion_status,
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
            inspect_playnite_backup,
            execute_playnite_import,
            pick_playnite_backup_file,
        ])
        .run(tauri::generate_context!())
        .expect("Errore durante l'esecuzione dell'applicazione Tauri");
}
