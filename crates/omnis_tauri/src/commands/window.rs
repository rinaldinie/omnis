use crate::types::{open_folder_in_os, AppState};
use tauri::{Manager, State, Window};

pub use omnis_core::os::{resolve_executable_path_sync, ResolvedExecutable};

#[tauri::command]
pub fn open_folder(folder_type: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = match folder_type.as_str() {
        "db" | "library" => &state.app_dir,
        "covers" => &state.covers_dir,
        "plugins" => &state.plugins_dir,
        "themes" => &state.themes_dir,
        _ => &state.app_dir,
    };
    open_folder_in_os(path);
    Ok(())
}

#[tauri::command]
pub fn window_start_dragging(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_unminimize(window: Window) -> Result<(), String> {
    let _ = window.show();
    window.unminimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_set_focus(window: Window) -> Result<(), String> {
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: Window) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_toggle_fullscreen(window: Window) -> Result<bool, String> {
    let current = window.is_fullscreen().map_err(|e| e.to_string())?;
    let next = !current;
    if next {
        crate::services::window_service::ensure_fullscreen_geometry(&window);
    } else {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
    }
    Ok(next)
}

#[tauri::command]
pub fn window_set_fullscreen(fullscreen: bool, window: Window) -> Result<(), String> {
    if fullscreen {
        crate::services::window_service::ensure_fullscreen_geometry(&window);
    } else {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn is_fullscreen_arg(raw: &str) -> bool {
    let clean = raw
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_lowercase();
    clean == "--fullscreen"
        || clean == "-fullscreen"
        || clean == "/fullscreen"
        || clean == "-f"
        || clean == "/f"
        || clean == "--bigpicture"
        || clean == "-bigpicture"
        || clean == "/bigpicture"
        || clean == "-b"
        || clean == "/b"
        || clean.starts_with("--fullscreen=")
        || clean.starts_with("-fullscreen=")
}

pub fn is_fullscreen_requested<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let all: Vec<String> = args.into_iter().map(|s| s.as_ref().to_string()).collect();
    let joined = all.join(" ").to_lowercase();
    if joined.contains("fullscreen") || joined.contains("bigpicture") {
        return true;
    }
    all.iter().any(|arg| is_fullscreen_arg(arg))
}

#[tauri::command]
pub fn is_fullscreen_launch() -> bool {
    is_fullscreen_requested(std::env::args())
}

#[tauri::command]
pub fn set_minimize_to_tray(enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    state
        .minimize_to_tray
        .store(enabled, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn window_close(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    if state
        .minimize_to_tray
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        window.hide().map_err(|e| e.to_string())
    } else {
        window.app_handle().exit(0);
        Ok(())
    }
}

#[tauri::command]
pub fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
pub async fn system_sleep() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        #[cfg(windows)]
        {
            #[link(name = "powrprof")]
            extern "system" {
                fn SetSuspendState(
                    b_hibernate: u8,
                    b_force: u8,
                    b_wakeup_events_disabled: u8,
                ) -> u8;
            }
            let res = unsafe { SetSuspendState(0, 0, 0) };
            if res != 0 {
                Ok(())
            } else {
                let _ = std::process::Command::new("rundll32.exe")
                    .args(["powrprof.dll,SetSuspendState", "0,1,0"])
                    .spawn();
                Ok(())
            }
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("pmset")
                .arg("sleepnow")
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        #[cfg(all(not(windows), not(target_os = "macos")))]
        {
            let res = std::process::Command::new("systemctl")
                .arg("suspend")
                .spawn();
            if res.is_err() {
                let _ = std::process::Command::new("loginctl")
                    .arg("suspend")
                    .spawn();
            }
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn system_shutdown() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        #[cfg(windows)]
        {
            std::process::Command::new("shutdown.exe")
                .args(["/s", "/t", "0"])
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("osascript")
                .args(["-e", "tell app \"System Events\" to shut down"])
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        #[cfg(all(not(windows), not(target_os = "macos")))]
        {
            let res = std::process::Command::new("systemctl")
                .arg("poweroff")
                .spawn();
            if res.is_err() {
                let _ = std::process::Command::new("shutdown")
                    .args(["-h", "now"])
                    .spawn();
            }
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn system_restart() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        #[cfg(windows)]
        {
            std::process::Command::new("shutdown.exe")
                .args(["/r", "/t", "0"])
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("osascript")
                .args(["-e", "tell app \"System Events\" to restart"])
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        #[cfg(all(not(windows), not(target_os = "macos")))]
        {
            let res = std::process::Command::new("systemctl")
                .arg("reboot")
                .spawn();
            if res.is_err() {
                let _ = std::process::Command::new("reboot").spawn();
            }
            Ok(())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pick_executable_file() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let file = rfd::FileDialog::new()
            .set_title("Seleziona file eseguibile (.exe)")
            .add_filter("Eseguibili Windows", &["exe", "bat", "cmd", "lnk"])
            .pick_file();
        Ok(file.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Resolves an executable path, expanding Windows `.lnk` shortcuts to target executable,
/// arguments, and working directory when applicable.
#[tauri::command]
pub async fn resolve_executable_path(path: String) -> Result<ResolvedExecutable, String> {
    tokio::task::spawn_blocking(move || resolve_executable_path_sync(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pick_directory() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let dir = rfd::FileDialog::new()
            .set_title("Seleziona cartella")
            .pick_folder();
        Ok(dir.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn find_executables_in_folder(folder_path: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let path = std::path::Path::new(&folder_path);
        let exes = omnis_core::launcher::scan_game_executables(path)
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        Ok(exes)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pick_image_file(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let picked: Option<String> = tokio::task::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Seleziona immagine copertina o sfondo")
            .add_filter("Immagini", &["png", "jpg", "jpeg", "webp", "ico", "bmp"])
            .pick_file()
            .map(|p| p.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?;
    // Allow the picked file so the editor can preview it before saving
    if let Some(ref path) = picked {
        state.media_scope.allow_media_file(path);
    }
    Ok(picked)
}

pub fn validate_external_url(url: &str) -> Result<&str, String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("Solo protocolli HTTP e HTTPS sono supportati".to_string());
    }

    // Parse with url::Url to ensure structurally sound web URI
    let parsed = url::Url::parse(trimmed).map_err(|e| format!("URL non valido: {}", e))?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("Schema URL non supportato".to_string()),
    }

    // Strictly reject shell control/metacharacters to prevent command/argument injection
    if trimmed
        .chars()
        .any(|c| c.is_control() || "&|<>^%\"'\r\n\t".contains(c))
    {
        return Err("URL contiene caratteri non consentiti".to_string());
    }

    Ok(trimmed)
}

pub fn open_external_url_in_os(url: &str) -> Result<(), String> {
    let trimmed = validate_external_url(url)?;

    #[cfg(windows)]
    {
        // Use rundll32 FileProtocolHandler instead of cmd.exe /c start to avoid shell interpretation
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", trimmed])
            .spawn()
            .map_err(|e| format!("Impossibile aprire l'URL: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Impossibile aprire l'URL: {}", e))?;
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Impossibile aprire l'URL: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    open_external_url_in_os(&url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_external_url_valid() {
        assert_eq!(
            validate_external_url("https://example.com/path?foo=bar").unwrap(),
            "https://example.com/path?foo=bar"
        );
        assert_eq!(
            validate_external_url("http://localhost:8080").unwrap(),
            "http://localhost:8080"
        );
    }

    #[test]
    fn test_validate_external_url_invalid() {
        assert!(validate_external_url("ftp://example.com").is_err());
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("https://example.com/test&evil_cmd").is_err());
        assert!(validate_external_url("https://example.com/test|evil_cmd").is_err());
        assert!(validate_external_url("https://example.com/\"injection\"").is_err());
    }
}
