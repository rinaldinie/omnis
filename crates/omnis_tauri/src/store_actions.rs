use omnis_sdk::Game;
use std::path::{Path, PathBuf};

/// Locates the user desktop directory across Windows (including OneDrive redirection) and Unix
pub fn get_desktop_dir() -> Option<PathBuf> {
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(userprofile).join("Desktop");
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(onedrive) = std::env::var("OneDrive") {
        let p = PathBuf::from(onedrive).join("Desktop");
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let p = PathBuf::from(home).join("Desktop");
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// Helper to sanitize game title for filesystem shortcut names
pub fn sanitize_shortcut_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | '?' | '%' | '*' | ':' | '|' | '"' | '<' | '>' => '_',
            _ => c,
        })
        .collect();
    let trimmed = sanitized.trim();
    if trimmed.is_empty() {
        "Game".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Dispatches store-specific URIs, uninstallers, and desktop shortcut generation
pub struct StorePlatformDispatcher;

impl StorePlatformDispatcher {
    /// Formats the launch URI according to the library provider
    pub fn get_launch_uri(game: &Game) -> String {
        match game.library_id.as_str() {
            "steam" => format!("steam://rungameid/{}", game.external_id),
            "epic" => format!("com.epicgames.launcher://apps/{}?action=launch", game.external_id),
            "gog" => format!("goggalaxy://openGameView/{}", game.external_id),
            _ => {
                if let Some(action) = game.play_actions.first() {
                    format!("file:///{}", action.executable.replace('\\', "/"))
                } else {
                    format!("omnis://launch/{}", game.id)
                }
            }
        }
    }

    /// Triggers store-specific verification of game files
    pub fn trigger_verify(library_id: &str, external_id: &str) -> Result<(), String> {
        match library_id {
            "steam" => {
                let uri = format!("steam://validate/{}", external_id);
                Self::validate_and_open_store_uri(&uri)
            }
            "epic" => {
                let uri = format!("com.epicgames.launcher://apps/{}?action=verify", external_id);
                Self::validate_and_open_store_uri(&uri)
            }
            "gog" => {
                let uri = format!("goggalaxy://openGameView/{}", external_id);
                Self::validate_and_open_store_uri(&uri)
            }
            _ => Err("La verifica automatica dei file è supportata solo per Steam ed Epic Games.".to_string()),
        }
    }

    /// Triggers store uninstallation or spawns the local uninstaller binary
    pub fn trigger_uninstall(game: &Game) -> Result<(), String> {
        match game.library_id.as_str() {
            "steam" => {
                let uri = format!("steam://uninstall/{}", game.external_id);
                Self::validate_and_open_store_uri(&uri)
            }
            "epic" => {
                let uri = format!("com.epicgames.launcher://apps/{}?action=uninstall", game.external_id);
                Self::validate_and_open_store_uri(&uri)
            }
            "gog" => {
                let mut launched_uninstaller = false;
                if let Some(ref dir) = game.install_dir {
                    let uninstaller = dir.join("unins000.exe");
                    if uninstaller.exists() {
                        let _ = tokio::process::Command::new(&uninstaller).spawn();
                        launched_uninstaller = true;
                    }
                }
                if !launched_uninstaller {
                    let uri = format!("goggalaxy://openGameView/{}", game.external_id);
                    Self::validate_and_open_store_uri(&uri)?;
                }
                Ok(())
            }
            _ => {
                let mut launched_uninstaller = false;
                if let Some(ref dir) = game.install_dir {
                    for candidate in ["unins000.exe", "uninstall.exe", "Uninstall.exe"] {
                        let uninstaller = dir.join(candidate);
                        if uninstaller.exists() {
                            let _ = tokio::process::Command::new(&uninstaller).spawn();
                            launched_uninstaller = true;
                            break;
                        }
                    }
                    if !launched_uninstaller && dir.exists() {
                        crate::types::open_folder_in_os(dir);
                    }
                }
                Ok(())
            }
        }
    }

    /// Creates an InternetShortcut (.url) for desktop launching
    pub fn create_desktop_shortcut(game: &Game, desktop_dir: &Path) -> Result<PathBuf, String> {
        let safe_title = sanitize_shortcut_name(&game.title);
        let shortcut_path = desktop_dir.join(format!("{}.url", safe_title));
        let launch_url = Self::get_launch_uri(game);

        let icon_line = if let Some(ref icon) = game.icon_image_path {
            format!("\nIconIndex=0\nIconFile={}", icon)
        } else if let Some(ref cover) = game.cover_image_path {
            format!("\nIconIndex=0\nIconFile={}", cover)
        } else if let Some(action) = game.play_actions.first() {
            format!("\nIconIndex=0\nIconFile={}", action.executable)
        } else {
            String::new()
        };

        let content = format!("[InternetShortcut]\nURL={}{}\n", launch_url, icon_line);
        std::fs::write(&shortcut_path, content).map_err(|e| e.to_string())?;

        Ok(shortcut_path)
    }

    /// Validates store-specific scheme and opens it via OS handler
    pub fn validate_and_open_store_uri(uri: &str) -> Result<(), String> {
        const ALLOWED_SCHEMES: &[&str] = &["steam://", "com.epicgames.launcher://", "goggalaxy://"];
        let is_allowed = ALLOWED_SCHEMES.iter().any(|scheme| uri.starts_with(scheme));
        if !is_allowed {
            return Err("Schema URI del negozio non supportato o non consentito".to_string());
        }

        #[cfg(windows)]
        {
            let _ = std::process::Command::new("rundll32.exe")
                .args(["url.dll,FileProtocolHandler", uri])
                .spawn();
        }
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("open").arg(uri).spawn();
        }
        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("xdg-open").arg(uri).spawn();
        }

        Ok(())
    }
}
