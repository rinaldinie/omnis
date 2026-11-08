pub mod process_control;
pub use process_control::*;

#[cfg(test)]
mod tests;

use omnis_sdk::{LaunchConfiguration, ProcessTrackingMode};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{Pid, System};
use thiserror::Error;
use tokio::process::Command;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum LaunchError {
    #[error("Failed to spawn process: {0}")]
    SpawnFailed(#[from] std::io::Error),
    #[error("Invalid executable path: {0}")]
    InvalidPath(String),
    #[error("Game process not found within timeout")]
    ProcessNotFound,
    #[error("Process monitoring error: {0}")]
    MonitoringFailed(String),
}

/// How long a launcher trampoline is given to hand the session over to the real game process.
///
/// Store clients frequently spawn the game and exit within a second or two; without a handoff
/// window the session would be recorded as a few seconds long and the host would bring its own
/// window back over a game that is still starting up.
const TRAMPOLINE_HANDOFF_SECS: u64 = 10;

/// Lifecycle phase of a tracked game process, reported to the host while the session runs.
///
/// A plain session reports `Running` once and `Exiting` once. Launcher trampolines produce more
/// transitions: every `Exiting` may be followed by another `Running` when a replacement process
/// takes over within the exit grace window, so the host must treat these as a state machine
/// rather than as one-shot notifications.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrackingPhase {
    /// A game process is live. `pid` is 0 when the title could not be tied to any local process.
    Running(u32),
    /// The tracked process terminated. The exit grace window is now open, so a further `Running`
    /// phase may still follow.
    Exiting,
}

/// Host callback invoked on every tracking phase transition. Must be cheap and must not block.
pub type PhaseCallback = Arc<dyn Fn(TrackingPhase) + Send + Sync>;

/// Builds a phase callback that discards every transition.
pub fn noop_phase_callback() -> PhaseCallback {
    Arc::new(|_| {})
}

/// Blacklist of common helper processes, redistributable installers, and crash reporters
/// that must NEVER be identified as the main game process (Requirement A4).
pub const BLACKLISTED_PROCESS_NAMES: &[&str] = &[
    // Installers & runtimes
    "vcredist_x86.exe",
    "vcredist_x64.exe",
    "vc_redist.x86.exe",
    "vc_redist.x64.exe",
    "dxsetup.exe",
    "dotnetfx.exe",
    "dotnetfx35.exe",
    "oalinst.exe",
    "directx_setup.exe",
    // Crash reporters & diagnostics
    "unitycrashhandler64.exe",
    "unitycrashhandler32.exe",
    "crashreportclient.exe",
    "werfault.exe",
    "bslogreporter.exe",
    "unrealcefsubprocess.exe",
    "steamerrorreporter.exe",
    // Anti-cheat setup helpers
    "easyanticheat_setup.exe",
    "battleye_setup.exe",
    "eadesktopinstaller.exe",
    // Shell & launcher wrappers
    "redprelauncher.exe",
    "eadefinitiveinstaller.exe",
    "cmd.exe",
    "conhost.exe",
    "powershell.exe",
    "rundll32.exe",
];

/// Checks if a process name matches any known blacklisted background or installer binary
pub fn is_blacklisted_process(name: &str) -> bool {
    let lower = name.to_lowercase();
    let clean = lower.strip_suffix(".exe").unwrap_or(&lower);

    // Filter out common installers, updaters, and redistributable setup binaries
    if clean.contains("installer")
        || clean.contains("setup")
        || clean.contains("unins")
        || clean.contains("vcredist")
        || clean.contains("dxsetup")
        || clean.contains("crashreporter")
        || clean.contains("crashreport")
        || clean.contains("crashhandler")
    {
        return true;
    }

    BLACKLISTED_PROCESS_NAMES.iter().any(|b| {
        let b_clean = b.strip_suffix(".exe").unwrap_or(b);
        lower == *b || clean == b_clean || lower.ends_with(b)
    })
}

/// Query the full image path of a process using PROCESS_QUERY_LIMITED_INFORMATION
/// to safely support elevated or anti-cheat protected game processes without ACCESS_DENIED crashes (Requirement A2).
#[cfg(windows)]
pub fn get_process_image_path(pid: u32) -> Option<PathBuf> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe {
        if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut buffer = [0u16; 1024];
            let mut size = buffer.len() as u32;
            let success = QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_FORMAT(0),
                windows::core::PWSTR(buffer.as_mut_ptr()),
                &mut size,
            );
            let _ = CloseHandle(handle);

            if success.is_ok() && size > 0 {
                let path_str = String::from_utf16_lossy(&buffer[..size as usize]);
                return Some(PathBuf::from(path_str));
            }
        }
    }
    None
}

