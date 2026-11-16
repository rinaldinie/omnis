//! Local scanner module for Amazon Games client and installed titles.
//!
//! Detects Amazon Games installations through Windows Registry, standard SQLite databases
//! (`DataStorage.db`, `GameInstall.sqlite`, `GameInstallInfo.sqlite`), and parses `fuel.json` manifests.

use omnis_sdk::{DiscoveredGame, LaunchConfiguration, PluginError, ProcessTrackingMode};
use rusqlite::{Connection, OpenFlags};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// Amazon Games launch protocol scheme
pub const AMAZON_GAMES_SCHEME: &str = "amazon-games://play";

/// Deserialized structure of an Amazon Games `fuel.json` manifest
#[derive(Debug, Clone, Deserialize, Default)]
pub struct FuelManifest {
    #[serde(rename = "Id", default)]
    pub id: Option<String>,
    #[serde(rename = "Title", default)]
    pub title: Option<String>,
    #[serde(rename = "Main", default)]
    pub main: Option<FuelMainSection>,
    #[serde(rename = "Command", default)]
    pub command: Option<String>,
    #[serde(rename = "Args", default)]
    pub args: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct FuelMainSection {
    #[serde(rename = "Command", default)]
    pub command: Option<String>,
    #[serde(rename = "WorkingSubdirOverride", default)]
    pub working_subdir_override: Option<String>,
    #[serde(rename = "Args", default)]
    pub args: Option<Vec<String>>,
}

/// Raw record extracted from Amazon Games SQLite databases
#[derive(Debug, Clone, Default)]
pub struct RawAmazonGameRecord {
    pub id: String,
    pub title: String,
    pub install_dir: Option<PathBuf>,
    pub main_executable: Option<String>,
    pub is_installed: bool,
    pub cover_url: Option<String>,
}

/// Detects the Amazon Games database or installation directory on the host system.
pub fn detect_amazon_games_installation() -> Option<PathBuf> {
    // 1. Check standard SQLite databases
    if let Some(db_path) = find_standard_database_path() {
        return Some(db_path);
    }

    // 2. Check Windows registry
    #[cfg(target_os = "windows")]
    {
        if let Some(reg_path) = detect_from_windows_registry() {
            return Some(reg_path);
        }
    }

    // 3. Fallback standard folders
    default_candidate_directories()
        .into_iter()
        .find(|candidate| candidate.exists())
}

/// Returns the standard default candidates for the Amazon Games SQLite database.
pub fn find_standard_database_path() -> Option<PathBuf> {
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        let base = PathBuf::from(local_appdata)
            .join("Amazon Games")
            .join("Data")
            .join("Games")
            .join("Sql");

        let candidates = [
            base.join("DataStorage.db"),
            base.join("GameInstall.sqlite"),
            base.join("GameInstallInfo.sqlite"),
        ];

        for path in candidates {
            if path.exists() && path.is_file() {
                return Some(path);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // WSL Check
        for drive in ['c', 'd', 'e'] {
            let base = PathBuf::from(format!(
                "/mnt/{}/Users",
                drive
            ));
            if let Ok(entries) = std::fs::read_dir(&base) {
                for entry in entries.flatten() {
                    let user_dir = entry.path();
                    let sql_dir = user_dir
                        .join("AppData")
                        .join("Local")
                        .join("Amazon Games")
                        .join("Data")
                        .join("Games")
                        .join("Sql");

                    for db_name in ["DataStorage.db", "GameInstall.sqlite", "GameInstallInfo.sqlite"] {
                        let p = sql_dir.join(db_name);
                        if p.exists() {
                            return Some(p);
                        }
                    }
                }
            }
        }
    }

    None
}

/// Detects Amazon Games installation path from Windows Registry
#[cfg(target_os = "windows")]
pub fn detect_from_windows_registry() -> Option<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let subkeys = [
        "SOFTWARE\\WOW6432Node\\Amazon\\Amazon Games",
        "SOFTWARE\\Amazon\\Amazon Games",
    ];

    for subkey in subkeys {
        if let Ok(key) = hklm.open_subkey_with_flags(subkey, KEY_READ) {
            for val_name in ["InstallDirectory", "Path", "AppPath", "DataPath"] {
                if let Ok(path_str) = key.get_value::<String, _>(val_name) {
                    let p = PathBuf::from(path_str);
                    if p.exists() {
                        return Some(p);
                    }
                }
            }
        }
    }

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey_with_flags("Software\\Amazon\\Amazon Games", KEY_READ) {
        for val_name in ["InstallDirectory", "Path", "AppPath", "DataPath"] {
            if let Ok(path_str) = key.get_value::<String, _>(val_name) {
                let p = PathBuf::from(path_str);
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    None
}

/// Fallback candidate directories where Amazon Games client or games might reside.
pub fn default_candidate_directories() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        dirs.push(PathBuf::from(local_appdata).join("Amazon Games"));
    }

    #[cfg(target_os = "windows")]
    {
        for drive in ['C', 'D', 'E', 'F'] {
            dirs.push(PathBuf::from(format!("{}:\\Amazon Games", drive)));
            dirs.push(PathBuf::from(format!("{}:\\Program Files\\Amazon Games", drive)));
            dirs.push(PathBuf::from(format!("{}:\\Program Files (x86)\\Amazon Games", drive)));
        }
    }

    dirs
}

/// Resolves the effective SQLite database path given optional custom paths.
pub fn resolve_database_path(custom_paths: &[PathBuf]) -> Option<PathBuf> {
    // 1. Search among explicit user custom paths
    for p in custom_paths {
        if p.is_file() {
            return Some(p.clone());
        }
        if p.is_dir() {
            for db_name in ["DataStorage.db", "GameInstall.sqlite", "GameInstallInfo.sqlite"] {
                let cand = p.join(db_name);
                if cand.is_file() {
                    return Some(cand);
                }
                let cand_sub = p.join("Data").join("Games").join("Sql").join(db_name);
                if cand_sub.is_file() {
                    return Some(cand_sub);
                }
            }
        }
    }

    // 2. Standard location
    find_standard_database_path()
}

/// Opens an SQLite database safely in read-only mode, with fallback to an ephemeral copy
/// if the client process currently holds a file lock.
pub fn open_sqlite_readonly(db_path: &Path) -> Result<Connection, PluginError> {
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY
        | OpenFlags::SQLITE_OPEN_NO_MUTEX
        | OpenFlags::SQLITE_OPEN_URI;

    // Direct read-only connection attempt
    if let Ok(conn) = Connection::open_with_flags(db_path, flags) {
        let _ = conn.execute_batch("PRAGMA query_only = ON; PRAGMA busy_timeout = 3000;");
        return Ok(conn);
    }

    // Fallback: Copy to temporary file in case of active exclusive lock from client
    let temp_dir = std::env::temp_dir();
    let temp_copy = temp_dir.join(format!(
        "omnis_amazon_db_snapshot_{}.db",
        std::process::id()
    ));

    if std::fs::copy(db_path, &temp_copy).is_ok() {
        let res = Connection::open_with_flags(&temp_copy, flags);
        let _ = std::fs::remove_file(&temp_copy);
        if let Ok(conn) = res {
            let _ = conn.execute_batch("PRAGMA query_only = ON; PRAGMA busy_timeout = 3000;");
            return Ok(conn);
        }
    }

    Err(PluginError::Io(format!(
        "Impossibile aprire il database SQLite di Amazon Games in sola lettura: {:?}",
        db_path
    )))
}

/// Parses any `fuel.json` found directly in a game directory
pub fn parse_fuel_manifest(game_dir: &Path) -> Option<FuelManifest> {
    let fuel_file = game_dir.join("fuel.json");
    if !fuel_file.is_file() {
        return None;
    }

    let content = std::fs::read_to_string(&fuel_file).ok()?;
    serde_json::from_str::<FuelManifest>(&content).ok()
}

/// Searches a game directory for the primary executable file.
pub fn find_primary_executable(game_dir: &Path, preferred_name: Option<&str>) -> Option<PathBuf> {
    if !game_dir.is_dir() {
        return None;
    }

    // If preferred name was provided, try it directly
    if let Some(pref) = preferred_name {
        let trimmed = pref.trim().trim_matches('"');
        if !trimmed.is_empty() {
            let candidate = if Path::new(trimmed).is_absolute() {
                PathBuf::from(trimmed)
            } else {
                game_dir.join(trimmed)
            };
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    // Inspect direct game directory and immediate subdirectories for .exe
    let mut exes = Vec::new();
    let mut search_dirs = vec![game_dir.to_path_buf()];

    for sub in ["bin", "Binaries", "Binaries/Win64", "bin/x64", "x64"] {
        let p = game_dir.join(sub);
        if p.is_dir() {
            search_dirs.push(p);
        }
    }

    for dir in search_dirs {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() && p.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("exe")) {
                    let file_name = p
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    // Filter out crash reporters, installers, uninstallers
                    if file_name.starts_with("unins")
                        || file_name.starts_with("crash")
                        || file_name.starts_with("unitycrash")
                        || file_name.starts_with("ue4prereq")
                        || file_name.starts_with("dxsetup")
                        || file_name.starts_with("vcredist")
                    {
                        continue;
                    }

                    exes.push(p);
                }
            }
        }
    }

    exes.into_iter().next()
}

/// Inspects tables in the SQLite database and reads installed product records.
pub fn extract_games_from_connection(conn: &Connection) -> Vec<RawAmazonGameRecord> {
    let mut results = Vec::new();

    // Query tables in the database
    let mut stmt = match conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'") {
        Ok(s) => s,
        Err(_) => return results,
    };

