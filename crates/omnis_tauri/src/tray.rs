use crate::types::AppState;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn build_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let state = app.state::<AppState>();
    let menu = Menu::new(app)?;

    // Title / Brand Header
    let brand = MenuItem::with_id(app, "brand_info", "Omnis Game Library", false, None::<&str>)?;
    menu.append(&brand)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // Show/Hide Omnis
    let show_hide = MenuItem::with_id(app, "show_hide", "Mostra / Nascondi", true, None::<&str>)?;
    menu.append(&show_hide)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // Check if game is currently running (non-blocking, safe inside Tokio worker threads)
    let running_session = state.active_game_manager.get_running_sync();

    if let Some(session) = running_session {
        let running_label = format!("● In esecuzione: {}", session.title);
        let running_item = MenuItem::with_id(app, "running_title", &running_label, false, None::<&str>)?;
        menu.append(&running_item)?;

        let kill_item = MenuItem::with_id(app, "kill_running", "Termina gioco", true, None::<&str>)?;
        menu.append(&kill_item)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }

    // Recent games
    let recent_games = state.db.get_recent_games(5).unwrap_or_default();
    let recent_submenu = Submenu::new(app, "Avvia Recenti", true)?;
    if recent_games.is_empty() {
        let no_recent = MenuItem::with_id(app, "no_recent", "Nessun gioco recente", false, None::<&str>)?;
        recent_submenu.append(&no_recent)?;
    } else {
        for game in recent_games {
            let item_id = format!("launch_{}", game.id);
            let item = MenuItem::with_id(app, &item_id, &game.title, true, None::<&str>)?;
            recent_submenu.append(&item)?;
        }
    }
    menu.append(&recent_submenu)?;

    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // Settings
    let settings_item = MenuItem::with_id(app, "open_settings", "Impostazioni...", true, None::<&str>)?;
    menu.append(&settings_item)?;

    // Exit
    let exit_item = MenuItem::with_id(app, "exit_app", "Esci da Omnis", true, None::<&str>)?;
    menu.append(&exit_item)?;

    Ok(menu)
}

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app)?;

    #[cfg(target_os = "windows")]
    let icon = app.default_window_icon().cloned()
        .or_else(|| {
            tauri::image::Image::from_app_icon_resource(32).ok()
        });

    #[cfg(not(target_os = "windows"))]
    let icon = app.default_window_icon().cloned();

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("Omnis Game Library")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app_handle, event| {
            let id_str = event.id().as_ref();
            match id_str {
                "show_hide" => {
                    toggle_window_visibility(app_handle);
                }
                "kill_running" => {
                    let app_clone = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let state = app_clone.state::<AppState>();
                        let _ = state.active_game_manager.kill_running().await;
                        if let Some(w) = app_clone.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                        update_tray_menu(&app_clone);
                    });
                }
                "open_settings" => {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                    use tauri::Emitter;
                    let _ = app_handle.emit("tray-open-settings", ());
                }
                "exit_app" => {
                    app_handle.exit(0);
                }
                other => {
                    if let Some(game_id) = other.strip_prefix("launch_") {
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                        use tauri::Emitter;
                        let _ = app_handle.emit("tray-launch-game", game_id.to_string());
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                toggle_window_visibility(app);
            }
        });

    if let Some(ic) = icon {
        builder = builder.icon(ic);
    }

    let _tray = builder.build(app)?;
    Ok(())
}

pub fn update_tray_menu(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        if let Ok(new_menu) = build_tray_menu(app) {
            let _ = tray.set_menu(Some(new_menu));
        }
    }
}

pub fn toggle_window_visibility(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        let is_minimized = window.is_minimized().unwrap_or(false);
        if is_visible && !is_minimized {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}
