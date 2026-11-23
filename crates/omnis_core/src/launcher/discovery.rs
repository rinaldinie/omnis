use std::path::{Path, PathBuf};
use super::is_blacklisted_process;

/// Locates GOG Galaxy client executable (`GalaxyClient.exe`) on the system.
///
/// On Windows, checks registry installations and standard Program Files paths.
#[cfg(windows)]
pub fn find_gog_galaxy_client() -> Option<PathBuf> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ,
        KEY_WOW64_32KEY, REG_SZ, REG_VALUE_TYPE,
    };

    // 1. Try Registry paths: HKLM\SOFTWARE\GOG.com\GalaxyClient\paths (with standard and 32-bit views)
    for sam_desired in [KEY_READ, KEY_READ | KEY_WOW64_32KEY] {
        for subkey_str in [
            "SOFTWARE\\GOG.com\\GalaxyClient\\paths\0",
            "SOFTWARE\\WOW6432Node\\GOG.com\\GalaxyClient\\paths\0",
        ] {
            let subkey: Vec<u16> = subkey_str.encode_utf16().collect();
            unsafe {
                let mut hkey = HKEY::default();
                if RegOpenKeyExW(
                    HKEY_LOCAL_MACHINE,
                    PCWSTR(subkey.as_ptr()),
                    0,
                    sam_desired,
                    &mut hkey,
                )
                .is_ok()
                {
                    let val_name: Vec<u16> = "client\0".encode_utf16().collect();
                    let mut val_type = REG_VALUE_TYPE::default();
                    let mut data_buf = [0u16; 512];
                    let mut data_len = (data_buf.len() * std::mem::size_of::<u16>()) as u32;

                    let res = RegQueryValueExW(
                        hkey,
                        PCWSTR(val_name.as_ptr()),
                        None,
                        Some(&mut val_type),
                        Some(data_buf.as_mut_ptr() as *mut u8),
                        Some(&mut data_len),
                    );
                    let _ = RegCloseKey(hkey);

                    if res.is_ok() && val_type == REG_SZ && data_len > 0 {
                        let len_chars = (data_len as usize / std::mem::size_of::<u16>())
                            .saturating_sub(1);
                        let client_dir = String::from_utf16_lossy(&data_buf[..len_chars]);
                        let trimmed = client_dir.trim_matches('\0').trim();
                        if !trimmed.is_empty() {
                            let candidate = PathBuf::from(trimmed).join("GalaxyClient.exe");
                            if candidate.is_file() {
                                return Some(candidate);
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Check standard installation directories on Windows
    let mut candidate_paths = Vec::new();
    if let Ok(prog_files_x86) = std::env::var("ProgramFiles(x86)") {
        candidate_paths.push(PathBuf::from(prog_files_x86).join("GOG Galaxy").join("GalaxyClient.exe"));
    }
    if let Ok(prog_files) = std::env::var("ProgramFiles") {
        candidate_paths.push(PathBuf::from(prog_files).join("GOG Galaxy").join("GalaxyClient.exe"));
    }
    candidate_paths.push(PathBuf::from(r"C:\Program Files (x86)\GOG Galaxy\GalaxyClient.exe"));
    candidate_paths.push(PathBuf::from(r"C:\Program Files\GOG Galaxy\GalaxyClient.exe"));

    candidate_paths.into_iter().find(|candidate| candidate.is_file())
}

/// Non-Windows stub for locating GOG Galaxy client
#[cfg(not(windows))]
pub fn find_gog_galaxy_client() -> Option<PathBuf> {
    None
}

/// Store-specific heuristic: Locate primary game executable from GOG goggame-*.info (Requirement A7)
pub fn find_gog_game_executable(install_dir: &Path) -> Option<PathBuf> {
    if let Ok(entries) = std::fs::read_dir(install_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.starts_with("goggame-") && file_name.ends_with(".info") {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(play_tasks) =
                                json.get("playTasks").and_then(|p| p.as_array())
                            {
                                // Pass 1: Look for tasks with category == "game" (actual game executables, not launcher trampolines)
                                let mut game_candidates = Vec::new();
                                for task in play_tasks {
                                    let is_file = task.get("type").and_then(|t| t.as_str())
                                        == Some("FileTask");
                                    let is_game = task.get("category").and_then(|c| c.as_str())
                                        == Some("game");
                                    if is_file && is_game {
                                        if let Some(rel_path) =
                                            task.get("path").and_then(|p| p.as_str())
                                        {
                                            let exe = install_dir.join(rel_path);
                                            if exe.exists() {
                                                game_candidates.push(exe);
                                            }
                                        }
                                    }
                                }
                                if !game_candidates.is_empty() {
                                    // Prefer DX12 / x64 if present, otherwise first game candidate
                                    if let Some(dx12) = game_candidates.iter().find(|p| {
                                        let name = p.to_string_lossy().to_lowercase();
                                        name.contains("dx12") || name.contains("x64")
                                    }) {
                                        return Some(dx12.clone());
                                    }
                                    return Some(game_candidates.remove(0));
                                }

                                // Pass 2: Primary FileTask
                                for task in play_tasks {
                                    let is_primary = task
                                        .get("isPrimary")
                                        .and_then(|p| p.as_bool())
                                        .unwrap_or(false);
                                    let is_file = task.get("type").and_then(|t| t.as_str())
                                        == Some("FileTask");
                                    if is_primary && is_file {
                                        if let Some(rel_path) =
                                            task.get("path").and_then(|p| p.as_str())
                                        {
                                            let exe = install_dir.join(rel_path);
                                            if exe.exists() {
                                                return Some(exe);
                                            }
                                        }
                                    }
                                }

                                // Pass 3: Any FileTask
                                for task in play_tasks {
                                    let is_file = task.get("type").and_then(|t| t.as_str())
                                        == Some("FileTask");
                                    if is_file {
                                        if let Some(rel_path) =
                                            task.get("path").and_then(|p| p.as_str())
                                        {
                                            let exe = install_dir.join(rel_path);
                                            if exe.exists() {
                                                return Some(exe);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

/// Scans an install directory and its common binary subdirectories for valid, non-blacklisted game executables
pub fn scan_game_executables(install_dir: &Path) -> Vec<PathBuf> {
    if !install_dir.is_dir() {
        return Vec::new();
    }

    let mut candidates = Vec::new();
    let mut search_dirs = vec![install_dir.to_path_buf()];

    if let Ok(entries) = std::fs::read_dir(install_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let name = p
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase();
                if ["bin", "binaries", "x64", "win64", "win32", "game"].contains(&name.as_str()) {
                    search_dirs.push(p);
                }
            }
        }
    }

    for dir in search_dirs {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Some(ext) = p.extension() {
                        if ext.eq_ignore_ascii_case("exe") {
                            if let Some(fname) = p.file_name().and_then(|n| n.to_str()) {
                                if !is_blacklisted_process(fname) {
                                    candidates.push(p);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by shallower directory depth first (root of install folder)
    candidates.sort_by_key(|p| p.components().count());
    candidates
}

/// Heuristic: Locate primary game executable from an install directory by scanning for valid, non-blacklisted binaries
pub fn find_primary_game_executable(install_dir: &Path) -> Option<PathBuf> {
    scan_game_executables(install_dir).into_iter().next()
}