    let table_names: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default();

    for table in table_names {
        // Inspect table columns via PRAGMA
        let pragma_sql = format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\""));
        let mut pragma_stmt = match conn.prepare(&pragma_sql) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let columns: Vec<String> = pragma_stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map(|rows| rows.flatten().map(|c| c.to_lowercase()).collect())
            .unwrap_or_default();

        let has_key = columns.iter().any(|c| c == "key");
        let has_val = columns.iter().any(|c| c == "value" || c == "data");

        // Case A: Key-Value / JSON blob storage
        if has_key && has_val {
            let val_col = if columns.iter().any(|c| c == "value") { "value" } else { "data" };
            let query = format!("SELECT \"{}\" FROM \"{}\"", val_col, table.replace('"', "\"\""));
            if let Ok(mut query_stmt) = conn.prepare(&query) {
                let rows = query_stmt.query_map([], |row| row.get::<_, String>(0));
                if let Ok(rows) = rows {
                    for json_str in rows.flatten() {
                        if let Some(record) = parse_json_product_record(&json_str) {
                            results.push(record);
                        }
                    }
                }
            }
            continue;
        }

        // Case B: Relational schema
        let id_col = columns.iter().find(|c| {
            matches!(
                c.as_str(),
                "id" | "productid" | "product_id" | "asin" | "itemid" | "item_id"
            )
        });
        let title_col = columns.iter().find(|c| {
            matches!(
                c.as_str(),
                "producttitle" | "product_title" | "title" | "name" | "displayname"
            )
        });
        let path_col = columns.iter().find(|c| {
            matches!(
                c.as_str(),
                "installdirectory"
                    | "install_directory"
                    | "installdir"
                    | "install_dir"
                    | "path"
                    | "installationdirectory"
            )
        });
        let exe_col = columns.iter().find(|c| {
            matches!(
                c.as_str(),
                "mainexecutable" | "main_executable" | "executable" | "exe" | "command"
            )
        });
        let installed_col = columns.iter().find(|c| {
            matches!(
                c.as_str(),
                "installed" | "isinstalled" | "is_installed" | "installstate"
            )
        });

        if let (Some(id_name), Some(title_name)) = (id_col, title_col) {
            let p_col = path_col.map(|s| format!("\"{}\"", s)).unwrap_or_else(|| "''".to_string());
            let e_col = exe_col.map(|s| format!("\"{}\"", s)).unwrap_or_else(|| "''".to_string());
            let i_col = installed_col.map(|s| format!("\"{}\"", s)).unwrap_or_else(|| "1".to_string());

            let select_sql = format!(
                "SELECT \"{}\", \"{}\", {}, {}, {} FROM \"{}\"",
                id_name,
                title_name,
                p_col,
                e_col,
                i_col,
                table.replace('"', "\"\"")
            );

            if let Ok(mut sel_stmt) = conn.prepare(&select_sql) {
                let rows = sel_stmt.query_map([], |row| {
                    let id: String = row.get(0)?;
                    let title: String = row.get(1)?;
                    let path_str: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
                    let exe_str: String = row.get::<_, Option<String>>(3)?.unwrap_or_default();
                    let installed_raw: i64 = row.get::<_, Option<i64>>(4)?.unwrap_or(1);

                    Ok(RawAmazonGameRecord {
                        id,
                        title,
                        install_dir: if path_str.trim().is_empty() {
                            None
                        } else {
                            Some(PathBuf::from(path_str))
                        },
                        main_executable: if exe_str.trim().is_empty() {
                            None
                        } else {
                            Some(exe_str)
                        },
                        is_installed: installed_raw != 0,
                        cover_url: None,
                    })
                });

                if let Ok(rows) = rows {
                    for r in rows.flatten() {
                        results.push(r);
                    }
                }
            }
        }
    }

    results
}