#[cfg(not(windows))]
pub fn get_process_image_path(pid: u32) -> Option<PathBuf> {
    let mut sys = System::new();
    let sys_pid = Pid::from(pid as usize);
    if sys.refresh_process(sys_pid) {
        return sys
            .process(sys_pid)
            .and_then(|p| p.exe().map(|e| e.to_path_buf()));
    }
    None
}

/// Store-specific heuristic: Read HKCU\Software\Valve\Steam\RunningAppID on Windows (Requirement A7)
#[cfg(windows)]
pub fn get_steam_running_appid() -> Option<u64> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ, REG_DWORD,
        REG_VALUE_TYPE,
    };

    unsafe {
        let mut hkey = HKEY::default();
        let subkey: Vec<u16> = "Software\\Valve\\Steam\0".encode_utf16().collect();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey.as_ptr()),
            0,
            KEY_READ,
            &mut hkey,
        )
        .is_ok()
        {
            let val_name: Vec<u16> = "RunningAppID\0".encode_utf16().collect();
            let mut app_id: u32 = 0;
            let mut val_type = REG_VALUE_TYPE::default();
            let mut data_len = std::mem::size_of::<u32>() as u32;

            let res = RegQueryValueExW(
                hkey,
                PCWSTR(val_name.as_ptr()),
                None,
                Some(&mut val_type),
                Some(&mut app_id as *mut u32 as *mut u8),
                Some(&mut data_len),
            );
            let _ = RegCloseKey(hkey);

            if res.is_ok() && val_type == REG_DWORD && app_id > 0 {
                return Some(app_id as u64);
            }
        }
    }
    None
}

#[cfg(not(windows))]
pub fn get_steam_running_appid() -> Option<u64> {
    None
}

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

/// Heuristic: Locate primary game executable from an install directory by scanning for valid, non-blacklisted binaries
pub fn find_primary_game_executable(install_dir: &Path) -> Option<PathBuf> {
    if !install_dir.is_dir() {
        return None;
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

    // Prefer candidate in shallower directory depth (root of install folder)
    candidates.sort_by_key(|p| p.components().count());
    candidates.into_iter().next()
}

/// Helper function to detect if a launch configuration is a shell/URI invocation
pub fn is_uri_command(config: &LaunchConfiguration) -> bool {
    if is_launch_uri(&config.executable) {
        return true;
    }

    let exe = config.executable.to_lowercase();
    let is_cmd = exe.ends_with("cmd.exe") || exe == "cmd";
    let is_start = config
        .arguments
        .iter()
        .any(|a| a.eq_ignore_ascii_case("start"));
    if is_cmd && is_start {
        return true;
    }
    if exe == "xdg-open" || exe == "open" {
        return true;
    }

    // Synthesized Windows protocol dispatch: rundll32.exe url.dll,FileProtocolHandler <uri>
    if exe.ends_with("rundll32.exe")
        && config
            .arguments
            .iter()
            .any(|a| a.to_lowercase().contains("fileprotocolhandler"))
    {
        return true;
    }

    // GOG Galaxy Client CLI dispatcher: GalaxyClient.exe /command=runGame ...
    if exe.ends_with("galaxyclient.exe") || exe == "galaxyclient" {
        return true;
    }

    false
}

/// Returns true when a launch target is a protocol URI (`steam://`, `com.epicgames.launcher://`,
/// `ms-windows-store://`, ...) rather than a filesystem path.
///
/// Store plugins may place the URI directly in `LaunchConfiguration::executable`. Spawning that
/// string as a program can never succeed, so it has to be handed to the OS protocol handler.
pub fn is_launch_uri(value: &str) -> bool {
    let Some(idx) = value.find("://") else {
        return false;
    };
    let scheme = &value[..idx];
    // A single-character scheme is a Windows drive letter ("C://Games"), never a protocol
    if scheme.len() < 2 {
        return false;
    }
    scheme
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '+' | '-'))
}

