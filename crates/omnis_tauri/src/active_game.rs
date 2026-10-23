use omnis_sdk::SessionState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Active game session state model with session_id and life-cycle state (Requirements B2, B3)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActiveGameSession {
    pub session_id: String,
    pub game_id: String,
    pub title: String,
    pub pid: Option<u32>,
    pub state: SessionState,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub process_detected_at: Option<chrono::DateTime<chrono::Utc>>,
    pub elapsed_seconds: u64,
}

/// Global active game manager tracking the currently running title, session checkpoints, and graceful shutdowns
#[derive(Debug, Clone)]
pub struct ActiveGameManager {
    current: Arc<RwLock<Option<ActiveGameSession>>>,
    abort_handle: Arc<RwLock<Option<tokio::task::AbortHandle>>>,
}

impl ActiveGameManager {
    /// Creates a new ActiveGameManager instance
    pub fn new() -> Self {
        Self {
            current: Arc::new(RwLock::new(None)),
            abort_handle: Arc::new(RwLock::new(None)),
        }
    }

    /// Set a game session in the Launching state (Requirement A6, B3)
    pub async fn set_launching(&self, session_id: Uuid, game_id: String, title: String) {
        let mut lock = self.current.write().await;
        *lock = Some(ActiveGameSession {
            session_id: session_id.to_string(),
            game_id,
            title,
            pid: None,
            state: SessionState::Launching,
            started_at: chrono::Utc::now(),
            process_detected_at: None,
            elapsed_seconds: 0,
        });
    }

    /// Register the background tracking task's AbortHandle to enable instant cancellation
    pub async fn set_abort_handle(&self, handle: tokio::task::AbortHandle) {
        let mut lock = self.abort_handle.write().await;
        *lock = Some(handle);
    }

    /// Update session to Running state upon process detection (Requirement A6, B3)
    pub async fn set_running(&self, session_id: &str, pid: u32) {
        let mut lock = self.current.write().await;
        if let Some(ref mut session) = *lock {
            if session.session_id == session_id {
                session.pid = Some(pid);
                session.state = SessionState::Running;
                session.process_detected_at = Some(chrono::Utc::now());
            }
        }
    }

    /// Transition session to Stopping state (Requirement B3)
    pub async fn set_stopping(&self, session_id: &str) {
        let mut lock = self.current.write().await;
        if let Some(ref mut session) = *lock {
            if session.session_id == session_id {
                session.state = SessionState::Stopping;
            }
        }
    }

    /// Incrementally update elapsed time in memory during checkpointing (Requirement B1)
    pub async fn add_elapsed(&self, session_id: &str, delta_seconds: u64) {
        let mut lock = self.current.write().await;
        if let Some(ref mut session) = *lock {
            if session.session_id == session_id {
                session.elapsed_seconds += delta_seconds;
            }
        }
    }

    /// Clear the active game session when the game exits
    pub async fn clear_running(&self) {
        {
            let mut abort_lock = self.abort_handle.write().await;
            let _ = abort_lock.take();
        }
        let mut lock = self.current.write().await;
        *lock = None;
    }

    /// Retrieve the currently running game session if any
    pub async fn get_running(&self) -> Option<ActiveGameSession> {
        let lock = self.current.read().await;
        lock.clone()
    }

    /// Forcibly or gracefully terminate the currently running game process (Requirement B4)
    pub async fn kill_running(&self) -> Result<bool, String> {
        self.kill_running_graceful(3).await
    }

    /// Graceful termination: sends WM_CLOSE, waits up to timeout_secs, then falls back to hard kill
    pub async fn kill_running_graceful(&self, timeout_secs: u64) -> Result<bool, String> {
        // Abort background tracker immediately if active
        {
            let mut abort_lock = self.abort_handle.write().await;
            if let Some(handle) = abort_lock.take() {
                handle.abort();
            }
        }

        let pid_to_kill = {
            let lock = self.current.read().await;
            if let Some(ref session) = *lock {
                session.pid
            } else {
                return Ok(false);
            }
        };

        if let Some(pid) = pid_to_kill {
            let _ = omnis_core::launcher::GameLauncher::kill_process_graceful(pid, timeout_secs).await;
        }

        let mut lock = self.current.write().await;
        *lock = None;
        Ok(true)
    }

    /// Startup re-attachment: checks if any installed game is currently running on the system (Requirement B2)
    pub async fn check_and_reattach(&self, db: &omnis_core::db::Database) -> Option<ActiveGameSession> {
        // If already tracking, return current
        if let Some(running) = self.get_running().await {
            return Some(running);
        }

        let games = match db.get_all_games() {
            Ok(g) => g,
            Err(_) => return None,
        };

        let mut sys = sysinfo::System::new();
        sys.refresh_processes();

        for game in games {
            if !game.is_installed {
                continue;
            }

            let target_name: Option<String> = game.play_actions.first().and_then(|action| {
                match &action.tracking_mode {
                    omnis_sdk::ProcessTrackingMode::ProcessName(name) => Some(name.clone()),
                    _ => None,
                }
            });

            let install_dir = game.install_dir.as_deref();

            for (pid, proc) in sys.processes() {
                if omnis_core::launcher::matches_target(proc, target_name.as_deref(), install_dir) {
                    let session_id = Uuid::new_v4();
                    let reattached = ActiveGameSession {
                        session_id: session_id.to_string(),
                        game_id: game.id.to_string(),
                        title: game.title.clone(),
                        pid: Some(pid.as_u32()),
                        state: SessionState::Running,
                        started_at: chrono::Utc::now(),
                        process_detected_at: Some(chrono::Utc::now()),
                        elapsed_seconds: 0,
                    };

                    let mut lock = self.current.write().await;
                    *lock = Some(reattached.clone());
                    tracing::info!("Re-attached to running game {} (PID: {}) on startup", game.title, pid);
                    return Some(reattached);
                }
            }
        }

        None
    }
}

impl Default for ActiveGameManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_active_game_manager_lifecycle() {
        let manager = ActiveGameManager::new();
        assert!(manager.get_running().await.is_none());

        let session_id = Uuid::new_v4();
        manager.set_launching(session_id, "test-game-123".to_string(), "Test Game".to_string()).await;
        
        let launching = manager.get_running().await.expect("Session should be active");
        assert_eq!(launching.state, SessionState::Launching);
        assert_eq!(launching.pid, None);

        manager.set_running(&session_id.to_string(), 4242).await;
        let running = manager.get_running().await.expect("Session should be active");
        assert_eq!(running.state, SessionState::Running);
        assert_eq!(running.pid, Some(4242));
        assert!(running.process_detected_at.is_some());

        manager.add_elapsed(&session_id.to_string(), 60).await;
        let running_after_checkpoint = manager.get_running().await.expect("Session should be active");
        assert_eq!(running_after_checkpoint.elapsed_seconds, 60);

        manager.clear_running().await;
        assert!(manager.get_running().await.is_none());
    }

    #[tokio::test]
    async fn test_kill_running_when_none() {
        let manager = ActiveGameManager::new();
        let res = manager.kill_running().await;
        assert_eq!(res, Ok(false));
    }
}
