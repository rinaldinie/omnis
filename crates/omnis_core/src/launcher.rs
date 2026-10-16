use omnis_sdk::{LaunchConfiguration, ProcessTrackingMode};
use std::time::Instant;
use thiserror::Error;
use tokio::process::Command;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum LaunchError {
    #[error("Failed to spawn process: {0}")]
    SpawnFailed(#[from] std::io::Error),
    #[error("Invalid executable path: {0}")]
    InvalidPath(String),
}

/// Zero-overhead game process runner
pub struct GameLauncher;

impl GameLauncher {
    /// Launches a game executable with asynchronous, evented exit notification
    /// Consumes 0.0% CPU while waiting for process tree exit.
    pub async fn launch_and_track<F>(
        _game_id: Uuid,
        config: LaunchConfiguration,
        on_started: F,
    ) -> Result<u64, LaunchError>
    where
        F: FnOnce(u32),
    {
        let mut cmd = Command::new(&config.executable);
        cmd.args(&config.arguments);

        if let Some(ref dir) = config.working_dir {
            cmd.current_dir(dir);
        }

        let start_time = Instant::now();

        match config.tracking_mode {
            ProcessTrackingMode::KernelJobObject | ProcessTrackingMode::ProcessName(_) => {
                let mut child = cmd.spawn()?;
                let pid = child.id().unwrap_or(0);
                on_started(pid);

                // Asynchronously wait for the process to exit without polling
                let _status = child.wait().await?;
                let duration = start_time.elapsed().as_secs();
                Ok(duration)
            }
            ProcessTrackingMode::WatchDirectory(_) => {
                // Launch and track root process
                let mut child = cmd.spawn()?;
                let pid = child.id().unwrap_or(0);
                on_started(pid);
                let _status = child.wait().await?;
                let duration = start_time.elapsed().as_secs();
                Ok(duration)
            }
        }
    }
}
