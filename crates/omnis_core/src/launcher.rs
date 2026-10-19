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

/// Helper function to detect if a launch configuration is a shell/URI invocation
pub fn is_uri_command(config: &LaunchConfiguration) -> bool {
    let exe = config.executable.to_lowercase();
    let is_cmd = exe.ends_with("cmd.exe") || exe == "cmd";
    let is_start = config.arguments.iter().any(|a| a.eq_ignore_ascii_case("start"));
    (is_cmd && is_start) || exe == "xdg-open" || exe == "open"
}

/// Helper function to check if child path is located within parent directory
pub fn path_contains(parent: &Path, child: &Path) -> bool {
    let parent_canon = parent.canonicalize().unwrap_or_else(|_| parent.to_path_buf());
    let child_canon = child.canonicalize().unwrap_or_else(|_| child.to_path_buf());

    let mut p_str = parent_canon.to_string_lossy().replace('/', "\\").to_lowercase();
    let mut c_str = child_canon.to_string_lossy().replace('/', "\\").to_lowercase();

    // Strip verbatim Windows prefix \\?\ or \\?\unc\
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

/// Helper function to determine if a running process matches target criteria
pub fn matches_target(
    proc: &sysinfo::Process,
    target_name: Option<&str>,
    target_dir: Option<&Path>,
) -> bool {
    if let Some(name) = target_name {
        let p_name = proc.name();
        let name_clean = name.strip_suffix(".exe").unwrap_or(name);
        let p_name_clean = p_name.strip_suffix(".exe").unwrap_or(p_name);
        let name_match = p_name.eq_ignore_ascii_case(name) || p_name_clean.eq_ignore_ascii_case(name_clean);

        if !name_match {
            return false;
        }

        // If target_dir is also specified, verify path containment if exe path is available
        if let Some(dir) = target_dir {
            if let Some(exe_path) = proc.exe() {
                return path_contains(dir, exe_path);
            }
        }
        return true;
    }

    // Only target_dir is provided (e.g. WatchDirectory mode without specific exe name)
    if let Some(dir) = target_dir {
        if let Some(exe_path) = proc.exe() {
            return path_contains(dir, exe_path);
        }
    }

    false
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

/// High-performance process runner & monitoring engine for Omnis
pub struct GameLauncher;

impl GameLauncher {
    /// Launches a game executable with real-time process monitoring and exit tracking
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
        let start_time = Instant::now();

        let target_name: Option<String> = match &config.tracking_mode {
            ProcessTrackingMode::ProcessName(name) => Some(name.clone()),
            _ => None,
        };

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

            // If neither target name nor directory is specified, we cannot track a process (e.g. install protocol)
            if target_name.is_none() && target_dir.is_none() {
                on_started(0);
                return Ok(0);
            }

            // Grace period: up to 30 seconds with checks every 500ms
            let timeout = Duration::from_secs(30);
            let check_interval = Duration::from_millis(500);
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

            let real_pid = match detected_pid {
                Some(pid) => pid,
                None => {
                    tracing::warn!("Grace period timeout: no process found for game {}", game_id);
                    return Err(LaunchError::ProcessNotFound);
                }
            };

            on_started(real_pid);

            // Real-time monitoring loop: monitor at 1s intervals until process terminates
            let mut tracking_pid = Pid::from(real_pid as usize);
            loop {
                tokio::time::sleep(Duration::from_secs(1)).await;
                if !sys.refresh_process(tracking_pid) {
                    // Target process exited; do full refresh to check if an alternative process is still running
                    sys.refresh_processes();
                    let mut alternative_pid = None;
                    for (pid, proc) in sys.processes() {
                        if matches_target(proc, target_name.as_deref(), target_dir.as_deref()) {
                            alternative_pid = Some(pid.as_u32());
                            break;
                        }
                    }

                    if let Some(alt_pid) = alternative_pid {
                        tracking_pid = Pid::from(alt_pid as usize);
                        continue;
                    }

                    break;
                }
            }

            let duration = start_time.elapsed().as_secs();
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
            on_started(child_pid);

            let _status = child.wait().await?;
            let mut duration = start_time.elapsed().as_secs();

            // If the process exited in under 2 seconds and we have target tracking criteria,
            // check if it launched a target process (trampoline launcher scenario)
            if duration < 2 && (target_name.is_some() || target_dir.is_some()) {
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
                    let tracking_pid = Pid::from(real_pid as usize);
                    loop {
                        tokio::time::sleep(Duration::from_secs(1)).await;
                        if !sys.refresh_process(tracking_pid) {
                            break;
                        }
                    }
                    duration = start_time.elapsed().as_secs();
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

    /// Terminate process by PID
    pub fn kill_process(pid: u32) -> Result<(), String> {
        kill_process(pid)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

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

        // Check against current process
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
        // Spawn a process that sleeps
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
