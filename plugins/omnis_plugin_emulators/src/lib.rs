//! Emulator library integration for Omnis.
//!
//! First platform: **Nintendo Switch**. The plugin finds the Switch emulators installed on
//! the machine (yuzu family: Eden, Citron, Sudachi, Suyu, yuzu; and Ryujinx), reads the game
//! folders configured in each of them, and publishes one catalog entry per game under the
//! `switch` library. Games launch with the first available emulator in
//! [`emulators::SWITCH_EMULATORS`] order.
//!
//! Nothing has to be configured in Omnis: if a game shows up in the emulator, it shows up
//! in the library, with the play time the emulators recorded.
//!
//! Optionally (off by default, see [`EmulatorSettings::use_emulator_keys`]) the plugin
//! can read the keys the user already gave their emulator to show the official title and
//! icon of each game, exactly like the emulator's own game list.

use async_trait::async_trait;
use omnis_sdk::{DiscoveredGame, LibraryPlugin, PluginError};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub mod control;
pub mod emulators;
pub mod keys;
pub mod playtime;
pub mod switch;

pub use emulators::{
    spec_for_executable, DetectedEmulator, EmulatorSpec, GameDir, SWITCH_EMULATORS,
};
pub use switch::SWITCH_LIBRARY_ID;

/// Plugin identifier inside the plugin host.
pub const PLUGIN_ID: &str = "emulators";

/// Settings file inside the plugin data folder.
const SETTINGS_FILE: &str = "settings.json";
/// Folder for extracted game icons inside the plugin data folder.
const ICONS_DIR: &str = "switch-icons";

/// User settings of the emulator integration.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct EmulatorSettings {
    /// Read the emulator's `prod.keys` / `title.keys` (read-only, in memory) to show the
    /// official title and icon of each game. Off by default.
    #[serde(default)]
    pub use_emulator_keys: bool,
    /// Emulator id (e.g. "eden") used to launch Switch games. When unset or not
    /// available, the first detected emulator in [`SWITCH_EMULATORS`] order is used.
    #[serde(default)]
    pub switch_default_emulator: Option<String>,
    /// Per-game exceptions: Switch Title ID (16 hex digits) -> emulator id.
    #[serde(default)]
    pub switch_game_emulators: BTreeMap<String, String>,
    /// Emulator executables picked by hand (preferred over the detected ones), for
    /// emulators Windows has no record of.
    #[serde(default)]
    pub switch_custom_executables: Vec<String>,
    /// Extra game folders scanned recursively, besides those configured in the emulators.
    #[serde(default)]
    pub switch_extra_game_dirs: Vec<String>,
}

impl EmulatorSettings {
    /// Emulator that launches the game with `external_id`: the per-game choice, then the
    /// default choice, then the first detected one. Only emulators with a known
    /// executable can launch.
    pub fn launcher_for<'a>(
        &self,
        external_id: &str,
        detected: &'a [DetectedEmulator],
    ) -> Option<&'a DetectedEmulator> {
        let launchable = |id: &str| {
            detected
                .iter()
                .find(|e| e.spec.id == id && e.executable.is_some())
        };
        self.switch_game_emulators
            .get(&external_id.to_uppercase())
            .and_then(|id| launchable(id))
            .or_else(|| self.default_launcher(detected))
    }

    /// Default emulator for Switch games (see [`Self::launcher_for`]).
    pub fn default_launcher<'a>(
        &self,
        detected: &'a [DetectedEmulator],
    ) -> Option<&'a DetectedEmulator> {
        self.switch_default_emulator
            .as_deref()
            .and_then(|id| {
                detected
                    .iter()
                    .find(|e| e.spec.id == id && e.executable.is_some())
            })
            .or_else(|| detected.iter().find(|e| e.executable.is_some()))
    }
    /// Loads the settings from `dir`, defaulting when missing or unreadable.
    pub fn load(dir: &Path) -> Self {
        std::fs::read_to_string(dir.join(SETTINGS_FILE))
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_default()
    }

    /// Saves the settings into `dir`.
    pub fn save(&self, dir: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(dir)?;
        let json = serde_json::to_string_pretty(self).map_err(std::io::Error::other)?;
        std::fs::write(dir.join(SETTINGS_FILE), json)
    }
}

