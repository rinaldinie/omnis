use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Platform-specific downloadable asset information
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MarketplacePlatformAsset {
    pub download_url: String,
    pub filename: String,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub size_bytes: Option<u64>,
}

/// Catalog entry for an Omnis community plugin
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MarketplacePluginItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub plugin_type: String, // "metadata" | "library"
    #[serde(default)]
    pub requires_api_key: bool,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub platforms: HashMap<String, MarketplacePlatformAsset>,
    #[serde(default)]
    pub is_installed: bool,
    #[serde(default)]
    pub installed_version: Option<String>,
    #[serde(default)]
    pub has_update: bool,
}

/// Complete marketplace catalog schema
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MarketplaceCatalog {
    pub version: String,
    pub updated_at: String,
    pub plugins: Vec<MarketplacePluginItem>,
}

/// Returns the current OS and architecture identifier string
pub fn current_platform_key() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows-x86_64"
    } else if cfg!(target_os = "macos") {
        #[cfg(target_arch = "aarch64")]
        {
            "macos-aarch64"
        }
        #[cfg(not(target_arch = "aarch64"))]
        {
            "macos-x86_64"
        }
    } else {
        "linux-x86_64"
    }
}

/// Compares two semver-like strings, returns true if remote_v is newer than installed_v
pub fn is_newer_version(remote_v: &str, installed_v: &str) -> bool {
    let r_parts: Vec<u64> = remote_v.split('.').filter_map(|s| s.parse().ok()).collect();
    let i_parts: Vec<u64> = installed_v.split('.').filter_map(|s| s.parse().ok()).collect();
    if !r_parts.is_empty() && !i_parts.is_empty() {
        r_parts > i_parts
    } else {
        remote_v != installed_v
    }
}

/// Validates plugin ID allowlist and checks against path traversal sequences
pub fn validate_plugin_id(plugin_id: &str) -> Result<(), String> {
    if plugin_id.is_empty() {
        return Err("ID plugin non valido: non può essere vuoto".to_string());
    }
    if !plugin_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("ID plugin non valido: sono ammessi solo caratteri alfanumerici, trattini e underscore".to_string());
    }
    if plugin_id.contains("..") {
        return Err("ID plugin non valido: sequenza traversal non consentita".to_string());
    }
    Ok(())
}

/// Resolves a file:// URL or path string to a canonical PathBuf across Windows and Unix
pub fn file_url_to_path(url_str: &str) -> PathBuf {
    if let Ok(parsed) = url::Url::parse(url_str) {
        if let Ok(path) = parsed.to_file_path() {
            return path;
        }
    }
    let mut raw = url_str.trim_start_matches("file://");
    while raw.starts_with('/') {
        if raw.len() >= 3
            && raw.chars().nth(1).map_or(false, |c| c.is_ascii_alphabetic())
            && raw.chars().nth(2) == Some(':')
        {
            raw = &raw[1..];
            break;
        } else if !raw.starts_with("//") {
            break;
        } else {
            raw = &raw[1..];
        }
    }
    PathBuf::from(raw)
}