/// Attempts to parse a JSON blob from key-value tables into a RawAmazonGameRecord.
fn parse_json_product_record(json_str: &str) -> Option<RawAmazonGameRecord> {
    let val: serde_json::Value = serde_json::from_str(json_str).ok()?;
    let obj = val.as_object()?;

    let id = obj
        .get("Id")
        .or_else(|| obj.get("id"))
        .or_else(|| obj.get("ProductId"))
        .or_else(|| obj.get("productId"))
        .and_then(|v| v.as_str())?
        .to_string();

    let title = obj
        .get("ProductTitle")
        .or_else(|| obj.get("productTitle"))
        .or_else(|| obj.get("Title"))
        .or_else(|| obj.get("title"))
        .or_else(|| obj.get("name"))
        .and_then(|v| v.as_str())?
        .to_string();

    let install_dir = obj
        .get("InstallDirectory")
        .or_else(|| obj.get("installDirectory"))
        .or_else(|| obj.get("install_dir"))
        .or_else(|| obj.get("path"))
        .and_then(|v| v.as_str())
        .map(PathBuf::from);

    let main_executable = obj
        .get("MainExecutable")
        .or_else(|| obj.get("mainExecutable"))
        .or_else(|| obj.get("executable"))
        .or_else(|| obj.get("command"))
        .and_then(|v| v.as_str())
        .map(String::from);

    let is_installed = obj
        .get("Installed")
        .or_else(|| obj.get("installed"))
        .or_else(|| obj.get("isInstalled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    Some(RawAmazonGameRecord {
        id,
        title,
        install_dir,
        main_executable,
        is_installed,
        cover_url: None,
    })
}

