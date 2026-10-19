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
pub fn allow_set_foreground_window() {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{AllowSetForegroundWindow, ASFW_ANY};
        unsafe {
            let _ = AllowSetForegroundWindow(ASFW_ANY);
        }
    }
}

/// Helper to forcibly terminate a process by PID across platforms
pub fn kill_process(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Err("Invalid PID: 0".to_string());
    }

    #[cfg(windows)]
    {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
        unsafe {
            if let Ok(handle) = OpenProcess(PROCESS_TERMINATE, false, pid) {
                let res = TerminateProcess(handle, 1);
                let _ = CloseHandle(handle);
                if res.is_ok() {
                    return Ok(());
                }
            }
        }
    }

    let mut sys = System::new();
    sys.refresh_processes();
    let sysinfo_pid = Pid::from(pid as usize);
    if let Some(proc) = sys.process(sysinfo_pid) {
        if proc.kill() {
            return Ok(());
        }
    }

    #[cfg(unix)]
    {
        unsafe {
            if libc::kill(pid as i32, libc::SIGKILL) == 0 {
                return Ok(());
            }
        }
    }

    // Check if the process is already gone
    sys.refresh_processes();
    if sys.process(sysinfo_pid).is_none() {
        return Ok(());
    }

    Err(format!("Impossibile terminare il processo con PID {}", pid))
}

/// Sends WM_CLOSE to all top-level windows of a process for graceful exit (Requirement B4)
#[cfg(windows)]
pub fn send_wm_close_to_process(pid: u32) {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
    };

    struct EnumData {
        target_pid: u32,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut EnumData);
        let mut proc_id = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut proc_id));
        if proc_id == data.target_pid {
            let _ = PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
        }
        BOOL(1)
    }

    let mut data = EnumData { target_pid: pid };
    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut data as *mut EnumData as isize));
    }
}

#[cfg(not(windows))]
pub fn send_wm_close_to_process(pid: u32) {
    #[cfg(unix)]
    unsafe {
        let _ = libc::kill(pid as i32, libc::SIGTERM);
    }
}

/// Graceful termination: sends WM_CLOSE, waits up to timeout_secs, then falls back to hard kill (Requirement B4)
pub async fn kill_process_graceful(pid: u32, timeout_secs: u64) -> Result<(), String> {
    if pid == 0 {
        return Err("Invalid PID: 0".to_string());
    }

    send_wm_close_to_process(pid);

    let deadline = Instant::now() + Duration::from_secs(timeout_secs.max(1));
    let mut sys = System::new();
    let sys_pid = Pid::from(pid as usize);

    while Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(300)).await;
        if !sys.refresh_process(sys_pid) {
            return Ok(()); // Exited gracefully
        }
    }

    // Still alive after graceful timeout, terminate forcibly
    kill_process(pid)
}

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

impl GameLauncher {
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
        let is_uri = is_uri_command(&config);

        let target_name: Option<String> = match &config.tracking_mode {
            ProcessTrackingMode::ProcessName(name) => Some(name.clone()),
            _ => None,
        };

        // Store-specific GOG detection: if install_dir has goggame-*.info, look for real primary executable
        let target_name = target_name.or_else(|| {
            if let Some(ref dir) = install_dir {
                find_gog_game_executable(dir).and_then(|p| {
                    p.file_name().and_then(|f| f.to_str()).map(|s| s.to_string())
                })
            } else {
                None
            }
        });

        let target_dir: Option<PathBuf> = install_dir.or_else(|| match &config.tracking_mode {
            ProcessTrackingMode::WatchDirectory(dir) => Some(dir.clone()),
            _ => config.working_dir.clone(),
        });