/// Helper function to check if child path is located within parent directory,
/// with support for case-insensitivity, \\?\ verbatim prefixes and junction resolution (Requirement A3).
pub fn path_contains(parent: &Path, child: &Path) -> bool {
    let parent_canon = parent
        .canonicalize()
        .unwrap_or_else(|_| parent.to_path_buf());
    let child_canon = child.canonicalize().unwrap_or_else(|_| child.to_path_buf());

    let mut p_str = parent_canon
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase();
    let mut c_str = child_canon
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase();

    // Strip verbatim Windows prefixes
    if let Some(stripped) = p_str.strip_prefix(r"\\?\unc\") {
        p_str = format!(r"\\{}", stripped);
    } else if let Some(stripped) = p_str.strip_prefix(r"\\?\") {
        p_str = stripped.to_string();
    }

    if let Some(stripped) = c_str.strip_prefix(r"\\?\unc\") {
        c_str = format!(r"\\{}", stripped);
    } else if let Some(stripped) = c_str.strip_prefix(r"\\?\") {
        c_str = stripped.to_string();
    }

    let p_trimmed = p_str.trim_end_matches('\\');
    if c_str == p_trimmed {
        return true;
    }
    if let Some(remainder) = c_str.strip_prefix(p_trimmed) {
        if remainder.starts_with('\\') {
            return true;
        }
    }
    false
}

/// Reduces a tracking target to a bare process file name.
///
/// Plugins may hand over a path-qualified executable: Epic manifests store the launch target as
/// `Game/Binaries/Win64/Game.exe` relative to the install location. Such a string can never equal
/// a running process name, so the directory part has to be dropped before matching.
pub fn process_file_name(value: &str) -> &str {
    value.rsplit(['/', '\\']).next().unwrap_or(value)
}

/// Helper function to determine if a running process matches target criteria,
/// strictly enforcing the process blacklist (Requirement A4).
pub fn matches_target(
    proc: &sysinfo::Process,
    target_name: Option<&str>,
    target_dir: Option<&Path>,
) -> bool {
    let p_name = proc.name();

    // Filter out blacklisted helper processes immediately
    if is_blacklisted_process(p_name) {
        return false;
    }

    // Try reading the full process path (via PROCESS_QUERY_LIMITED_INFORMATION)
    let pid_u32 = proc.pid().as_u32();
    let real_exe = get_process_image_path(pid_u32).or_else(|| proc.exe().map(|e| e.to_path_buf()));

    if let Some(ref exe_path) = real_exe {
        if let Some(file_name) = exe_path.file_name().and_then(|n| n.to_str()) {
            if is_blacklisted_process(file_name) {
                return false;
            }
        }
    }

    // 1. If target_dir is specified and real executable path is available, verify directory containment.
    // Any non-blacklisted executable located inside the target install directory belongs to the game
    // (e.g. Control_DX12.exe or Control_DX11.exe when launched from Control's install dir).
    if let Some(dir) = target_dir {
        if let Some(ref exe_path) = real_exe {
            if path_contains(dir, exe_path) {
                return true;
            }
        }
    }

    // 2. If target_name is specified, check process name with exact and variant matching
    if let Some(name) = target_name {
        let name_clean = name.strip_suffix(".exe").unwrap_or(name);
        let p_name_clean = p_name.strip_suffix(".exe").unwrap_or(p_name);
        let exact_match =
            p_name.eq_ignore_ascii_case(name) || p_name_clean.eq_ignore_ascii_case(name_clean);

        let variant_match = if name_clean.len() >= 3 {
            p_name_clean
                .to_lowercase()
                .starts_with(&format!("{}_", name_clean.to_lowercase()))
                || p_name_clean
                    .to_lowercase()
                    .starts_with(&format!("{}-", name_clean.to_lowercase()))
                || name_clean
                    .to_lowercase()
                    .starts_with(&format!("{}_", p_name_clean.to_lowercase()))
                || name_clean
                    .to_lowercase()
                    .starts_with(&format!("{}-", p_name_clean.to_lowercase()))
        } else {
            false
        };

        if exact_match || variant_match {
            // If target_dir is also specified and exe path is available, verify path containment
            if let Some(dir) = target_dir {
                if let Some(ref exe_path) = real_exe {
                    return path_contains(dir, exe_path);
                }
            }
            return true;
        }
    }

    // 3. Only target_dir is provided (e.g. WatchDirectory mode without specific exe name)
    if let Some(dir) = target_dir {
        if let Some(ref exe_path) = real_exe {
            return path_contains(dir, exe_path);
        }
    }

    false
}

