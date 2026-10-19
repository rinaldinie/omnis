//! C-ABI FFI conventions and helpers for Omnis dynamic plugins.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

/// Helper function to safely deallocate a C string allocated with `CString::into_raw`
///
/// # Safety
/// The pointer must be a valid pointer returned by `CString::into_raw` or null.
pub unsafe fn free_c_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        drop(CString::from_raw(ptr));
    }
}

/// Helper function for deallocating strings across C-ABI boundary.
///
/// # Safety
/// The pointer must be a valid pointer returned by `CString::into_raw` or null.
pub unsafe fn omnis_free_string(ptr: *mut c_char) {
    free_c_string(ptr);
}

/// Helper function to safely convert a raw C string pointer to a Rust `String`
///
/// # Safety
/// The pointer must be a valid, null-terminated C string, or null.
pub unsafe fn c_str_to_string(ptr: *const c_char) -> Result<String, String> {
    if ptr.is_null() {
        return Err("Null pointer provided to c_str_to_string".to_string());
    }
    CStr::from_ptr(ptr)
        .to_str()
        .map(|s| s.to_string())
        .map_err(|e| format!("Invalid UTF-8 in C string: {}", e))
}

/// Helper function to convert a Rust string slice into a raw C-compatible string (`*mut c_char`)
///
/// Strips internal null bytes if any are present to prevent panics.
/// Caller must guarantee the returned string pointer is freed using `omnis_free_string` or `free_c_string`.
pub fn string_to_c_str(s: &str) -> *mut c_char {
    let c_string = match CString::new(s) {
        Ok(cs) => cs,
        Err(_) => {
            let sanitized: String = s.chars().filter(|&c| c != '\0').collect();
            CString::new(sanitized).unwrap_or_else(|_| CString::new("").unwrap())
        }
    };
    c_string.into_raw()
}

/// Current ABI version for native Omnis dynamic plugins.
pub const OMNIS_PLUGIN_ABI_VERSION: u32 = 1;

/// Safely executes an FFI closure inside a panic unwinding boundary.
/// If the closure panics, returns a C string containing a serialized JSON error object,
/// ensuring that host processes never crash due to plugin panics.
pub fn guard<F>(f: F) -> *mut c_char
where
    F: FnOnce() -> *mut c_char + std::panic::UnwindSafe,
{
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(ptr) => ptr,
        Err(e) => {
            let msg = if let Some(s) = e.downcast_ref::<&str>() {
                *s
            } else if let Some(s) = e.downcast_ref::<String>() {
                s.as_str()
            } else {
                "Unknown panic during dynamic plugin FFI execution"
            };
            let err_json = format!("{{\"error\":\"Panic caught by FFI guard: {}\"}}", msg);
            string_to_c_str(&err_json)
        }
    }
}