/// What the integration found for one emulator.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EmulatorStatus {
    pub id: String,
    pub name: String,
    pub platform: String,
    /// Executable used to launch games, if known
    pub executable: Option<String>,
    /// Game folders configured in the emulator
    pub game_dirs: Vec<String>,
    /// Whether the emulator has a `prod.keys` file
    pub has_keys: bool,
    /// Whether games are launched with this emulator by default
    pub is_default: bool,
    /// Whether the executable was picked by hand in Settings
    pub custom_executable: bool,
}

/// Emulator library plugin.
#[derive(Debug, Clone, Default)]
pub struct EmulatorsPlugin {
    /// Overrides `%APPDATA%` (tests)
    appdata_override: Option<PathBuf>,
    /// Overrides the executables discovered from the system (tests)
    executables_override: Option<Vec<PathBuf>>,
    /// Omnis-owned folder for settings and extracted icons
    data_dir: Option<PathBuf>,
}

impl EmulatorsPlugin {
    pub fn new() -> Self {
        Self::default()
    }

    /// Plugin bound to an explicit configuration root and executable list instead of the
    /// current user's environment.
    pub fn with_environment(appdata: Option<PathBuf>, executables: Vec<PathBuf>) -> Self {
        Self {
            appdata_override: appdata,
            executables_override: Some(executables),
            data_dir: None,
        }
    }

    /// Folder (owned by Omnis) where the plugin keeps its settings and game icons.
    pub fn with_data_dir(mut self, dir: PathBuf) -> Self {
        self.data_dir = Some(dir);
        self
    }

    /// Current settings (defaults when no data folder is configured).
    pub fn settings(&self) -> EmulatorSettings {
        self.data_dir
            .as_deref()
            .map(EmulatorSettings::load)
            .unwrap_or_default()
    }

    fn appdata(&self) -> Option<PathBuf> {
        // An explicit environment (see `with_environment`) never falls back to the real
        // user profile.
        if self.executables_override.is_some() {
            return self.appdata_override.clone();
        }
        std::env::var_os("APPDATA").map(PathBuf::from)
    }

    /// Switch emulators found on this machine, in launch preference order.
    pub fn detect_switch_emulators(&self) -> Vec<DetectedEmulator> {
        let executables = self
            .executables_override
            .clone()
            .unwrap_or_else(emulators::executables_known_to_system);
        let chosen: Vec<PathBuf> = self
            .settings()
            .switch_custom_executables
            .iter()
            .map(PathBuf::from)
            .collect();
        emulators::detect_switch_emulators(self.appdata().as_deref(), &executables, &chosen)
    }

    /// Scans every detected emulator's game folders and returns the Switch catalog.
    pub fn scan_switch(&self) -> Vec<DiscoveredGame> {
        let detected = self.detect_switch_emulators();
        if detected.is_empty() {
            tracing::info!("No Switch emulator detected.");
            return Vec::new();
        }

        let settings = self.settings();
        let launcher = settings.default_launcher(&detected);
        match launcher {
            Some(emu) => tracing::info!(
                "Switch games will launch with {} by default ({:?}), {} per-game exception(s)",
                emu.spec.display_name,
                emu.executable,
                settings.switch_game_emulators.len()
            ),
            None => tracing::warn!(
                "Switch emulator configuration found but no executable: games will be listed without a launch action"
            ),
        }

        let dirs: Vec<GameDir> = detected
            .iter()
            .flat_map(|e| e.game_dirs.iter().cloned())
            .chain(settings.switch_extra_game_dirs.iter().map(|d| GameDir {
                path: PathBuf::from(d),
                recursive: true,
            }))
            .collect();
        let files = switch::find_switch_files(&dirs);
        let entries = switch::build_game_entries(&files, launcher);

        let play_stats = playtime::collect_play_stats(&detected);
        let keys = self.load_keys(&detected);
        let icons_dir = self.data_dir.as_ref().map(|d| d.join(ICONS_DIR));
        let mut with_control_data = 0;

        let games: Vec<DiscoveredGame> = entries
            .into_iter()
            .map(|(mut game, file)| {
                // Per-game emulator choice (falls back to the default launcher)
                if let Some(emu) = settings.launcher_for(&game.external_id, &detected) {
                    game.play_action = switch::launch_configuration(emu, &file);
                }
                let Ok(title_id) = u64::from_str_radix(&game.external_id, 16) else {
                    return game;
                };
                if let Some(stats) = play_stats.get(&title_id) {
                    game.playtime_seconds = stats.seconds;
                    game.last_activity = stats.last_played;
                }
                if let Some(keys) = keys.as_ref() {
                    if let Some(data) = control::read_control(&file, keys) {
                        with_control_data += 1;
                        if let Some(name) = data.name {
                            game.title = name;
                        }
                        if let (Some(jpeg), Some(dir)) = (data.icon_jpeg, icons_dir.as_deref()) {
                            game.cover_image_path = save_icon(dir, &game.external_id, &jpeg);
                        }
                    }
                }
                tracing::debug!(
                    "Switch {} '{}': {}s played, icon: {}, launcher: {}",
                    game.external_id,
                    game.title,
                    game.playtime_seconds,
                    game.cover_image_path.is_some(),
                    game.play_action
                        .as_ref()
                        .and_then(|a| Path::new(&a.executable).file_name())
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "-".to_string())
                );
                game
            })
            .collect();

