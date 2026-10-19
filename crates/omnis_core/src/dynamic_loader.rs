//! Dynamic Native Plugin Loader for Omnis Game Library
//!
//! Loads external community plugins compiled as native shared libraries (`.dll`, `.so`, `.dylib`)
//! conforming to the Omnis C-ABI FFI contract.

use async_trait::async_trait;
use omnis_sdk::{
    GameMetadataPatch, MetadataField, MetadataProvider, MetadataSearchRequest, PluginManifest,
    PluginSettingsSchema,
};
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub type FnGetManifest = unsafe extern "C" fn() -> *mut c_char;
pub type FnMetadataFetch = unsafe extern "C" fn(*const c_char, *const c_char) -> *mut c_char;
pub type FnMetadataTest = unsafe extern "C" fn(*const c_char) -> *mut c_char;
pub type FnFreeString = unsafe extern "C" fn(*mut c_char);

/// Checks whether a given path has a platform-specific shared library extension
pub fn is_shared_library(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext = ext.to_lowercase();
        if cfg!(target_os = "windows") {
            ext == "dll"
        } else if cfg!(target_os = "macos") {
            ext == "dylib" || ext == "so"
        } else {
            ext == "so"
        }
    } else {
        false
    }
}

/// Discovers the first matching native shared library inside a directory
pub fn find_shared_library_in_dir(dir: &Path) -> Option<PathBuf> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && is_shared_library(&path) {
                return Some(path);
            }
        }
    }
    None
}

/// Encapsulates a loaded dynamic library handle and its FFI function pointers
#[derive(Clone)]
pub struct DynamicPluginHandle {
    pub library_path: PathBuf,
    #[allow(dead_code)]
    lib: Arc<libloading::Library>,
    fn_get_manifest: FnGetManifest,
    fn_metadata_fetch: FnMetadataFetch,
    fn_metadata_test: Option<FnMetadataTest>,
    fn_free_string: FnFreeString,
}

impl DynamicPluginHandle {
    /// Calls an FFI function that returns a dynamically allocated C string,
    /// catches any unwind panics, converts the C string to a Rust String,
    /// and immediately calls the plugin's `omnis_free_string` to release the pointer safely.
    pub unsafe fn call_c_string_returning<F>(&self, func: F) -> Result<String, String>
    where
        F: FnOnce() -> *mut c_char + std::panic::UnwindSafe,
    {
        let c_ptr_res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(func));
        let c_ptr = match c_ptr_res {
            Ok(ptr) => ptr,
            Err(e) => {
                let msg = if let Some(s) = e.downcast_ref::<&str>() {
                    s.to_string()
                } else if let Some(s) = e.downcast_ref::<String>() {
                    s.clone()
                } else {
                    "Unknown panic occurred in dynamic plugin".to_string()
                };
                return Err(format!("Plugin crashed during FFI invocation: {}", msg));
            }
        };

        if c_ptr.is_null() {
            return Err("Plugin returned null pointer".to_string());
        }

