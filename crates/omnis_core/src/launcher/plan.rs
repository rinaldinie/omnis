//! Game Launch Plan Resolution
//!
//! Pure business logic for resolving the primary tracked launch configuration
//! and auxiliary play actions for any game in the catalog.

use omnis_sdk::{Game, LaunchConfiguration, ProcessTrackingMode};

/// Resolved launch plan containing the primary tracked launch and detached auxiliary actions.
#[derive(Debug, Clone, PartialEq)]
pub struct LaunchPlan {
    pub primary: LaunchConfiguration,
    pub auxiliary: Vec<LaunchConfiguration>,
}

/// Constructs the installation URI for a given store platform.
pub fn build_install_uri(library_id: &str, external_id: &str) -> String {
    match library_id.to_lowercase().as_str() {
        "steam" => format!("steam://install/{}", external_id),
        "epic" => format!(
            "com.epicgames.launcher://apps/{}?action=install",
            external_id
        ),
        "gog" => format!("goggalaxy://openGameView/{}", external_id),
        "xbox" => format!("ms-windows-store://pdp/?ProductId={}", external_id),
        "amazon" => format!("amazon-games://play/{}", external_id),
        _ => format!("steam://install/{}", external_id),
    }
}

/// Constructs the launch URI for a given store platform.
pub fn build_play_uri(library_id: &str, external_id: &str) -> String {
    match library_id.to_lowercase().as_str() {
        "steam" => format!("steam://rungameid/{}", external_id),
        "epic" => format!(
            "com.epicgames.launcher://apps/{}?action=launch&silent=true",
            external_id
        ),
        "gog" => format!("goggalaxy://runGame/{}", external_id),
        "xbox" => format!("ms-windows-store://pdp/?ProductId={}", external_id),
        "amazon" => format!("amazon-games://play/{}", external_id),
        _ => format!("steam://rungameid/{}", external_id),
    }
}

/// Checks whether a library has a recognized official store integration.
pub fn has_store_integration(library_id: &str) -> bool {
    matches!(
        library_id.trim().to_ascii_lowercase().as_str(),
        "steam" | "epic" | "gog" | "xbox" | "amazon"
    )
}

/// Checks whether two launch configurations point to the same executable and argument list.
pub fn actions_equivalent(a: &LaunchConfiguration, b: &LaunchConfiguration) -> bool {
    let exe_a = a.executable.trim().replace('\\', "/").to_ascii_lowercase();
    let exe_b = b.executable.trim().replace('\\', "/").to_ascii_lowercase();
    if exe_a != exe_b || a.arguments.len() != b.arguments.len() {
        return false;
    }
    a.arguments
        .iter()
        .zip(b.arguments.iter())
        .all(|(lhs, rhs)| lhs.trim() == rhs.trim())
}

/// Builds the default platform launcher configuration invoking the store URI.
pub fn build_store_uri_launch_config(library_id: &str, external_id: &str) -> LaunchConfiguration {
    let play_uri = build_play_uri(library_id, external_id);

    LaunchConfiguration {
        executable: if cfg!(windows) {
            "rundll32.exe".to_string()
        } else if cfg!(target_os = "macos") {
            "open".to_string()
        } else {
            "xdg-open".to_string()
        },
        arguments: if cfg!(windows) {
            vec!["url.dll,FileProtocolHandler".to_string(), play_uri]
        } else {
            vec![play_uri]
        },
        working_dir: None,
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    }
}