/// Kernel-level process termination wait: parks the waiting thread in the OS kernel
/// via WaitForSingleObject with SYNCHRONIZE rights, achieving TRUE 0% CPU consumption (Requirement A1).
#[cfg(windows)]
pub async fn wait_for_process_exit_kernel(pid: u32) -> Result<(), String> {
    use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
    use windows::Win32::System::Threading::{
        OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE,
    };

    let wait_res = tokio::task::spawn_blocking(move || unsafe {
        let handle_res = OpenProcess(PROCESS_SYNCHRONIZE, false, pid);
        let handle = match handle_res {
            Ok(h) => h,
            Err(_) => return WAIT_OBJECT_0,
        };
        let status = WaitForSingleObject(handle, INFINITE);
        let _ = CloseHandle(handle);
        status
    })
    .await
    .map_err(|e| e.to_string())?;

    if wait_res == WAIT_OBJECT_0 {
        Ok(())
    } else {
        Err(format!(
            "WaitForSingleObject returned status: {:?}",
            wait_res
        ))
    }
}

#[cfg(not(windows))]
pub async fn wait_for_process_exit_kernel(pid: u32) -> Result<(), String> {
    let mut sys = System::new();
    let sys_pid = Pid::from(pid as usize);
    loop {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if !sys.refresh_process(sys_pid) {
            break;
        }
    }
    Ok(())
}

/// Calculates the total resident memory in bytes of a process and ALL its descendants.
/// Correctly accounts for multi-process architectures such as Chromium/WebView2,
/// game launchers, anti-cheat wrappers, and worker subprocesses.
pub fn get_process_tree_memory_bytes(root_pid: u32) -> u64 {
    let mut sys = System::new();
    sys.refresh_processes();
    get_process_tree_memory_from_system(&sys, root_pid)
}

/// Calculates the total resident memory given an existing sysinfo::System snapshot in O(N) single-pass traversal.
pub fn get_process_tree_memory_from_system(sys: &System, root_pid: u32) -> u64 {
    let target_pid = Pid::from(root_pid as usize);
    let mut children_map: std::collections::HashMap<Pid, Vec<Pid>> =
        std::collections::HashMap::new();

    for (pid, proc) in sys.processes() {
        if let Some(parent) = proc.parent() {
            children_map.entry(parent).or_default().push(*pid);
        }
    }

    let mut total_bytes = 0u64;
    let mut queue = std::collections::VecDeque::new();
    let mut visited = std::collections::HashSet::new();

    queue.push_back(target_pid);
    visited.insert(target_pid);

    while let Some(current) = queue.pop_front() {
        if let Some(proc) = sys.process(current) {
            total_bytes = total_bytes.saturating_add(proc.memory());
        }
        if let Some(children) = children_map.get(&current) {
            for child in children {
                if visited.insert(*child) {
                    queue.push_back(*child);
                }
            }
        }
    }

    total_bytes
}

/// Returns the total memory in bytes consumed by the Omnis host process and all its
/// WebView2 / helper child processes.
pub fn get_current_app_memory_bytes() -> u64 {
    get_process_tree_memory_bytes(std::process::id())
}

/// High-performance process runner & monitoring engine for Omnis
pub struct GameLauncher;

pub mod tracker;
pub use tracker::ProcessTracker;

impl GameLauncher {
    fn resolve_target_name(
        config: &LaunchConfiguration,
        install_dir: Option<&Path>,
    ) -> Option<String> {
        match &config.tracking_mode {
            ProcessTrackingMode::ProcessName(name) => Some(process_file_name(name).to_string()),
            ProcessTrackingMode::WatchDirectory(_) => None,
            _ => install_dir.and_then(|dir| {
                find_gog_game_executable(dir)
                    .or_else(|| find_primary_game_executable(dir))
                    .and_then(|p| {
                        p.file_name()
                            .and_then(|f| f.to_str())
                            .map(|s| s.to_string())
                    })
            }),
        }
    }

    fn resolve_target_dir(
        config: &LaunchConfiguration,
        install_dir: Option<PathBuf>,
    ) -> Option<PathBuf> {
        install_dir.or_else(|| match &config.tracking_mode {
            ProcessTrackingMode::WatchDirectory(dir) => Some(dir.clone()),
            _ => config.working_dir.clone(),
        })
    }

