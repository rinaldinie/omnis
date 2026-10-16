pub mod vdf_parser;

use async_trait::async_trait;
use omnis_sdk::{
    LogLevel, PluginEvent, PluginSettingsSchema, ReactivePlugin, SettingField, SettingGroup,
    SettingType,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::info;

#[derive(Default, Serialize, Deserialize)]
pub struct SteamConfig {
    pub custom_steam_path: Option<PathBuf>,
    pub api_key: Option<String>,
    pub steam_id64: Option<String>,
    pub import_free_games: bool,
}

pub struct SteamPlugin {
    config: SteamConfig,
    #[allow(dead_code)]
    client: reqwest::Client,
}

impl Default for SteamPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl SteamPlugin {
    pub fn new() -> Self {
        Self {
            config: SteamConfig::default(),
            client: reqwest::Client::builder()
                .pool_max_idle_per_host(4)
                .tcp_nodelay(true)
                .build()
                .unwrap_or_default(),
        }
    }
}

#[async_trait]
impl ReactivePlugin for SteamPlugin {
    fn id(&self) -> &'static str {
        "steam"
    }

    fn name(&self) -> &'static str {
        "Steam Integration"
    }

    fn settings_schema(&self) -> Option<PluginSettingsSchema> {
        Some(PluginSettingsSchema {
            plugin_id: "steam".to_string(),
            title: "Steam Configuration".to_string(),
            groups: vec![
                SettingGroup {
                    id: "local_scan".to_string(),
                    title: "Local Detection".to_string(),
                    fields: vec![SettingField {
                        key: "custom_steam_path".to_string(),
                        label: "Custom Steam Path".to_string(),
                        description: Some("Override Steam installation path".to_string()),
                        required: false,
                        field_type: SettingType::Path { is_directory: true },
                    }],
                },
                SettingGroup {
                    id: "web_api".to_string(),
                    title: "Steam Web API (Optional Cloud Sync)".to_string(),
                    fields: vec![
                        SettingField {
                            key: "api_key".to_string(),
                            label: "Steam Web API Key".to_string(),
                            description: Some("Optional API Key for non-installed library sync".to_string()),
                            required: false,
                            field_type: SettingType::SecretString {
                                placeholder: Some("32-character key".to_string()),
                            },
                        },
                        SettingField {
                            key: "steam_id64".to_string(),
                            label: "SteamID64".to_string(),
                            description: Some("Your 17-digit SteamID".to_string()),
                            required: false,
                            field_type: SettingType::String {
                                default: None,
                                placeholder: Some("76561198...".to_string()),
                                regex: Some("^[0-9]{17}$".to_string()),
                            },
                        },
                        SettingField {
                            key: "import_free_games".to_string(),
                            label: "Import Free-to-Play Games".to_string(),
                            description: None,
                            required: false,
                            field_type: SettingType::Boolean { default: false },
                        },
                    ],
                },
            ],
        })
    }

    async fn initialize(&mut self, config_json: &str) -> Result<(), String> {
        if !config_json.is_empty() && config_json != "{}" {
            self.config = serde_json::from_str(config_json).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    async fn handle_event(&mut self, event: PluginEvent) -> Result<Vec<PluginEvent>, String> {
        let mut responses = Vec::new();

        match event {
            PluginEvent::SyncRequested { library_id, .. } if library_id == "steam" || library_id == "all" => {
                info!("Steam sync requested. Initiating zero-overhead local manifest scan...");

                let steam_path = self
                    .config
                    .custom_steam_path
                    .clone()
                    .or_else(vdf_parser::detect_steam_installation);

                if let Some(path) = steam_path {
                    let local_games = vdf_parser::scan_installed_games(&path);
                    info!("Discovered {} local Steam games.", local_games.len());

                    responses.push(PluginEvent::BatchGamesDiscovered {
                        library_id: "steam".to_string(),
                        games: local_games,
                    });
                } else {
                    responses.push(PluginEvent::NotificationEmitted {
                        level: LogLevel::Warn,
                        message: "Steam installation directory not found on system.".to_string(),
                    });
                }

                // Playnite multi-store discovery: Scan Epic Games manifests if "all" requested
                if library_id == "all" {
                    let epic_games = vdf_parser::scan_epic_installed_games();
                    if !epic_games.is_empty() {
                        responses.push(PluginEvent::BatchGamesDiscovered {
                            library_id: "epic".to_string(),
                            games: epic_games,
                        });
                    }
                }
            }
            _ => {}
        }

        Ok(responses)
    }
}