        let rust_str_res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            CStr::from_ptr(c_ptr).to_str().map(|s| s.to_string())
        }));

        // Immediately deallocate the C string using the plugin's own allocator
        let free_fn = self.fn_free_string;
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            free_fn(c_ptr);
        }));

        match rust_str_res {
            Ok(Ok(s)) => Ok(s),
            Ok(Err(utf8_err)) => Err(format!("Plugin returned invalid UTF-8 string: {}", utf8_err)),
            Err(_) => Err("Panic while converting C string to Rust string".to_string()),
        }
    }

    /// Retrieves and parses the declarative manifest from the dynamic plugin
    pub fn get_manifest(&self) -> Result<PluginManifest, String> {
        let fn_manifest = self.fn_get_manifest;
        let json_str = unsafe {
            self.call_c_string_returning(|| fn_manifest())
        }?;

        serde_json::from_str::<PluginManifest>(&json_str)
            .map_err(|e| format!("Failed to parse PluginManifest JSON from plugin: {} (raw: {})", e, json_str))
    }

    /// Invokes the plugin's metadata search and enrichment logic via FFI
    pub fn metadata_fetch(
        &self,
        request: &MetadataSearchRequest,
        settings: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<GameMetadataPatch, String> {
        let req_json = serde_json::to_string(request)
            .map_err(|e| format!("Failed to serialize search request: {}", e))?;
        let settings_json = serde_json::to_string(settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;

        let req_c = CString::new(req_json)
            .map_err(|e| format!("CString error on request: {}", e))?;
        let settings_c = CString::new(settings_json)
            .map_err(|e| format!("CString error on settings: {}", e))?;

        let fn_fetch = self.fn_metadata_fetch;
        let json_str = unsafe {
            self.call_c_string_returning(|| {
                fn_fetch(req_c.as_ptr(), settings_c.as_ptr())
            })
        }?;

        let result: Result<GameMetadataPatch, String> = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to deserialize metadata fetch result from plugin: {} (raw: {})", e, json_str))?;

        result
    }

    /// Invokes the plugin's connection test logic via FFI
    pub fn metadata_test(
        &self,
        settings: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<String, String> {
        let Some(fn_test) = self.fn_metadata_test else {
            return Ok("Connection verified (plugin test not implemented)".to_string());
        };

        let settings_json = serde_json::to_string(settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        let settings_c = CString::new(settings_json)
            .map_err(|e| format!("CString error on settings: {}", e))?;

        let json_str = unsafe {
            self.call_c_string_returning(|| {
                fn_test(settings_c.as_ptr())
            })
        }?;

        let result: Result<String, String> = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to deserialize metadata test result from plugin: {} (raw: {})", e, json_str))?;

        result
    }
}

/// Dynamic native provider implementing the Omnis `MetadataProvider` trait
pub struct DynamicNativeMetadataProvider {
    pub handle: DynamicPluginHandle,
    pub manifest: PluginManifest,
    pub root_dir: PathBuf,
}

#[async_trait]
impl MetadataProvider for DynamicNativeMetadataProvider {
    fn id(&self) -> &str {
        &self.manifest.id
    }

    fn name(&self) -> &str {
        &self.manifest.name
    }

    fn description(&self) -> &str {
        &self.manifest.description
    }

    fn author(&self) -> &str {
        &self.manifest.author
    }

    fn website(&self) -> Option<&str> {
        self.manifest.website.as_deref()
    }

    fn key_help_url(&self) -> Option<&str> {
        self.manifest.key_help_url.as_deref()
    }

    fn requires_api_key(&self) -> bool {
        self.manifest.requires_api_key
    }

    fn is_builtin(&self) -> bool {
        false
    }

    fn version(&self) -> Option<&str> {
        Some(&self.manifest.version)
    }

    fn plugin_path(&self) -> Option<&Path> {
        Some(&self.root_dir)
    }

    fn supported_fields(&self) -> Vec<MetadataField> {
        if self.manifest.supported_fields.is_empty() {
            vec![
                MetadataField::CriticScore,
                MetadataField::CommunityScore,
                MetadataField::Description,
            ]
        } else {
            self.manifest.supported_fields.clone()
        }
    }

    fn settings_schema(&self) -> Option<PluginSettingsSchema> {
        self.manifest.settings_schema.clone()
    }

    async fn fetch_metadata(
        &self,
        request: &MetadataSearchRequest,
        settings: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<GameMetadataPatch, String> {
        let handle = self.handle.clone();
        let request = request.clone();
        let settings = settings.clone();

        tokio::task::spawn_blocking(move || {
            handle.metadata_fetch(&request, &settings)
        })
        .await
        .map_err(|e| format!("JoinError executing dynamic plugin fetch: {}", e))?
    }

    async fn test_connection(
        &self,
        settings: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<String, String> {
        let handle = self.handle.clone();
        let settings = settings.clone();

        tokio::task::spawn_blocking(move || {
            handle.metadata_test(&settings)
        })
        .await
        .map_err(|e| format!("JoinError executing dynamic plugin test: {}", e))?
    }
}

/// Loader responsible for dynamically opening native libraries and verifying FFI ABI contracts
#[derive(Debug, Default, Clone)]
pub struct DynamicPluginLoader;

impl DynamicPluginLoader {
    pub fn new() -> Self {
        Self
    }

    /// Loads a native shared library from disk, verifies required FFI symbols,
    /// and instantiates a `DynamicNativeMetadataProvider`.
    pub fn load_metadata_provider_from_library(
        &self,
        library_path: &Path,
    ) -> Result<DynamicNativeMetadataProvider, String> {
        if !library_path.exists() {
            return Err(format!(
                "Dynamic library path does not exist: {}",
                library_path.display()
            ));
        }

        // Safety: loading native shared libraries can execute arbitrary code. Caller must trust the plugin binary.
        let lib = unsafe {
            libloading::Library::new(library_path).map_err(|e| {
                format!(
                    "Failed to load dynamic library '{}': {}",
                    library_path.display(),
                    e
                )
            })?
        };

        let lib = Arc::new(lib);

        let fn_get_manifest: FnGetManifest = unsafe {
            let sym = lib
                .get::<FnGetManifest>(b"omnis_plugin_get_manifest\0")
                .map_err(|e| format!("Missing mandatory FFI symbol 'omnis_plugin_get_manifest': {}", e))?;
            *sym
        };

        let fn_metadata_fetch: FnMetadataFetch = unsafe {
            let sym = lib
                .get::<FnMetadataFetch>(b"omnis_metadata_fetch\0")
                .map_err(|e| format!("Missing mandatory FFI symbol 'omnis_metadata_fetch': {}", e))?;
            *sym
        };

        let fn_free_string: FnFreeString = unsafe {
            let sym = lib
                .get::<FnFreeString>(b"omnis_free_string\0")
                .map_err(|e| format!("Missing mandatory FFI symbol 'omnis_free_string': {}", e))?;
            *sym
        };

        let fn_metadata_test: Option<FnMetadataTest> = unsafe {
            lib.get::<FnMetadataTest>(b"omnis_metadata_test\0")
                .map(|sym| *sym)
                .ok()
        };

        let handle = DynamicPluginHandle {
            library_path: library_path.to_path_buf(),
            lib,
            fn_get_manifest,
            fn_metadata_fetch,
            fn_metadata_test,
            fn_free_string,
        };

        let manifest = handle.get_manifest()?;
        let root_dir = library_path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| library_path.to_path_buf());

        Ok(DynamicNativeMetadataProvider {
            handle,
            manifest,
            root_dir,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_shared_library() {
        if cfg!(target_os = "windows") {
            assert!(is_shared_library(Path::new("my_plugin.dll")));
            assert!(!is_shared_library(Path::new("my_plugin.so")));
        } else {
            assert!(is_shared_library(Path::new("my_plugin.so")));
            assert!(!is_shared_library(Path::new("my_plugin.txt")));
        }
    }

    #[test]
    fn test_nonexistent_library_error() {
        let loader = DynamicPluginLoader::new();
        let res = loader.load_metadata_provider_from_library(Path::new("nonexistent_library_path_12345.dll"));
        assert!(res.is_err());
    }
}