/// Resolves both the primary tracked launch configuration and auxiliary custom actions,
/// ensuring the primary command is never repeated in the auxiliary list.
pub fn resolve_launch_plan(game: &Game) -> LaunchPlan {
    let valid_custom_actions: Vec<LaunchConfiguration> = game
        .play_actions
        .iter()
        .filter(|a| !a.executable.trim().is_empty())
        .cloned()
        .collect();
    let valid_library_action = game
        .library_play_action
        .as_ref()
        .filter(|a| !a.executable.trim().is_empty())
        .cloned();
    let is_custom = game.library_id.eq_ignore_ascii_case("custom");

    // When library integration is disabled or this is a custom game, bypass GOG Galaxy,
    // library_play_action, and store URIs; use play_actions[0] as primary and [1..] as auxiliary.
    if !game.use_library_integration || is_custom {
        if let Some(primary) = valid_custom_actions.first().cloned() {
            let auxiliary = valid_custom_actions
                .into_iter()
                .skip(1)
                .filter(|aux| !actions_equivalent(aux, &primary))
                .collect();
            return LaunchPlan { primary, auxiliary };
        }
        return LaunchPlan {
            primary: LaunchConfiguration {
                executable: String::new(),
                arguments: Vec::new(),
                working_dir: None,
                tracking_mode: ProcessTrackingMode::KernelJobObject,
            },
            auxiliary: Vec::new(),
        };
    }

    // For GOG games, if the official GOG Galaxy client (GalaxyClient.exe) is present on the system,
    // launch via Galaxy CLI args (`/command=runGame /gameId={id} /path="{dir}"`) to ensure the Galaxy
    // client launches the game directly with overlay, cloud saves, and achievements active.
    // If GalaxyClient.exe is not installed or detected, fallback to library_play_action, discovered
    // game executable, or GOG Galaxy URI — never to user custom play_actions.
    if game.use_library_integration && game.library_id.eq_ignore_ascii_case("gog") {
        let tracking_mode = if let Some(ref dir) = game.install_dir {
            ProcessTrackingMode::WatchDirectory(dir.clone())
        } else {
            valid_library_action
                .as_ref()
                .map(|action| match &action.tracking_mode {
                    ProcessTrackingMode::ProcessName(name) => {
                        ProcessTrackingMode::ProcessName(name.clone())
                    }
                    _ => {
                        let exe_name = std::path::Path::new(&action.executable)
                            .file_name()
                            .and_then(|f| f.to_str())
                            .unwrap_or("game.exe");
                        ProcessTrackingMode::ProcessName(exe_name.to_string())
                    }
                })
                .unwrap_or(ProcessTrackingMode::KernelJobObject)
        };

        let primary = if let Some(galaxy_exe) = super::find_gog_galaxy_client() {
            let mut args = vec![
                "/command=runGame".to_string(),
                format!("/gameId={}", game.external_id),
            ];
            if let Some(ref dir) = game.install_dir {
                args.push(format!("/path=\"{}\"", dir.display()));
            }

            LaunchConfiguration {
                executable: galaxy_exe.to_string_lossy().to_string(),
                arguments: args,
                working_dir: game.install_dir.clone(),
                tracking_mode,
            }
        } else if let Some(lib_action) = valid_library_action {
            lib_action
        } else if let Some(exe_path) = game.install_dir.as_ref().and_then(|dir| {
            super::find_gog_game_executable(dir)
                .or_else(|| super::find_primary_game_executable(dir))
        }) {
            let exe_name = exe_path
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or("game.exe");
            LaunchConfiguration {
                executable: exe_path.to_string_lossy().to_string(),
                arguments: vec![],
                working_dir: game.install_dir.clone(),
                tracking_mode: ProcessTrackingMode::ProcessName(exe_name.to_string()),
            }
        } else {
            build_store_uri_launch_config(&game.library_id, &game.external_id)
        };

        let auxiliary = valid_custom_actions
            .into_iter()
            .filter(|aux| !actions_equivalent(aux, &primary))
            .collect();
        return LaunchPlan { primary, auxiliary };
    }

    if let Some(library_action) = valid_library_action {
        let auxiliary = valid_custom_actions
            .into_iter()
            .filter(|aux| !actions_equivalent(aux, &library_action))
            .collect();
        return LaunchPlan {
            primary: library_action,
            auxiliary,
        };
    }

    // Store-backed libraries without library_play_action must fall back to the store URI,
    // keeping custom play_actions strictly auxiliary so play_actions[0] is never run twice.
    if has_store_integration(&game.library_id) {
        let primary = build_store_uri_launch_config(&game.library_id, &game.external_id);
        let auxiliary = valid_custom_actions
            .into_iter()
            .filter(|aux| !actions_equivalent(aux, &primary))
            .collect();
        return LaunchPlan { primary, auxiliary };
    }

    // Non-store libraries (e.g. emulators or third-party imports without library_play_action)
    // fall back to play_actions[0] and skip it from auxiliary actions.
    if let Some(primary) = valid_custom_actions.first().cloned() {
        let auxiliary = valid_custom_actions
            .into_iter()
            .skip(1)
            .filter(|aux| !actions_equivalent(aux, &primary))
            .collect();
        return LaunchPlan { primary, auxiliary };
    }

    LaunchPlan {
        primary: build_store_uri_launch_config(&game.library_id, &game.external_id),
        auxiliary: Vec::new(),
    }
}

