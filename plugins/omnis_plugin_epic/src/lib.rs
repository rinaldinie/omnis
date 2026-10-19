use async_trait::async_trait;
use omnis_sdk::{
    CloudStorePlugin, DiscoveredGame, LaunchConfiguration, LibraryPlugin, PluginError,
    ProcessTrackingMode, StoreAccountSession,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub mod client;

/// Deserialized structure of an Epic Games Store `.item` manifest
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EpicManifest {
    #[serde(rename = "AppName")]
    pub app_name: String,
    #[serde(rename = "DisplayName")]
    pub display_name: String,
    #[serde(rename = "InstallLocation")]
    pub install_location: PathBuf,
    #[serde(rename = "LaunchExecutable")]
    pub launch_executable: String,
    #[serde(rename = "AppVersionString", default)]
    pub app_version: Option<String>,
}

/// Epic Games Store Library Plugin for Omnis Game Library
#[derive(Debug, Clone)]
pub struct EpicLibraryPlugin {
    pub custom_manifests_path: Option<PathBuf>,
    pub client: reqwest::Client,
}

impl Default for EpicLibraryPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl EpicLibraryPlugin {
    pub fn new() -> Self {
        Self {
            custom_manifests_path: None,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
        }
    }

    pub fn with_custom_path(path: PathBuf) -> Self {
        Self {
            custom_manifests_path: Some(path),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
        }
    }

    pub fn with_client(client: reqwest::Client) -> Self {
        Self {
            custom_manifests_path: None,
            client,
        }
    }

    pub fn with_custom_path_and_client(path: PathBuf, client: reqwest::Client) -> Self {
        Self {
            custom_manifests_path: Some(path),
            client,
        }
    }

    /// Resolve the Epic Games manifests directory
    /// Defaults to `%PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests` with fallback to `C:\ProgramData\...`
    pub fn detect_manifests_dir(&self) -> PathBuf {
        if let Some(ref custom) = self.custom_manifests_path {
            return custom.clone();
        }

        let program_data = std::env::var("PROGRAMDATA")
            .unwrap_or_else(|_| "C:\\ProgramData".to_string());
        PathBuf::from(program_data)
            .join("Epic")
            .join("EpicGamesLauncher")
            .join("Data")
            .join("Manifests")
    }
}

#[async_trait]
impl LibraryPlugin for EpicLibraryPlugin {
    fn id(&self) -> &str {
        "epic"
    }

    fn name(&self) -> &str {
        "Epic Games Store"
    }

    async fn scan(&self) -> Result<Vec<DiscoveredGame>, PluginError> {
        let manifest_dir = self.detect_manifests_dir();
        if !manifest_dir.exists() {
            tracing::info!(
                "Epic Games manifests directory not found: {:?}",
                manifest_dir
            );
            return Ok(Vec::new());
        }

        let mut games = Vec::new();
        let entries = std::fs::read_dir(&manifest_dir)?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("item") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    match serde_json::from_str::<EpicManifest>(&content) {
                        Ok(manifest) => {
                            let exe_path = manifest.install_location.join(&manifest.launch_executable);
                            let is_installed = exe_path.exists();

                            let launch_config = LaunchConfiguration {
                                executable: format!(
                                    "com.epicgames.launcher://apps/{}?action=launch&silent=true",
                                    manifest.app_name
                                ),
                                arguments: vec![],
                                working_dir: Some(manifest.install_location.clone()),
                                tracking_mode: ProcessTrackingMode::ProcessName(manifest.launch_executable.clone()),
                            };

                            games.push(DiscoveredGame {
                                library_id: "epic".to_string(),
                                external_id: manifest.app_name,
                                title: manifest.display_name,
                                install_dir: Some(manifest.install_location),
                                is_installed,
                                play_action: Some(launch_config),
                                playtime_seconds: 0,
                                play_count: 0,
                                last_activity: None,
                                cover_image_path: None,
                                background_image_path: None,
                            });
                        }
                        Err(e) => {
                            tracing::warn!("Failed to deserialize Epic manifest {:?}: {}", path, e);
                        }
                    }
                }
            }
        }

        tracing::info!("Discovered {} local Epic Games titles.", games.len());
        Ok(games)
    }
}