    /// Launches a game executable with real-time process monitoring, hybrid scan+kernel wait,
    /// and exit grace period handoff (Requirements A1, A5, A6).
    ///
    /// Only process startup is reported. Hosts that need to know when the game exits *before* the
    /// exit grace window elapses should use [`Self::launch_and_track_with_phases`] instead.
    pub async fn launch_and_track<F>(
        game_id: Uuid,
        config: LaunchConfiguration,
        install_dir: Option<PathBuf>,
        on_started: F,
    ) -> Result<u64, LaunchError>
    where
        F: FnOnce(u32) + Send + 'static,
    {
        let on_started = std::sync::Mutex::new(Some(on_started));
        let on_phase: PhaseCallback = Arc::new(move |phase| {
            if let TrackingPhase::Running(pid) = phase {
                if let Ok(mut slot) = on_started.lock() {
                    if let Some(callback) = slot.take() {
                        callback(pid);
                    }
                }
            }
        });
        Self::launch_and_track_with_phases(game_id, config, install_dir, on_phase).await
    }

    /// Launches a game and reports every tracking phase transition to `on_phase`.
    ///
    /// The exit phase is reported the instant the kernel signals the process death, before the
    /// grace window that waits for a possible replacement process. A host can therefore cover the
    /// screen for exactly as long as no game window is up, instead of guessing at fixed delays.
    pub async fn launch_and_track_with_phases(
        game_id: Uuid,
        config: LaunchConfiguration,
        install_dir: Option<PathBuf>,
        on_phase: PhaseCallback,
    ) -> Result<u64, LaunchError> {
        let target_name = Self::resolve_target_name(&config, install_dir.as_deref());
        let target_dir = Self::resolve_target_dir(&config, install_dir);

        if is_uri_command(&config) {
            Self::launch_and_track_uri(game_id, config, target_name, target_dir, on_phase).await
        } else {
            Self::launch_and_track_binary(config, target_name, target_dir, on_phase).await
        }
    }

    /// Launches a URI/shell game command and tracks its lifecycle using process polling or Steam AppID detection.
    pub async fn launch_and_track_uri(
        game_id: Uuid,
        config: LaunchConfiguration,
        target_name: Option<String>,
        target_dir: Option<PathBuf>,
        on_phase: PhaseCallback,
    ) -> Result<u64, LaunchError> {
        ProcessTracker::spawn_uri_command(&config).await?;

        // The AppID may sit in the executable (plugin-provided URI) or in the arguments
        // (synthesized `cmd /c start "" steam://...` dispatch), so both are scanned.
        #[cfg(windows)]
        let steam_appid: Option<u64> = std::iter::once(&config.executable)
            .chain(config.arguments.iter())
            .find_map(|arg| {
                let pos = arg.find("steam://rungameid/")?;
                let id_part = &arg[pos + "steam://rungameid/".len()..];
                let clean_id: String = id_part.chars().take_while(|c| c.is_ascii_digit()).collect();
                clean_id.parse::<u64>().ok()
            });

        #[cfg(windows)]
        if let Some(appid) = steam_appid {
            if let Some(duration) = Self::track_steam_session(
                appid,
                target_name.as_deref(),
                target_dir.as_deref(),
                &on_phase,
            )
            .await
            {
                return Ok(duration);
            }
        }

        if target_name.is_none() && target_dir.is_none() {
            // Nothing identifies the game process (e.g. a UWP/Xbox title with no install directory):
            // the store client owns the session from here and there is nothing left to wait for.
            tracing::warn!(
                "Game {} has no trackable process name or directory: session will not be timed",
                game_id
            );
            on_phase(TrackingPhase::Running(0));
            on_phase(TrackingPhase::Exiting);
            return Ok(0);
        }

        let real_pid = match ProcessTracker::detect_process(
            target_name.as_deref(),
            target_dir.as_deref(),
            Duration::from_secs(90),
        )
        .await
        {
            Some(pid) => pid,
            None => {
                tracing::warn!(
                    "Grace period timeout: no process found for game {}",
                    game_id
                );
                on_phase(TrackingPhase::Exiting);
                return Err(LaunchError::ProcessNotFound);
            }
        };

        let detection_time = Instant::now();
        on_phase(TrackingPhase::Running(real_pid));

        ProcessTracker::track_until_exit(
            real_pid,
            target_name.as_deref(),
            target_dir.as_deref(),
            &on_phase,
        )
        .await;

        Ok(detection_time.elapsed().as_secs())
    }

