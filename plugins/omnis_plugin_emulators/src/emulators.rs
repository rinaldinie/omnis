//! Emulator detection: the known Nintendo Switch emulators, where each one keeps its
//! configuration, how to read the game folders the user configured in it and how to
//! launch a game file with it.
//!
//! Two configuration families cover today's Switch emulators:
//! - **yuzu family** (Eden, Citron, Sudachi, Suyu, yuzu): Qt `qt-config.ini` with
//!   `Paths\gamedirs\N\path` entries, stored in `%APPDATA%\<name>\config` or, in portable
//!   mode, in `<exe dir>\user\config`.
//! - **Ryujinx**: `Config.json` with a `game_dirs` array, stored in `%APPDATA%\Ryujinx` or,
//!   in portable mode, in `<exe dir>\portable`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Configuration file format used by an emulator family.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfigFormat {
    /// yuzu-derived emulators: `qt-config.ini`
    YuzuQtIni,
    /// Ryujinx and its forks: `Config.json`
    RyujinxJson,
}

/// Static description of a supported emulator.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EmulatorSpec {
    /// Stable identifier (e.g. "eden")
    pub id: &'static str,
    /// User-facing name (e.g. "Eden")
    pub display_name: &'static str,
    /// Executable file names, compared case-insensitively
    pub exe_names: &'static [&'static str],
    /// Folder name under `%APPDATA%` holding the user configuration
    pub appdata_dir: &'static str,
    /// Configuration family
    pub format: ConfigFormat,
}

/// Supported Switch emulators, in launch preference order: the first one with a known
/// executable is used to start games.
pub const SWITCH_EMULATORS: &[EmulatorSpec] = &[
    EmulatorSpec {
        id: "eden",
        display_name: "Eden",
        exe_names: &["eden.exe", "eden"],
        appdata_dir: "eden",
        format: ConfigFormat::YuzuQtIni,
    },
    EmulatorSpec {
        id: "citron",
        display_name: "Citron",
        exe_names: &["citron.exe", "citron"],
        appdata_dir: "citron",
        format: ConfigFormat::YuzuQtIni,
    },
    EmulatorSpec {
        id: "sudachi",
        display_name: "Sudachi",
        exe_names: &["sudachi.exe", "sudachi"],
        appdata_dir: "sudachi",
        format: ConfigFormat::YuzuQtIni,
    },
    EmulatorSpec {
        id: "suyu",
        display_name: "Suyu",
        exe_names: &["suyu.exe", "suyu"],
        appdata_dir: "suyu",
        format: ConfigFormat::YuzuQtIni,
    },
    EmulatorSpec {
        id: "yuzu",
        display_name: "yuzu",
        exe_names: &["yuzu.exe", "yuzu"],
        appdata_dir: "yuzu",
        format: ConfigFormat::YuzuQtIni,
    },
    EmulatorSpec {
        id: "ryujinx",
        display_name: "Ryujinx",
        exe_names: &["ryujinx.exe", "ryujinx"],
        appdata_dir: "Ryujinx",
        format: ConfigFormat::RyujinxJson,
    },
];

impl EmulatorSpec {
    /// Whether `path` points to one of this emulator's executables.
    pub fn matches_executable(&self, path: &Path) -> bool {
        path.file_name()
            .and_then(|n| n.to_str())
            .map(|n| self.exe_names.iter().any(|exe| n.eq_ignore_ascii_case(exe)))
            .unwrap_or(false)
    }

    /// Candidate user-data folders, portable one (next to the executable) first, then the
    /// per-user one under `%APPDATA%`. Configuration, keys and play time live in there.
    pub fn data_roots(&self, appdata: Option<&Path>, executable: Option<&Path>) -> Vec<PathBuf> {
        let mut roots = Vec::new();
        if let Some(dir) = executable.and_then(|e| e.parent()) {
            roots.push(match self.format {
                ConfigFormat::YuzuQtIni => dir.join("user"),
                ConfigFormat::RyujinxJson => dir.join("portable"),
            });
        }
        if let Some(base) = appdata {
            roots.push(base.join(self.appdata_dir));
        }
        roots
    }

    /// Configuration file inside a data root.
    pub fn config_file(&self, root: &Path) -> PathBuf {
        match self.format {
            ConfigFormat::YuzuQtIni => root.join("config").join("qt-config.ini"),
            ConfigFormat::RyujinxJson => root.join("Config.json"),
        }
    }

    /// Folder holding `prod.keys` / `title.keys` inside a data root.
    pub fn keys_dir(&self, root: &Path) -> PathBuf {
        match self.format {
            ConfigFormat::YuzuQtIni => root.join("keys"),
            ConfigFormat::RyujinxJson => root.join("system"),
        }
    }