/// Builds a `DiscoveredGame` from an extracted raw record and optional `fuel.json` enrichment.
pub fn build_discovered_game(
    mut record: RawAmazonGameRecord,
    prefer_direct_launch: bool,
) -> DiscoveredGame {
    let mut arguments: Vec<String> = Vec::new();
    let mut working_dir: Option<PathBuf> = None;
    let mut resolved_exe_path: Option<PathBuf> = None;

    // 1. Inspect install_dir for fuel.json and executables if directory exists
    if let Some(ref dir) = record.install_dir {
        if dir.exists() {
            if let Some(fuel) = parse_fuel_manifest(dir) {
                if let Some(fuel_id) = fuel.id {
                    if record.id.is_empty() {
                        record.id = fuel_id;
                    }
                }
                if let Some(fuel_title) = fuel.title {
                    if record.title.is_empty() {
                        record.title = fuel_title;
                    }
                }

                if let Some(main) = fuel.main {
                    if let Some(cmd) = main.command {
                        record.main_executable = Some(cmd);
                    }
                    if let Some(subdir) = main.working_subdir_override {
                        working_dir = Some(dir.join(subdir));
                    }
                    if let Some(args) = main.args {
                        arguments = args;
                    }
                } else if let Some(cmd) = fuel.command {
                    record.main_executable = Some(cmd);
                    if let Some(args) = fuel.args {
                        arguments = args;
                    }
                }
            }

            // Resolve binary executable path
            resolved_exe_path = find_primary_executable(dir, record.main_executable.as_deref());
        }
    }

    let is_installed = record.is_installed
        || record
            .install_dir
            .as_ref()
            .map(|p| p.exists())
            .unwrap_or(false);

    let exe_filename = resolved_exe_path
        .as_ref()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .or(record.main_executable.as_deref())
        .unwrap_or("game.exe")
        .to_string();

    let tracking_mode = if let Some(ref exe_path) = resolved_exe_path {
        let name = exe_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&exe_filename);
        ProcessTrackingMode::ProcessName(name.to_string())
    } else if let Some(ref main_exe) = record.main_executable {
        let name = Path::new(main_exe)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(main_exe.as_str());
        ProcessTrackingMode::ProcessName(name.to_string())
    } else if let Some(ref dir) = record.install_dir {
        ProcessTrackingMode::WatchDirectory(dir.clone())
    } else {
        ProcessTrackingMode::KernelJobObject
    };

    let play_action = if is_installed {
        if prefer_direct_launch {
            if let Some(exe) = resolved_exe_path {
                let effective_wd = working_dir.or_else(|| exe.parent().map(|p| p.to_path_buf()));
                Some(LaunchConfiguration {
                    executable: exe.to_string_lossy().to_string(),
                    arguments,
                    working_dir: effective_wd,
                    tracking_mode,
                })
            } else {
                Some(LaunchConfiguration {
                    executable: format!("{}/{}", AMAZON_GAMES_SCHEME, record.id),
                    arguments: vec![],
                    working_dir: record.install_dir.clone(),
                    tracking_mode,
                })
            }
        } else {
            // Standard Amazon Games URL scheme launch
            Some(LaunchConfiguration {
                executable: format!("{}/{}", AMAZON_GAMES_SCHEME, record.id),
                arguments: vec![],
                working_dir: record.install_dir.clone(),
                tracking_mode,
            })
        }
    } else {
        None
    };

    DiscoveredGame {
        library_id: "amazon".to_string(),
        external_id: record.id,
        title: record.title.trim().to_string(),
        install_dir: record.install_dir,
        is_installed,
        play_action,
        playtime_seconds: 0,
        play_count: 0,
        last_activity: None,
        cover_image_path: record.cover_url,
        background_image_path: None,
    }
}

