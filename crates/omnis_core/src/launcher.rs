pub mod process_control;
pub use process_control::*;

#[cfg(test)]
mod tests;

use omnis_sdk::{LaunchConfiguration, ProcessTrackingMode};
use std::path::{Path, PathBuf};
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
        return sys.process(sys_pid).and_then(|p| p.exe().map(|e| e.to_path_buf()));
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

/// Store-specific heuristic: Locate primary game executable from GOG goggame-*.info (Requirement A7)
pub fn find_gog_game_executable(install_dir: &Path) -> Option<PathBuf> {
    if let Ok(entries) = std::fs::read_dir(install_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.starts_with("goggame-") && file_name.ends_with(".info") {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(play_tasks) = json.get("playTasks").and_then(|p| p.as_array()) {
                                for task in play_tasks {
                                    let is_primary = task.get("isPrimary").and_then(|p| p.as_bool()).unwrap_or(false);
                                    let is_file = task.get("type").and_then(|t| t.as_str()) == Some("FileTask");
                                    if is_primary || is_file {
                                        if let Some(rel_path) = task.get("path").and_then(|p| p.as_str()) {
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

/// Helper function to detect if a launch configuration is a shell/URI invocation
pub fn is_uri_command(config: &LaunchConfiguration) -> bool {
    let exe = config.executable.to_lowercase();
    let is_cmd = exe.ends_with("cmd.exe") || exe == "cmd";
    let is_start = config.arguments.iter().any(|a| a.eq_ignore_ascii_case("start"));
    (is_cmd && is_start) || exe == "xdg-open" || exe == "open"
}

/// Helper function to check if child path is located within parent directory,
/// with support for case-insensitivity, \\?\ verbatim prefixes and junction resolution (Requirement A3).
pub fn path_contains(parent: &Path, child: &Path) -> bool {
    let parent_canon = parent.canonicalize().unwrap_or_else(|_| parent.to_path_buf());
    let child_canon = child.canonicalize().unwrap_or_else(|_| child.to_path_buf());

    let mut p_str = parent_canon.to_string_lossy().replace('/', "\\").to_lowercase();
    let mut c_str = child_canon.to_string_lossy().replace('/', "\\").to_lowercase();

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
    if c_str.starts_with(p_trimmed) {
        let remainder = &c_str[p_trimmed.len()..];
        if remainder.starts_with('\\') {
            return true;
        }
    }
    false
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

    if let Some(name) = target_name {
        let name_clean = name.strip_suffix(".exe").unwrap_or(name);
        let p_name_clean = p_name.strip_suffix(".exe").unwrap_or(p_name);
        let name_match = p_name.eq_ignore_ascii_case(name) || p_name_clean.eq_ignore_ascii_case(name_clean);

        if !name_match {
            return false;
        }

        // If target_dir is also specified, verify path containment if exe path is available
        if let Some(dir) = target_dir {
            if let Some(ref exe_path) = real_exe {
                return path_contains(dir, exe_path);
            }
        }
        return true;
    }

    // Only target_dir is provided (e.g. WatchDirectory mode without specific exe name)
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
    use windows::Win32::System::Threading::{OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE};

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
        Err(format!("WaitForSingleObject returned status: {:?}", wait_res))
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

/// Allows background and child processes to set the foreground window on Windows (Requirement C1)

/// Calculates the total resident memory in bytes of a process and ALL its descendants.
/// Correctly accounts for multi-process architectures such as Chromium/WebView2,
/// game launchers, anti-cheat wrappers, and worker subprocesses.
pub fn get_process_tree_memory_bytes(root_pid: u32) -> u64 {
    let mut sys = System::new();
    sys.refresh_processes();
    get_process_tree_memory_from_system(&sys, root_pid)
}

/// Calculates the total resident memory given an existing sysinfo::System snapshot.
pub fn get_process_tree_memory_from_system(sys: &System, root_pid: u32) -> u64 {
    let target_pid = Pid::from(root_pid as usize);
    let mut pids_in_tree = std::collections::HashSet::new();
    pids_in_tree.insert(target_pid);

    let mut added = true;
    while added {
        added = false;
        for (pid, proc) in sys.processes() {
            if !pids_in_tree.contains(pid) {
                if let Some(parent_pid) = proc.parent() {
                    if pids_in_tree.contains(&parent_pid) {
                        pids_in_tree.insert(*pid);
                        added = true;
                    }
                }
            }
        }
    }

    let mut total_bytes = 0u64;
    for pid in &pids_in_tree {
        if let Some(proc) = sys.process(*pid) {
            total_bytes = total_bytes.saturating_add(proc.memory());
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
    fn resolve_target_name(config: &LaunchConfiguration, install_dir: Option<&Path>) -> Option<String> {
        match &config.tracking_mode {
            ProcessTrackingMode::ProcessName(name) => Some(name.clone()),
            _ => install_dir.and_then(|dir| {
                find_gog_game_executable(dir).and_then(|p| {
                    p.file_name().and_then(|f| f.to_str()).map(|s| s.to_string())
                })
            }),
        }
    }

    fn resolve_target_dir(config: &LaunchConfiguration, install_dir: Option<PathBuf>) -> Option<PathBuf> {
        install_dir.or_else(|| match &config.tracking_mode {
            ProcessTrackingMode::WatchDirectory(dir) => Some(dir.clone()),
            _ => config.working_dir.clone(),
        })
    }

    /// Launches a game executable with real-time process monitoring, hybrid scan+kernel wait,
    /// and exit grace period handoff (Requirements A1, A5, A6).
    pub async fn launch_and_track<F>(
        game_id: Uuid,
        config: LaunchConfiguration,
        install_dir: Option<PathBuf>,
        on_started: F,
    ) -> Result<u64, LaunchError>
    where
        F: FnOnce(u32) + Send,
    {
        let target_name = Self::resolve_target_name(&config, install_dir.as_deref());
        let target_dir = Self::resolve_target_dir(&config, install_dir);

        if is_uri_command(&config) {
            Self::launch_and_track_uri(game_id, config, target_name, target_dir, on_started).await
        } else {
            Self::launch_and_track_binary(config, target_name, target_dir, on_started).await
        }
    }

    /// Launches a URI/shell game command and tracks its lifecycle using process polling or Steam AppID detection.
    pub async fn launch_and_track_uri<F>(
        game_id: Uuid,
        config: LaunchConfiguration,
        target_name: Option<String>,
        target_dir: Option<PathBuf>,
        on_started: F,
    ) -> Result<u64, LaunchError>
    where
        F: FnOnce(u32) + Send,
    {
        ProcessTracker::spawn_uri_command(&config).await?;

        #[cfg(windows)]
        let steam_appid: Option<u64> = config.arguments.iter().find_map(|arg| {
            if let Some(pos) = arg.find("steam://rungameid/") {
                let id_part = &arg[pos + "steam://rungameid/".len()..];
                let clean_id: String = id_part.chars().take_while(|c| c.is_ascii_digit()).collect();
                clean_id.parse::<u64>().ok()
            } else {
                None
            }
        });

        #[cfg(windows)]
        if let Some(appid) = steam_appid {
            let wait_start = Instant::now();
            let mut steam_detected = false;
            while wait_start.elapsed() < Duration::from_secs(45) {
                if get_steam_running_appid() == Some(appid) {
                    steam_detected = true;
                    break;
                }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }

            if steam_detected {
                let mut sys = System::new();
                sys.refresh_processes();
                let mut found_pid = 0u32;
                for (pid, proc) in sys.processes() {
                    if matches_target(proc, target_name.as_deref(), target_dir.as_deref()) {
                        found_pid = pid.as_u32();
                        break;
                    }
                }
                let detection_time = Instant::now();
                on_started(found_pid);

                while get_steam_running_appid() == Some(appid) {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }

                let duration = detection_time.elapsed().as_secs();
                return Ok(duration);
            }
        }

        if target_name.is_none() && target_dir.is_none() {
            on_started(0);
            return Ok(0);
        }

        let real_pid = match ProcessTracker::detect_process(
            target_name.as_deref(),
            target_dir.as_deref(),
            Duration::from_secs(90),
        ).await {
            Some(pid) => pid,
            None => {
                tracing::warn!("Grace period timeout: no process found for game {}", game_id);
                return Err(LaunchError::ProcessNotFound);
            }
        };

        let detection_time = Instant::now();
        on_started(real_pid);

        ProcessTracker::track_until_exit(real_pid, target_name.as_deref(), target_dir.as_deref()).await;

        let duration = detection_time.elapsed().as_secs();
        Ok(duration)
    }

    /// Launches a native binary game process and tracks it using kernel wait and grace period handoff.
    pub async fn launch_and_track_binary<F>(
        config: LaunchConfiguration,
        target_name: Option<String>,
        target_dir: Option<PathBuf>,
        on_started: F,
    ) -> Result<u64, LaunchError>
    where
        F: FnOnce(u32) + Send,
    {
        let mut cmd = Command::new(&config.executable);
        cmd.args(&config.arguments);
        if let Some(ref dir) = config.working_dir {
            cmd.current_dir(dir);
        }

        let mut child = cmd.spawn()?;
        let child_pid = child.id().unwrap_or(0);
        let detection_time = Instant::now();
        on_started(child_pid);

        let _status = child.wait().await?;
        let mut duration = detection_time.elapsed().as_secs();

        if duration < 3 && (target_name.is_some() || target_dir.is_some()) {
            if let Some(real_pid) = ProcessTracker::detect_process(
                target_name.as_deref(),
                target_dir.as_deref(),
                Duration::from_secs(1),
            ).await {
                let _ = wait_for_process_exit_kernel(real_pid).await;
                duration = detection_time.elapsed().as_secs();
            }
        }

        Ok(duration)
    }

    pub async fn launch_and_track_simple<F>(
        game_id: Uuid,
        config: LaunchConfiguration,
        on_started: F,
    ) -> Result<u64, LaunchError>
    where
        F: FnOnce(u32) + Send,
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

