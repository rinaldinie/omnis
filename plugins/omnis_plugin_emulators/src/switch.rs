//! Nintendo Switch game files: discovery in the emulators' game folders, Title ID
//! parsing and grouping of base games, updates and DLC into one library entry per game.

use crate::emulators::{same_path, DetectedEmulator, GameDir};
use omnis_sdk::{DiscoveredGame, LaunchConfiguration, ProcessTrackingMode};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Library identifier used for Switch games in the Omnis catalog.
pub const SWITCH_LIBRARY_ID: &str = "switch";

/// File extensions of Switch game dumps.
pub const SWITCH_EXTENSIONS: &[&str] = &["nsp", "xci", "nsz", "xcz"];

/// Safety limit for recursive folder scans.
const MAX_SCAN_DEPTH: usize = 8;

/// Kind of content a Switch Title ID refers to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TitleKind {
    Base,
    Update,
    Dlc,
}

/// Classifies a Title ID: base games end in `000`, updates in `800`, anything else is DLC.
pub fn title_kind(title_id: u64) -> TitleKind {
    match title_id & 0xFFF {
        0x000 => TitleKind::Base,
        0x800 => TitleKind::Update,
        _ => TitleKind::Dlc,
    }
}

/// Title ID of the base game an update or DLC belongs to.
pub fn base_title_id(title_id: u64) -> u64 {
    match title_kind(title_id) {
        TitleKind::Base => title_id,
        TitleKind::Update => title_id & !0xFFF,
        // DLC IDs are the base ID + 0x1000 + index
        TitleKind::Dlc => title_id.wrapping_sub(0x1000) & !0xFFF,
    }
}

/// Extracts the Title ID from a file name such as `Game [0100000000010000][v0].nsp`.
/// Accepts 15 hex digits too, since some dumps drop the leading zero.
pub fn parse_title_id(file_name: &str) -> Option<u64> {
    let mut rest = file_name;
    while let Some(start) = rest.find('[') {
        let after = &rest[start + 1..];
        let Some(end) = after.find(']') else {
            break;
        };
        let inner = &after[..end];
        if (15..=16).contains(&inner.len()) && inner.chars().all(|c| c.is_ascii_hexdigit()) {
            if let Ok(id) = u64::from_str_radix(inner, 16) {
                // Every Switch title lives in the 0x01xx... range
                if id >> 56 == 0x01 {
                    return Some(id);
                }
            }
        }
        rest = &after[end + 1..];
    }
    None
}

/// Turns a dump file name into a display title: drops bracketed/parenthesised tags,
/// trailing version tokens (`v1.0.0`) and the extension.
pub fn clean_title(file_name: &str) -> String {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    let cut = stem.find(['[', '(']).map(|i| &stem[..i]).unwrap_or(stem);
    let mut words: Vec<&str> = cut.split_whitespace().collect();
    while let Some(last) = words.last() {
        if is_version_token(last) {
            words.pop();
        } else {
            break;
        }
    }
    let title = words.join(" ").replace('_', " ");
    let title = title.trim_matches(|c: char| c == '-' || c.is_whitespace());
    if title.is_empty() {
        stem.trim().to_string()
    } else {
        title.to_string()
    }
}

fn is_version_token(token: &str) -> bool {
    let Some(rest) = token.strip_prefix(['v', 'V']) else {
        return false;
    };
    !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit() || c == '.')
}

/// A Switch dump found on disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SwitchFile {
    pub path: PathBuf,
    pub title_id: Option<u64>,
}

/// Recursively (when requested) lists Switch dumps in the given folders. A folder shared
/// by several emulators is scanned once, recursively if any of them asks for it.
pub fn find_switch_files(dirs: &[GameDir]) -> Vec<SwitchFile> {
    let mut merged: Vec<GameDir> = Vec::new();
    for dir in dirs {
        match merged.iter_mut().find(|d| same_path(&d.path, &dir.path)) {
            Some(existing) => existing.recursive |= dir.recursive,
            None => merged.push(dir.clone()),
        }
    }

    let mut files = Vec::new();
    for dir in &merged {
        let depth = if dir.recursive { MAX_SCAN_DEPTH } else { 0 };
        walk(&dir.path, depth, &mut files);
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    files.dedup_by(|a, b| same_path(&a.path, &b.path));
    files
}

fn walk(dir: &Path, depth_left: usize, out: &mut Vec<SwitchFile>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if depth_left > 0 {
                walk(&path, depth_left - 1, out);
            }
            continue;
        }
        let is_dump = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| SWITCH_EXTENSIONS.iter().any(|x| e.eq_ignore_ascii_case(x)))
            .unwrap_or(false);
        if is_dump {
            let title_id = path
                .file_name()
                .and_then(|n| n.to_str())
                .and_then(parse_title_id);
            out.push(SwitchFile { path, title_id });
        }
    }
}

