//! Operating System Utilities and Executable Resolvers
//!
//! Provides platform-aware executable and shortcut resolution, Windows `.lnk`
//! target expansion via COM IShellLink, environment variable expansion, and command-line parsing.

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Information extracted from an executable path or shortcut.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedExecutable {
    pub original_path: String,
    pub executable_path: String,
    pub arguments: Vec<String>,
    pub working_dir: Option<String>,
    pub shortcut_name: Option<String>,
}

/// Resolves an executable path, expanding Windows `.lnk` shortcuts to target executable,
/// arguments, and working directory when applicable.
pub fn resolve_executable_path_sync(path: &str) -> Result<ResolvedExecutable, String> {
    let p = Path::new(path);
    let is_lnk = p
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("lnk"))
        .unwrap_or(false);

    if is_lnk {
        #[cfg(windows)]
        {
            return resolve_windows_shortcut(p);
        }
        #[cfg(not(windows))]
        {
            return Err("Risoluzione shortcut .lnk supportata solo su Windows".to_string());
        }
    }

    let default_working_dir = p
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(|parent| parent.to_string_lossy().to_string())
        .or_else(|| {
            // Fallback for Windows-style backslashes on non-Windows platforms (e.g. Wine/Proton or cross-platform tests)
            let trimmed = path.trim_end_matches(['/', '\\']);
            trimmed.rfind(['/', '\\']).and_then(|idx| {
                let parent = &trimmed[..idx];
                if parent.is_empty() {
                    None
                } else if parent.len() == 2 && parent.ends_with(':') {
                    Some(format!("{}\\", parent))
                } else {
                    Some(parent.to_string())
                }
            })
        });

    Ok(ResolvedExecutable {
        original_path: path.to_string(),
        executable_path: path.to_string(),
        arguments: Vec::new(),
        working_dir: default_working_dir,
        shortcut_name: None,
    })
}

#[cfg(windows)]
fn null_terminated_u16_to_string(slice: &[u16]) -> String {
    let len = slice.iter().position(|&c| c == 0).unwrap_or(slice.len());
    String::from_utf16_lossy(&slice[..len])
}

#[cfg(windows)]
fn resolve_windows_shortcut(shortcut_path: &Path) -> Result<ResolvedExecutable, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, IPersistFile, STGM_READ,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink, SLGP_RAWPATH, SLR_NO_UI};

    struct ComGuard;
    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    let shortcut_abs = shortcut_path
        .canonicalize()
        .unwrap_or_else(|_| shortcut_path.to_path_buf());

    let shortcut_stem = shortcut_path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string());

    unsafe {
        let _ = CoInitializeEx(
            None,
            COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE,
        );
    }
    let _com_guard = ComGuard;

    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| format!("Impossibile creare istanza ShellLink: {}", e))?;

        let persist_file: IPersistFile = link
            .cast()
            .map_err(|e| format!("Impossibile ottenere interfaccia IPersistFile: {}", e))?;

        let mut path_wide: Vec<u16> = shortcut_abs.as_os_str().encode_wide().collect();
        path_wide.push(0);

        persist_file
            .Load(PCWSTR(path_wide.as_ptr()), STGM_READ)
            .map_err(|e| format!("Impossibile caricare il file .lnk: {}", e))?;

        // Resolve shortcut without UI/prompts
        let _ = link.Resolve(
            windows::Win32::Foundation::HWND(std::ptr::null_mut()),
            SLR_NO_UI.0 as u32,
        );

        // Retrieve target path
        let mut target_buf = [0u16; 1024];
        let _ = link.GetPath(&mut target_buf, std::ptr::null_mut(), SLGP_RAWPATH.0 as u32);
        let target_raw = null_terminated_u16_to_string(&target_buf);
        let target_trimmed = target_raw.trim().to_string();

        let target_expanded = expand_env_strings(&target_trimmed);

        // Retrieve arguments
        let mut args_buf = [0u16; 2048];
        let _ = link.GetArguments(&mut args_buf);
        let args_raw = null_terminated_u16_to_string(&args_buf);
        let args_trimmed = args_raw.trim().to_string();
        let parsed_args = parse_windows_arguments(&args_trimmed);

        // Retrieve working directory
        let mut dir_buf = [0u16; 1024];
        let _ = link.GetWorkingDirectory(&mut dir_buf);
        let dir_raw = null_terminated_u16_to_string(&dir_buf);
        let dir_trimmed = dir_raw.trim().to_string();
        let dir_expanded = if dir_trimmed.is_empty() {
            Path::new(&target_expanded)
                .parent()
                .filter(|parent| !parent.as_os_str().is_empty())
                .map(|p| p.to_string_lossy().to_string())
        } else {
            Some(expand_env_strings(&dir_trimmed))
        };

        if target_expanded.is_empty() {
            return Err("Il collegamento .lnk non punta a un percorso valido".to_string());
        }

        Ok(ResolvedExecutable {
            original_path: shortcut_path.to_string_lossy().to_string(),
            executable_path: target_expanded,
            arguments: parsed_args,
            working_dir: dir_expanded,
            shortcut_name: shortcut_stem,
        })
    }
}

