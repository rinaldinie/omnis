use omnis_sdk::{DiscoveredGame, LaunchConfiguration, ProcessTrackingMode};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// Deserialized structure of a GOG `goggame-*.info` manifest
#[derive(Debug, Clone, Deserialize)]
pub struct GogGameInfo {
    #[serde(rename = "gameId", default)]
    pub game_id: Option<String>,
    #[serde(rename = "rootGameId", default)]
    pub root_game_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "playTasks", default)]
    pub play_tasks: Vec<GogPlayTask>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GogPlayTask {
    #[serde(rename = "isPrimary", default)]
    pub is_primary: bool,
    #[serde(rename = "type", default)]
    pub task_type: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(rename = "workingDir", default)]
    pub working_dir: Option<String>,
    #[serde(default)]
    pub arguments: Option<String>,
}

/// Parse a `goggame-*.info` file content and construct a `DiscoveredGame`
pub fn parse_goggame_info(content: &str, game_dir: &Path) -> Option<DiscoveredGame> {
    let info: GogGameInfo = serde_json::from_str(content).ok()?;
    let game_id = info.game_id.or(info.root_game_id)?;
    let title = info.name.filter(|n| !n.trim().is_empty())?;

    // Find primary FileTask (not URLTask or link)
    let primary_task = info.play_tasks.iter().find(|t| {
        t.is_primary
            && t.task_type
                .as_deref()
                .map(|s| !s.eq_ignore_ascii_case("URLTask") && !s.eq_ignore_ascii_case("link"))
                .unwrap_or(true)
    })?;

    let rel_path = primary_task.path.as_deref()?;
    // Normalize slashes for platform
    let clean_rel = rel_path.replace('\\', "/");
    let exe_path = game_dir.join(clean_rel);

    let working_dir = primary_task
        .working_dir
        .as_deref()
        .filter(|w| !w.trim().is_empty())
        .map(|w| game_dir.join(w.replace('\\', "/")))
        .or_else(|| exe_path.parent().map(|p| p.to_path_buf()));

    let exe_filename = exe_path
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("game.exe");

    let is_installed = exe_path.exists() || game_dir.exists();

    Some(DiscoveredGame {
        library_id: "gog".to_string(),
        external_id: game_id,
        title,
        install_dir: Some(game_dir.to_path_buf()),
        is_installed,
        play_action: Some(LaunchConfiguration {
            executable: exe_path.to_string_lossy().to_string(),
            arguments: primary_task
                .arguments
                .as_deref()
                .filter(|a| !a.trim().is_empty())
                .map(|a| a.split_whitespace().map(String::from).collect())
                .unwrap_or_default(),
            working_dir,
            tracking_mode: ProcessTrackingMode::ProcessName(exe_filename.to_string()),
        }),
        playtime_seconds: 0,
        play_count: 0,
        last_activity: None,
        cover_image_path: None,
        background_image_path: None,
    })
}

/// Find and parse any `goggame-*.info` file inside the specified directory
pub fn inspect_game_dir(game_dir: &Path) -> Option<DiscoveredGame> {
    if !game_dir.is_dir() {
        return None;
    }

    if let Ok(entries) = std::fs::read_dir(game_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.starts_with("goggame-") && file_name.ends_with(".info") {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Some(game) = parse_goggame_info(&content, game_dir) {
                            return Some(game);
                        }
                    }
                }
            }
        }
    }

    None
}

/// Scan for locally installed GOG games across system registry and configured directories
pub fn scan_local_games(custom_paths: &[PathBuf]) -> Vec<DiscoveredGame> {
    let mut discovered: HashMap<String, DiscoveredGame> = HashMap::new();
    let mut candidate_dirs: HashSet<PathBuf> = HashSet::new();

    // 1. Windows: Query Registry for installed GOG games
    #[cfg(target_os = "windows")]
    {
        scan_windows_registry(&mut discovered, &mut candidate_dirs);
    }

    // 2. Linux / WSL: Query Heroic, minigalaxy, and default library paths
    #[cfg(target_os = "linux")]
    {
        scan_linux_dirs(&mut candidate_dirs);
    }

    // 3. User configured paths
    for p in custom_paths {
        if p.exists() {
            candidate_dirs.insert(p.clone());
        }
    }

    // 4. Scan any candidate directories for goggame-*.info manifests
    for dir in candidate_dirs {
        // Direct game folder check
        if let Some(game) = inspect_game_dir(&dir) {
            discovered.entry(game.external_id.clone()).or_insert(game);
            continue;
        }

        // Subdirectory check (e.g. if dir is "C:\GOG Games" containing multiple games)
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let sub_path = entry.path();
                if sub_path.is_dir() {
                    if let Some(game) = inspect_game_dir(&sub_path) {
                        discovered.entry(game.external_id.clone()).or_insert(game);
                    }
                }
            }
        }
    }

    discovered.into_values().collect()
}