/// Builds one catalog entry per base game. Updates and DLC are folded into their base
/// game; files without a Title ID become standalone entries keyed by their title.
/// `launcher` is the emulator used to start games, if one was found.
pub fn build_games(
    files: &[SwitchFile],
    launcher: Option<&DetectedEmulator>,
) -> Vec<DiscoveredGame> {
    build_game_entries(files, launcher)
        .into_iter()
        .map(|(game, _)| game)
        .collect()
}

/// Same as [`build_games`], also returning the base game file of each entry.
pub fn build_game_entries(
    files: &[SwitchFile],
    launcher: Option<&DetectedEmulator>,
) -> Vec<(DiscoveredGame, PathBuf)> {
    let mut bases: BTreeMap<String, &SwitchFile> = BTreeMap::new();
    for file in files {
        match file.title_id {
            Some(id) if title_kind(id) == TitleKind::Base => {
                bases.entry(format!("{:016X}", id)).or_insert(file);
            }
            Some(_) => {} // update / DLC: belongs to a base game
            None => {
                let name = file
                    .path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default();
                let key = format!("file:{}", clean_title(name).to_lowercase());
                bases.entry(key).or_insert(file);
            }
        }
    }

    bases
        .into_iter()
        .map(|(external_id, file)| {
            let file_name = file
                .path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default();
            let game = DiscoveredGame {
                library_id: SWITCH_LIBRARY_ID.to_string(),
                external_id,
                title: clean_title(file_name),
                install_dir: file.path.parent().map(Path::to_path_buf),
                is_installed: true,
                play_action: launcher.and_then(|emu| launch_configuration(emu, &file.path)),
                playtime_seconds: 0,
                play_count: 0,
                last_activity: None,
                cover_image_path: None,
                background_image_path: None,
            };
            (game, file.path.clone())
        })
        .collect()
}