        tracing::info!(
            "Discovered {} Switch games ({} files) from {} emulator(s); play time for {}, official title/icon for {}.",
            games.len(),
            files.len(),
            detected.len(),
            games.iter().filter(|g| g.playtime_seconds > 0).count(),
            with_control_data
        );
        games
    }

    /// What was found for each emulator, for the Settings page. Only checks whether a
    /// `prod.keys` file exists: keys are not read here.
    pub fn emulator_status(&self) -> Vec<EmulatorStatus> {
        let detected = self.detect_switch_emulators();
        let settings = self.settings();
        let default_id = settings.default_launcher(&detected).map(|e| e.spec.id);
        detected
            .iter()
            .map(|e| EmulatorStatus {
                is_default: Some(e.spec.id) == default_id,
                custom_executable: e.executable.as_ref().is_some_and(|exe| {
                    settings
                        .switch_custom_executables
                        .iter()
                        .any(|c| emulators::same_path(Path::new(c), exe))
                }),
                id: e.spec.id.to_string(),
                name: e.spec.display_name.to_string(),
                platform: "Nintendo Switch".to_string(),
                executable: e
                    .executable
                    .as_ref()
                    .map(|p| p.to_string_lossy().to_string()),
                game_dirs: e
                    .game_dirs
                    .iter()
                    .map(|d| d.path.to_string_lossy().to_string())
                    .collect(),
                has_keys: e
                    .data_roots
                    .iter()
                    .any(|r| e.spec.keys_dir(r).join("prod.keys").is_file()),
            })
            .collect()
    }

    /// Keys from the detected emulators, only when the user enabled the option.
    fn load_keys(&self, detected: &[DetectedEmulator]) -> Option<keys::KeySet> {
        if !self.settings().use_emulator_keys {
            return None;
        }
        let mut set = keys::KeySet::default();
        for emulator in detected {
            for root in &emulator.data_roots {
                set.add_from_dir(&emulator.spec.keys_dir(root));
            }
        }
        if set.is_usable() {
            Some(set)
        } else {
            tracing::info!("Emulator keys option is on, but no usable prod.keys was found.");
            None
        }
    }
}

/// Writes an extracted icon (unchanged files are left alone) and returns its path.
fn save_icon(dir: &Path, external_id: &str, jpeg: &[u8]) -> Option<String> {
    let sanitized = external_id.replace([':', '/', '\\', '*', '?', '"', '<', '>', '|'], "_");
    let path = dir.join(format!("{}.jpg", sanitized));
    let unchanged = std::fs::metadata(&path)
        .map(|m| m.len() == jpeg.len() as u64)
        .unwrap_or(false);
    if !unchanged {
        std::fs::create_dir_all(dir).ok()?;
        std::fs::write(&path, jpeg).ok()?;
    }
    Some(path.to_string_lossy().to_string())
}

#[async_trait]
impl LibraryPlugin for EmulatorsPlugin {
    fn id(&self) -> &str {
        SWITCH_LIBRARY_ID
    }

    fn name(&self) -> &str {
        "Nintendo Switch (emulators)"
    }

    /// Local filesystem and registry reads only: fast enough to run inline, like the
    /// Steam and Epic manifest scanners.
    async fn scan(&self) -> Result<Vec<DiscoveredGame>, PluginError> {
        Ok(self.scan_switch())
    }
}

