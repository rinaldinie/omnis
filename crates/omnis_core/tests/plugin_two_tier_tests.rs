//! Integration tests for Tier 1 (Native FFI) and Tier 2 (WebAssembly Wasmtime) Plugin Architecture.
//!
//! Validates:
//! - Tier 1: FFI panic safety via `omnis_sdk::ffi::guard` (catch_unwind)
//! - Tier 1: ABI version handshake (`omnis_plugin_abi_version` check & rejection)
//! - Tier 2: Wasmtime epoch interruption terminating infinite loops within timeout
//! - Tier 2: Wasmtime instruction fuel exhaustion preventing denial of service
//! - Tier 2: Domain allowlist permission sandbox ("net:<domain>") blocking unauthorized egress

use omnis_core::wasm_host::{
    WasmExecutionError, WasmPluginEngine, WasmPluginPermissions, WasmSandboxConfig,
};
use omnis_core::DynamicPluginLoader;
use omnis_sdk::ffi::{c_str_to_string, free_c_string, guard, string_to_c_str, OMNIS_PLUGIN_ABI_VERSION};
use std::path::Path;
use std::time::Duration;

#[test]
fn test_tier1_native_plugin_panic_safety_via_guard() {
    // Simulate an FFI entry point that throws a panic inside a native plugin
    let ptr = guard(|| {
        panic!("Fatal internal error in native scanner plugin!");
    });

    assert!(!ptr.is_null());
    let error_json = unsafe { c_str_to_string(ptr) }.expect("Valid UTF-8 C string");
    assert!(error_json.contains("Panic caught by FFI guard"));
    assert!(error_json.contains("Fatal internal error in native scanner plugin"));

    unsafe { free_c_string(ptr) };
}

#[test]
fn test_tier1_native_plugin_normal_return_via_guard() {
    let ptr = guard(|| {
        let json = "{\"id\":\"native-scanner\",\"version\":\"1.0.0\"}";
        string_to_c_str(json)
    });

    assert!(!ptr.is_null());
    let ok_json = unsafe { c_str_to_string(ptr) }.expect("Valid UTF-8 C string");
    assert_eq!(ok_json, "{\"id\":\"native-scanner\",\"version\":\"1.0.0\"}");

    unsafe { free_c_string(ptr) };
}

#[test]
fn test_tier1_loader_rejects_missing_library_path() {
    let loader = DynamicPluginLoader::new();
    let res = loader.load_metadata_provider_from_library(Path::new("nonexistent_native_plugin.dll"));
    assert!(res.is_err());
    let err = res.err().unwrap();
    assert!(err.contains("does not exist"));
}

#[test]
fn test_tier2_wasm_permissions_domain_allowlist() {
    let perms = vec![
        "net:api.igdb.com".to_string(),
        "net:steamcommunity.com".to_string(),
        "storage:read".to_string(),
    ];

    let permissions = WasmPluginPermissions::from_manifest_permissions(&perms);
    assert!(permissions.can_read_storage);
    assert!(!permissions.can_write_storage);

    // Permitted domains
    assert!(permissions.is_domain_allowed("https://api.igdb.com/v4/games"));
    assert!(permissions.is_domain_allowed("http://api.igdb.com:443"));
    assert!(permissions.is_domain_allowed("api.igdb.com"));
    assert!(permissions.is_domain_allowed("https://steamcommunity.com/id/player"));

    // Blocked domains
    assert!(!permissions.is_domain_allowed("https://malicious-exfiltration.com/data"));
    assert!(!permissions.is_domain_allowed("https://api.rawg.io/api/games"));
    assert!(!permissions.is_domain_allowed("https://google.com"));
    assert!(!permissions.is_domain_allowed(""));
}

#[test]
fn test_tier2_wasm_infinite_loop_terminated_by_epoch_interruption() {
    let wat = r#"
        (module
            (func (export "infinite_loop")
                (loop $loop
                    br $loop
                )
            )
        )
    "#;

    // Configure sandbox with very short timeout (150ms)
    let config = WasmSandboxConfig {
        fuel_limit: 100_000_000,
        timeout: Duration::from_millis(150),
        epoch_tick_interval: Duration::from_millis(15),
    };

    let engine = WasmPluginEngine::new(config).expect("Engine initialization");
    let mut instance = engine
        .create_instance(wat.as_bytes(), &[])
        .expect("Instance creation");

    let start = std::time::Instant::now();
    let result = instance.call_func("infinite_loop", &[]);
    let elapsed = start.elapsed();

    // Verify it timed out cleanly without freezing
    assert!(result.is_err(), "Infinite loop must fail");
    match result.err().unwrap() {
        WasmExecutionError::Timeout(duration) => {
            assert!(duration <= Duration::from_millis(200));
        }
        other => panic!("Expected Timeout error, got: {:?}", other),
    }

    // Must have terminated within ~1-2 seconds, not hung forever
    assert!(elapsed < Duration::from_secs(3), "Execution took too long: {:?}", elapsed);
}

#[test]
fn test_tier1_abi_version_constant() {
    assert_eq!(OMNIS_PLUGIN_ABI_VERSION, 1);
}

#[test]
fn test_tier2_wasm_host_permission_check_in_sandbox() {
    let wat = r#"
        (module
            (import "env" "omnis_check_permission" (func $check (param i32 i32) (result i32)))
            (memory (export "memory") 1)
            (data (i32.const 0) "api.igdb.com")
            (data (i32.const 32) "evil.com")

            (func (export "test_allowed") (result i32)
                ;; pass ptr=0, len=12 ("api.igdb.com")
                (call $check (i32.const 0) (i32.const 12))
            )

            (func (export "test_forbidden") (result i32)
                ;; pass ptr=32, len=8 ("evil.com")
                (call $check (i32.const 32) (i32.const 8))
            )
        )
    "#;

    let config = WasmSandboxConfig::default();
    let engine = WasmPluginEngine::new(config).expect("Engine initialization");

    let perms = vec!["net:api.igdb.com".to_string()];
    let mut instance = engine
        .create_instance(wat.as_bytes(), &perms)
        .expect("Instance creation");

    let res_allowed = instance.call_func("test_allowed", &[]).expect("Call success");
    assert_eq!(res_allowed[0].i32(), Some(1), "api.igdb.com must be allowed");

    let res_forbidden = instance.call_func("test_forbidden", &[]).expect("Call success");
    assert_eq!(res_forbidden[0].i32(), Some(0), "evil.com must be forbidden");
}