/// Launch configuration starting `game_file` with the given emulator.
pub fn launch_configuration(
    emulator: &DetectedEmulator,
    game_file: &Path,
) -> Option<LaunchConfiguration> {
    let exe = emulator.executable.as_ref()?;
    Some(LaunchConfiguration {
        executable: exe.to_string_lossy().to_string(),
        arguments: emulator.spec.launch_arguments(game_file),
        working_dir: exe.parent().map(Path::to_path_buf),
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::emulators::SWITCH_EMULATORS;

    #[test]
    fn title_id_kinds_and_base_ids() {
        assert_eq!(title_kind(0x0100000000010000), TitleKind::Base);
        assert_eq!(title_kind(0x0100000000010800), TitleKind::Update);
        assert_eq!(title_kind(0x01006A800016F001), TitleKind::Dlc);
        assert_eq!(base_title_id(0x0100000000010800), 0x0100000000010000);
        assert_eq!(base_title_id(0x01006A800016F001), 0x01006A800016E000);
        assert_eq!(base_title_id(0x0100ABF008969002), 0x0100ABF008968000);
    }

    #[test]
    fn parses_title_ids_from_common_dump_names() {
        assert_eq!(
            parse_title_id("Super Mario Odyssey [0100000000010000][v0].nsp"),
            Some(0x0100000000010000)
        );
        assert_eq!(
            parse_title_id("ASTRAL CHAIN[01007300020FA000][US][v0].nsp"),
            Some(0x01007300020FA000)
        );
        assert_eq!(
            parse_title_id("Season Pass DLC [01007ef00011f001][v196608].nsp"),
            Some(0x01007EF00011F001)
        );
        // 15 hex digits: leading zero dropped by the dumper
        assert_eq!(
            parse_title_id("Pokemon Sword [100ABF008968800][v458752].nsp"),
            Some(0x0100ABF008968800)
        );
        assert_eq!(parse_title_id("Some Game [US][v0].nsp"), None);
        assert_eq!(parse_title_id("Game [AAFP01].xci"), None);
    }

    #[test]
    fn cleans_titles() {
        assert_eq!(
            clean_title("Super Mario Party Jamboree v1.0.0[0100965017338000][0][APP].nsp"),
            "Super Mario Party Jamboree"
        );
        assert_eq!(
            clean_title("Super Mario Bros. Wonder[010015100B514000][1.0.0][0][16.0.3].nsp"),
            "Super Mario Bros. Wonder"
        );
        assert_eq!(
            clean_title("Pokémon Let’s Go, Eevee! [0100187003A36000][v0].nsp"),
            "Pokémon Let’s Go, Eevee!"
        );
        assert_eq!(
            clean_title("Pokemon Scarlet [0100A3D008C5C000][v0][US].nsp"),
            "Pokemon Scarlet"
        );
        assert_eq!(clean_title("[0100000000010000].nsp"), "[0100000000010000]");
    }

    fn file(path: &str) -> SwitchFile {
        let name = Path::new(path).file_name().unwrap().to_str().unwrap();
        SwitchFile {
            path: PathBuf::from(path),
            title_id: parse_title_id(name),
        }
    }

    #[test]
    fn groups_updates_and_dlc_under_their_base_game() {
        let files = vec![
            file("D:/Switch/Smash/Super Smash Bros Ultimate[01006A800016E000][US][v0].nsp"),
            file("D:/Switch/Smash/Super Smash Bros. Ultimate [01006A800016E800][v1900544].nsp"),
            file("D:/Switch/Smash/Super Smash Bros Ultimate [DLC Piranha Plant] [01006A800016F001][v65536].nsp"),
            file("D:/Switch/Orphan Update [0100AAAA00000800][v1].nsp"),
            file("D:/Switch/Homebrew Game.nsp"),
        ];
        let games = build_games(&files, None);
        assert_eq!(games.len(), 2);

        let smash = games
            .iter()
            .find(|g| g.external_id == "01006A800016E000")
            .unwrap();
        assert_eq!(smash.title, "Super Smash Bros Ultimate");
        assert_eq!(smash.library_id, SWITCH_LIBRARY_ID);
        assert_eq!(smash.install_dir, Some(PathBuf::from("D:/Switch/Smash")));
        assert!(smash.play_action.is_none());

        let homebrew = games
            .iter()
            .find(|g| g.external_id == "file:homebrew game")
            .unwrap();
        assert_eq!(homebrew.title, "Homebrew Game");
    }

    #[test]
    fn launch_action_uses_detected_emulator() {
        let emulator = DetectedEmulator {
            spec: SWITCH_EMULATORS[0],
            executable: Some(PathBuf::from("C:/Emu/Eden/eden.exe")),
            game_dirs: vec![],
            data_roots: vec![],
        };
        let files = vec![file("D:/Switch/Metroid Dread [010093801237C000][v0].nsp")];
        let games = build_games(&files, Some(&emulator));
        let action = games[0].play_action.as_ref().unwrap();
        assert_eq!(action.executable, "C:/Emu/Eden/eden.exe");
        assert_eq!(
            action.arguments,
            vec![
                "-f",
                "-g",
                "D:/Switch/Metroid Dread [010093801237C000][v0].nsp"
            ]
        );
        assert_eq!(action.working_dir, Some(PathBuf::from("C:/Emu/Eden")));
    }

    #[test]
    fn scans_folders_respecting_recursion_and_shared_dirs() {
        let root = std::env::temp_dir().join(format!("omnis_switch_scan_{}", std::process::id()));
        let nested = root.join("Pokemon");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(root.join("Game A [0100000000010000][v0].nsp"), b"").unwrap();
        std::fs::write(nested.join("Game B [0100ABF008968000][v0].XCI"), b"").unwrap();
        std::fs::write(root.join("notes.txt"), b"").unwrap();

        let flat = find_switch_files(&[GameDir {
            path: root.clone(),
            recursive: false,
        }]);
        assert_eq!(flat.len(), 1);

        // Same folder configured in two emulators, only the second one recursive
        let deep = find_switch_files(&[
            GameDir {
                path: root.clone(),
                recursive: false,
            },
            GameDir {
                path: root.clone(),
                recursive: true,
            },
        ]);
        assert_eq!(deep.len(), 2);
        assert!(deep.iter().all(|f| f.title_id.is_some()));

        let _ = std::fs::remove_dir_all(&root);
    }
}
