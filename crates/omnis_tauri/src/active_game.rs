use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Active game session state model
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActiveGameSession {
    pub game_id: String,
    pub title: String,
    pub pid: Option<u32>,
    pub started_at: chrono::DateTime<chrono::Utc>,
}

/// Global active game manager tracking the currently running title
#[derive(Debug, Clone)]
pub struct ActiveGameManager {
    current: Arc<RwLock<Option<ActiveGameSession>>>,
}

impl ActiveGameManager {
    /// Creates a new ActiveGameManager instance
    pub fn new() -> Self {
        Self {
            current: Arc::new(RwLock::new(None)),
        }
    }

    /// Set the currently running game session
    pub async fn set_running(&self, session: ActiveGameSession) {
        let mut lock = self.current.write().await;
        *lock = Some(session);
    }

    /// Update the discovered real process PID of the running game
    pub async fn update_pid(&self, pid: u32) {
        let mut lock = self.current.write().await;
        if let Some(ref mut session) = *lock {
            session.pid = Some(pid);
        }
    }

    /// Clear the active game session when the game exits
    pub async fn clear_running(&self) {
        let mut lock = self.current.write().await;
        *lock = None;
    }

    /// Retrieve the currently running game session if any
    pub async fn get_running(&self) -> Option<ActiveGameSession> {
        let lock = self.current.read().await;
        lock.clone()
    }

    /// Forcibly terminate the currently running game process and clear active state
    pub async fn kill_running(&self) -> Result<bool, String> {
        let mut lock = self.current.write().await;
        if let Some(session) = lock.as_ref() {
            if let Some(pid) = session.pid {
                omnis_core::launcher::GameLauncher::kill_process(pid)?;
            }
            *lock = None;
            Ok(true)
        } else {
            Ok(false)
        }
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
    use chrono::Utc;

    #[tokio::test]
    async fn test_active_game_manager_lifecycle() {
        let manager = ActiveGameManager::new();
        assert!(manager.get_running().await.is_none());

        let session = ActiveGameSession {
            game_id: "test-game-123".to_string(),
            title: "Test Game".to_string(),
            pid: None,
            started_at: Utc::now(),
        };

        manager.set_running(session.clone()).await;
        let running = manager.get_running().await;
        assert!(running.is_some());
        assert_eq!(running.as_ref().unwrap().game_id, "test-game-123");
        assert_eq!(running.as_ref().unwrap().pid, None);

        manager.update_pid(4242).await;
        let updated = manager.get_running().await;
        assert_eq!(updated.unwrap().pid, Some(4242));

        manager.clear_running().await;
        assert!(manager.get_running().await.is_none());
    }

    #[tokio::test]
    async fn test_kill_running_when_none() {
        let manager = ActiveGameManager::new();
        let res = manager.kill_running().await;
        assert_eq!(res, Ok(false));
    }

    #[tokio::test]
    async fn test_kill_running_with_spawned_process() {
        let manager = ActiveGameManager::new();

        // Spawn a background process
        let mut cmd = if cfg!(windows) {
            let mut c = std::process::Command::new("cmd.exe");
            c.args(["/c", "ping", "-n", "10", "127.0.0.1"]);
            c
        } else {
            let mut c = std::process::Command::new("sleep");
            c.arg("10");
            c
        };

        let child = cmd.spawn().expect("Failed to spawn process");
        let pid = child.id();

        manager
            .set_running(ActiveGameSession {
                game_id: "test-game-process".to_string(),
                title: "Test Process".to_string(),
                pid: Some(pid),
                started_at: Utc::now(),
            })
            .await;

        let res = manager.kill_running().await;
        assert_eq!(res, Ok(true));
        assert!(manager.get_running().await.is_none());
    }
}
