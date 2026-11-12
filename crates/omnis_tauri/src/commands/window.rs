use crate::types::{open_folder_in_os, AppState};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{Manager, State, Window};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedExecutable {
    pub original_path: String,
    pub executable_path: String,
    pub arguments: Vec<String>,
    pub working_dir: Option<String>,
    pub shortcut_name: Option<String>,
}

#[tauri::command]
pub fn open_folder(folder_type: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = match folder_type.as_str() {
        "db" | "library" => &state.app_dir,
        "covers" => &state.covers_dir,
        "plugins" => &state.plugins_dir,
        "themes" => &state.themes_dir,
        _ => &state.app_dir,
    };
    open_folder_in_os(path);
    Ok(())
}

#[tauri::command]
pub fn window_start_dragging(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_unminimize(window: Window) -> Result<(), String> {
    let _ = window.show();
    window.unminimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_set_focus(window: Window) -> Result<(), String> {
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: Window) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_toggle_fullscreen(window: Window) -> Result<bool, String> {
    let current = window.is_fullscreen().map_err(|e| e.to_string())?;
    let next = !current;
    if next {
        crate::services::window_service::ensure_fullscreen_geometry(&window);
    } else {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
    }
    Ok(next)
}

#[tauri::command]
pub fn window_set_fullscreen(fullscreen: bool, window: Window) -> Result<(), String> {
    if fullscreen {
        crate::services::window_service::ensure_fullscreen_geometry(&window);
    } else {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn is_fullscreen_arg(raw: &str) -> bool {
    let clean = raw
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_lowercase();
    clean == "--fullscreen"
        || clean == "-fullscreen"
        || clean == "/fullscreen"
        || clean == "-f"
        || clean == "/f"
        || clean == "--bigpicture"
        || clean == "-bigpicture"
        || clean == "/bigpicture"
        || clean == "-b"
        || clean == "/b"
        || clean.starts_with("--fullscreen=")
        || clean.starts_with("-fullscreen=")
}

pub fn is_fullscreen_requested<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let all: Vec<String> = args.into_iter().map(|s| s.as_ref().to_string()).collect();
    let joined = all.join(" ").to_lowercase();
    if joined.contains("fullscreen") || joined.contains("bigpicture") {
        return true;
    }
    all.iter().any(|arg| is_fullscreen_arg(arg))
}

#[tauri::command]
pub fn is_fullscreen_launch() -> bool {
    is_fullscreen_requested(std::env::args())
}

#[tauri::command]
pub fn set_minimize_to_tray(enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    state
        .minimize_to_tray
        .store(enabled, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn window_close(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    if state
        .minimize_to_tray
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        window.hide().map_err(|e| e.to_string())
    } else {
        window.app_handle().exit(0);
        Ok(())
    }
}

#[tauri::command]
pub fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
pub async fn pick_executable_file() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let file = rfd::FileDialog::new()
            .set_title("Seleziona file eseguibile (.exe)")
            .add_filter("Eseguibili Windows", &["exe", "bat", "cmd", "lnk"])
            .pick_file();
        Ok(file.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Resolves an executable path, expanding Windows `.lnk` shortcuts to target executable,
/// arguments, and working directory when applicable.
#[tauri::command]
pub async fn resolve_executable_path(path: String) -> Result<ResolvedExecutable, String> {
    tokio::task::spawn_blocking(move || resolve_executable_path_sync(&path))
        .await
        .map_err(|e| e.to_string())?
}

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
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
        COINIT_DISABLE_OLE1DDE, IPersistFile, STGM_READ,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink, SLR_NO_UI, SLGP_RAWPATH};

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
        let _ = link.Resolve(windows::Win32::Foundation::HWND(std::ptr::null_mut()), SLR_NO_UI.0 as u32);

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

#[allow(dead_code)]
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
                let _ = LocalFree(Some(windows::Win32::Foundation::HLOCAL(argv_ptr as *mut _)));
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

#[tauri::command]
pub async fn pick_directory() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let dir = rfd::FileDialog::new()
            .set_title("Seleziona cartella")
            .pick_folder();
        Ok(dir.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn find_executables_in_folder(folder_path: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let path = std::path::Path::new(&folder_path);
        let exes = omnis_core::launcher::scan_game_executables(path)
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        Ok(exes)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pick_image_file(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let picked: Option<String> = tokio::task::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Seleziona immagine copertina o sfondo")
            .add_filter("Immagini", &["png", "jpg", "jpeg", "webp", "ico", "bmp"])
            .pick_file()
            .map(|p| p.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?;
    // Allow the picked file so the editor can preview it before saving
    if let Some(ref path) = picked {
        state.media_scope.allow_media_file(path);
    }
    Ok(picked)
}

pub fn validate_external_url(url: &str) -> Result<&str, String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("Solo protocolli HTTP e HTTPS sono supportati".to_string());
    }

    // Parse with url::Url to ensure structurally sound web URI
    let parsed = url::Url::parse(trimmed).map_err(|e| format!("URL non valido: {}", e))?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("Schema URL non supportato".to_string()),
    }

    // Strictly reject shell control/metacharacters to prevent command/argument injection
    if trimmed
        .chars()
        .any(|c| c.is_control() || "&|<>^%\"'\r\n\t".contains(c))
    {
        return Err("URL contiene caratteri non consentiti".to_string());
    }

    Ok(trimmed)
}

pub fn open_external_url_in_os(url: &str) -> Result<(), String> {
    let trimmed = validate_external_url(url)?;

    #[cfg(windows)]
    {
        // Use rundll32 FileProtocolHandler instead of cmd.exe /c start to avoid shell interpretation
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", trimmed])
            .spawn()
            .map_err(|e| format!("Impossibile aprire l'URL: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Impossibile aprire l'URL: {}", e))?;
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("Impossibile aprire l'URL: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    open_external_url_in_os(&url)
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

    #[cfg(windows)]
    #[test]
    fn test_resolve_windows_shortcut() {
        use std::process::Command;

        let temp_dir = std::env::temp_dir();
        let lnk_path = temp_dir.join("omnis_test_unit.lnk");
        let lnk_str = lnk_path.to_string_lossy().to_string();

        let ps_cmd = format!(
            r#"$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{lnk}'); $s.TargetPath = 'C:\Windows\System32\notepad.exe'; $s.Arguments = '--test-flag'; $s.WorkingDirectory = 'C:\Windows'; $s.Save()"#,
            lnk = lnk_str.replace('\\', "\\\\")
        );

        let status = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_cmd])
            .status();

        if let Ok(st) = status {
            if st.success() && lnk_path.exists() {
                let resolved = resolve_executable_path_sync(&lnk_str);
                let _ = std::fs::remove_file(&lnk_path);

                assert!(resolved.is_ok());
                let res = resolved.unwrap();
                assert!(res.executable_path.to_lowercase().contains("notepad.exe"));
                assert_eq!(res.arguments, vec!["--test-flag"]);
                assert_eq!(res.working_dir, Some("C:\\Windows".to_string()));
                assert_eq!(res.shortcut_name, Some("omnis_test_unit".to_string()));
            }
        }
    }
}
