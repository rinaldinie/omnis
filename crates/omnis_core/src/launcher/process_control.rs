use std::time::{Duration, Instant};
use sysinfo::{Pid, System};
use tokio::time::sleep;

pub fn allow_set_foreground_window() {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{AllowSetForegroundWindow, ASFW_ANY};
        unsafe {
            let _ = AllowSetForegroundWindow(ASFW_ANY);
        }
    }
}

/// Brings the main visible window of a process (or its child process tree) to the foreground on Windows.
/// Uses AttachThreadInput, AllowSetForegroundWindow, and SetForegroundWindow to reliably bypass Windows foreground lock.
#[cfg(windows)]
pub fn bring_process_to_foreground(pid: u32) -> bool {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::WindowsAndMessaging::{
        AllowSetForegroundWindow, BringWindowToTop, EnumWindows, GetForegroundWindow,
        GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow, ShowWindow,
        ASFW_ANY, SW_RESTORE,
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

    struct WindowSearch {
        candidate_pids: std::collections::HashSet<u32>,
        found_hwnd: Option<HWND>,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut WindowSearch);
        let mut proc_id = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut proc_id));
        if data.candidate_pids.contains(&proc_id) && IsWindowVisible(hwnd).as_bool() {
            data.found_hwnd = Some(hwnd);
            return BOOL(0); // Stop enumeration
        }
        BOOL(1)
    }

    let mut data = WindowSearch {
        candidate_pids,
        found_hwnd: None,
    };

    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut data as *mut WindowSearch as isize));
        if let Some(hwnd) = data.found_hwnd {
            let _ = AllowSetForegroundWindow(ASFW_ANY);

            let fg_hwnd = GetForegroundWindow();
            let mut fg_proc_id = 0u32;
            let fg_thread_id = GetWindowThreadProcessId(fg_hwnd, Some(&mut fg_proc_id));
            let current_thread_id = GetCurrentThreadId();
            let mut target_proc_id = 0u32;
            let target_thread_id = GetWindowThreadProcessId(hwnd, Some(&mut target_proc_id));

            let attached_fg = if fg_thread_id != current_thread_id && fg_thread_id != 0 {
                AttachThreadInput(current_thread_id, fg_thread_id, BOOL(1)) == BOOL(1)
            } else {
                false
            };

            let attached_target = if target_thread_id != current_thread_id && target_thread_id != 0 {
                AttachThreadInput(current_thread_id, target_thread_id, BOOL(1)) == BOOL(1)
            } else {
                false
            };

            let _ = ShowWindow(hwnd, SW_RESTORE);
            let _ = BringWindowToTop(hwnd);
            let _ = SetForegroundWindow(hwnd);

            if attached_fg {
                let _ = AttachThreadInput(current_thread_id, fg_thread_id, BOOL(0));
            }
            if attached_target {
                let _ = AttachThreadInput(current_thread_id, target_thread_id, BOOL(0));
            }

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

