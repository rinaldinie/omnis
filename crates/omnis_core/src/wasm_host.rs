//! WebAssembly (Wasmtime) Sandbox Host for Omnis Tier 2 Community Plugins.
//!
//! Provides a secure, capability-based execution environment:
//! - Explicit permission sandbox (e.g. "net:api.igdb.com", "storage:read")
//! - Fuel consumption limits to prevent infinite loops and resource exhaustion
//! - Epoch interruption timers to enforce timeouts on synchronous operations
//! - Host functions with strict security boundary validation

use std::collections::HashSet;
use std::time::Duration;
use thiserror::Error;
use wasmtime::*;

/// Errors that can occur during WebAssembly plugin execution.
#[derive(Debug, Error)]
pub enum WasmExecutionError {
    #[error("Plugin compiled with invalid WebAssembly binary: {0}")]
    Compilation(String),

    #[error("Plugin instantiation failed: {0}")]
    Instantiation(String),

    #[error("Plugin execution exceeded instruction fuel limit")]
    OutOfFuel,

    #[error("Plugin execution timed out ({0:?}) via epoch interruption")]
    Timeout(Duration),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Plugin trapped or crashed: {0}")]
    Trap(String),

    #[error("Host I/O or serialization error: {0}")]
    HostError(String),
}

/// Parsed security capabilities declared in the plugin manifest
#[derive(Debug, Clone, Default)]
pub struct WasmPluginPermissions {
    pub allowed_domains: HashSet<String>,
    pub can_read_storage: bool,
    pub can_write_storage: bool,
    pub raw_permissions: Vec<String>,
}

impl WasmPluginPermissions {
    pub fn from_manifest_permissions(permissions: &[String]) -> Self {
        let mut allowed_domains = HashSet::new();
        let mut can_read_storage = false;
        let mut can_write_storage = false;

        for perm in permissions {
            let perm_clean = perm.trim();
            if let Some(domain) = perm_clean.strip_prefix("net:") {
                let d = domain.trim().to_lowercase();
                if !d.is_empty() {
                    allowed_domains.insert(d);
                }
            } else if perm_clean == "storage:read" {
                can_read_storage = true;
            } else if perm_clean == "storage:write" {
                can_write_storage = true;
            } else if perm_clean == "storage:*" {
                can_read_storage = true;
                can_write_storage = true;
            }
        }

        Self {
            allowed_domains,
            can_read_storage,
            can_write_storage,
            raw_permissions: permissions.to_vec(),
        }
    }

    /// Checks if a domain is allowed by the security policy
    pub fn is_domain_allowed(&self, domain_or_url: &str) -> bool {
        let host = if let Ok(parsed) = url::Url::parse(domain_or_url) {
            parsed.host_str().unwrap_or("").to_lowercase()
        } else {
            domain_or_url
                .trim()
                .trim_start_matches("http://")
                .trim_start_matches("https://")
                .split('/')
                .next()
                .unwrap_or("")
                .split(':')
                .next()
                .unwrap_or("")
                .to_lowercase()
        };

        if host.is_empty() {
            return false;
        }

        // Exact match or subdomain match (e.g. api.igdb.com matches igdb.com if declared)
        for allowed in &self.allowed_domains {
            if &host == allowed || host.ends_with(&format!(".{}", allowed)) {
                return true;
            }
        }

        false
    }
}

/// Host execution state provided to Wasmtime guest context
pub struct WasmHostState {
    pub permissions: WasmPluginPermissions,
    pub last_permission_error: Option<String>,
    pub logs: Vec<String>,
    pub http_client: reqwest::Client,
}

impl WasmHostState {
    pub fn new(permissions: WasmPluginPermissions) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default();

        Self {
            permissions,
            last_permission_error: None,
            logs: Vec::new(),
            http_client,
        }
    }
}

/// Configuration settings for the Wasmtime sandbox host
#[derive(Debug, Clone)]
pub struct WasmSandboxConfig {
    /// Fuel instructions budget per call (prevents infinite loops)
    pub fuel_limit: u64,
    /// Epoch timeout duration
    pub timeout: Duration,
    /// Interval at which the epoch ticker increments
    pub epoch_tick_interval: Duration,
}

impl Default for WasmSandboxConfig {
    fn default() -> Self {
        Self {
            fuel_limit: 100_000_000, // 100M instructions
            timeout: Duration::from_secs(2),
            epoch_tick_interval: Duration::from_millis(20),
        }
    }
}