    /// Candidate configuration files (see [`Self::data_roots`]).
    pub fn config_files(&self, appdata: Option<&Path>, executable: Option<&Path>) -> Vec<PathBuf> {
        self.data_roots(appdata, executable)
            .iter()
            .map(|root| self.config_file(root))
            .collect()
    }

    /// Parses the game folders out of one of this emulator's configuration files.
    pub fn parse_game_dirs(&self, content: &str) -> Vec<GameDir> {
        match self.format {
            ConfigFormat::YuzuQtIni => parse_yuzu_game_dirs(content),
            ConfigFormat::RyujinxJson => parse_ryujinx_game_dirs(content),
        }
    }

    /// Command-line arguments that start `game_file` with this emulator.
    pub fn launch_arguments(&self, game_file: &Path) -> Vec<String> {
        let game = game_file.to_string_lossy().to_string();
        match self.format {
            // yuzu CLI: -f = fullscreen, -g <file> = game to boot
            ConfigFormat::YuzuQtIni => vec!["-f".to_string(), "-g".to_string(), game],
            ConfigFormat::RyujinxJson => vec![game],
        }
    }
}

/// A game folder configured inside an emulator.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameDir {
    pub path: PathBuf,
    /// Whether sub-folders are scanned too
    pub recursive: bool,
}

/// An emulator found on this machine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedEmulator {
    pub spec: EmulatorSpec,
    pub executable: Option<PathBuf>,
    pub game_dirs: Vec<GameDir>,
    /// Existing user-data folders (configuration, keys, play time)
    pub data_roots: Vec<PathBuf>,
}

/// Virtual locations of yuzu-family emulators that are not filesystem folders.
const YUZU_VIRTUAL_DIRS: &[&str] = &["SDMC", "UserNAND", "SysNAND"];

/// Reads `Paths\gamedirs\N\path` / `Paths\gamedirs\N\deep_scan` from a yuzu-family
/// `qt-config.ini`, skipping the emulator's virtual NAND/SD locations.
pub fn parse_yuzu_game_dirs(content: &str) -> Vec<GameDir> {
    let mut paths: HashMap<u32, String> = HashMap::new();
    let mut deep: HashMap<u32, bool> = HashMap::new();

    for line in content.lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let Some(rest) = key.trim().strip_prefix("Paths\\gamedirs\\") else {
            continue;
        };
        let Some((index, field)) = rest.split_once('\\') else {
            continue;
        };
        let Ok(index) = index.parse::<u32>() else {
            continue;
        };
        match field {
            "path" => {
                paths.insert(index, unquote_qt_value(value.trim()));
            }
            "deep_scan" => {
                deep.insert(index, value.trim().eq_ignore_ascii_case("true"));
            }
            _ => {}
        }
    }

    let mut indices: Vec<u32> = paths.keys().copied().collect();
    indices.sort_unstable();
    indices
        .into_iter()
        .filter_map(|i| {
            let path = paths.remove(&i)?;
            if path.is_empty() || YUZU_VIRTUAL_DIRS.iter().any(|v| path == *v) {
                return None;
            }
            Some(GameDir {
                path: PathBuf::from(path),
                recursive: deep.get(&i).copied().unwrap_or(false),
            })
        })
        .collect()
}

