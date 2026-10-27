//! Domain service coordinating polymorphic achievement retrieval, persistence, and asset caching

use omnis_core::achievements::AchievementCacheManager;
use omnis_core::Database;
use omnis_plugin_epic::EpicLibraryPlugin;
use omnis_plugin_gog::GogCloudPlugin;
use omnis_plugin_steam::SteamPlugin;
use omnis_plugin_xbox::XboxCloudPlugin;
use omnis_sdk::{Achievement, AchievementProvider, Game, GameAchievementsSummary};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tracing::warn;
use uuid::Uuid;

use crate::store_manager::StoreAccountManager;

/// Domain service that coordinates achievement providers, session resolution,
/// local persistence, and background icon caching.
pub struct AchievementService {
    providers: HashMap<String, Box<dyn AchievementProvider>>,
}

impl AchievementService {
    pub fn new() -> Self {
        let mut service = Self {
            providers: HashMap::new(),
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
            "steam" => Some(
                store_account_manager
                    .load_session("steam")
                    .map_err(|e| format!("Errore nel caricamento della sessione Steam: {e}"))?
                    .ok_or_else(|| {
                        "Nessun account Steam configurato. Inserisci la Steam Web API Key e l'ID Account nelle impostazioni Store.".to_string()
                    })?,
            ),
            "xbox" => Some(
                store_account_manager
                    .load_session("xbox")
                    .map_err(|e| format!("Error loading Xbox session: {e}"))?
                    .ok_or_else(|| {
                        "No active Xbox account found. Please connect your Xbox account in Store Accounts.".to_string()
                    })?,
            ),
            "gog" => Some(
                store_account_manager
                    .load_session("gog")
                    .map_err(|e| format!("Error loading GOG session: {e}"))?
                    .ok_or_else(|| {
                        "No active GOG Galaxy account found. Please connect your GOG account in Store Accounts.".to_string()
                    })?,
            ),
            "epic" => store_account_manager.load_session("epic").ok().flatten(),
            _ => store_account_manager.load_session(&game.library_id).ok().flatten(),
        };

        provider.fetch_achievements(game, session.as_ref()).await
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

        let achievements = self.fetch_achievements(&game, store_account_manager).await?;

        db.upsert_achievements(game_id, &achievements)
            .map_err(|e| format!("Database error saving achievements: {e}"))?;

        let db_clone = Arc::clone(db);
        let cache_dir = app_dir.join("cache").join("achievements");
        let cache_manager = AchievementCacheManager::new(cache_dir);
        tokio::spawn(async move {
            if let Err(e) = cache_manager
                .cache_achievements_for_game(&db_clone, game_id, &achievements)
                .await
            {
                warn!("Achievement icon caching had errors for {game_id}: {e}");
            }
        });

        db.get_game_achievements(game_id)
            .map_err(|e| format!("Database error reading achievement summary: {e}"))
    }
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
        assert!(service.providers.contains_key("steam"));
        assert!(service.providers.contains_key("xbox"));
        assert!(service.providers.contains_key("gog"));
        assert!(service.providers.contains_key("epic"));
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
                name: "Mock Achieved".to_string(),
                description: "Mock Description".to_string(),
                icon_url: None,
                unlocked: true,
                unlock_time: None,
                rarity_percentage: Some(50.0),
            }])
        }
    }

    #[tokio::test]
    async fn test_custom_provider_registration() {
        let mut service = AchievementService::new();
        service.register_provider(Box::new(MockProvider));
        assert!(service.providers.contains_key("mock_store"));

        let db = Database::ephemeral();
        let vault = Arc::new(omnis_core::SecretVault::ephemeral());
        let store_mgr = StoreAccountManager::new(Arc::new(db), vault);

        let game = Game {
            id: Uuid::new_v4(),
            library_id: "mock_store".to_string(),
            external_id: "123".to_string(),
            title: "Mock Game".to_string(),
            is_installed: true,
            install_dir: None,
            executable_path: None,
            launch_arguments: vec![],
            working_dir: None,
            cover_image_path: None,
            background_image_path: None,
            icon_image_path: None,
            playtime_seconds: 0,
            play_count: 0,
            last_activity: None,
            description: None,
            release_date: None,
            critic_score: None,
            community_score: None,
            genres: vec![],
            developers: vec![],
            publishers: vec![],
            tags: vec![],
            categories: vec![],
            features: vec![],
            series: None,
            age_rating: None,
            completion_status: None,
            user_notes: None,
            custom_links: vec![],
            extra_metadata: None,
            is_favorite: false,
            is_hidden: false,
        };

        let res = service.fetch_achievements(&game, &store_mgr).await;
        assert!(res.is_ok());
        let achs = res.unwrap();
        assert_eq!(achs.len(), 1);
        assert_eq!(achs[0].id, "mock_1");
    }

    #[tokio::test]
    async fn test_unsupported_store_error() {
        let service = AchievementService::new();
        let db = Database::ephemeral();
        let vault = Arc::new(omnis_core::SecretVault::ephemeral());
        let store_mgr = StoreAccountManager::new(Arc::new(db), vault);

        let game = Game {
            id: Uuid::new_v4(),
            library_id: "unsupported_unknown".to_string(),
            external_id: "123".to_string(),
            title: "Unknown Game".to_string(),
            is_installed: true,
            install_dir: None,
            executable_path: None,
            launch_arguments: vec![],
            working_dir: None,
            cover_image_path: None,
            background_image_path: None,
            icon_image_path: None,
            playtime_seconds: 0,
            play_count: 0,
            last_activity: None,
            description: None,
            release_date: None,
            critic_score: None,
            community_score: None,
            genres: vec![],
            developers: vec![],
            publishers: vec![],
            tags: vec![],
            categories: vec![],
            features: vec![],
            series: None,
            age_rating: None,
            completion_status: None,
            user_notes: None,
            custom_links: vec![],
            extra_metadata: None,
            is_favorite: false,
            is_hidden: false,
        };

        let res = service.fetch_achievements(&game, &store_mgr).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Achievements are currently not supported for store 'unsupported_unknown'"));
    }
}
