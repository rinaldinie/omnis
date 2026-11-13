use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub battery_percent: Option<u8>,
    pub is_charging: bool,
    pub wifi_connected: bool,
    pub wifi_signal: Option<u8>,
}

#[tauri::command]
pub fn get_system_status() -> SystemStatus {
    read_system_status()
}

#[cfg(target_os = "linux")]
fn read_system_status() -> SystemStatus {
    let (battery_percent, is_charging) = read_linux_battery();
    let (wifi_connected, wifi_signal) = read_linux_wifi();
    SystemStatus {
        battery_percent,
        is_charging,
        wifi_connected,
        wifi_signal,
    }
}

#[cfg(target_os = "linux")]
fn read_linux_battery() -> (Option<u8>, bool) {
    let Ok(entries) = std::fs::read_dir("/sys/class/power_supply") else {
        return (None, false);
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if !name_str.starts_with("BAT") {
            continue;
        }
        let capacity = std::fs::read_to_string(path.join("capacity"))
            .ok()
            .and_then(|s| s.trim().parse::<u8>().ok())
            .map(|v| v.min(100));
        let status = std::fs::read_to_string(path.join("status"))
            .ok()
            .map(|s| s.trim().eq_ignore_ascii_case("Charging") || s.trim().eq_ignore_ascii_case("Full"))
            .unwrap_or(false);
        if capacity.is_some() {
            return (capacity, status);
        }
    }

    (None, false)
}

#[cfg(target_os = "linux")]
fn read_linux_wifi() -> (bool, Option<u8>) {
    let Ok(content) = std::fs::read_to_string("/proc/net/wireless") else {
        return (false, None);
    };

    // Skip the two header lines
    for line in content.lines().skip(2) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        // Format: iface: status link level noise ...
        if parts.len() >= 3 {
            let link_raw = parts[2].trim_end_matches('.');
            if let Ok(link) = link_raw.parse::<f32>() {
                let pct = ((link / 70.0) * 100.0).round().clamp(0.0, 100.0) as u8;
                return (true, Some(pct));
            }
            return (true, None);
        }
    }

    (false, None)
}

#[cfg(target_os = "windows")]
fn read_system_status() -> SystemStatus {
    let (battery_percent, is_charging) = read_windows_battery();
    let (wifi_connected, wifi_signal) = read_windows_wifi();
    SystemStatus {
        battery_percent,
        is_charging,
        wifi_connected,
        wifi_signal,
    }
}

#[cfg(target_os = "windows")]
fn read_windows_battery() -> (Option<u8>, bool) {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

    let mut status = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut status) }.is_err() {
        return (None, false);
    }

    let battery_percent = if status.BatteryLifePercent == 255 {
        None
    } else {
        Some(status.BatteryLifePercent.min(100))
    };
    let is_charging = status.ACLineStatus == 1;
    (battery_percent, is_charging)
}

#[cfg(target_os = "windows")]
fn read_windows_wifi() -> (bool, Option<u8>) {
    use std::ffi::c_void;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::NetworkManagement::WiFi::{
        wlan_interface_state_connected, wlan_intf_opcode_current_connection, WlanCloseHandle,
        WlanEnumInterfaces, WlanFreeMemory, WlanOpenHandle, WlanQueryInterface,
        WLAN_CONNECTION_ATTRIBUTES, WLAN_INTERFACE_INFO_LIST,
    };

    let mut negotiated_version = 0u32;
    let mut client_handle = HANDLE::default();
    let open_res = unsafe { WlanOpenHandle(2, None, &mut negotiated_version, &mut client_handle) };
    if open_res != 0 {
        return (false, None);
    }

    let mut iface_list_ptr: *mut WLAN_INTERFACE_INFO_LIST = std::ptr::null_mut();
    let enum_res = unsafe { WlanEnumInterfaces(client_handle, None, &mut iface_list_ptr) };
    if enum_res != 0 || iface_list_ptr.is_null() {
        unsafe { WlanCloseHandle(client_handle, None) };
        return (false, None);
    }

    let mut connected = false;
    let mut signal: Option<u8> = None;

    unsafe {
        let count = (*iface_list_ptr).dwNumberOfItems as usize;
        let interfaces = std::slice::from_raw_parts((*iface_list_ptr).InterfaceInfo.as_ptr(), count);
        for iface in interfaces {
            if iface.isState == wlan_interface_state_connected {
                connected = true;
                let mut data_size = 0u32;
                let mut data_ptr: *mut c_void = std::ptr::null_mut();
                let query_res = WlanQueryInterface(
                    client_handle,
                    &iface.InterfaceGuid,
                    wlan_intf_opcode_current_connection,
                    None,
                    &mut data_size,
                    &mut data_ptr,
                    None,
                );
                if query_res == 0 && !data_ptr.is_null() {
                    let attrs = &*(data_ptr as *const WLAN_CONNECTION_ATTRIBUTES);
                    signal = Some((attrs.wlanAssociationAttributes.wlanSignalQuality as u8).min(100));
                    WlanFreeMemory(data_ptr);
                }
                break;
            }
        }
        WlanFreeMemory(iface_list_ptr as *mut c_void);
        WlanCloseHandle(client_handle, None);
    }

    (connected, signal)
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn read_system_status() -> SystemStatus {
    SystemStatus {
        battery_percent: None,
        is_charging: false,
        wifi_connected: false,
        wifi_signal: None,
    }
}
