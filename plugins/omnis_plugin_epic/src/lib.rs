use async_trait::async_trait;
use omnis_sdk::{
    DiscoveredGame, LaunchConfiguration, LibraryPlugin, PluginError, ProcessTrackingMode,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

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
#[derive(Debug, Clone, Default)]
pub struct EpicLibraryPlugin {
    pub custom_manifests_path: Option<PathBuf>,
}

impl EpicLibraryPlugin {
    pub fn new() -> Self {
        Self {
            custom_manifests_path: None,
        }
    }

    pub fn with_custom_path(path: PathBuf) -> Self {
        Self {
            custom_manifests_path: Some(path),
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