/// Declarative macro to export a struct implementing `MetadataProvider` as a dynamic C-ABI plugin (`cdylib`).
///
/// Exports the following C symbols:
/// - `omnis_plugin_abi_version() -> u32`
/// - `omnis_plugin_get_manifest() -> *mut c_char`
/// - `omnis_metadata_fetch(request_json: *const c_char, settings_json: *const c_char) -> *mut c_char`
/// - `omnis_metadata_test(settings_json: *const c_char) -> *mut c_char`
/// - `omnis_free_string(ptr: *mut c_char)`
#[macro_export]
macro_rules! export_omnis_plugin {
    ($provider_type:ty) => {
        #[no_mangle]
        pub extern "C" fn omnis_plugin_abi_version() -> u32 {
            $crate::ffi::OMNIS_PLUGIN_ABI_VERSION
        }

        #[no_mangle]
        pub unsafe extern "C" fn omnis_plugin_get_manifest() -> *mut ::std::os::raw::c_char {
            $crate::ffi::guard(|| {
                let provider = <$provider_type as ::std::default::Default>::default();
                let manifest = <$provider_type as $crate::MetadataProvider>::manifest(&provider);
                match ::serde_json::to_string(&manifest) {
                    Ok(json) => $crate::ffi::string_to_c_str(&json),
                    Err(e) => {
                        let err_json = format!("{{\"error\":\"Failed to serialize manifest: {}\"}}", e);
                        $crate::ffi::string_to_c_str(&err_json)
                    }
                }
            })
        }

        #[no_mangle]
        pub unsafe extern "C" fn omnis_metadata_fetch(
            request_json: *const ::std::os::raw::c_char,
            settings_json: *const ::std::os::raw::c_char,
        ) -> *mut ::std::os::raw::c_char {
            $crate::ffi::guard(|| {
                let req_str = match $crate::ffi::c_str_to_string(request_json) {
                    Ok(s) => s,
                    Err(e) => {
                        let res: Result<$crate::GameMetadataPatch, String> = Err(format!("Invalid request string: {}", e));
                        let json = ::serde_json::to_string(&res).unwrap_or_default();
                        return $crate::ffi::string_to_c_str(&json);
                    }
                };

                let request: $crate::MetadataSearchRequest = match ::serde_json::from_str(&req_str) {
                    Ok(r) => r,
                    Err(e) => {
                        let res: Result<$crate::GameMetadataPatch, String> = Err(format!("Failed to parse request JSON: {}", e));
                        let json = ::serde_json::to_string(&res).unwrap_or_default();
                        return $crate::ffi::string_to_c_str(&json);
                    }
                };

                let settings: ::serde_json::Map<String, ::serde_json::Value> = if settings_json.is_null() {
                    ::serde_json::Map::new()
                } else {
                    match $crate::ffi::c_str_to_string(settings_json) {
                        Ok(s) if s.trim().is_empty() => ::serde_json::Map::new(),
                        Ok(s) => match ::serde_json::from_str(&s) {
                            Ok(m) => m,
                            Err(e) => {
                                let res: Result<$crate::GameMetadataPatch, String> = Err(format!("Failed to parse settings JSON: {}", e));
                                let json = ::serde_json::to_string(&res).unwrap_or_default();
                                return $crate::ffi::string_to_c_str(&json);
                            }
                        },
                        Err(e) => {
                            let res: Result<$crate::GameMetadataPatch, String> = Err(format!("Invalid settings string: {}", e));
                            let json = ::serde_json::to_string(&res).unwrap_or_default();
                            return $crate::ffi::string_to_c_str(&json);
                        }
                    }
                };

                let provider = <$provider_type as ::std::default::Default>::default();
                let fut = <$provider_type as $crate::MetadataProvider>::fetch_metadata(&provider, &request, &settings);

                let res: Result<$crate::GameMetadataPatch, String> = match ::tokio::runtime::Builder::new_current_thread().enable_all().build() {
                    Ok(rt) => rt.block_on(fut),
                    Err(_) => match ::tokio::runtime::Runtime::new() {
                        Ok(rt) => rt.block_on(fut),
                        Err(e) => Err(format!("Failed to initialize tokio runtime in plugin: {}", e)),
                    },
                };

                let json = match ::serde_json::to_string(&res) {
                    Ok(j) => j,
                    Err(e) => {
                        let fallback: Result<$crate::GameMetadataPatch, String> = Err(format!("Serialization error in plugin fetch: {}", e));
                        ::serde_json::to_string(&fallback).unwrap_or_else(|_| "{\"Err\":\"Serialization error\"}".to_string())
                    }
                };
                $crate::ffi::string_to_c_str(&json)
            })
        }

        #[no_mangle]
        pub unsafe extern "C" fn omnis_metadata_test(
            settings_json: *const ::std::os::raw::c_char,
        ) -> *mut ::std::os::raw::c_char {
            $crate::ffi::guard(|| {
                let settings: ::serde_json::Map<String, ::serde_json::Value> = if settings_json.is_null() {
                    ::serde_json::Map::new()
                } else {
                    match $crate::ffi::c_str_to_string(settings_json) {
                        Ok(s) if s.trim().is_empty() => ::serde_json::Map::new(),
                        Ok(s) => match ::serde_json::from_str(&s) {
                            Ok(m) => m,
                            Err(e) => {
                                let res: Result<String, String> = Err(format!("Failed to parse settings JSON: {}", e));
                                let json = ::serde_json::to_string(&res).unwrap_or_default();
                                return $crate::ffi::string_to_c_str(&json);
                            }
                        },
                        Err(e) => {
                            let res: Result<String, String> = Err(format!("Invalid settings string: {}", e));
                            let json = ::serde_json::to_string(&res).unwrap_or_default();
                            return $crate::ffi::string_to_c_str(&json);
                        }
                    }
                };

                let provider = <$provider_type as ::std::default::Default>::default();
                let fut = <$provider_type as $crate::MetadataProvider>::test_connection(&provider, &settings);

                let res: Result<String, String> = match ::tokio::runtime::Builder::new_current_thread().enable_all().build() {
                    Ok(rt) => rt.block_on(fut),
                    Err(_) => match ::tokio::runtime::Runtime::new() {
                        Ok(rt) => rt.block_on(fut),
                        Err(e) => Err(format!("Failed to initialize tokio runtime in plugin: {}", e)),
                    },
                };

                let json = match ::serde_json::to_string(&res) {
                    Ok(j) => j,
                    Err(e) => {
                        let fallback: Result<String, String> = Err(format!("Serialization error in plugin test: {}", e));
                        ::serde_json::to_string(&fallback).unwrap_or_else(|_| "{\"Err\":\"Serialization error\"}".to_string())
                    }
                };
                $crate::ffi::string_to_c_str(&json)
            })
        }

        #[no_mangle]
        pub unsafe extern "C" fn omnis_free_string(ptr: *mut ::std::os::raw::c_char) {
            let _ = ::std::panic::catch_unwind(::std::panic::AssertUnwindSafe(|| {
                $crate::ffi::free_c_string(ptr);
            }));
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_c_string_roundtrip() {
        let original = "Hello Omnis FFI World!";
        let ptr = string_to_c_str(original);
        assert!(!ptr.is_null());

        let converted = unsafe { c_str_to_string(ptr) }.expect("Valid conversion");
        assert_eq!(converted, original);

        unsafe { free_c_string(ptr) };
    }

    #[test]
    fn test_null_c_string() {
        let result = unsafe { c_str_to_string(std::ptr::null()) };
        assert!(result.is_err());

        // free null pointer must not crash
        unsafe { free_c_string(std::ptr::null_mut()) };
    }

    #[test]
    fn test_ffi_guard_catches_panic_and_returns_error_json() {
        let ptr = guard(|| {
            panic!("Intentional test panic in FFI function");
        });
        assert!(!ptr.is_null());

        let res_str = unsafe { c_str_to_string(ptr) }.expect("Valid string");
        assert!(res_str.contains("Panic caught by FFI guard"));
        assert!(res_str.contains("Intentional test panic"));

        unsafe { free_c_string(ptr) };
    }

    #[test]
    fn test_ffi_guard_normal_return() {
        let ptr = guard(|| {
            string_to_c_str("{\"success\":true}")
        });
        assert!(!ptr.is_null());

        let res_str = unsafe { c_str_to_string(ptr) }.expect("Valid string");
        assert_eq!(res_str, "{\"success\":true}");

        unsafe { free_c_string(ptr) };
    }
}