/// Reads the `game_dirs` array from a Ryujinx `Config.json`. Ryujinx always scans
/// its game folders recursively.
pub fn parse_ryujinx_game_dirs(content: &str) -> Vec<GameDir> {
    let Ok(json) = serde_json::from_str::<serde_json::Value>(content) else {
        return Vec::new();
    };
    json.get("game_dirs")
        .and_then(|v| v.as_array())
        .map(|dirs| {
            dirs.iter()
                .filter_map(|d| d.as_str())
                .filter(|d| !d.trim().is_empty())
                .map(|d| GameDir {
                    path: PathBuf::from(d),
                    recursive: true,
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Strips Qt `QSettings` quoting (`"..."` with `\\` and `\"` escapes) from an INI value.
fn unquote_qt_value(value: &str) -> String {
    if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
        value[1..value.len() - 1]
            .replace("\\\\", "\u{0}")
            .replace("\\\"", "\"")
            .replace('\u{0}', "\\")
    } else {
        value.to_string()
    }
}

/// Picks the most recently modified existing executable of `spec` among `candidates`
/// (users often keep several versions of the same emulator side by side). Between
/// copies of the same build, a stable install wins over one sitting in a downloads or
/// temporary folder.
pub fn pick_executable(spec: &EmulatorSpec, candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates
        .iter()
        .filter(|p| spec.matches_executable(p) && p.is_file())
        .max_by_key(|p| {
            let modified = std::fs::metadata(p)
                .and_then(|m| m.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            (modified, !is_transient_location(p))
        })
        .cloned()
}

/// Folders where executables are usually just passing through.
fn is_transient_location(path: &Path) -> bool {
    path.components().any(|c| {
        let name = c.as_os_str().to_string_lossy().to_lowercase();
        matches!(name.as_str(), "downloads" | "download" | "temp" | "tmp")
    })
}

/// Identifies which supported emulator an executable chosen by the user belongs to: exact
/// file name first (`eden.exe`), then a name containing the emulator id (e.g. a renamed
/// `Eden-nightly.exe`).
pub fn spec_for_executable(path: &Path) -> Option<EmulatorSpec> {
    if let Some(spec) = SWITCH_EMULATORS.iter().find(|s| s.matches_executable(path)) {
        return Some(*spec);
    }
    let stem = path.file_stem()?.to_string_lossy().to_lowercase();
    SWITCH_EMULATORS
        .iter()
        .find(|s| stem.contains(s.id))
        .copied()
}

/// Detects the supported Switch emulators from the user configuration folder (`appdata`),
/// the executables the user picked by hand (`chosen_executables`, always preferred) and
/// the executables known to the system.
pub fn detect_switch_emulators(
    appdata: Option<&Path>,
    known_executables: &[PathBuf],
    chosen_executables: &[PathBuf],
) -> Vec<DetectedEmulator> {
    SWITCH_EMULATORS
        .iter()
        .filter_map(|spec| {
            let executable = chosen_executables
                .iter()
                .find(|p| spec_for_executable(p).as_ref() == Some(spec) && p.is_file())
                .cloned()
                .or_else(|| pick_executable(spec, known_executables));
            let mut game_dirs: Vec<GameDir> = Vec::new();
            let mut data_roots: Vec<PathBuf> = Vec::new();
            for root in spec.data_roots(appdata, executable.as_deref()) {
                let Ok(content) = std::fs::read_to_string(spec.config_file(&root)) else {
                    continue;
                };
                for dir in spec.parse_game_dirs(&content) {
                    if !game_dirs.iter().any(|d| same_path(&d.path, &dir.path)) {
                        game_dirs.push(dir);
                    }
                }
                data_roots.push(root);
            }
            if executable.is_none() && data_roots.is_empty() {
                return None;
            }
            Some(DetectedEmulator {
                spec: *spec,
                executable,
                game_dirs,
                data_roots,
            })
        })
        .collect()
}

/// Case- and separator-insensitive path comparison (Windows paths).
pub fn same_path(a: &Path, b: &Path) -> bool {
    normalize(a) == normalize(b)
}

fn normalize(p: &Path) -> String {
    p.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

/// Executables Windows remembers having started for the current user (Explorer's
/// `MuiCache` and the Program Compatibility Assistant store). This finds portable
/// emulators that have no installer or registry entry of their own.
pub fn executables_known_to_system() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        const KEYS: &[&str] = &[
            r"Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache",
            r"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Compatibility Assistant\Store",
        ];

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let mut found: Vec<PathBuf> = Vec::new();
        for key_path in KEYS {
            let Ok(key) = hkcu.open_subkey(key_path) else {
                continue;
            };
            for (name, _) in key.enum_values().flatten() {
                // MuiCache value names look like "C:\dir\app.exe.FriendlyAppName"
                let lower = name.to_lowercase();
                let Some(end) = lower.find(".exe") else {
                    continue;
                };
                let path = PathBuf::from(&name[..end + 4]);
                if !found.iter().any(|p| same_path(p, &path)) {
                    found.push(path);
                }
            }
        }
        found
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EDEN_INI: &str = r#"[UI]
Paths\gamedirs\size=5
Paths\romsPath=
Paths\gamedirs\1\path=SDMC
Paths\gamedirs\1\deep_scan\default=true
Paths\gamedirs\1\deep_scan=false
Paths\gamedirs\2\path=UserNAND
Paths\gamedirs\3\path=SysNAND
Paths\gamedirs\4\path=D:/Games/Switch
Paths\gamedirs\4\deep_scan\default=false
Paths\gamedirs\4\deep_scan=true
Paths\gamedirs\5\path="D:/Giochi, Switch"
Paths\gamedirs\5\deep_scan=false
"#;

    #[test]
    fn yuzu_ini_game_dirs_skip_virtual_locations() {
        let dirs = parse_yuzu_game_dirs(EDEN_INI);
        assert_eq!(
            dirs,
            vec![
                GameDir {
                    path: PathBuf::from("D:/Games/Switch"),
                    recursive: true,
                },
                GameDir {
                    path: PathBuf::from("D:/Giochi, Switch"),
                    recursive: false,
                },
            ]
        );
    }

    #[test]
    fn ryujinx_json_game_dirs_are_recursive() {
        let json = r#"{ "version": 70, "game_dirs": ["D:\\Games\\Switch", ""], "other": 1 }"#;
        let dirs = parse_ryujinx_game_dirs(json);
        assert_eq!(
            dirs,
            vec![GameDir {
                path: PathBuf::from("D:\\Games\\Switch"),
                recursive: true,
            }]
        );
        assert!(parse_ryujinx_game_dirs("not json").is_empty());
    }

    #[test]
    fn launch_arguments_per_family() {
        let eden = SWITCH_EMULATORS[0];
        let ryujinx = SWITCH_EMULATORS
            .iter()
            .find(|s| s.id == "ryujinx")
            .copied()
            .unwrap();
        let game = Path::new("D:/Switch/Game [0100000000010000].nsp");
        assert_eq!(
            eden.launch_arguments(game),
            vec!["-f", "-g", "D:/Switch/Game [0100000000010000].nsp"]
        );
        assert_eq!(
            ryujinx.launch_arguments(game),
            vec!["D:/Switch/Game [0100000000010000].nsp"]
        );
    }

    #[test]
    fn executable_matching_is_case_insensitive() {
        let ryujinx = SWITCH_EMULATORS.iter().find(|s| s.id == "ryujinx").unwrap();
        assert!(ryujinx.matches_executable(Path::new("C:/emu/publish/Ryujinx.exe")));
        assert!(!ryujinx.matches_executable(Path::new("C:/emu/eden.exe")));
    }

    #[test]
    fn identifies_hand_picked_executables() {
        let id = |p: &str| spec_for_executable(Path::new(p)).map(|s| s.id);
        assert_eq!(id("C:/Emu/eden.exe"), Some("eden"));
        assert_eq!(id("C:/Emu/Ryujinx.exe"), Some("ryujinx"));
        assert_eq!(id("C:/Emu/Eden-nightly-2026.exe"), Some("eden"));
        assert_eq!(id("C:/Emu/citron-qt.exe"), Some("citron"));
        assert_eq!(id("C:/Emu/suyu.exe"), Some("suyu"));
        assert_eq!(id("C:/Emu/notepad.exe"), None);
    }

    #[test]
    fn hand_picked_executable_wins_over_system_list() {
        let root = std::env::temp_dir().join(format!("omnis_emu_pick_{}", std::process::id()));
        let system = root.join("A").join("eden.exe");
        let chosen = root.join("B").join("Eden-nightly.exe");
        for p in [&system, &chosen] {
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, b"").unwrap();
        }
        let detected = detect_switch_emulators(
            None,
            std::slice::from_ref(&system),
            std::slice::from_ref(&chosen),
        );
        let eden = detected.iter().find(|d| d.spec.id == "eden").unwrap();
        assert_eq!(eden.executable.as_deref(), Some(chosen.as_path()));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn transient_folders_are_recognised() {
        assert!(is_transient_location(Path::new(
            "C:/Users/me/Downloads/eden.exe"
        )));
        assert!(is_transient_location(Path::new("C:/Temp/x/eden.exe")));
        assert!(!is_transient_location(Path::new(
            "C:/Emulatori/Eden/eden.exe"
        )));
    }

    #[test]
    fn detects_portable_yuzu_family_config_next_to_executable() {
        let root = std::env::temp_dir().join(format!("omnis_emu_detect_{}", std::process::id()));
        let exe_dir = root.join("Citron");
        let config_dir = exe_dir.join("user").join("config");
        std::fs::create_dir_all(&config_dir).unwrap();
        let exe = exe_dir.join("citron.exe");
        std::fs::write(&exe, b"").unwrap();
        std::fs::write(
            config_dir.join("qt-config.ini"),
            "Paths\\gamedirs\\1\\path=SDMC\nPaths\\gamedirs\\2\\path=E:/Switch\n",
        )
        .unwrap();

        let detected = detect_switch_emulators(None, std::slice::from_ref(&exe), &[]);
        let citron = detected.iter().find(|d| d.spec.id == "citron").unwrap();
        assert_eq!(citron.executable.as_deref(), Some(exe.as_path()));
        assert_eq!(citron.game_dirs.len(), 1);
        assert_eq!(citron.game_dirs[0].path, PathBuf::from("E:/Switch"));
        assert!(detected.iter().all(|d| d.spec.id == "citron"));

        let _ = std::fs::remove_dir_all(&root);
    }
}