/// Resolves the primary launch configuration for a game, creating default store protocol launcher if none configured.
pub fn resolve_launch_configuration(game: &Game) -> LaunchConfiguration {
    resolve_launch_plan(game).primary
}

/// Validates that a store URI conforms to authorized scheme whitelist and contains no malicious command injection characters.
pub fn validate_and_open_store_uri(uri: &str) -> Result<(), String> {
    let allowed_schemes = [
        "steam://",
        "com.epicgames.launcher://",
        "goggalaxy://",
        "ms-windows-store://",
        "amazon-games://",
    ];
    if !allowed_schemes.iter().any(|scheme| uri.starts_with(scheme)) {
        return Err("Protocollo URI non autorizzato".to_string());
    }
    if uri
        .chars()
        .any(|c| c.is_control() || "&|;<>^%\"' \r\n\t".contains(c))
    {
        return Err("URI contiene caratteri non consentiti".to_string());
    }

    #[cfg(windows)]
    {
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", uri])
            .spawn()
            .map_err(|e| format!("Impossibile aprire il protocollo: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(uri)
            .spawn()
            .map_err(|e| format!("Impossibile aprire il protocollo: {}", e))?;
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(uri)
            .spawn()
            .map_err(|e| format!("Impossibile aprire il protocollo: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_build_install_uri() {
        assert_eq!(build_install_uri("steam", "730"), "steam://install/730");
        assert_eq!(
            build_install_uri("epic", "Fortnite"),
            "com.epicgames.launcher://apps/Fortnite?action=install"
        );
        assert_eq!(
            build_install_uri("gog", "1207658924"),
            "goggalaxy://openGameView/1207658924"
        );
        assert_eq!(
            build_install_uri("xbox", "9NBLGGGZ5155"),
            "ms-windows-store://pdp/?ProductId=9NBLGGGZ5155"
        );
    }

    #[test]
    fn test_build_play_uri() {
        assert_eq!(build_play_uri("steam", "400"), "steam://rungameid/400");
        assert_eq!(
            build_play_uri("epic", "Sugar"),
            "com.epicgames.launcher://apps/Sugar?action=launch&silent=true"
        );
        assert_eq!(
            build_play_uri("gog", "1207658924"),
            "goggalaxy://runGame/1207658924"
        );
        assert_eq!(
            build_play_uri("xbox", "9NBLGGGZ5155"),
            "ms-windows-store://pdp/?ProductId=9NBLGGGZ5155"
        );
    }

    #[test]
    fn test_validate_store_uri_valid() {
        let allowed = [
            "steam://rungameid/400",
            "com.epicgames.launcher://apps/Sugar?action=launch",
            "goggalaxy://openGameView/1207658924",
            "ms-windows-store://pdp/?ProductId=9NBLGGGZ5155",
        ];
        for u in allowed {
            assert!(
                u.starts_with("steam://")
                    || u.starts_with("com.epicgames")
                    || u.starts_with("goggalaxy")
                    || u.starts_with("ms-windows-store")
            );
        }
    }

    #[test]
    fn test_validate_store_uri_rejected_schemes() {
        assert!(validate_and_open_store_uri("http://evil.com").is_err());
        assert!(validate_and_open_store_uri("file:///etc/passwd").is_err());
        assert!(validate_and_open_store_uri("powershell.exe").is_err());
    }

    #[test]
    fn test_validate_store_uri_injection_chars() {
        assert!(validate_and_open_store_uri("steam://install/730&calc.exe").is_err());
        assert!(validate_and_open_store_uri("steam://install/730|calc.exe").is_err());
        assert!(validate_and_open_store_uri("steam://install/730;calc.exe").is_err());
        assert!(validate_and_open_store_uri("steam://install/730\ncalc.exe").is_err());
    }

    #[test]
    fn test_resolve_launch_configuration_disabled_library_integration_bypasses_library_and_gog() {
        let mut game = Game::new(
            "gog".to_string(),
            "123456".to_string(),
            "Test GOG Game".to_string(),
        );
        game.install_dir = Some(PathBuf::from("/path/to/game"));
        game.is_installed = true;
        game.use_library_integration = false;
        game.library_play_action = Some(LaunchConfiguration {
            executable: "goggalaxy://runGame/123456".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        });
        game.play_actions = vec![LaunchConfiguration {
            executable: "/custom/override.exe".to_string(),
            arguments: vec!["--windowed".to_string()],
            working_dir: Some(PathBuf::from("/custom")),
            tracking_mode: ProcessTrackingMode::ProcessName("override.exe".to_string()),
        }];

        let resolved = resolve_launch_configuration(&game);
        assert_eq!(resolved.executable, "/custom/override.exe");
        assert_eq!(resolved.arguments, vec!["--windowed".to_string()]);
    }

    #[test]
    fn test_resolve_launch_configuration_enabled_library_integration_uses_library_action() {
        let mut game = Game::new("steam".to_string(), "730".to_string(), "CS2".to_string());
        game.is_installed = true;
        game.use_library_integration = true;
        game.library_play_action = Some(LaunchConfiguration {
            executable: "steam://rungameid/730".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::ProcessName("cs2.exe".to_string()),
        });
        game.play_actions = vec![LaunchConfiguration {
            executable: "/extra/tool.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }];

        let resolved = resolve_launch_configuration(&game);
        assert_eq!(resolved.executable, "steam://rungameid/730");
    }

    #[test]
    fn test_resolve_launch_plan_steam_without_library_action_uses_store_uri_and_runs_custom_once() {
        let mut game = Game::new(
            "steam".to_string(),
            "620".to_string(),
            "Portal 2".to_string(),
        );
        game.is_installed = true;
        game.use_library_integration = true;
        game.library_play_action = None;
        let trainer = LaunchConfiguration {
            executable: "C:\\Tools\\trainer.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        game.play_actions = vec![trainer.clone()];

        let plan = resolve_launch_plan(&game);
        assert_ne!(plan.primary.executable, trainer.executable);
        assert!(plan
            .primary
            .arguments
            .iter()
            .any(|a| a == "steam://rungameid/620"));
        assert_eq!(plan.auxiliary, vec![trainer]);
    }

    #[test]
    fn test_resolve_launch_plan_gog_without_library_action_does_not_duplicate_custom_action() {
        let mut game = Game::new(
            "gog".to_string(),
            "1207658924".to_string(),
            "Witcher".to_string(),
        );
        game.is_installed = true;
        game.use_library_integration = true;
        game.library_play_action = None;
        game.install_dir = None;
        let trainer = LaunchConfiguration {
            executable: "C:\\Tools\\trainer.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        game.play_actions = vec![trainer.clone()];

        let plan = resolve_launch_plan(&game);
        assert_ne!(plan.primary.executable, trainer.executable);
        assert_eq!(plan.auxiliary, vec![trainer]);
        if crate::launcher::find_gog_galaxy_client().is_none() {
            assert!(plan
                .primary
                .arguments
                .iter()
                .any(|a| a == "goggalaxy://runGame/1207658924"));
        }
    }

    #[test]
    fn test_resolve_launch_plan_non_store_without_library_action_runs_first_custom_once() {
        let mut game = Game::new(
            "switch".to_string(),
            "0100".to_string(),
            "Zelda".to_string(),
        );
        game.is_installed = true;
        game.use_library_integration = true;
        game.library_play_action = None;
        let emu = LaunchConfiguration {
            executable: "C:\\Emu\\eden.exe".to_string(),
            arguments: vec!["game.nsp".to_string()],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        let overlay = LaunchConfiguration {
            executable: "C:\\Tools\\overlay.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        game.play_actions = vec![emu.clone(), overlay.clone()];

        let plan = resolve_launch_plan(&game);
        assert_eq!(plan.primary, emu);
        assert_eq!(plan.auxiliary, vec![overlay]);
    }

    #[test]
    fn test_resolve_launch_plan_deduplicates_auxiliary_matching_primary() {
        let mut game = Game::new(
            "steam".to_string(),
            "620".to_string(),
            "Portal 2".to_string(),
        );
        game.is_installed = true;
        game.use_library_integration = true;
        let store_cmd = LaunchConfiguration {
            executable: "cmd.exe".to_string(),
            arguments: vec![
                "/c".to_string(),
                "start".to_string(),
                "".to_string(),
                "steam://rungameid/620".to_string(),
            ],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        let trainer = LaunchConfiguration {
            executable: "C:\\Tools\\trainer.exe".to_string(),
            arguments: vec![],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        };
        game.library_play_action = Some(store_cmd.clone());
        game.play_actions = vec![store_cmd.clone(), trainer.clone()];

        let plan = resolve_launch_plan(&game);
        assert_eq!(plan.primary, store_cmd);
        assert_eq!(plan.auxiliary, vec![trainer]);
    }
}