#[cfg(windows)]
fn expand_env_strings(input: &str) -> String {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::System::Environment::ExpandEnvironmentStringsW;

    if !input.contains('%') {
        return input.to_string();
    }

    let mut wide_input: Vec<u16> = std::ffi::OsStr::new(input).encode_wide().collect();
    wide_input.push(0);

    let mut buf = [0u16; 2048];
    unsafe {
        let len = ExpandEnvironmentStringsW(PCWSTR(wide_input.as_ptr()), Some(&mut buf));
        if len > 0 {
            null_terminated_u16_to_string(&buf[..len as usize])
        } else {
            input.to_string()
        }
    }
}

/// Parses Windows-style command line arguments, respecting quotes and escapes.
pub fn parse_windows_arguments(args_str: &str) -> Vec<String> {
    let trimmed = args_str.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::LocalFree;
        use windows::Win32::UI::Shell::CommandLineToArgvW;

        let mut wide: Vec<u16> = std::ffi::OsStr::new(trimmed).encode_wide().collect();
        wide.push(0);

        let mut num_args = 0i32;
        unsafe {
            let argv_ptr = CommandLineToArgvW(PCWSTR(wide.as_ptr()), &mut num_args);
            if !argv_ptr.is_null() {
                let mut result = Vec::with_capacity(num_args as usize);
                for i in 0..(num_args as isize) {
                    let arg_pwstr = *argv_ptr.offset(i);
                    let arg_slice = std::slice::from_raw_parts(
                        arg_pwstr.0,
                        (0..).take_while(|&idx| *arg_pwstr.0.add(idx) != 0).count(),
                    );
                    result.push(String::from_utf16_lossy(arg_slice));
                }
                let _ = LocalFree(windows::Win32::Foundation::HLOCAL(argv_ptr as *mut _));
                return result;
            }
        }
    }

    // Fallback simple argument splitter
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    for c in trimmed.chars() {
        match c {
            '"' => in_quotes = !in_quotes,
            ' ' | '\t' if !in_quotes => {
                if !current.is_empty() {
                    args.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(c),
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_windows_arguments() {
        assert_eq!(
            parse_windows_arguments(r#"-fullscreen -lang "it IT" --debug"#),
            vec!["-fullscreen", "-lang", "it IT", "--debug"]
        );
        assert_eq!(
            parse_windows_arguments(r#""C:\Program Files\Game\start.exe" --arg1"#),
            vec![r#"C:\Program Files\Game\start.exe"#, "--arg1"]
        );
        assert_eq!(parse_windows_arguments(""), Vec::<String>::new());
    }

    #[test]
    fn test_resolve_executable_path_sync_plain_exe() {
        let res_win = resolve_executable_path_sync(r#"C:\Games\Game\game.exe"#).unwrap();
        assert_eq!(res_win.executable_path, r#"C:\Games\Game\game.exe"#);
        assert_eq!(res_win.working_dir, Some(r#"C:\Games\Game"#.to_string()));
        assert!(res_win.arguments.is_empty());
        assert_eq!(res_win.shortcut_name, None);

        let res_unix = resolve_executable_path_sync("/usr/games/game/start.sh").unwrap();
        assert_eq!(res_unix.executable_path, "/usr/games/game/start.sh");
        assert_eq!(res_unix.working_dir, Some("/usr/games/game".to_string()));
        assert!(res_unix.arguments.is_empty());
        assert_eq!(res_unix.shortcut_name, None);
    }

    #[test]
    #[cfg(windows)]
    fn test_resolve_windows_shortcut() {
        let temp_dir = std::env::temp_dir();
        let lnk_path = temp_dir.join("omnis_test_unit.lnk");
        let lnk_str = lnk_path.to_string_lossy().to_string();

        let ps_script = format!(
            r#"$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{lnk}'); $s.TargetPath = 'C:\Windows\System32\notepad.exe'; $s.Arguments = '--test-flag'; $s.WorkingDirectory = 'C:\Windows'; $s.Save()"#,
            lnk = lnk_str.replace('\\', "\\\\")
        );

        if let Ok(st) = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_script])
            .status()
        {
            if st.success() && lnk_path.exists() {
                let resolved = resolve_executable_path_sync(&lnk_str);
                let _ = std::fs::remove_file(&lnk_path);

                if let Ok(res) = resolved {
                    assert_eq!(res.executable_path.to_lowercase(), r#"c:\windows\system32\notepad.exe"#);
                    assert_eq!(res.arguments, vec!["--test-flag"]);
                    assert_eq!(res.working_dir, Some(r#"C:\Windows"#.to_string()));
                    assert_eq!(res.shortcut_name, Some("omnis_test_unit".to_string()));
                }
            }
        }
    }
}
