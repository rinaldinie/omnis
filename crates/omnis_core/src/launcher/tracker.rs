use std::path::Path;
use std::time::{Duration, Instant};
use sysinfo::System;
use tokio::process::Command;
use omnis_sdk::LaunchConfiguration;

use super::{matches_target, wait_for_process_exit_kernel, LaunchError};

/// Handles process identification, launcher trampoline detection, and exit grace period monitoring
pub struct ProcessTracker;

impl ProcessTracker {
    /// Spawns a URI protocol command (e.g. steam://, com.epicgames.launcher://) with platform-specific argument sanitization
    pub async fn spawn_uri_command(config: &LaunchConfiguration) -> Result<(), LaunchError> {
        let mut cmd = Command::new(&config.executable);
        let mut args = config.arguments.clone();
        if cfg!(windows) {
            let mut sanitized = Vec::new();
            let mut iter = args.into_iter();
            while let Some(arg) = iter.next() {
                let is_start = arg.eq_ignore_ascii_case("start");
                sanitized.push(arg);
                if is_start {
                    if let Some(next_arg) = iter.next() {
                        if !next_arg.is_empty()
                            && (next_arg.contains("://")
                                || next_arg.ends_with(".exe")
                                || next_arg.starts_with('"'))
                        {
                            sanitized.push("".to_string());
                        }
                        sanitized.push(next_arg);
                    }
                }
            }
            args = sanitized;
        }
        cmd.args(&args);
        if let Some(ref dir) = config.working_dir {
            cmd.current_dir(dir);
        }

        let mut child = cmd.spawn()?;
        let _ = child.wait().await;
        Ok(())
    }

    /// Polls running processes within timeout to detect the game process matching target name or directory
    pub async fn detect_process(
        target_name: Option<&str>,
        target_dir: Option<&Path>,
        timeout: Duration,
    ) -> Option<u32> {
        let grace_start = Instant::now();
        let check_interval = Duration::from_secs(1);
        let mut sys = System::new();

        while grace_start.elapsed() < timeout {
            sys.refresh_processes();
            for (pid, proc) in sys.processes() {
                if matches_target(proc, target_name, target_dir) {
                    return Some(pid.as_u32());
                }
            }
            tokio::time::sleep(check_interval).await;
        }
        None
    }

    /// Monitors a detected process and any child/replacement processes spawned during exit grace period
    pub async fn track_until_exit(
        mut real_pid: u32,
        target_name: Option<&str>,
        target_dir: Option<&Path>,
    ) {
        let mut sys = System::new();
        loop {
            let _ = wait_for_process_exit_kernel(real_pid).await;

            let mut alternative_found = None;
            let exit_grace_deadline = Instant::now() + Duration::from_secs(5);

            while Instant::now() < exit_grace_deadline {
                tokio::time::sleep(Duration::from_millis(500)).await;
                sys.refresh_processes();
                for (pid, proc) in sys.processes() {
                    if matches_target(proc, target_name, target_dir) {
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
                continue;
            }
            break;
        }
    }
}