#[async_trait]
impl CloudStorePlugin for EpicLibraryPlugin {
    fn login_url(&self) -> String {
        client::EPIC_AUTH_URL.to_string()
    }

    fn is_redirect_url(&self, url: &str) -> bool {
        (url.contains("epicgames.com/id/api/redirect") || url.contains("localhost/launcher/authorized"))
            && (url.contains("code=") || url.contains("authorizationCode=") || url.contains("exchangeCode="))
    }

    async fn exchange_code(&self, redirect_url: &str) -> Result<StoreAccountSession, PluginError> {
        let code = client::extract_exchange_code(redirect_url).ok_or_else(|| {
            PluginError::Parse(format!(
                "Impossibile estrarre il codice dall'URL di redirect Epic: {}",
                redirect_url
            ))
        })?;
        client::exchange_code(&self.client, &code).await
    }

    async fn refresh_session(&self, refresh_token: &str) -> Result<StoreAccountSession, PluginError> {
        client::refresh_token(&self.client, refresh_token).await
    }

    async fn sync_games(&self, session: &StoreAccountSession) -> Result<Vec<DiscoveredGame>, PluginError> {
        client::fetch_user_games(&self.client, session).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::{
        extract_exchange_code, normalize_epic_entitlement, EpicEntitlement,
        EpicOAuthTokenResponse,
    };

    const SAMPLE_EPIC_MANIFEST: &str = r#"{
        "FormatVersion": 0,
        "AppVersionString": "1.0.4",
        "AppName": "Salt",
        "CatalogItemId": "8756c9a099f7435f939e0116812837ff",
        "CatalogNamespace": "arrow",
        "DisplayName": "Salt 2: Shores of Gold",
        "InstallationStatus": "Complete",
        "InstallLocation": "C:\\Games\\Salt2",
        "MainGameAppName": "Salt",
        "LaunchExecutable": "Salt2.exe",
        "ManifestLocation": "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests",
        "StagingLocation": "C:\\Games\\.staging"
    }"#;

    #[test]
    fn test_parse_epic_manifest_full() {
        let manifest: EpicManifest = serde_json::from_str(SAMPLE_EPIC_MANIFEST)
            .expect("Failed to deserialize sample Epic manifest");

        assert_eq!(manifest.app_name, "Salt");
        assert_eq!(manifest.display_name, "Salt 2: Shores of Gold");
        assert_eq!(manifest.install_location, PathBuf::from("C:\\Games\\Salt2"));
        assert_eq!(manifest.launch_executable, "Salt2.exe");
        assert_eq!(manifest.app_version, Some("1.0.4".to_string()));
    }

    #[test]
    fn test_parse_epic_manifest_missing_version() {
        let json_without_version = r#"{
            "AppName": "FallGuys",
            "DisplayName": "Fall Guys",
            "InstallLocation": "D:\\EpicGames\\FallGuys",
            "LaunchExecutable": "FallGuys_client.exe"
        }"#;

        let manifest: EpicManifest = serde_json::from_str(json_without_version)
            .expect("Failed to parse manifest without version");

