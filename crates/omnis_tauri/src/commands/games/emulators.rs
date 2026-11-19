use crate::types::AppState;
use omnis_plugin_epic::EpicLibraryPlugin;
use omnis_sdk::PluginEvent;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

/// Result of a per-store installation detection check, used by the onboarding wizard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreDetectionResult {
    pub id: String,
    pub name: String,
    pub detected: bool,
    pub requires_login: bool,
    pub icon: String,
}

/// Detect which game stores are installed on the system without performing any import.
/// Used by the first-launch onboarding wizard to pre-populate the store selection list.
#[tauri::command]
pub async fn detect_stores(
    state: State<'_, AppState>,
) -> Result<Vec<StoreDetectionResult>, String> {
    let mut results = Vec::new();

    // Steam: detect via VDF library folders scan
    let steam_detected = omnis_plugin_steam::vdf_parser::detect_steam_installation().is_some();
    results.push(StoreDetectionResult {
        id: "steam".to_string(),
        name: "Steam".to_string(),
        detected: steam_detected,
        requires_login: false,
        icon: "steam".to_string(),
    });

    // Epic Games Store: detect via default manifests directory without allocating HTTP client
    let epic_detected = EpicLibraryPlugin::default_manifests_dir().exists();
    results.push(StoreDetectionResult {
        id: "epic".to_string(),
        name: "Epic Games Store".to_string(),
        detected: epic_detected,
        requires_login: false,
        icon: "epic".to_string(),
    });

    // GOG Galaxy: detect via standard installation paths on Windows
    #[cfg(target_os = "windows")]
    let gog_detected = [
        std::path::Path::new("C:\\ProgramData\\GOG.com\\Galaxy\\storage"),
        std::path::Path::new("C:\\Program Files (x86)\\GOG Galaxy"),
    ]
    .iter()
    .any(|p| p.exists());
    #[cfg(not(target_os = "windows"))]
    let gog_detected = false;

    results.push(StoreDetectionResult {
        id: "gog".to_string(),
        name: "GOG Galaxy".to_string(),
        detected: gog_detected,
        requires_login: true,
        icon: "gog".to_string(),
    });

    // Amazon Games: detect via installation path, registry, or SQLite database
    let amazon_detected = omnis_plugin_amazon::detect_amazon_games_installation().is_some();
    results.push(StoreDetectionResult {
        id: "amazon".to_string(),
        name: "Amazon Games".to_string(),
        detected: amazon_detected,
        requires_login: false,
        icon: "amazon".to_string(),
    });

    // Xbox Game Pass: detect via UWP app package directory
    #[cfg(target_os = "windows")]
    let xbox_detected = std::env::var("LOCALAPPDATA")
        .map(|local| {
            let packages = std::path::Path::new(&local).join("Packages");
            packages.join("Microsoft.GamingApp_8wekyb3d8bbwe").exists()
                || packages.join("Microsoft.XboxApp_8wekyb3d8bbwe").exists()
        })
        .unwrap_or(false);
    #[cfg(not(target_os = "windows"))]
    let xbox_detected = false;

    results.push(StoreDetectionResult {
        id: "xbox".to_string(),
        name: "Xbox Game Pass".to_string(),
        detected: xbox_detected,
        requires_login: true,
        icon: "xbox".to_string(),
    });

    // Nintendo Switch: any supported emulator found (installed, portable or picked by hand)
    let switch_detected = !omnis_plugin_emulators::EmulatorsPlugin::new()
        .with_data_dir(emulators_data_dir(&state))
        .detect_switch_emulators()
        .is_empty();
    results.push(StoreDetectionResult {
        id: omnis_plugin_emulators::SWITCH_LIBRARY_ID.to_string(),
        name: "Nintendo Switch".to_string(),
        detected: switch_detected,
        requires_login: false,
        icon: "switch".to_string(),
    });

    Ok(results)
}

/// Folder owned by Omnis for the emulator integration (settings and extracted icons).
fn emulators_data_dir(state: &AppState) -> PathBuf {
    state.plugins_dir.join(omnis_plugin_emulators::PLUGIN_ID)
}

/// Name of the supported emulator an executable picked by the user belongs to, if any.
#[tauri::command]
pub async fn identify_emulator_executable(path: String) -> Option<String> {
    omnis_plugin_emulators::spec_for_executable(std::path::Path::new(&path))
        .map(|spec| spec.display_name.to_string())
}

/// Emulators found on this machine (Settings > Emulators).
#[tauri::command]
pub async fn get_emulator_status(
    state: State<'_, AppState>,
) -> Result<Vec<omnis_plugin_emulators::EmulatorStatus>, String> {
    let plugin =
        omnis_plugin_emulators::EmulatorsPlugin::new().with_data_dir(emulators_data_dir(&state));
    Ok(plugin.emulator_status())
}

#[tauri::command]
pub async fn get_emulator_settings(
    state: State<'_, AppState>,
) -> Result<omnis_plugin_emulators::EmulatorSettings, String> {
    Ok(omnis_plugin_emulators::EmulatorSettings::load(
        &emulators_data_dir(&state),
    ))
}

/// Saves the emulator settings and re-syncs the Switch library right away, so a new
/// default / per-game emulator (or the keys option) applies without a full library sync.
#[tauri::command]
pub async fn set_emulator_settings(
    settings: omnis_plugin_emulators::EmulatorSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    settings
        .save(&emulators_data_dir(&state))
        .map_err(|e| e.to_string())?;
    state
        .host
        .dispatch_event_and_wait(
            None,
            PluginEvent::SyncRequested {
                library_id: omnis_plugin_emulators::SWITCH_LIBRARY_ID.to_string(),
                force_full: false,
            },
        )
        .await;
    Ok(())
}
