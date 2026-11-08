//! Domain service coordinating polymorphic achievement retrieval, persistence, and asset caching

use omnis_core::achievements::AchievementCacheManager;
use omnis_core::Database;
use omnis_plugin_epic::EpicLibraryPlugin;
use omnis_plugin_gog::GogCloudPlugin;
use omnis_plugin_steam::SteamPlugin;
use omnis_plugin_xbox::XboxCloudPlugin;
use omnis_sdk::constants::{storage, stores};
use omnis_sdk::{Achievement, AchievementProvider, Game, GameAchievementsSummary};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tracing::warn;
use uuid::Uuid;

use crate::store::StoreAccountManager;

/// Domain service that coordinates achievement providers, session resolution,
/// local persistence, and background icon caching.
pub struct AchievementService {
    providers: HashMap<String, Box<dyn AchievementProvider>>,
    library_sync_running: AtomicBool,
}

impl AchievementService {
    pub fn new() -> Self {
        let mut service = Self {
            providers: HashMap::new(),
            library_sync_running: AtomicBool::new(false),
        };
        service.register_provider(Box::new(SteamPlugin::new()));
        service.register_provider(Box::new(XboxCloudPlugin::new()));
        service.register_provider(Box::new(GogCloudPlugin::new()));
        service.register_provider(Box::new(EpicLibraryPlugin::new()));
        service
    }

    pub fn register_provider(&mut self, provider: Box<dyn AchievementProvider>) {
        self.providers
            .insert(provider.provider_id().to_string(), provider);
    }

    /// Returns true when an achievement provider is registered for the given store
    pub fn supports_store(&self, library_id: &str) -> bool {
        self.providers.contains_key(library_id)
    }

    /// Marks the library-wide sync as running; returns false if one is already in progress
    pub fn try_begin_library_sync(&self) -> bool {
        self.library_sync_running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    pub fn end_library_sync(&self) {
        self.library_sync_running.store(false, Ordering::SeqCst);
    }

    /// Selects the games worth refreshing in a background library sync: supported store with a
    /// connected account, and some recorded play activity (unplayed games cannot have new unlocks
    /// and still get their achievement list lazily when opened). Most recently played first.
    pub fn library_sync_candidates(
        &self,
        db: &Database,
        store_account_manager: &StoreAccountManager,
    ) -> Result<Vec<Game>, String> {
        let configured: HashSet<&str> = self
            .providers
            .keys()
            .map(String::as_str)
            .filter(|store_id| matches!(store_account_manager.load_session(store_id), Ok(Some(_))))
            .collect();

        if configured.is_empty() {
            return Ok(Vec::new());
        }

        let mut games: Vec<Game> = db
            .get_all_games()
            .map_err(|e| format!("Database error listing games: {e}"))?
            .into_iter()
            .filter(|g| configured.contains(g.library_id.as_str()))
            .filter(|g| g.playtime_seconds > 0 || g.play_count > 0 || g.last_activity.is_some())
            .collect();
        games.sort_by_key(|g| std::cmp::Reverse(g.last_activity));
        Ok(games)
    }

    /// Dispatches achievement fetching to the registered store provider
    pub async fn fetch_achievements(
        &self,
        game: &Game,
        store_account_manager: &StoreAccountManager,
    ) -> Result<Vec<Achievement>, String> {
        let provider = self.providers.get(&game.library_id).ok_or_else(|| {
            format!(
                "Achievements are currently not supported for store '{}'",
                game.library_id
            )
        })?;

        let session = match game.library_id.as_str() {
            stores::STEAM => Some(
                store_account_manager
                    .get_valid_session(stores::STEAM)
                    .await
                    .map_err(|e| format!("Errore nel caricamento della sessione Steam: {e}"))?
                    .ok_or_else(|| {
                        "Nessun account Steam configurato. Inserisci la Steam Web API Key e l'ID Account nelle impostazioni Store.".to_string()
                    })?,
            ),
            stores::XBOX => Some(
                store_account_manager
                    .get_valid_session(stores::XBOX)
                    .await
                    .map_err(|e| format!("Error loading Xbox session: {e}"))?
                    .ok_or_else(|| {
                        "No active Xbox account found. Please connect your Xbox account in Store Accounts.".to_string()
                    })?,
            ),
            stores::GOG => Some(
                store_account_manager
                    .get_valid_session(stores::GOG)
                    .await
                    .map_err(|e| format!("Error loading GOG session: {e}"))?
                    .ok_or_else(|| {
                        "No active GOG Galaxy account found. Please connect your GOG account in Store Accounts.".to_string()
                    })?,
            ),
            stores::EPIC => store_account_manager
                .get_valid_session(stores::EPIC)
                .await
                .ok()
                .flatten(),
            _ => store_account_manager
                .get_valid_session(&game.library_id)
                .await
                .ok()
                .flatten(),
        };

        match provider.fetch_achievements(game, session.as_ref()).await {
            Ok(achievements) => Ok(achievements),
            Err(err) => {
                if is_session_expired_error(&err) {
                    tracing::info!(
                        "Achievement fetch failed with authorization error for store '{}' ({err}). Attempting session refresh and retry...",
                        game.library_id
                    );
                    if let Ok(new_session) = store_account_manager.refresh_session(&game.library_id).await {
                        return provider.fetch_achievements(game, Some(&new_session)).await;
                    }
                }
                Err(err)
            }
        }
    }

    /// Orchestrates full achievement sync: fetch, database upsert, background icon caching, and summary return
    pub async fn sync_game_achievements(
        &self,
        db: &Arc<Database>,
        store_account_manager: &StoreAccountManager,
        app_dir: &Path,
        game_id: Uuid,
    ) -> Result<GameAchievementsSummary, String> {
        let game = db
            .get_game_by_id(game_id)
            .map_err(|e| format!("Database error fetching game: {e}"))?
            .ok_or_else(|| format!("Game not found: {game_id}"))?;

        let achievements = self
            .fetch_achievements(&game, store_account_manager)
            .await?;

        db.upsert_achievements(game_id, &achievements)
            .map_err(|e| format!("Database error saving achievements: {e}"))?;

        let db_clone = Arc::clone(db);
        let cache_dir = app_dir
            .join(storage::CACHE_DIR)
            .join(storage::ACHIEVEMENTS_DIR);
        let cache_manager = AchievementCacheManager::new(cache_dir);
        let game_title = game.title.clone();
        tokio::spawn(async move {
            if let Err(e) = cache_manager
                .cache_achievements_for_game(&db_clone, game_id, &achievements)
                .await
            {
                warn!("Achievement icon caching had errors for '{game_title}' ({game_id}): {e}");
            }
        });

        db.get_game_achievements(game_id)
            .map_err(|e| format!("Database error reading achievement summary: {e}"))
    }
}

/// Helper detecting HTTP 401 Unauthorized or OAuth expired grant errors
fn is_session_expired_error(err: &str) -> bool {
    let lower = err.to_lowercase();
    lower.contains("401")
        || lower.contains("invalid_grant")
        || lower.contains("expired")
        || lower.contains("unauthorized")
        || lower.contains("sessionexpired")
        || lower.contains("session expired")
}

impl Default for AchievementService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_achievement_service_initialization() {
        let service = AchievementService::new();
        assert!(service.providers.contains_key(stores::STEAM));
        assert!(service.providers.contains_key(stores::XBOX));
        assert!(service.providers.contains_key(stores::GOG));
        assert!(service.providers.contains_key(stores::EPIC));
    }

