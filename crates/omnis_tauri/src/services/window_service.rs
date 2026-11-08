//! Window geometry, focus and fullscreen resilience service.
//!
//! Solves display mode negotiation glitches (e.g. Moonlight / Sunshine remote streaming),
//! DirectX / Vulkan game termination transitions, DPI scaling edge cases, and Windows Shell
//! taskbar occlusion bugs.

use tauri::Window;

/// Ensures that a window is in genuine, unconstrained fullscreen mode covering the exact
/// monitor rectangle, clearing any maximized state and forcing top-level foreground focus.
pub fn ensure_fullscreen_geometry(window: &Window) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongW, SetWindowLongW, SetWindowPos, ShowWindow, GWL_STYLE, HWND_TOP,
            SWP_FRAMECHANGED, SWP_SHOWWINDOW, SW_RESTORE, WS_MAXIMIZE, WS_POPUP, WS_THICKFRAME,
        };

        if let Ok(hwnd) = window.hwnd() {
            unsafe {
                // 1. Unminimize if minimized or hidden
                let _ = ShowWindow(hwnd, SW_RESTORE);

                // 2. Strip WS_MAXIMIZE and WS_THICKFRAME styles so the Windows Shell does not treat
                // the window as a standard desktop maximized window (which causes the taskbar to stay
                // on top, or adds standard 8px resize margins that overflow the screen bounds).
                let style = GetWindowLongW(hwnd, GWL_STYLE);
                let clean_style = (style & !(WS_MAXIMIZE.0 as i32) & !(WS_THICKFRAME.0 as i32))
                    | (WS_POPUP.0 as i32);
                let _ = SetWindowLongW(hwnd, GWL_STYLE, clean_style);

                // 3. Query the exact current physical bounds of the monitor holding this window
                let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                let mut mi = MONITORINFO {
                    cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                    ..Default::default()
                };
                if GetMonitorInfoW(monitor, &mut mi).as_bool() {
                    let width = mi.rcMonitor.right - mi.rcMonitor.left;
                    let height = mi.rcMonitor.bottom - mi.rcMonitor.top;

                    // 4. Force window to exact monitor rectangle with HWND_TOP and SWP_FRAMECHANGED
                    let _ = SetWindowPos(
                        hwnd,
                        Some(HWND_TOP),
                        mi.rcMonitor.left,
                        mi.rcMonitor.top,
                        width,
                        height,
                        SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                    );
                }

                // 5. Force foreground focus so Windows Shell places the taskbar underneath
                force_window_to_foreground_hwnd(hwnd);
            }
        }
    }

    // Synchronize Tauri's internal state
    let _ = window.set_fullscreen(true);
    let _ = window.set_focus();
}

/// Overcomes Windows foreground lock to bring the given window to the front.
pub fn force_foreground(window: &Window) {
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            force_window_to_foreground_hwnd(hwnd);
        }
    }
    let _ = window.set_focus();
}

#[cfg(target_os = "windows")]
fn force_window_to_foreground_hwnd(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::WindowsAndMessaging::{
        AllowSetForegroundWindow, BringWindowToTop, GetForegroundWindow,
        GetWindowThreadProcessId, SetForegroundWindow, ShowWindow, ASFW_ANY, SW_SHOW,
    };

    unsafe {
        let _ = AllowSetForegroundWindow(ASFW_ANY);
        let _ = ShowWindow(hwnd, SW_SHOW);

        let fg_hwnd = GetForegroundWindow();
        let mut fg_proc_id = 0u32;
        let fg_thread_id = GetWindowThreadProcessId(fg_hwnd, Some(&mut fg_proc_id));
        let current_thread_id = GetCurrentThreadId();

        let attached = if fg_thread_id != current_thread_id && fg_thread_id != 0 {
            AttachThreadInput(current_thread_id, fg_thread_id, true).as_bool()
        } else {
            false
        };

        let _ = BringWindowToTop(hwnd);
        let _ = SetForegroundWindow(hwnd);

        if attached {
            let _ = AttachThreadInput(current_thread_id, fg_thread_id, false);
        }
    }
}