#[async_trait]
impl omnis_sdk::ReactivePlugin for EmulatorsPlugin {
    fn id(&self) -> &'static str {
        PLUGIN_ID
    }

    fn name(&self) -> &'static str {
        "Emulators"
    }

    async fn initialize(&mut self, _config_json: &str) -> Result<(), String> {
        Ok(())
    }

    async fn handle_event(
        &mut self,
        event: omnis_sdk::PluginEvent,
    ) -> Result<Vec<omnis_sdk::PluginEvent>, String> {
        let mut responses = Vec::new();
        if let omnis_sdk::PluginEvent::SyncRequested { library_id, .. } = event {
            if library_id == "all" || library_id == SWITCH_LIBRARY_ID || library_id == PLUGIN_ID {
                match self.scan().await {
                    Ok(games) => responses.push(omnis_sdk::PluginEvent::BatchGamesDiscovered {
                        library_id: SWITCH_LIBRARY_ID.to_string(),
                        games,
                    }),
                    Err(e) => responses.push(omnis_sdk::PluginEvent::NotificationEmitted {
                        level: omnis_sdk::LogLevel::Error,
                        message: format!("Switch emulator scan failed: {}", e),
                    }),
                }
            }
        }
        Ok(responses)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use omnis_sdk::ReactivePlugin;

    #[tokio::test]
    async fn sync_publishes_switch_games_from_eden_and_ryujinx_configs() {
        let root = std::env::temp_dir().join(format!("omnis_emu_plugin_{}", std::process::id()));
        let appdata = root.join("AppData");
        let games = root.join("Games");
        let eden_cfg = appdata.join("eden").join("config");
        let ryu_cfg = appdata.join("Ryujinx");
        let eden_exe = root.join("Eden").join("eden.exe");
        std::fs::create_dir_all(&eden_cfg).unwrap();
        std::fs::create_dir_all(&ryu_cfg).unwrap();
        std::fs::create_dir_all(games.join("Zelda")).unwrap();
        std::fs::create_dir_all(eden_exe.parent().unwrap()).unwrap();
        std::fs::write(&eden_exe, b"").unwrap();

        let games_str = games.to_string_lossy().replace('\\', "/");
        std::fs::write(
            eden_cfg.join("qt-config.ini"),
            format!("Paths\\gamedirs\\1\\path=SDMC\nPaths\\gamedirs\\2\\path={games_str}\nPaths\\gamedirs\\2\\deep_scan=true\n"),
        )
        .unwrap();
        std::fs::write(
            ryu_cfg.join("Config.json"),
            serde_json::json!({ "game_dirs": [games.to_string_lossy()] }).to_string(),
        )
        .unwrap();
        std::fs::write(
            games
                .join("Zelda")
                .join("Zelda BOTW [01007EF00011E000][v0].nsp"),
            b"",
        )
        .unwrap();
        std::fs::write(
            games
                .join("Zelda")
                .join("Zelda BOTW [01007EF00011E800][v786432].nsp"),
            b"",
        )
        .unwrap();
        std::fs::write(games.join("Metroid Dread [010093801237C000][v0].xci"), b"").unwrap();

        let mut plugin = EmulatorsPlugin::with_environment(Some(appdata), vec![eden_exe.clone()]);
        let detected = plugin.detect_switch_emulators();
        assert_eq!(
            detected.iter().map(|d| d.spec.id).collect::<Vec<_>>(),
            vec!["eden", "ryujinx"]
        );

        let events = plugin
            .handle_event(omnis_sdk::PluginEvent::SyncRequested {
                library_id: "all".to_string(),
                force_full: false,
            })
            .await
            .unwrap();
        assert_eq!(events.len(), 1);
        let omnis_sdk::PluginEvent::BatchGamesDiscovered { library_id, games } = &events[0] else {
            panic!("expected BatchGamesDiscovered");
        };
        assert_eq!(library_id, SWITCH_LIBRARY_ID);
        // Shared folder in both emulators: each game listed once, update folded in
        assert_eq!(games.len(), 2);
        let zelda = games.iter().find(|g| g.title == "Zelda BOTW").unwrap();
        let action = zelda.play_action.as_ref().unwrap();
        assert_eq!(action.executable, eden_exe.to_string_lossy());
        assert_eq!(action.arguments[..2], ["-f".to_string(), "-g".to_string()]);
        assert!(action.arguments[2].ends_with("[01007EF00011E000][v0].nsp"));

        let other = plugin
            .handle_event(omnis_sdk::PluginEvent::SyncRequested {
                library_id: "steam".to_string(),
                force_full: false,
            })
            .await
            .unwrap();
        assert!(other.is_empty());

        let _ = std::fs::remove_dir_all(&root);
    }

    fn emulator(id: &str, exe: Option<&str>) -> DetectedEmulator {
        DetectedEmulator {
            spec: *SWITCH_EMULATORS.iter().find(|s| s.id == id).unwrap(),
            executable: exe.map(PathBuf::from),
            game_dirs: vec![],
            data_roots: vec![],
        }
    }

    #[test]
    fn launcher_choice_default_and_per_game() {
        let detected = vec![
            emulator("eden", Some("C:/Eden/eden.exe")),
            emulator("citron", None), // configured but no executable known
            emulator("ryujinx", Some("C:/Ryujinx/Ryujinx.exe")),
        ];
        let id = |e: Option<&DetectedEmulator>| e.map(|e| e.spec.id);

        // Nothing chosen: first launchable emulator in preference order
        let mut s = EmulatorSettings::default();
        assert_eq!(id(s.default_launcher(&detected)), Some("eden"));
        assert_eq!(
            id(s.launcher_for("0100000000010000", &detected)),
            Some("eden")
        );

        // User default
        s.switch_default_emulator = Some("ryujinx".into());
        assert_eq!(id(s.default_launcher(&detected)), Some("ryujinx"));

        // Per-game exception (case-insensitive Title ID) wins over the default
        s.switch_game_emulators
            .insert("01007EF00011E000".into(), "eden".into());
        assert_eq!(
            id(s.launcher_for("01007ef00011e000", &detected)),
            Some("eden")
        );
        assert_eq!(
            id(s.launcher_for("0100000000010000", &detected)),
            Some("ryujinx")
        );

        // Choices pointing to an emulator that cannot launch fall back gracefully
        s.switch_game_emulators
            .insert("0100000000010000".into(), "citron".into());
        assert_eq!(
            id(s.launcher_for("0100000000010000", &detected)),
            Some("ryujinx")
        );
        s.switch_default_emulator = Some("sudachi".into());
        assert_eq!(id(s.default_launcher(&detected)), Some("eden"));
    }

    #[test]
    fn settings_round_trip_and_old_files_still_load() {
        let dir = std::env::temp_dir().join(format!("omnis_emu_settings_{}", std::process::id()));
        let mut s = EmulatorSettings {
            use_emulator_keys: true,
            switch_default_emulator: Some("citron".into()),
            ..Default::default()
        };
        s.switch_game_emulators
            .insert("0100000000010000".into(), "ryujinx".into());
        s.save(&dir).unwrap();
        assert_eq!(EmulatorSettings::load(&dir), s);

        // A settings file written before these options existed
        std::fs::write(
            dir.join("settings.json"),
            r#"{ "use_emulator_keys": true }"#,
        )
        .unwrap();
        let old = EmulatorSettings::load(&dir);
        assert!(old.use_emulator_keys);
        assert!(old.switch_default_emulator.is_none());
        assert!(old.switch_game_emulators.is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn hand_picked_emulator_and_extra_folder_work_without_any_detection() {
        let root = std::env::temp_dir().join(format!("omnis_emu_manual_{}", std::process::id()));
        let exe = root.join("Portable Emu").join("eden.exe");
        let games = root.join("My Switch Games");
        let data = root.join("omnis-data");
        std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        std::fs::create_dir_all(games.join("sub")).unwrap();
        std::fs::write(&exe, b"").unwrap();
        std::fs::write(
            games
                .join("sub")
                .join("Metroid Dread [010093801237C000][v0].nsp"),
            b"",
        )
        .unwrap();
        EmulatorSettings {
            switch_custom_executables: vec![exe.to_string_lossy().to_string()],
            switch_extra_game_dirs: vec![games.to_string_lossy().to_string()],
            ..Default::default()
        }
        .save(&data)
        .unwrap();

        // No %APPDATA% config and nothing recorded by Windows
        let plugin = EmulatorsPlugin::with_environment(None, vec![]).with_data_dir(data);
        let status = plugin.emulator_status();
        assert_eq!(status.len(), 1);
        assert!(status[0].custom_executable && status[0].is_default);

        let found = plugin.scan_switch();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Metroid Dread");
        let action = found[0].play_action.as_ref().unwrap();
        assert_eq!(action.executable, exe.to_string_lossy());

        let _ = std::fs::remove_dir_all(&root);
    }
}
