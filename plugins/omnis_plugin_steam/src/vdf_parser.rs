use omnis_sdk::{DiscoveredGame, LaunchConfiguration, ProcessTrackingMode};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Locate the primary Steam installation path across Windows and Linux (Playnite algorithm)
pub fn detect_steam_installation() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        // 1. Check HKCU\Software\Valve\Steam -> SteamPath
        if let Ok(hkcu) = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam") {
            if let Ok(path_str) = hkcu.get_value::<String, _>("SteamPath") {
                let p = PathBuf::from(path_str.replace('/', "\\"));
                if p.exists() {
                    return Some(p);
                }
            }
        }

        // 2. Check HKLM\SOFTWARE\Valve\Steam -> InstallPath
        if let Ok(hklm) = winreg::RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE).open_subkey("SOFTWARE\\Valve\\Steam") {
            if let Ok(path_str) = hklm.get_value::<String, _>("InstallPath") {
                let p = PathBuf::from(path_str);
                if p.exists() {
                    return Some(p);
                }
            }
        }

        // 3. Check HKLM\SOFTWARE\WOW6432Node\Valve\Steam -> InstallPath
        if let Ok(hklm32) = winreg::RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE).open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam") {
            if let Ok(path_str) = hklm32.get_value::<String, _>("InstallPath") {
                let p = PathBuf::from(path_str);
                if p.exists() {
                    return Some(p);
                }
            }
        }

        // 4. Common fallback paths on all typical drives
        for drive in ['C', 'D', 'E', 'F', 'G', 'H'] {
            for sub in [
                "Program Files (x86)\\Steam",
                "Program Files\\Steam",
                "Steam",
                "Games\\Steam",
                "SteamLibrary",
            ] {
                let p = PathBuf::from(format!("{}:\\{}", drive, sub));
                if p.exists() && p.join("steamapps").exists() {
                    return Some(p);
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(home) = dirs::home_dir() {
            let candidates = [
                home.join(".local/share/Steam"),
                home.join(".steam/steam"),
                home.join(".steam/root"),
                home.join(".var/app/com.valvesoftware.Steam/data/Steam"),
                home.join("snap/steam/common/.local/share/Steam"),
            ];
            for p in candidates {
                if p.exists() && p.join("steamapps").exists() {
                    return Some(p);
                }
            }
        }

        // Check Windows mounts if running under WSL
        for drive in ['c', 'd', 'e', 'f'] {
            for sub in [
                "Program Files (x86)/Steam",
                "Program Files/Steam",
                "Steam",
                "Games/Steam",
                "SteamLibrary",
            ] {
                let p = PathBuf::from(format!("/mnt/{}/{}", drive, sub));
                if p.exists() && p.join("steamapps").exists() {
                    return Some(p);
                }
            }
        }
    }

    None
}

/// Helper function to extract quoted strings from a line (handles tabs, multiple spaces, etc.)
pub fn extract_quoted_value(line: &str, index: usize) -> Option<String> {
    let mut quotes = Vec::new();
    let mut in_quote = false;
    let mut start = 0;
    for (i, c) in line.char_indices() {
        if c == '"' {
            if in_quote {
                quotes.push(&line[start..i]);
                in_quote = false;
            } else {
                start = i + 1;
                in_quote = true;
            }
        }
    }
    quotes.into_iter().nth(index).map(|s| s.to_string())
}

/// Find all Steam library folders across all drives by reading libraryfolders.vdf
pub fn discover_library_folders(steam_root: &Path) -> Vec<PathBuf> {
    let mut folders = Vec::new();
    let root_steamapps = steam_root.join("steamapps");
    if root_steamapps.exists() {
        folders.push(root_steamapps);
    } else {
        folders.push(steam_root.to_path_buf());
    }

    let vdf_path = steam_root.join("steamapps").join("libraryfolders.vdf");
    if let Ok(content) = fs::read_to_string(&vdf_path) {
        for line in content.lines() {
            let trimmed = line.trim();
            // Modern Steam format: "path" "/path/to/library"
            if trimmed.starts_with("\"path\"") {
                if let Some(path_str) = extract_quoted_value(trimmed, 1) {
                    let clean = path_str.replace("\\\\", "\\");
                    let p = PathBuf::from(clean);
                    let steamapps_path = if p.join("steamapps").exists() {
                        p.join("steamapps")
                    } else {
                        p
                    };
                    if steamapps_path.exists() && !folders.contains(&steamapps_path) {
                        folders.push(steamapps_path);
                    }
                }
            }
            // Legacy Steam format: "1" "D:\\SteamLibrary"
            else if trimmed.starts_with('"') {
                let parts: Vec<&str> = trimmed.split('"').filter(|s| !s.is_empty()).collect();
                if parts.len() >= 2 && parts[0].chars().all(|c| c.is_ascii_digit()) {
                    let clean = parts[1].replace("\\\\", "\\");
                    let p = PathBuf::from(clean);
                    let steamapps_path = if p.join("steamapps").exists() {
                        p.join("steamapps")
                    } else {
                        p
                    };
                    if steamapps_path.exists() && !folders.contains(&steamapps_path) {
                        folders.push(steamapps_path);
                    }
                }
            }
        }
    }

    folders
}

/// Parse user playtime and last played dates from all localconfig.vdf profiles in steam/userdata
pub fn scan_user_playtime(steam_root: &Path) -> HashMap<String, (u64, Option<chrono::DateTime<chrono::Utc>>)> {
    let mut stats = HashMap::new();
    let userdata = steam_root.join("userdata");
    if let Ok(entries) = fs::read_dir(&userdata) {
        for entry in entries.flatten() {
            let localconfig = entry.path().join("config").join("localconfig.vdf");
            if localconfig.exists() {
                if let Ok(content) = fs::read_to_string(&localconfig) {
                    parse_localconfig_playtime(&content, &mut stats);
                }
            }
        }
    }
    stats
}

fn parse_localconfig_playtime(
    content: &str,
    stats: &mut HashMap<String, (u64, Option<chrono::DateTime<chrono::Utc>>)>,
) {
    let mut current_appid: Option<String> = None;
    let mut in_apps = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.eq_ignore_ascii_case("\"apps\"") {
            in_apps = true;
            continue;
        }

        if in_apps {
            if trimmed.starts_with('"') && trimmed.ends_with('"') {
                let key = trimmed.trim_matches('"');
                if key.chars().all(|c| c.is_ascii_digit()) {
                    current_appid = Some(key.to_string());
                }
            } else if let Some(ref appid) = current_appid {
                if trimmed.starts_with("\"PlayTime\"") || trimmed.starts_with("\"playtime\"") {
                    if let Some(val_str) = extract_quoted_value(trimmed, 1) {
                        if let Ok(mins) = val_str.parse::<u64>() {
                            let entry = stats.entry(appid.clone()).or_insert((0, None));
                            entry.0 = entry.0.max(mins * 60);
                        }
                    }
                } else if trimmed.starts_with("\"LastPlayed\"") || trimmed.starts_with("\"lastplayed\"") {
                    if let Some(val_str) = extract_quoted_value(trimmed, 1) {
                        if let Ok(ts) = val_str.parse::<i64>() {
                            if ts > 0 {
                                let dt = chrono::DateTime::from_timestamp(ts, 0);
                                let entry = stats.entry(appid.clone()).or_insert((0, None));
                                if entry.1.is_none() {
                                    entry.1 = dt;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Parse a single appmanifest_*.acf file into a DiscoveredGame with Playnite-level validation
pub fn parse_appmanifest(
    content: &str,
    steamapps_dir: &Path,
    librarycache_dir: Option<&Path>,
) -> Option<DiscoveredGame> {
    let mut appid = None;
    let mut name = None;
    let mut installdir = None;
    let mut last_played = None;
    let mut state_flags: u32 = 4;
    let mut size_on_disk: u64 = 0;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("\"appid\"") {
            appid = extract_quoted_value(trimmed, 1);
        } else if trimmed.starts_with("\"name\"") {
            name = extract_quoted_value(trimmed, 1);
        } else if trimmed.starts_with("\"installdir\"") {
            installdir = extract_quoted_value(trimmed, 1);
        } else if trimmed.starts_with("\"LastPlayed\"") {
            last_played = extract_quoted_value(trimmed, 1).and_then(|s| s.parse::<i64>().ok());
        } else if trimmed.starts_with("\"StateFlags\"") {
            if let Some(s) = extract_quoted_value(trimmed, 1).and_then(|s| s.parse::<u32>().ok()) {
                state_flags = s;
            }
        } else if trimmed.starts_with("\"SizeOnDisk\"") {
            if let Some(s) = extract_quoted_value(trimmed, 1).and_then(|s| s.parse::<u64>().ok()) {
                size_on_disk = s;
            }
        }
    }

    if let (Some(id), Some(title)) = (appid, name) {
        // Exclude common Steam redistributables / runtimes (AppID 228980 Steamworks Shared, etc.)
        if id == "228980" || title.starts_with("Steamworks Common") {
            return None;
        }

        let full_install_dir = installdir.map(|dir| steamapps_dir.join("common").join(dir));

        // Playnite validation: game is installed if StateFlags has bit 4 (StateFullyInstalled)
        let has_flag = (state_flags & 4) == 4 || (state_flags & 6) != 0;
        let dir_exists = full_install_dir.as_ref().map(|p| p.exists()).unwrap_or(false);
        let is_installed = has_flag && (dir_exists || size_on_disk > 0);

        let last_activity = last_played.and_then(|lp| {
            if lp > 0 {
                chrono::DateTime::from_timestamp(lp, 0)
            } else {
                None
            }
        });

        // Playnite instant local artwork discovery (appcache/librarycache)
        let (cover_image_path, background_image_path) = if let Some(cache) = librarycache_dir {
            let cover_p = cache.join(format!("{}_library_600x900.jpg", id));
            let cover_alt = cache.join(format!("{}_header.jpg", id));
            let final_cover = if cover_p.exists() {
                Some(cover_p.to_string_lossy().to_string())
            } else if cover_alt.exists() {
                Some(cover_alt.to_string_lossy().to_string())
            } else {
                None
            };

            let bg_p = cache.join(format!("{}_library_hero.jpg", id));
            let final_bg = if bg_p.exists() {
                Some(bg_p.to_string_lossy().to_string())
            } else {
                None
            };

            (final_cover, final_bg)
        } else {
            (None, None)
        };

        Some(DiscoveredGame {
            library_id: "steam".to_string(),
            external_id: id.clone(),
            title,
            install_dir: full_install_dir,
            is_installed,
            play_action: Some(LaunchConfiguration {
                executable: if cfg!(windows) {
                    "cmd.exe".to_string()
                } else {
                    "xdg-open".to_string()
                },
                arguments: if cfg!(windows) {
                    vec![
                        "/c".to_string(),
                        "start".to_string(),
                        format!("steam://rungameid/{}", id),
                    ]
                } else {
                    vec![format!("steam://rungameid/{}", id)]
                },
                working_dir: None,
                tracking_mode: ProcessTrackingMode::KernelJobObject,
            }),
            playtime_seconds: 0,
            play_count: 0,
            last_activity,
            cover_image_path,
            background_image_path,
        })
    } else {
        None
    }
}

/// Scan all manifest files across all discovered library folders with playtime & artwork enrichment
pub fn scan_installed_games(steam_root: &Path) -> Vec<DiscoveredGame> {
    let mut games = Vec::new();
    let library_folders = discover_library_folders(steam_root);
    let playtime_map = scan_user_playtime(steam_root);

    let librarycache = steam_root.join("appcache").join("librarycache");
    let cache_opt = if librarycache.exists() {
        Some(librarycache.as_path())
    } else {
        None
    };

    for folder in library_folders {
        if let Ok(entries) = fs::read_dir(&folder) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    if file_name.starts_with("appmanifest_") && file_name.ends_with(".acf") {
                        if let Ok(content) = fs::read_to_string(&path) {
                            if let Some(mut game) = parse_appmanifest(&content, &folder, cache_opt) {
                                // Enrich with user playtime from localconfig.vdf if available
                                if let Some((playtime, last_act)) = playtime_map.get(&game.external_id) {
                                    game.playtime_seconds = *playtime;
                                    if last_act.is_some() {
                                        game.last_activity = *last_act;
                                    }
                                }
                                games.push(game);
                            }
                        }
                    }
                }
            }
        }
    }

    games
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_appmanifest_dota2() {
        let manifest = r#"
"AppState"
{
	"appid"		"570"
	"Universe"		"1"
	"name"		"Dota 2"
	"StateFlags"		"4"
	"installdir"		"dota 2 beta"
	"LastUpdated"		"1700000000"
	"UpdateResult"		"0"
	"SizeOnDisk"		"45892182912"
	"buildid"		"12345678"
	"LastOwner"		"76561198000000000"
	"BytesToDownload"		"0"
	"BytesDownloaded"		"0"
	"AutoUpdateBehavior"		"0"
	"AllowOtherDownloadsWhileRunning"		"0"
	"ScheduledAutoUpdate"		"0"
	"InstalledDepots"
	{
	}
	"UserConfig"
	{
	}
	"MountedDepots"
	{
	}
	"InstallScripts"
	{
	}
	"SharedDepots"
	{
	}
}
"#;
        let dummy_dir = Path::new("C:\\Steam\\steamapps");
        let game = parse_appmanifest(manifest, dummy_dir, None).expect("Failed to parse manifest");

        assert_eq!(game.library_id, "steam");
        assert_eq!(game.external_id, "570");
        assert_eq!(game.title, "Dota 2");
        assert!(game.is_installed);
        assert_eq!(
            game.install_dir,
            Some(PathBuf::from("C:\\Steam\\steamapps\\common\\dota 2 beta"))
        );
    }
}
