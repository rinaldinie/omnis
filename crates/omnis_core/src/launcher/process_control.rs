use std::time::{Duration, Instant};
use sysinfo::{Pid, System};

pub fn allow_set_foreground_window() {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{AllowSetForegroundWindow, ASFW_ANY};
        unsafe {
            let _ = AllowSetForegroundWindow(ASFW_ANY);
        }
    }
}

/// Forces the specified window handle to the foreground on Windows, overcoming OS foreground locks.
#[cfg(windows)]
pub fn force_window_to_foreground_hwnd(hwnd: windows::Win32::Foundation::HWND) -> bool {
    use windows::Win32::Foundation::BOOL;
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_MENU,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        AllowSetForegroundWindow, BringWindowToTop, GetForegroundWindow,
        GetWindowThreadProcessId, IsIconic, SetForegroundWindow, SetWindowPos, ShowWindow,
        ASFW_ANY, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
        SW_RESTORE, SW_SHOW,
    };

    if hwnd.0.is_null() {
        return false;
    }

    unsafe {
        let fg_hwnd = GetForegroundWindow();
        if fg_hwnd == hwnd {
            return true;
        }

        // Grant permission to set foreground
        let _ = AllowSetForegroundWindow(ASFW_ANY);

        // Restore if minimized
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        } else {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }

        let mut fg_proc_id = 0u32;
        let fg_thread_id = GetWindowThreadProcessId(fg_hwnd, Some(&mut fg_proc_id));
        let mut target_proc_id = 0u32;
        let target_thread_id = GetWindowThreadProcessId(hwnd, Some(&mut target_proc_id));
        let current_thread_id = GetCurrentThreadId();

        // Attach input queue between target thread and the current foreground thread
        let attached_fg_target = if fg_thread_id != 0
            && target_thread_id != 0
            && fg_thread_id != target_thread_id
        {
            AttachThreadInput(target_thread_id, fg_thread_id, BOOL(1)).as_bool()
        } else {
            false
        };

        let attached_cur_target = if current_thread_id != 0
            && target_thread_id != 0
            && current_thread_id != target_thread_id
        {
            AttachThreadInput(current_thread_id, target_thread_id, BOOL(1)).as_bool()
        } else {
            false
        };

        // Simulate Alt keystroke to reset Windows foreground lock timer
        keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);

        // Elevate above fullscreen launcher overlay via TOPMOST toggle
        let _ = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );
        let _ = SetWindowPos(
            hwnd,
            HWND_NOTOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );

        let _ = BringWindowToTop(hwnd);
        let set_fg = SetForegroundWindow(hwnd).as_bool();

        if attached_fg_target {
            let _ = AttachThreadInput(target_thread_id, fg_thread_id, BOOL(0));
        }
        if attached_cur_target {
            let _ = AttachThreadInput(current_thread_id, target_thread_id, BOOL(0));
        }

        set_fg || GetForegroundWindow() == hwnd
    }
}

/// Raw pointer variant of `force_window_to_foreground_hwnd` to interoperate cleanly across different `windows` crate versions.
#[cfg(windows)]
pub fn force_window_to_foreground_raw(hwnd_ptr: *mut std::ffi::c_void) -> bool {
    force_window_to_foreground_hwnd(windows::Win32::Foundation::HWND(hwnd_ptr))
}

#[cfg(not(windows))]
pub fn force_window_to_foreground_raw(_hwnd_ptr: *mut std::ffi::c_void) -> bool {
    false
}

#[cfg(not(windows))]
pub fn force_window_to_foreground_hwnd(_hwnd: isize) -> bool {
    false
}