#[cfg(target_os = "windows")]
fn scan_windows_registry(
    discovered: &mut HashMap<String, DiscoveredGame>,
    candidate_dirs: &mut HashSet<PathBuf>,
) {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    let subkeys = [
        "SOFTWARE\\WOW6432Node\\GOG.com\\Games",
        "SOFTWARE\\GOG.com\\Games",
    ];

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    for subkey_path in subkeys {
        if let Ok(games_key) = hklm.open_subkey_with_flags(subkey_path, KEY_READ) {
            for key_name in games_key.enum_keys().flatten() {
                if let Ok(game_key) = games_key.open_subkey_with_flags(&key_name, KEY_READ) {
                    let game_id: String = game_key
                        .get_value("gameID")
                        .or_else(|_| game_key.get_value("gameId"))
                        .unwrap_or_else(|_| key_name.clone());

                    let game_name: Option<String> = game_key
                        .get_value("gameName")
                        .or_else(|_| game_key.get_value("GAMENAME"))
                        .ok();

                    let path_str: Option<String> = game_key
                        .get_value("path")
                        .or_else(|_| game_key.get_value("PATH"))
                        .ok();

                    let exe_str: Option<String> = game_key
                        .get_value("exe")
                        .or_else(|_| game_key.get_value("EXE"))
                        .or_else(|_| game_key.get_value("launchCommand"))
                        .ok();

                    if let Some(p_str) = path_str {
                        let path = PathBuf::from(p_str);
                        if path.exists() {
                            candidate_dirs.insert(path.clone());

                            // Fallback if no .info file is inside the directory
                            if let (Some(name), Some(exe)) = (game_name, exe_str) {
                                let exe_path = if Path::new(&exe).is_absolute() {
                                    PathBuf::from(&exe)
                                } else {
                                    path.join(&exe)
                                };

                                let exe_filename = exe_path
                                    .file_name()
                                    .and_then(|f| f.to_str())
                                    .unwrap_or("game.exe");

                                let working_dir = exe_path.parent().map(|p| p.to_path_buf());

                                discovered.entry(game_id.clone()).or_insert_with(|| {
                                    DiscoveredGame {
                                        library_id: "gog".to_string(),
                                        external_id: game_id,
                                        title: name,
                                        install_dir: Some(path),
                                        is_installed: exe_path.exists(),
                                        play_action: Some(LaunchConfiguration {
                                            executable: exe_path.to_string_lossy().to_string(),
                                            arguments: vec![],
                                            working_dir,
                                            tracking_mode: ProcessTrackingMode::ProcessName(
                                                exe_filename.to_string(),
                                            ),
                                        }),
                                        playtime_seconds: 0,
                                        play_count: 0,
                                        last_activity: None,
                                        cover_image_path: None,
                                        background_image_path: None,
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }
    }
}

#[cfg(target_os = "linux")]
fn scan_linux_dirs(candidate_dirs: &mut HashSet<PathBuf>) {
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        // Heroic Games Launcher installed GOG games config
        let heroic_gog_installed = home.join(".config/heroic/gog_store/installed.json");
        if heroic_gog_installed.exists() {
            if let Ok(content) = std::fs::read_to_string(&heroic_gog_installed) {
                #[derive(Deserialize)]
                struct HeroicInstalledEntry {
                    install_path: Option<String>,
                }
                #[derive(Deserialize)]
                struct HeroicGogConfig {
                    #[serde(default)]
                    installed: Vec<HeroicInstalledEntry>,
                }
                if let Ok(cfg) = serde_json::from_str::<HeroicGogConfig>(&content) {
                    for entry in cfg.installed {
                        if let Some(p) = entry.install_path {
                            let path = PathBuf::from(p);
                            if path.exists() {
                                candidate_dirs.insert(path);
                            }
                        }
                    }
                }
            }
        }

        // Common Linux default GOG / Heroic / Minigalaxy folders
        for folder in [
            home.join("Games/Heroic"),
            home.join("Games/GOG"),
            home.join("GOG Games"),
            home.join(".local/share/minigalaxy"),
        ] {
            if folder.exists() {
                candidate_dirs.insert(folder);
            }
        }
    }

    // WSL check for Windows mounted drives
    for drive in ['c', 'd', 'e', 'f'] {
        for sub in [
            "GOG Games",
            "Program Files (x86)/GOG Galaxy/Games",
            "Program Files/GOG Galaxy/Games",
        ] {
            let p = PathBuf::from(format!("/mnt/{}/{}", drive, sub));
            if p.exists() {
                candidate_dirs.insert(p);
            }
        }
    }
}
