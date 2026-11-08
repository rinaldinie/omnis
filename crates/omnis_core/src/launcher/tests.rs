use super::*;

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

#[test]
fn test_is_blacklisted_process() {
    assert!(is_blacklisted_process("UnityCrashHandler64.exe"));
    assert!(is_blacklisted_process("unitycrashhandler32.exe"));
    assert!(is_blacklisted_process("vcredist_x64.exe"));
    assert!(is_blacklisted_process("dxsetup.exe"));
    assert!(is_blacklisted_process("CrashReportClient.exe"));
    assert!(is_blacklisted_process("UbisoftConnectInstaller.exe"));
    assert!(is_blacklisted_process("unins000.exe"));
    assert!(!is_blacklisted_process("Doom.exe"));
    assert!(!is_blacklisted_process("Cyberpunk2077.exe"));
    assert!(!is_blacklisted_process("TheLostCrown.exe"));
}

#[test]
fn test_is_uri_command() {
    let uri_cfg_windows = LaunchConfiguration {
        executable: "cmd.exe".to_string(),
        arguments: vec![
            "/c".to_string(),
            "start".to_string(),
            "steam://rungameid/10".to_string(),
        ],
        working_dir: None,
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    };
    assert!(is_uri_command(&uri_cfg_windows));

    let uri_cfg_linux = LaunchConfiguration {
        executable: "xdg-open".to_string(),
        arguments: vec!["steam://rungameid/10".to_string()],
        working_dir: None,
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    };
    assert!(is_uri_command(&uri_cfg_linux));

    let direct_cfg = LaunchConfiguration {
        executable: "C:\\Games\\Doom\\Doom.exe".to_string(),
        arguments: vec![],
        working_dir: None,
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    };
    assert!(!is_uri_command(&direct_cfg));

    // Epic and Xbox plugins put the launch URI straight into the executable field: treating these
    // as binaries makes the spawn fail with "program not found" and the game never starts
    let epic_cfg = LaunchConfiguration {
        executable: "com.epicgames.launcher://apps/Fortnite?action=launch&silent=true".to_string(),
        arguments: vec![],
        working_dir: None,
        tracking_mode: ProcessTrackingMode::ProcessName("FortniteClient.exe".to_string()),
    };
    assert!(is_uri_command(&epic_cfg));

    let xbox_cfg = LaunchConfiguration {
        executable: "ms-windows-store://pdp/?ProductId=9NBLGGGZ5155".to_string(),
        arguments: vec![],
        working_dir: None,
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    };
    assert!(is_uri_command(&xbox_cfg));

    let gog_cfg = LaunchConfiguration {
        executable: "goggalaxy://openGameView/1207658924".to_string(),
        arguments: vec![],
        working_dir: None,
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    };
    assert!(is_uri_command(&gog_cfg));

    // Synthesized Windows protocol dispatch
    let rundll_cfg = LaunchConfiguration {
        executable: "rundll32.exe".to_string(),
        arguments: vec![
            "url.dll,FileProtocolHandler".to_string(),
            "steam://rungameid/400".to_string(),
        ],
        working_dir: None,
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    };
    assert!(is_uri_command(&rundll_cfg));

    // GOG Galaxy Client dispatch
    let galaxy_cfg = LaunchConfiguration {
        executable: "C:\\Program Files\\GOG Galaxy\\GalaxyClient.exe".to_string(),
        arguments: vec![
            "/command=runGame".to_string(),
            "/gameId=2049187585".to_string(),
            "/path=\"D:\\GOG Galaxy\\Games\\Control\"".to_string(),
        ],
        working_dir: None,
        tracking_mode: ProcessTrackingMode::WatchDirectory(PathBuf::from("D:\\GOG Galaxy\\Games\\Control")),
    };
    assert!(is_uri_command(&galaxy_cfg));
}

#[test]
fn test_process_file_name() {
    // Epic stores the launch target relative to the install location
    assert_eq!(
        process_file_name("FortniteGame/Binaries/Win64/FortniteClient-Win64-Shipping.exe"),
        "FortniteClient-Win64-Shipping.exe"
    );
    assert_eq!(
        process_file_name("Binaries\\\\Win64\\\\Game.exe"),
        "Game.exe"
    );
    assert_eq!(process_file_name("Doom.exe"), "Doom.exe");
    assert_eq!(process_file_name(""), "");
}

#[test]
fn test_is_launch_uri() {
    assert!(is_launch_uri("steam://rungameid/400"));
    assert!(is_launch_uri("goggalaxy://openGameView/1207658924"));
    assert!(is_launch_uri(
        "com.epicgames.launcher://apps/Sugar?action=launch"
    ));
    assert!(is_launch_uri(
        "ms-windows-store://pdp/?ProductId=9NBLGGGZ51"
    ));

    assert!(!is_launch_uri("C:\\Games\\Doom\\Doom.exe"));
    assert!(!is_launch_uri("/usr/bin/doom"));
    assert!(!is_launch_uri("Doom.exe"));
    assert!(!is_launch_uri(""));
    // A drive letter is a one-character "scheme" and must never be mistaken for a protocol
    assert!(!is_launch_uri("C://Games/Doom/Doom.exe"));
    // A UNC path with a doubled separator has no alphanumeric-only scheme
    assert!(!is_launch_uri("\\\\server\\share://games"));
}