    /// Tracks a title launched through the Steam client.
    ///
    /// Returns `Some(duration)` once Steam has reported the AppID as running, or `None` when Steam
    /// never picked the launch up, in which case the caller falls back to plain process scanning.
    ///
    /// A real PID is preferred over Steam's `RunningAppID`: the kernel signals the exit instantly,
    /// whereas the registry value lingers for seconds after the game window is already gone.
    #[cfg(windows)]
    async fn track_steam_session(
        appid: u64,
        target_name: Option<&str>,
        target_dir: Option<&Path>,
        on_phase: &PhaseCallback,
    ) -> Option<u64> {
        let wait_start = Instant::now();
        let mut steam_detected = false;
        while wait_start.elapsed() < Duration::from_secs(45) {
            if get_steam_running_appid() == Some(appid) {
                steam_detected = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }

        if !steam_detected {
            return None;
        }

        let detection_time = Instant::now();
        let mut tracked_pid =
            ProcessTracker::detect_process(target_name, target_dir, Duration::from_secs(30))
                .await
                .unwrap_or(0);

        on_phase(TrackingPhase::Running(tracked_pid));

        while get_steam_running_appid() == Some(appid) {
            if tracked_pid > 0 {
                ProcessTracker::track_until_exit(tracked_pid, target_name, target_dir, on_phase)
                    .await;
                tracked_pid = 0;
            }
            if get_steam_running_appid() != Some(appid) {
                break;
            }
            if let Some(next_pid) =
                ProcessTracker::detect_process(target_name, target_dir, Duration::from_millis(500))
                    .await
            {
                tracked_pid = next_pid;
                on_phase(TrackingPhase::Running(tracked_pid));
                continue;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }

        on_phase(TrackingPhase::Exiting);
        Some(detection_time.elapsed().as_secs())
    }

    /// Launches a native binary game process and tracks it using kernel wait and grace period handoff.
    pub async fn launch_and_track_binary(
        config: LaunchConfiguration,
        target_name: Option<String>,
        target_dir: Option<PathBuf>,
        on_phase: PhaseCallback,
    ) -> Result<u64, LaunchError> {
        let mut cmd = Command::new(&config.executable);
        cmd.args(&config.arguments);
        if let Some(ref dir) = config.working_dir {
            cmd.current_dir(dir);
        }

        let mut child = cmd.spawn()?;
        let child_pid = child.id().unwrap_or(0);
        let detection_time = Instant::now();
        on_phase(TrackingPhase::Running(child_pid));

        let _status = child.wait().await?;
        let duration = detection_time.elapsed().as_secs();

        // A launcher trampoline spawns the real game and exits at once: hand tracking over to the
        // process that took its place rather than ending the session after a couple of seconds.
        if duration < TRAMPOLINE_HANDOFF_SECS && (target_name.is_some() || target_dir.is_some()) {
            if let Some(real_pid) = ProcessTracker::detect_process(
                target_name.as_deref(),
                target_dir.as_deref(),
                Duration::from_secs(30),
            )
            .await
            {
                if real_pid != child_pid {
                    on_phase(TrackingPhase::Running(real_pid));
                }
                ProcessTracker::track_until_exit(
                    real_pid,
                    target_name.as_deref(),
                    target_dir.as_deref(),
                    &on_phase,
                )
                .await;
                return Ok(detection_time.elapsed().as_secs());
            }
        }

        on_phase(TrackingPhase::Exiting);
        Ok(duration)
    }

    pub async fn launch_and_track_simple<F>(
        game_id: Uuid,
        config: LaunchConfiguration,
        on_started: F,
    ) -> Result<u64, LaunchError>
    where
        F: FnOnce(u32) + Send + 'static,
    {
        Self::launch_and_track(game_id, config, None, on_started).await
    }

    /// Forcibly terminate process by PID
    pub fn kill_process(pid: u32) -> Result<(), String> {
        kill_process(pid)
    }

    /// Gracefully terminate process by PID with timeout before fallback (Requirement B4)
    pub async fn kill_process_graceful(pid: u32, timeout_secs: u64) -> Result<(), String> {
        kill_process_graceful(pid, timeout_secs).await
    }

    /// Allows background and child processes to set the foreground window on Windows (Requirement C1)
    pub fn allow_set_foreground_window() {
        allow_set_foreground_window();
    }

    /// Brings the process's main window to the foreground with async polling
    pub async fn bring_process_to_foreground(pid: u32, timeout_secs: u64) -> bool {
        bring_process_to_foreground_async(pid, timeout_secs).await
    }
}