/// Brings the main visible window of a process (or its child process tree) to the foreground on Windows.
/// Uses candidate filtering, AttachThreadInput, Alt-key unlock, and SetWindowPos to reliably
/// elevate game windows over fullscreen launchers.
#[cfg(windows)]
pub fn bring_process_to_foreground(pid: u32) -> bool {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowLongW, GetWindowRect, GetWindowTextLengthW,
        GetWindowThreadProcessId, IsWindowVisible, GWL_EXSTYLE, GW_OWNER, WS_EX_APPWINDOW,
        WS_EX_TOOLWINDOW,
    };

    if pid == 0 {
        return false;
    }

    // Collect all candidate PIDs: root PID and all children in process tree
    let mut candidate_pids = std::collections::HashSet::new();
    candidate_pids.insert(pid);

    let mut sys = System::new();
    sys.refresh_processes();
    let mut added = true;
    while added {
        added = false;
        for (p, proc) in sys.processes() {
            let p_u32 = p.as_u32();
            if !candidate_pids.contains(&p_u32) {
                if let Some(parent) = proc.parent() {
                    if candidate_pids.contains(&parent.as_u32()) {
                        candidate_pids.insert(p_u32);
                        added = true;
                    }
                }
            }
        }
    }

    #[derive(Debug)]
    struct WindowCandidate {
        hwnd: HWND,
        area: i64,
        has_title: bool,
        is_app_window: bool,
    }

    struct WindowSearch {
        candidate_pids: std::collections::HashSet<u32>,
        candidates: Vec<WindowCandidate>,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut WindowSearch);
        let mut proc_id = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut proc_id));

        if data.candidate_pids.contains(&proc_id) && IsWindowVisible(hwnd).as_bool() {
            // Filter cloaked windows (suspended/virtual desktop/hidden DWM windows)
            let mut cloaked: u32 = 0;
            if DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED,
                &mut cloaked as *mut _ as *mut _,
                std::mem::size_of::<u32>() as u32,
            )
            .is_ok()
                && cloaked != 0
            {
                return BOOL(1);
            }

            // Filter out 0x0 or microscopic dummy/message windows
            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_ok() {
                let width = (rect.right - rect.left) as i64;
                let height = (rect.bottom - rect.top) as i64;
                if width >= 32 && height >= 32 {
                    let owner = GetWindow(hwnd, GW_OWNER).unwrap_or_default();
                    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                    let is_tool = (ex_style & (WS_EX_TOOLWINDOW.0 as i32)) != 0;
                    let is_app = (ex_style & (WS_EX_APPWINDOW.0 as i32)) != 0;

                    if !is_tool || is_app {
                        let title_len = GetWindowTextLengthW(hwnd);
                        data.candidates.push(WindowCandidate {
                            hwnd,
                            area: width * height,
                            has_title: title_len > 0,
                            is_app_window: is_app || owner.0.is_null(),
                        });
                    }
                }
            }
        }
        BOOL(1)
    }

    let mut data = WindowSearch {
        candidate_pids,
        candidates: Vec::new(),
    };

    unsafe {
        let _ = EnumWindows(
            Some(enum_proc),
            LPARAM(&mut data as *mut WindowSearch as isize),
        );
    }

    // Rank candidates: prefer windows with a title, unowned / app windows, and largest visual area
    data.candidates.sort_by(|a, b| {
        b.has_title
            .cmp(&a.has_title)
            .then_with(|| b.is_app_window.cmp(&a.is_app_window))
            .then_with(|| b.area.cmp(&a.area))
    });

    for candidate in data.candidates {
        if force_window_to_foreground_hwnd(candidate.hwnd) {
            return true;
        }
    }

    false
}

#[cfg(not(windows))]
pub fn bring_process_to_foreground(_pid: u32) -> bool {
    false
}

/// Asynchronously attempts to bring the process's main window to the foreground with polling retries.
/// Since games often take 1 to 5 seconds to initialize graphics and display their window,
/// this retries every 300ms for up to `timeout_secs` (default ~6-8s).
pub async fn bring_process_to_foreground_async(pid: u32, timeout_secs: u64) -> bool {
    if pid == 0 {
        return false;
    }
    let deadline = Instant::now() + Duration::from_secs(timeout_secs.max(1));
    while Instant::now() < deadline {
        if bring_process_to_foreground(pid) {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    false
}

/// Helper to forcibly terminate a process by PID across platforms
pub fn kill_process(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Err("Invalid PID: 0".to_string());
    }

    #[cfg(windows)]
    {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
        unsafe {
            if let Ok(handle) = OpenProcess(PROCESS_TERMINATE, false, pid) {
                let res = TerminateProcess(handle, 1);
                let _ = CloseHandle(handle);
                if res.is_ok() {
                    return Ok(());
                }
            }
        }
    }

    let mut sys = System::new();
    sys.refresh_processes();
    let sysinfo_pid = Pid::from(pid as usize);
    if let Some(proc) = sys.process(sysinfo_pid) {
        if proc.kill() {
            return Ok(());
        }
    }

    #[cfg(unix)]
    {
        unsafe {
            if libc::kill(pid as i32, libc::SIGKILL) == 0 {
                return Ok(());
            }
        }
    }

    // Check if the process is already gone
    sys.refresh_processes();
    if sys.process(sysinfo_pid).is_none() {
        return Ok(());
    }

    Err(format!("Impossibile terminare il processo con PID {}", pid))
}

/// Sends WM_CLOSE to all top-level windows of a process for graceful exit (Requirement B4)
#[cfg(windows)]
pub fn send_wm_close_to_process(pid: u32) {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
    };

    struct EnumData {
        target_pid: u32,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut EnumData);
        let mut proc_id = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut proc_id));
        if proc_id == data.target_pid {
            let _ = PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
        }
        BOOL(1)
    }

    let mut data = EnumData { target_pid: pid };
    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut data as *mut EnumData as isize));
    }
}

#[cfg(not(windows))]
pub fn send_wm_close_to_process(pid: u32) {
    #[cfg(unix)]
    unsafe {
        let _ = libc::kill(pid as i32, libc::SIGTERM);
    }
}

/// Graceful termination: sends WM_CLOSE, waits up to timeout_secs, then falls back to hard kill (Requirement B4)
pub async fn kill_process_graceful(pid: u32, timeout_secs: u64) -> Result<(), String> {
    if pid == 0 {
        return Err("Invalid PID: 0".to_string());
    }

    send_wm_close_to_process(pid);

    let deadline = Instant::now() + Duration::from_secs(timeout_secs.max(1));
    let mut sys = System::new();
    let sys_pid = Pid::from(pid as usize);

    while Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(300)).await;
        if !sys.refresh_process(sys_pid) {
            return Ok(()); // Exited gracefully
        }
    }

    // Still alive after graceful timeout, terminate forcibly
    kill_process(pid)
}