#[test]
fn test_launch_phase_callback_reports_pid_once() {
    use std::sync::Mutex;

    let seen: Arc<Mutex<Vec<TrackingPhase>>> = Arc::new(Mutex::new(Vec::new()));
    let sink = seen.clone();
    let on_phase: PhaseCallback = Arc::new(move |phase| {
        sink.lock().unwrap().push(phase);
    });

    // A trampoline handover produces several transitions on one session
    on_phase(TrackingPhase::Running(100));
    on_phase(TrackingPhase::Exiting);
    on_phase(TrackingPhase::Running(200));
    on_phase(TrackingPhase::Exiting);

    let recorded = seen.lock().unwrap().clone();
    assert_eq!(
        recorded,
        vec![
            TrackingPhase::Running(100),
            TrackingPhase::Exiting,
            TrackingPhase::Running(200),
            TrackingPhase::Exiting,
        ]
    );
}

#[test]
fn test_path_contains() {
    let parent = Path::new("C:/Games/Doom");
    let child_ok = Path::new("C:\\Games\\Doom\\bin\\doom.exe");
    let child_same = Path::new("C:\\Games\\Doom");
    let child_other = Path::new("C:\\Games\\Doom2\\doom2.exe");
    let child_unrelated = Path::new("D:\\Other\\app.exe");

    assert!(path_contains(parent, child_ok));
    assert!(path_contains(parent, child_same));
    assert!(!path_contains(parent, child_other));
    assert!(!path_contains(parent, child_unrelated));
}

#[test]
fn test_kill_process_invalid_pid() {
    assert!(kill_process(0).is_err());
    assert!(GameLauncher::kill_process(0).is_err());
}

#[tokio::test]
async fn test_direct_launch_completion() {
    let config = if cfg!(windows) {
        LaunchConfiguration {
            executable: "cmd.exe".to_string(),
            arguments: vec!["/c".to_string(), "exit".to_string(), "0".to_string()],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }
    } else {
        LaunchConfiguration {
            executable: "sh".to_string(),
            arguments: vec!["-c".to_string(), "exit 0".to_string()],
            working_dir: None,
            tracking_mode: ProcessTrackingMode::KernelJobObject,
        }
    };

    let started_pid = Arc::new(AtomicU32::new(0));
    let pid_clone = started_pid.clone();
    let res = GameLauncher::launch_and_track_simple(Uuid::new_v4(), config, move |pid| {
        pid_clone.store(pid, Ordering::SeqCst);
    })
    .await;

    assert!(res.is_ok());
    assert!(started_pid.load(Ordering::SeqCst) > 0);
}

#[test]
fn test_matches_target() {
    let mut sys = System::new();
    sys.refresh_processes();

    let current_pid = std::process::id();
    let sys_pid = Pid::from(current_pid as usize);
    if let Some(proc) = sys.process(sys_pid) {
        let p_name = proc.name().to_string();
        assert!(matches_target(proc, Some(&p_name), None));
        assert!(matches_target(proc, Some(&p_name.to_lowercase()), None));
        assert!(matches_target(proc, Some(&p_name.to_uppercase()), None));

        if let Some(parent_dir) = proc.exe().and_then(|e| e.parent()) {
            assert!(matches_target(proc, None, Some(parent_dir)));
            // Process inside parent_dir must match even if target_name is a launcher / wrapper name
            assert!(matches_target(proc, Some("Launcher.exe"), Some(parent_dir)));
        }

        assert!(!matches_target(
            proc,
            Some("non_existent_process_12345.exe"),
            None
        ));
    }
}

#[tokio::test]
async fn test_kill_process_active() {
    let mut cmd = if cfg!(windows) {
        let mut c = std::process::Command::new("cmd.exe");
        c.args(["/c", "ping", "-n", "10", "127.0.0.1"]);
        c
    } else {
        let mut c = std::process::Command::new("sleep");
        c.arg("10");
        c
    };

    let mut child = cmd.spawn().expect("Failed to spawn sleeper process");
    let pid = child.id();
    assert!(pid > 0);

    let kill_res = kill_process(pid);
    assert!(kill_res.is_ok(), "Kill process failed: {:?}", kill_res);
    let _ = child.wait();
}

#[test]
fn test_find_gog_game_executable_prefers_game_over_launcher() {
    let temp_dir = std::env::temp_dir().join(format!("gog_test_{}", Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).unwrap();

    // Create dummy executables
    std::fs::write(temp_dir.join("Control.exe"), b"launcher").unwrap();
    std::fs::write(temp_dir.join("Control_DX11.exe"), b"game dx11").unwrap();
    std::fs::write(temp_dir.join("Control_DX12.exe"), b"game dx12").unwrap();

    let manifest = r#"{
        "gameId": "2049187585",
        "name": "Control Ultimate Edition",
        "playTasks": [
            {
                "isPrimary": true,
                "name": "Control Ultimate Edition",
                "path": "Control.exe",
                "type": "FileTask",
                "category": "launcher"
            },
            {
                "name": "Control Ultimate Edition - DX11",
                "path": "Control_DX11.exe",
                "type": "FileTask",
                "category": "game"
            },
            {
                "name": "Control Ultimate Edition - DX12",
                "path": "Control_DX12.exe",
                "type": "FileTask",
                "category": "game"
            }
        ]
    }"#;
    std::fs::write(temp_dir.join("goggame-2049187585.info"), manifest).unwrap();

    let exe = find_gog_game_executable(&temp_dir);
    assert!(exe.is_some());
    // Should prefer the game task (DX12) over the launcher task (Control.exe)
    assert_eq!(
        exe.unwrap().file_name().unwrap().to_str().unwrap(),
        "Control_DX12.exe"
    );

    let _ = std::fs::remove_dir_all(&temp_dir);
}