/// Scans local Amazon Games installations across detected database files and configured directories.
pub fn scan_local_games(
    custom_paths: &[PathBuf],
    prefer_direct_launch: bool,
) -> Vec<DiscoveredGame> {
    let mut discovered: HashMap<String, DiscoveredGame> = HashMap::new();
    let mut scanned_dirs: HashSet<PathBuf> = HashSet::new();

    // 1. Scan SQLite database if resolved
    if let Some(db_path) = resolve_database_path(custom_paths) {
        tracing::info!("Scanning Amazon Games database: {:?}", db_path);
        if let Ok(conn) = open_sqlite_readonly(&db_path) {
            let records = extract_games_from_connection(&conn);
            for rec in records {
                if let Some(ref dir) = rec.install_dir {
                    scanned_dirs.insert(dir.clone());
                }
                let game = build_discovered_game(rec, prefer_direct_launch);
                if !game.external_id.is_empty() {
                    discovered.insert(game.external_id.clone(), game);
                }
            }
        }
    }

    // 2. Scan custom paths and fallback directories for standalone fuel.json manifests
    let mut candidate_folders = Vec::new();
    for p in custom_paths {
        if p.is_dir() {
            candidate_folders.push(p.clone());
        }
    }
    candidate_folders.extend(default_candidate_directories());

    for folder in candidate_folders {
        if !folder.is_dir() {
            continue;
        }

        // Direct check: folder itself is a game with fuel.json
        if !scanned_dirs.contains(&folder) {
            if let Some(fuel) = parse_fuel_manifest(&folder) {
                let id = fuel.id.clone().unwrap_or_else(|| {
                    folder
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("amazon_game")
                        .to_string()
                });
                let title = fuel.title.clone().unwrap_or_else(|| id.clone());

                let raw = RawAmazonGameRecord {
                    id: id.clone(),
                    title,
                    install_dir: Some(folder.clone()),
                    main_executable: fuel.main.and_then(|m| m.command).or(fuel.command),
                    is_installed: true,
                    cover_url: None,
                };
                let game = build_discovered_game(raw, prefer_direct_launch);
                discovered.entry(id).or_insert(game);
                scanned_dirs.insert(folder.clone());
                continue;
            }
        }

        // Check immediate subdirectories (e.g. C:\Amazon Games\<GameName>)
        if let Ok(entries) = std::fs::read_dir(&folder) {
            for entry in entries.flatten() {
                let sub = entry.path();
                if sub.is_dir() && !scanned_dirs.contains(&sub) {
                    if let Some(fuel) = parse_fuel_manifest(&sub) {
                        let id = fuel.id.clone().unwrap_or_else(|| {
                            sub.file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("amazon_game")
                                .to_string()
                        });
                        let title = fuel.title.clone().unwrap_or_else(|| id.clone());

                        let raw = RawAmazonGameRecord {
                            id: id.clone(),
                            title,
                            install_dir: Some(sub.clone()),
                            main_executable: fuel.main.and_then(|m| m.command).or(fuel.command),
                            is_installed: true,
                            cover_url: None,
                        };
                        let game = build_discovered_game(raw, prefer_direct_launch);
                        discovered.entry(id).or_insert(game);
                        scanned_dirs.insert(sub);
                    }
                }
            }
        }
    }

    discovered.into_values().collect()
}