        if is_uri {
            let mut cmd = Command::new(&config.executable);
            cmd.args(&config.arguments);
            if let Some(ref dir) = config.working_dir {
                cmd.current_dir(dir);
            }

            let mut child = cmd.spawn()?;
            let _ = child.wait().await;

            // If neither target name nor directory is specified, we cannot track a process
            if target_name.is_none() && target_dir.is_none() {
                on_started(0);
                return Ok(0);
            }

            // A6. Generous launch timeout (up to 90 seconds, checking every 1s)
            let timeout = Duration::from_secs(90);
            let check_interval = Duration::from_secs(1);
            let grace_start = Instant::now();
            let mut detected_pid: Option<u32> = None;
            let mut sys = System::new();

            while grace_start.elapsed() < timeout {
                sys.refresh_processes();
                for (pid, proc) in sys.processes() {
                    if matches_target(proc, target_name.as_deref(), target_dir.as_deref()) {
                        detected_pid = Some(pid.as_u32());
                        break;
                    }
                }
                if detected_pid.is_some() {
                    break;
                }
                tokio::time::sleep(check_interval).await;
            }

            let mut real_pid = match detected_pid {
                Some(pid) => pid,
                None => {
                    tracing::warn!("Grace period timeout: no process found for game {}", game_id);
                    return Err(LaunchError::ProcessNotFound);
                }
            };

            // Playtime begins now (at process detection, Requirement A6)
            let detection_time = Instant::now();
            on_started(real_pid);

            // A1 & A5: Kernel Wait + Exit Grace Period
            loop {
                // Wait kernel-side for process exit (0% CPU)
                let _ = wait_for_process_exit_kernel(real_pid).await;

                // A5. Exit grace period (5s): check if an alternative game process was spawned by the launcher
                let mut alternative_found = None;
                let exit_grace_deadline = Instant::now() + Duration::from_secs(5);

                while Instant::now() < exit_grace_deadline {
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    sys.refresh_processes();
                    for (pid, proc) in sys.processes() {
                        if matches_target(proc, target_name.as_deref(), target_dir.as_deref()) {
                            alternative_found = Some(pid.as_u32());
                            break;
                        }
                    }
                    if alternative_found.is_some() {
                        break;
                    }
                }

                if let Some(next_pid) = alternative_found {
                    real_pid = next_pid;
                    continue; // Seamlessly track next child process
                }

                // No processes remaining after grace period; session ended
                break;
            }

            let duration = detection_time.elapsed().as_secs();
            Ok(duration)
        } else {
            // Direct executable launch without intermediate launcher
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

            // Trampoline launcher scenario: if exited in under 3 seconds, check for real game process
            if duration < 3 && (target_name.is_some() || target_dir.is_some()) {
                let mut sys = System::new();
                sys.refresh_processes();
                let mut found_pid = None;
                for (pid, proc) in sys.processes() {
                    if matches_target(proc, target_name.as_deref(), target_dir.as_deref()) {
                        found_pid = Some(pid.as_u32());
                        break;
                    }
                }

                if let Some(real_pid) = found_pid {
                    let _ = wait_for_process_exit_kernel(real_pid).await;
                    duration = detection_time.elapsed().as_secs();
                }
            }

            Ok(duration)
        }
    }

    /// Convenience wrapper for launching without explicit install directory
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[test]
    fn test_is_blacklisted_process() {
        assert!(is_blacklisted_process("UnityCrashHandler64.exe"));
        assert!(is_blacklisted_process("unitycrashhandler32.exe"));
        assert!(is_blacklisted_process("vcredist_x64.exe"));
        assert!(is_blacklisted_process("dxsetup.exe"));
        assert!(is_blacklisted_process("CrashReportClient.exe"));
        assert!(!is_blacklisted_process("Doom.exe"));
        assert!(!is_blacklisted_process("Cyberpunk2077.exe"));
    }

    #[test]
    fn test_is_uri_command() {
        let uri_cfg_windows = LaunchConfiguration {
            executable: "cmd.exe".to_string(),
            arguments: vec!["/c".to_string(), "start".to_string(), "steam://rungameid/10".to_string()],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        assert!(is_uri_command(&uri_cfg_windows));

        let uri_cfg_linux = LaunchConfiguration {
            executable: "xdg-open".to_string(),
            arguments: vec!["steam://rungameid/10".to_string()],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        assert!(is_uri_command(&uri_cfg_linux));

        let direct_cfg = LaunchConfiguration {
            executable: "C:\\Games\\Doom\\Doom.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        assert!(!is_uri_command(&direct_cfg));
    }

    #[test]
    fn test_path_contains() {
        let parent = Path::new("C:/Games/Doom");
        let child_ok = Path::new("C:\\Games\\Doom\\bin\\doom.exe");
        let child_same = Path::new("C:\\Games\\Doom");
        let child_other = Path::new("C:\\Games\\Doom2\\doom2.exe");
        let child_unrelated = Path::new("D:\\Other\\app.exe");

        assert!(path_contains(parent, child_ok));
        assert!(path_contains(parent, child_same));
        assert!(!path_contains(parent, child_other));
        assert!(!path_contains(parent, child_unrelated));
    }

    #[test]
    fn test_kill_process_invalid_pid() {
        assert!(kill_process(0).is_err());
        assert!(GameLauncher::kill_process(0).is_err());
    }

    #[tokio::test]
    async fn test_direct_launch_completion() {
        let config = if cfg!(windows) {
            LaunchConfiguration {
                executable: "cmd.exe".to_string(),
                arguments: vec!["/c".to_string(), "exit".to_string(), "0".to_string()],
                working_dir: None,
                tracking_mode: ProcessTrackingMode::KernelJobObject,
            }
        } else {
            LaunchConfiguration {
                executable: "sh".to_string(),
                arguments: vec!["-c".to_string(), "exit 0".to_string()],
                working_dir: None,
                tracking_mode: ProcessTrackingMode::KernelJobObject,
            }
        };

        let started_pid = Arc::new(AtomicU32::new(0));
        let pid_clone = started_pid.clone();
        let res = GameLauncher::launch_and_track_simple(
            Uuid::new_v4(),
            config,
            move |pid| {
                pid_clone.store(pid, Ordering::SeqCst);
            },
        )
        .await;

        assert!(res.is_ok());
        assert!(started_pid.load(Ordering::SeqCst) > 0);
    }

    #[test]
    fn test_matches_target() {
        let mut sys = System::new();
        sys.refresh_processes();

        let current_pid = std::process::id();
        let sys_pid = Pid::from(current_pid as usize);
        if let Some(proc) = sys.process(sys_pid) {
            let p_name = proc.name().to_string();
            assert!(matches_target(proc, Some(&p_name), None));
            assert!(matches_target(proc, Some(&p_name.to_lowercase()), None));
            assert!(matches_target(proc, Some(&p_name.to_uppercase()), None));

            if let Some(parent_dir) = proc.exe().and_then(|e| e.parent()) {
                assert!(matches_target(proc, None, Some(parent_dir)));
            }

            assert!(!matches_target(proc, Some("non_existent_process_12345.exe"), None));
        }
    }

    #[tokio::test]
    async fn test_kill_process_active() {
        let mut cmd = if cfg!(windows) {
            let mut c = std::process::Command::new("cmd.exe");
            c.args(["/c", "ping", "-n", "10", "127.0.0.1"]);
            c
        } else {
            let mut c = std::process::Command::new("sleep");
            c.arg("10");
            c
        };

        let child = cmd.spawn().expect("Failed to spawn sleeper process");
        let pid = child.id();
        assert!(pid > 0);

        let kill_res = kill_process(pid);
        assert!(kill_res.is_ok(), "Kill process failed: {:?}", kill_res);
    }
}
