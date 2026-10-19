use crate::types::{open_folder_in_os, AppState};
use tauri::{State, Window};

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
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
pub fn window_set_fullscreen(fullscreen: bool, window: Window) -> Result<(), String> {
    window.set_fullscreen(fullscreen).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_close(window: Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
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
        let mut exes = Vec::new();
        let path = std::path::Path::new(&folder_path);
        if path.is_dir() {
            let mut search_dirs = vec![path.to_path_buf()];
            if let Ok(entries) = std::fs::read_dir(path) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        let name = p.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                        if ["bin", "binaries", "x64", "win64", "win32", "game"].contains(&name.as_str()) {
                            search_dirs.push(p);
                        }
                    }
                }
            }

            for sdir in search_dirs {
                if let Ok(entries) = std::fs::read_dir(sdir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() {
                            if let Some(ext) = p.extension() {
                                if ext.eq_ignore_ascii_case("exe") {
                                    let fname = p.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                                    if !fname.contains("unins")
                                        && !fname.contains("crash")
                                        && !fname.contains("update")
                                        && !fname.contains("setup")
                                        && !fname.contains("redist")
                                        && !fname.contains("dxsetup")
                                    {
                                        exes.push(p.to_string_lossy().to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(exes)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pick_image_file() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let file = rfd::FileDialog::new()
            .set_title("Seleziona immagine copertina o sfondo")
            .add_filter("Immagini", &["png", "jpg", "jpeg", "webp", "ico", "bmp"])
            .pick_file();
        Ok(file.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}