        assert_eq!(manifest.app_name, "FallGuys");
        assert_eq!(manifest.display_name, "Fall Guys");
        assert_eq!(manifest.install_location, PathBuf::from("D:\\EpicGames\\FallGuys"));
        assert_eq!(manifest.launch_executable, "FallGuys_client.exe");
        assert_eq!(manifest.app_version, None);
    }

    #[tokio::test]
    async fn test_scan_with_temp_manifest_dir() {
        let temp_dir = std::env::temp_dir().join(format!("omnis_epic_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let item_file = temp_dir.join("0123456789ABCDEF.item");
        std::fs::write(&item_file, SAMPLE_EPIC_MANIFEST).unwrap();

        // Also add an ignored non-.item file to test filtering
        let other_file = temp_dir.join("ignored.txt");
        std::fs::write(&other_file, "ignored content").unwrap();

        let plugin = EpicLibraryPlugin::with_custom_path(temp_dir.clone());
        assert_eq!(plugin.id(), "epic");
        assert_eq!(plugin.name(), "Epic Games Store");

        let games = plugin.scan().await.expect("Scan should succeed");
        assert_eq!(games.len(), 1);

        let game = &games[0];
        assert_eq!(game.library_id, "epic");
        assert_eq!(game.external_id, "Salt");
        assert_eq!(game.title, "Salt 2: Shores of Gold");
        assert_eq!(game.install_dir, Some(PathBuf::from("C:\\Games\\Salt2")));

        let play_action = game.play_action.as_ref().expect("Should have play_action");
        assert_eq!(
            play_action.executable,
            "com.epicgames.launcher://apps/Salt?action=launch&silent=true"
        );
        assert_eq!(play_action.arguments, Vec::<String>::new());
        assert_eq!(play_action.working_dir, Some(PathBuf::from("C:\\Games\\Salt2")));
        assert_eq!(
            play_action.tracking_mode,
            ProcessTrackingMode::ProcessName("Salt2.exe".to_string())
        );

        // Cleanup
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_scan_non_existent_dir_returns_empty() {
        let non_existent = PathBuf::from("Z:\\Definitely\\NonExistent\\Path\\Manifests");
        let plugin = EpicLibraryPlugin::with_custom_path(non_existent);
        let games = plugin.scan().await.expect("Scan should return Ok");
        assert!(games.is_empty());
    }

    #[test]
    fn test_extract_code_from_redirect_url() {
        let url_code = "https://www.epicgames.com/id/api/redirect?code=MOCK_EXCHANGE_CODE_123";
        assert_eq!(
            extract_exchange_code(url_code),
            Some("MOCK_EXCHANGE_CODE_123".to_string())
        );

        let url_exchange = "https://www.epicgames.com/id/api/redirect?exchangeCode=MOCK_EXCHANGE_CODE_456";
        assert_eq!(
            extract_exchange_code(url_exchange),
            Some("MOCK_EXCHANGE_CODE_456".to_string())
        );

        let url_fragment = "https://www.epicgames.com/id/api/redirect#exchangeCode=MOCK_EXCHANGE_CODE_789";
        assert_eq!(
            extract_exchange_code(url_fragment),
            Some("MOCK_EXCHANGE_CODE_789".to_string())
        );

        let url_fragment_code = "https://www.epicgames.com/id/api/redirect#code=MOCK_CODE_ABC";
        assert_eq!(
            extract_exchange_code(url_fragment_code),
            Some("MOCK_CODE_ABC".to_string())
        );

        let url_invalid = "https://www.epicgames.com/id/api/redirect";
        assert_eq!(extract_exchange_code(url_invalid), None);
    }

    #[test]
    fn test_epic_oauth_token_response_deserialization() {
        let json_data = r#"{
            "access_token": "eg1_mock_access_token_12345",
            "refresh_token": "eg1_mock_refresh_token_67890",
            "expires_in": 7200,
            "account_id": "abc123456789def",
            "display_name": "EpicGamerX"
        }"#;

        let token_resp: EpicOAuthTokenResponse =
            serde_json::from_str(json_data).expect("Failed to deserialize EpicOAuthTokenResponse");

        assert_eq!(token_resp.access_token, "eg1_mock_access_token_12345");
        assert_eq!(
            token_resp.refresh_token,
            Some("eg1_mock_refresh_token_67890".to_string())
        );
        assert_eq!(token_resp.expires_in, Some(7200));
        assert_eq!(token_resp.account_id, "abc123456789def");
        assert_eq!(token_resp.display_name, Some("EpicGamerX".to_string()));

        // Also test camelCase aliases
        let json_camel = r#"{
            "access_token": "token_abc",
            "accountId": "acc_xyz",
            "displayName": "PlayerOne"
        }"#;
        let token_camel: EpicOAuthTokenResponse =
            serde_json::from_str(json_camel).expect("Failed to deserialize camelCase token");
        assert_eq!(token_camel.account_id, "acc_xyz");
        assert_eq!(token_camel.display_name, Some("PlayerOne".to_string()));
        assert_eq!(token_camel.refresh_token, None);
        assert_eq!(token_camel.expires_in, None);
    }

    #[test]
    fn test_epic_entitlement_deserialization_and_normalization() {
        let json_entitlement = r#"{
            "id": "entitlement_001",
            "entitlementName": "Death Stranding",
            "namespace": "f96f1301c34a478cbef1f5c6b9d62888",
            "catalogItemId": "de6747b0a72740bc8f7c9e03d4cc7e41",
            "grantDate": "2023-12-25T16:00:00.000Z"
        }"#;

        let entitlement: EpicEntitlement =
            serde_json::from_str(json_entitlement).expect("Failed to deserialize EpicEntitlement");

        assert_eq!(entitlement.id, "entitlement_001");
        assert_eq!(entitlement.entitlement_name, Some("Death Stranding".to_string()));
        assert_eq!(
            entitlement.catalog_item_id,
            Some("de6747b0a72740bc8f7c9e03d4cc7e41".to_string())
        );

        let discovered = normalize_epic_entitlement(&entitlement);
        assert_eq!(discovered.library_id, "epic");
        assert_eq!(discovered.external_id, "de6747b0a72740bc8f7c9e03d4cc7e41");
        assert_eq!(discovered.title, "Death Stranding");
        assert!(!discovered.is_installed);
        assert_eq!(discovered.install_dir, None);
        assert_eq!(discovered.playtime_seconds, 0);
        assert_eq!(discovered.play_count, 0);

        let play_action = discovered.play_action.expect("Play action must be present");
        assert_eq!(
            play_action.executable,
            "com.epicgames.launcher://apps/de6747b0a72740bc8f7c9e03d4cc7e41?action=install"
        );
        assert!(play_action.arguments.is_empty());
        assert_eq!(play_action.working_dir, None);
        assert_eq!(
            play_action.tracking_mode,
            ProcessTrackingMode::ProcessName("EpicGamesLauncher.exe".to_string())
        );

        // Test fallback when catalog_item_id and entitlement_name are missing
        let fallback_entitlement = EpicEntitlement {
            id: "fallback_id_999".to_string(),
            entitlement_name: None,
            namespace: None,
            catalog_item_id: None,
            grant_date: None,
        };
        let fallback_discovered = normalize_epic_entitlement(&fallback_entitlement);
        assert_eq!(fallback_discovered.external_id, "fallback_id_999");
        assert_eq!(fallback_discovered.title, "fallback_id_999");
        assert_eq!(
            fallback_discovered.play_action.unwrap().executable,
            "com.epicgames.launcher://apps/fallback_id_999?action=install"
        );
    }

    #[test]
    fn test_cloud_store_plugin_interface() {
        let plugin = EpicLibraryPlugin::new();
        assert_eq!(plugin.id(), "epic");
        assert_eq!(plugin.name(), "Epic Games Store");

        let login_url = plugin.login_url();
        assert!(login_url.contains(client::EPIC_CLIENT_ID));
        assert!(login_url.contains("redirectUrl="));

        assert!(plugin.is_redirect_url("https://www.epicgames.com/id/api/redirect?code=MOCK_CODE"));
        assert!(plugin.is_redirect_url("https://www.epicgames.com/id/api/redirect?exchangeCode=MOCK_EXCHANGE"));
        assert!(plugin.is_redirect_url("https://www.epicgames.com/id/api/redirect#code=MOCK_CODE"));
        assert!(plugin.is_redirect_url("https://www.epicgames.com/id/api/redirect#exchangeCode=MOCK_CODE"));
        assert!(plugin.is_redirect_url("https://localhost/launcher/authorized?code=MOCK_CODE"));
        assert!(plugin.is_redirect_url("https://www.epicgames.com/id/api/redirect?authorizationCode=MOCK_CODE"));
        assert!(!plugin.is_redirect_url("https://www.epicgames.com/id/api/redirect"));
        assert!(!plugin.is_redirect_url("https://store.epicgames.com/browse"));
    }
}