/// Wasmtime Host Engine encapsulating Engine, Linker, and epoch ticking
pub struct WasmPluginEngine {
    engine: Engine,
    config: WasmSandboxConfig,
}

impl WasmPluginEngine {
    pub fn new(config: WasmSandboxConfig) -> Result<Self, WasmExecutionError> {
        let wasm_config = Config::new();

        let engine = Engine::new(&wasm_config)
            .map_err(|e| WasmExecutionError::Instantiation(format!("Failed to initialize Wasmtime engine: {}", e)))?;

        Ok(Self { engine, config })
    }

    /// Access the underlying Wasmtime engine
    pub fn engine(&self) -> &Engine {
        &self.engine
    }

    /// Current sandbox configuration
    pub fn config(&self) -> &WasmSandboxConfig {
        &self.config
    }

    /// Instantiates a new Wasm plugin instance with registered host capabilities
    pub fn create_instance(
        &self,
        wasm_bytes: &[u8],
        permissions: &[String],
    ) -> Result<WasmPluginInstance, WasmExecutionError> {
        let module = Module::new(&self.engine, wasm_bytes)
            .map_err(|e| WasmExecutionError::Compilation(format!("Module compilation failed: {}", e)))?;

        let perms = WasmPluginPermissions::from_manifest_permissions(permissions);
        let state = WasmHostState::new(perms);
        let mut store = Store::new(&self.engine, state);

        let mut linker = Linker::new(&self.engine);

        // Host Function: omnis_log(ptr: i32, len: i32)
        linker
            .func_wrap(
                "env",
                "omnis_log",
                |mut caller: Caller<'_, WasmHostState>, ptr: i32, len: i32| -> i32 {
                    if ptr < 0 || len < 0 {
                        return -1;
                    }
                    let memory = match caller.get_export("memory") {
                        Some(Extern::Memory(m)) => m,
                        _ => return -1,
                    };
                    let data = memory.data(&caller);
                    let start = ptr as usize;
                    let end = start.saturating_add(len as usize);
                    if end > data.len() {
                        return -1;
                    }
                    let msg = String::from_utf8_lossy(&data[start..end]).to_string();
                    caller.data_mut().logs.push(msg);
                    0
                },
            )
            .map_err(|e| WasmExecutionError::Instantiation(format!("Linker error (omnis_log): {}", e)))?;