    struct MockProvider;
    #[async_trait::async_trait]
    impl AchievementProvider for MockProvider {
        fn provider_id(&self) -> &'static str {
            "mock_store"
        }
        async fn fetch_achievements(
            &self,
            _game: &Game,
            _session: Option<&omnis_sdk::StoreAccountSession>,
        ) -> Result<Vec<Achievement>, String> {
            Ok(vec![Achievement {
                id: "mock_1".to_string(),
                game_id: Uuid::new_v4(),
                api_name: "mock_1".to_string(),
                display_name: "Mock Achieved".to_string(),
                description: Some("Mock Description".to_string()),
                icon_unlocked_url: "https://example.com/icon.png".to_string(),
                icon_locked_url: None,
                local_icon_path: None,
                is_unlocked: true,
                unlock_time: None,
                rarity_percentage: Some(50.0),
                points: None,
                is_hidden: false,
            }])
        }
    }

    #[tokio::test]
    async fn test_custom_provider_registration() {
        let mut service = AchievementService::new();
        service.register_provider(Box::new(MockProvider));
        assert!(service.providers.contains_key("mock_store"));

        let db = Database::open_in_memory().unwrap();
        let vault = Arc::new(omnis_core::SecretVault::from_key([0x55; 32]));
        let store_mgr = StoreAccountManager::new(Arc::new(db), vault);

        let game = Game::new(
            "mock_store".to_string(),
            "123".to_string(),
            "Mock Game".to_string(),
        );

        let res = service.fetch_achievements(&game, &store_mgr).await;
        assert!(res.is_ok());
        let achs = res.unwrap();
        assert_eq!(achs.len(), 1);
        assert_eq!(achs[0].id, "mock_1");
    }

    #[tokio::test]
    async fn test_unsupported_store_error() {
        let service = AchievementService::new();
        let db = Database::open_in_memory().unwrap();
        let vault = Arc::new(omnis_core::SecretVault::from_key([0x55; 32]));
        let store_mgr = StoreAccountManager::new(Arc::new(db), vault);

        let game = Game::new(
            "unsupported_unknown".to_string(),
            "123".to_string(),
            "Unknown Game".to_string(),
        );

        let res = service.fetch_achievements(&game, &store_mgr).await;
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .contains("Achievements are currently not supported for store 'unsupported_unknown'"));
    }

    struct MockRetryProvider;
    #[async_trait::async_trait]
    impl AchievementProvider for MockRetryProvider {
        fn provider_id(&self) -> &'static str {
            "retry_store"
        }
        async fn fetch_achievements(
            &self,
            _game: &Game,
            session: Option<&omnis_sdk::StoreAccountSession>,
        ) -> Result<Vec<Achievement>, String> {
            let sess = session.ok_or_else(|| "Session missing".to_string())?;
            if sess.access_token == "expired_token_123" {
                return Err("GOG achievements request failed (401 Unauthorized): {\"error\":\"invalid_grant\",\"error_description\":\"The access token provided has expired.\"}".to_string());
            }
            if sess.access_token == "refreshed_token_456" {
                return Ok(vec![Achievement {
                    id: "retry_ach_1".to_string(),
                    game_id: Uuid::new_v4(),
                    api_name: "ACH_1".to_string(),
                    display_name: "Success After Refresh".to_string(),
                    description: None,
                    icon_unlocked_url: "https://example.com/icon.png".to_string(),
                    icon_locked_url: None,
                    local_icon_path: None,
                    is_unlocked: true,
                    unlock_time: None,
                    rarity_percentage: Some(100.0),
                    points: None,
                    is_hidden: false,
                }]);
            }
            Err("Unexpected token".to_string())
        }
    }

    struct MockRetryPlugin;
    #[async_trait::async_trait]
    impl omnis_sdk::LibraryPlugin for MockRetryPlugin {
        fn id(&self) -> &str {
            "retry_store"
        }
        fn name(&self) -> &str {
            "Retry Store"
        }
        async fn scan(&self) -> Result<Vec<omnis_sdk::DiscoveredGame>, omnis_sdk::PluginError> {
            Ok(vec![])
        }
    }
    #[async_trait::async_trait]
    impl omnis_sdk::CloudStorePlugin for MockRetryPlugin {
        fn login_url(&self) -> String {
            "".to_string()
        }
        fn is_redirect_url(&self, _url: &str) -> bool {
            false
        }
        async fn exchange_code(&self, _url: &str) -> Result<omnis_sdk::StoreAccountSession, omnis_sdk::PluginError> {
            unimplemented!()
        }
        async fn refresh_session(&self, _refresh_token: &str) -> Result<omnis_sdk::StoreAccountSession, omnis_sdk::PluginError> {
            Ok(omnis_sdk::StoreAccountSession {
                store_id: "retry_store".to_string(),
                user_id: "user999".to_string(),
                username: "RetryUser".to_string(),
                avatar_url: None,
                access_token: "refreshed_token_456".to_string(),
                refresh_token: Some("new_refresh_token".to_string()),
                expires_at: Some(chrono::Utc::now().timestamp() + 3600),
            })
        }
        async fn sync_games(&self, _session: &omnis_sdk::StoreAccountSession) -> Result<Vec<omnis_sdk::DiscoveredGame>, omnis_sdk::PluginError> {
            Ok(vec![])
        }
    }

    #[tokio::test]
    async fn test_achievements_retry_on_401_expired_token() {
        let mut service = AchievementService::new();
        service.register_provider(Box::new(MockRetryProvider));

        let db = Database::open_in_memory().unwrap();
        let vault = Arc::new(omnis_core::SecretVault::from_key([0x55; 32]));
        let store_mgr = StoreAccountManager::new(Arc::new(db), vault);
        store_mgr.register_plugin(Arc::new(MockRetryPlugin));

        // Save session whose expires_at is in the future, but token was invalidated on server
        let session = omnis_sdk::StoreAccountSession {
            store_id: "retry_store".to_string(),
            user_id: "user999".to_string(),
            username: "RetryUser".to_string(),
            avatar_url: None,
            access_token: "expired_token_123".to_string(),
            refresh_token: Some("old_refresh_token".to_string()),
            expires_at: Some(chrono::Utc::now().timestamp() + 3600),
        };
        store_mgr.save_session("retry_store", &session).unwrap();

        let game = Game::new(
            "retry_store".to_string(),
            "123".to_string(),
            "Retry Game".to_string(),
        );

        let res = service.fetch_achievements(&game, &store_mgr).await;
        assert!(res.is_ok(), "Expected retry to succeed after refreshing expired token: {:?}", res.err());
        let achs = res.unwrap();
        assert_eq!(achs.len(), 1);
        assert_eq!(achs[0].display_name, "Success After Refresh");

        // And verify session was updated in storage
        let refreshed = store_mgr.load_session("retry_store").unwrap().unwrap();
        assert_eq!(refreshed.access_token, "refreshed_token_456");
    }
}
