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
        assert!(!is_blacklisted_process("Doom.exe"));
        assert!(!is_blacklisted_process("Cyberpunk2077.exe"));
    }

    #[test]
    fn test_is_uri_command() {
        let uri_cfg_windows = LaunchConfiguration {
            executable: "cmd.exe".to_string(),
            arguments: vec!["/c".to_string(), "start".to_string(), "steam://rungameid/10".to_string()],
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
        let res = GameLauncher::launch_and_track_simple(
            Uuid::new_v4(),
            config,
            move |pid| {
                pid_clone.store(pid, Ordering::SeqCst);
            },
        )
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
            }

            assert!(!matches_target(proc, Some("non_existent_process_12345.exe"), None));
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

        let child = cmd.spawn().expect("Failed to spawn sleeper process");
        let pid = child.id();
        assert!(pid > 0);

        let kill_res = kill_process(pid);
        assert!(kill_res.is_ok(), "Kill process failed: {:?}", kill_res);
    }
