use omnis_sdk::LaunchConfiguration;
use std::path::Path;
use std::time::{Duration, Instant};
use sysinfo::System;
use tokio::process::Command;

use super::{
    is_launch_uri, matches_target, wait_for_process_exit_kernel, LaunchError, PhaseCallback,
    TrackingPhase,
};

/// How long a replacement process is awaited after the tracked process dies, before the session
/// is declared over. Launcher trampolines and in-game restarts reuse this window to hand over.
const EXIT_GRACE: Duration = Duration::from_millis(8000);

/// Polling cadence inside the exit grace window.
const EXIT_GRACE_POLL: Duration = Duration::from_millis(250);

/// Handles process identification, launcher trampoline detection, and exit grace period monitoring
pub struct ProcessTracker;

impl ProcessTracker {
    /// Spawns a URI protocol command (e.g. steam://, com.epicgames.launcher://) with platform-specific argument sanitization
    pub async fn spawn_uri_command(config: &LaunchConfiguration) -> Result<(), LaunchError> {
        if is_launch_uri(&config.executable) {
            return Self::spawn_protocol_uri(&config.executable).await;
        }

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

    /// Hands a protocol URI to the OS handler.
    ///
    /// Store plugins may place the launch URI straight into `LaunchConfiguration::executable`
    /// (`com.epicgames.launcher://...`, `ms-windows-store://...`). Spawning that string as a
    /// program always fails with "program not found", so the registered handler is invoked instead.
    /// Arguments are ignored on purpose: a protocol handler takes the URI and nothing else.
    async fn spawn_protocol_uri(uri: &str) -> Result<(), LaunchError> {
        if uri.chars().any(|c| c.is_control()) {
            return Err(LaunchError::InvalidPath(format!(
                "URI di avvio contiene caratteri di controllo: {uri}"
            )));
        }

        #[cfg(windows)]
        let mut cmd = {
            // url.dll,FileProtocolHandler dispatches without going through a shell, so the URI is
            // never re-parsed for metacharacters
            let mut command = Command::new("rundll32.exe");
            command.args(["url.dll,FileProtocolHandler", uri]);
            command
        };
        #[cfg(target_os = "macos")]
        let mut cmd = {
            let mut command = Command::new("open");
            command.arg(uri);
            command
        };
        #[cfg(not(any(windows, target_os = "macos")))]
        let mut cmd = {
            let mut command = Command::new("xdg-open");
            command.arg(uri);
            command
        };

        let mut child = cmd.spawn()?;
        let _ = child.wait().await;
        Ok(())
    }

    /// Monitors a detected process and any child/replacement processes spawned during exit grace period.
    ///
    /// `on_phase` is notified with [`TrackingPhase::Exiting`] the instant the kernel reports the
    /// process death, i.e. *before* the grace window runs, and with [`TrackingPhase::Running`]
    /// again if a replacement process takes over inside that window. A host can use this to keep a
    /// transition overlay on screen for the whole handover without ever uncovering the desktop.
    pub async fn track_until_exit(
        mut real_pid: u32,
        target_name: Option<&str>,
        target_dir: Option<&Path>,
        on_phase: &PhaseCallback,
    ) {
        let mut sys = System::new();
        loop {
            let _ = wait_for_process_exit_kernel(real_pid).await;
            on_phase(TrackingPhase::Exiting);

            let exited_pid = real_pid;
            let mut alternative_found = None;
            let exit_grace_deadline = Instant::now() + EXIT_GRACE;

            loop {
                sys.refresh_processes();
                for (pid, proc) in sys.processes() {
                    let candidate = pid.as_u32();
                    // The process that just died can still appear in one more snapshot
                    if candidate == exited_pid {
                        continue;
                    }
                    if matches_target(proc, target_name, target_dir) {
                        alternative_found = Some(candidate);
                        break;
                    }
                }
                if alternative_found.is_some() || Instant::now() >= exit_grace_deadline {
                    break;
                }
                tokio::time::sleep(EXIT_GRACE_POLL).await;
            }

            if let Some(next_pid) = alternative_found {
                on_phase(TrackingPhase::Running(next_pid));
                real_pid = next_pid;
                continue;
            }
            break;
        }
    }
}