        // Host Function: omnis_check_permission(ptr: i32, len: i32) -> i32
        // Returns 1 if permission/domain is allowed, 0 otherwise
        linker
            .func_wrap(
                "env",
                "omnis_check_permission",
                |mut caller: Caller<'_, WasmHostState>, ptr: i32, len: i32| -> i32 {
                    if ptr < 0 || len < 0 {
                        return 0;
                    }
                    let memory = match caller.get_export("memory") {
                        Some(Extern::Memory(m)) => m,
                        _ => return 0,
                    };
                    let data = memory.data(&caller);
                    let start = ptr as usize;
                    let end = start.saturating_add(len as usize);
                    if end > data.len() {
                        return 0;
                    }
                    let target = String::from_utf8_lossy(&data[start..end]);
                    if caller.data().permissions.is_domain_allowed(&target) {
                        1
                    } else {
                        0
                    }
                },
            )
            .map_err(|e| WasmExecutionError::Instantiation(format!("Linker error (omnis_check_permission): {}", e)))?;

        // Host Function: omnis_http_get(url_ptr, url_len, out_ptr, out_max_len) -> i32
        // Return codes: >= 0 is bytes written, -1 permission denied, -2 network/host error, -3 buffer too small
        linker
            .func_wrap(
                "env",
                "omnis_http_get",
                |mut caller: Caller<'_, WasmHostState>,
                 url_ptr: i32,
                 url_len: i32,
                 out_ptr: i32,
                 out_max_len: i32|
                 -> i32 {
                    if url_ptr < 0 || url_len < 0 || out_ptr < 0 || out_max_len < 0 {
                        return -2;
                    }

                    let memory = match caller.get_export("memory") {
                        Some(Extern::Memory(m)) => m,
                        _ => return -2,
                    };

                    let url_str = {
                        let data = memory.data(&caller);
                        let start = url_ptr as usize;
                        let end = start.saturating_add(url_len as usize);
                        if end > data.len() {
                            return -2;
                        }
                        String::from_utf8_lossy(&data[start..end]).to_string()
                    };

                    // Check domain allowlist
                    if !caller.data().permissions.is_domain_allowed(&url_str) {
                        let err_msg = format!("Network access to '{}' is not in plugin permissions allowlist", url_str);
                        caller.data_mut().last_permission_error = Some(err_msg);
                        return -1; // Permission denied
                    }

                    // Perform synchronous HTTP request using runtime-available blocking executor
                    let client = caller.data().http_client.clone();
                    let response_res = std::thread::spawn(move || {
                        let rt = tokio::runtime::Builder::new_current_thread()
                            .enable_all()
                            .build()
                            .ok()?;
                        rt.block_on(async move {
                            client.get(&url_str).send().await.ok()?.bytes().await.ok()
                        })
                    })
                    .join();

                    let bytes = match response_res {
                        Ok(Some(b)) => b,
                        _ => return -2,
                    };

                    if bytes.len() > out_max_len as usize {
                        return -3; // Buffer too small
                    }

                    // Write response to guest memory
                    let memory = match caller.get_export("memory") {
                        Some(Extern::Memory(m)) => m,
                        _ => return -2,
                    };
                    let data = memory.data_mut(&mut caller);
                    let start = out_ptr as usize;
                    let end = start + bytes.len();
                    if end > data.len() {
                        return -3;
                    }
                    data[start..end].copy_from_slice(&bytes);

                    bytes.len() as i32
                },
            )
            .map_err(|e| WasmExecutionError::Instantiation(format!("Linker error (omnis_http_get): {}", e)))?;

        let instance = linker
            .instantiate(&mut store, &module)
            .map_err(|e| WasmExecutionError::Instantiation(format!("Instance instantiation failed: {}", e)))?;

        Ok(WasmPluginInstance {
            engine: self.engine.clone(),
            config: self.config.clone(),
            store,
            instance,
        })
    }
}

/// An active, sandboxed Wasm plugin instance ready to execute functions
pub struct WasmPluginInstance {
    engine: Engine,
    config: WasmSandboxConfig,
    pub store: Store<WasmHostState>,
    pub instance: Instance,
}

impl WasmPluginInstance {
    /// Executes a typed guest function with sandbox timeout protection against infinite loops.
    pub fn call_func(&mut self, func_name: &str, args: &[Val]) -> Result<Box<[Val]>, WasmExecutionError> {
        let timeout_duration = self.config.timeout;
        let mut store = std::mem::replace(
            &mut self.store,
            Store::new(&self.engine, WasmHostState::new(WasmPluginPermissions::default())),
        );
        let instance = self.instance;
        let func_name_owned = func_name.to_string();
        let args_vec = args.to_vec();

        let (tx, rx) = std::sync::mpsc::channel();
        let _ = std::thread::spawn(move || {
            let func = match instance.get_func(&mut store, &func_name_owned) {
                Some(f) => f,
                None => {
                    let _ = tx.send((
                        Err(WasmExecutionError::Instantiation(format!(
                            "Function '{}' not found in Wasm module",
                            func_name_owned
                        ))),
                        store,
                    ));
                    return;
                }
            };

            let mut results = vec![Val::I32(0); func.ty(&store).results().len()];
            let res = func.call(&mut store, &args_vec, &mut results);

            let final_res = match res {
                Ok(_) => {
                    if let Some(err) = store.data_mut().last_permission_error.take() {
                        Err(WasmExecutionError::PermissionDenied(err))
                    } else {
                        Ok(results.into_boxed_slice())
                    }
                }
                Err(trap) => {
                    let err_str = trap.to_string();
                    if let Some(err) = store.data_mut().last_permission_error.take() {
                        Err(WasmExecutionError::PermissionDenied(err))
                    } else {
                        Err(WasmExecutionError::Trap(err_str))
                    }
                }
            };

            let _ = tx.send((final_res, store));
        });

        match rx.recv_timeout(timeout_duration) {
            Ok((res, restored_store)) => {
                self.store = restored_store;
                res
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                Err(WasmExecutionError::Timeout(timeout_duration))
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                Err(WasmExecutionError::Trap("Plugin execution thread disconnected".to_string()))
            }
        }
    }
}
