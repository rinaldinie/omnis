use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use sysinfo::System;
use url::Url;

const GITHUB_ISSUES_NEW_URL: &str = "https://github.com/rinaldinie/omnis/issues/new";
const GITHUB_BUG_TEMPLATE: &str = "bug_report.yml";
const MAX_LOG_LINES: usize = 80;
const MAX_EXCERPT_CHARS: usize = 4500;
const MAX_ISSUE_URL_LEN: usize = 7000;

const ALLOWED_AREAS: &[&str] = &[
    "UI / UX",
    "Fullscreen / Gamepad Mode",
    "Library Scanning",
    "Metadata Pipeline",
    "Process Tracking",
    "Plugins",
    "Core Engine",
    "CLI",
    "Other",
];

#[derive(Debug, Clone, Serialize)]
pub struct BugReportContext {
    pub app_version: String,
    pub os_info: String,
    pub logs_excerpt: String,
    pub log_file_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubBugReportPayload {
    pub title: String,
    pub description: String,
    pub reproduction: String,
    pub expected: String,
    pub actual: String,
    pub area: String,
    pub os: String,
    pub version: String,
    #[serde(default)]
    pub logs: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BugReportLaunchResult {
    pub url: String,
    pub logs_truncated: bool,
}

#[tauri::command]
pub async fn get_bug_report_context() -> Result<BugReportContext, String> {
    tokio::task::spawn_blocking(|| {
        let logs_dir = crate::logging::resolve_logs_dir();
        Ok(collect_bug_report_context(&logs_dir))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn open_github_bug_report(payload: GitHubBugReportPayload) -> Result<BugReportLaunchResult, String> {
    let (url, logs_truncated) = build_github_bug_report_url(&payload)?;
    let url_str = url.to_string();
    open_validated_github_url(&url)?;
    Ok(BugReportLaunchResult {
        url: url_str,
        logs_truncated,
    })
}

pub fn collect_bug_report_context(logs_dir: &Path) -> BugReportContext {
    let app_version = format!("v{}", env!("CARGO_PKG_VERSION"));
    let os_info = detect_os_info();
    let (logs_excerpt, log_file_name) = read_latest_log_excerpt(logs_dir);

    BugReportContext {
        app_version,
        os_info,
        logs_excerpt,
        log_file_name,
    }
}

fn detect_os_info() -> String {
    let os_desc = System::long_os_version()
        .or_else(|| {
            let name = System::name()?;
            let ver = System::os_version().unwrap_or_default();
            if ver.is_empty() {
                Some(name)
            } else {
                Some(format!("{} {}", name, ver))
            }
        })
        .unwrap_or_else(|| std::env::consts::OS.to_string());

    format!("{} ({})", os_desc.trim(), std::env::consts::ARCH)
}

fn find_latest_log_file(logs_dir: &Path) -> Option<(String, PathBuf)> {
    let entries = fs::read_dir(logs_dir).ok()?;
    let mut log_files: Vec<(String, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() {
                return None;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("omnis-") && name.ends_with(".log") {
                Some((name, path))
            } else {
                None
            }
        })
        .collect();

    // Filenames are `omnis-YYYY-MM-DD.log`, so reverse lexicographical order gives newest first.
    log_files.sort_by(|a, b| b.0.cmp(&a.0));
    log_files.into_iter().next()
}

fn read_latest_log_excerpt(logs_dir: &Path) -> (String, Option<String>) {
    let Some((file_name, path)) = find_latest_log_file(logs_dir) else {
        return (String::new(), None);
    };

    let Ok(raw) = fs::read_to_string(&path) else {
        return (String::new(), Some(file_name));
    };

    let lines: Vec<&str> = raw.lines().collect();
    let start = lines.len().saturating_sub(MAX_LOG_LINES);
    let tail = lines[start..].join("\n");
    let sanitized = sanitize_log_text(&tail);
    let trimmed = take_tail_chars(&sanitized, MAX_EXCERPT_CHARS);

    (trimmed, Some(file_name))
}

fn take_tail_chars(input: &str, max_chars: usize) -> String {
    let count = input.chars().count();
    if count <= max_chars {
        return input.to_string();
    }
    let skip = count - max_chars;
    let byte_idx = input
        .char_indices()
        .nth(skip)
        .map(|(idx, _)| idx)
        .unwrap_or(0);
    input[byte_idx..].to_string()
}

/// Redacts local user paths and common credential/token patterns before logs leave the machine.
pub fn sanitize_log_text(raw: &str) -> String {
    raw.lines()
        .map(sanitize_log_line)
        .collect::<Vec<_>>()
        .join("\n")
}

fn sanitize_log_line(line: &str) -> String {
    let mut out = redact_user_home_paths(line);
    for prefix in ["Bearer ", "ghp_", "github_pat_"] {
        out = redact_token_prefix(&out, prefix);
    }
    for key in [
        "token=",
        "api_key=",
        "apikey=",
        "client_secret=",
        "secret=",
        "password=",
        "authorization=",
    ] {
        out = redact_kv_secret(&out, key);
    }
    out
}

fn redact_user_home_paths(line: &str) -> String {
    let mut result = line.to_string();
    for marker in [r":\Users\", ":/Users/", "/Users/", "/home/"] {
        result = redact_segment_after_marker(&result, marker, "<USER>");
    }
    result
}

fn redact_segment_after_marker(input: &str, marker: &str, replacement: &str) -> String {
    let lower_input = input.to_ascii_lowercase();
    let lower_marker = marker.to_ascii_lowercase();
    let mut out = String::with_capacity(input.len());
    let mut cursor = 0;

    while let Some(rel_idx) = lower_input[cursor..].find(&lower_marker) {
        let match_start = cursor + rel_idx;
        let user_start = match_start + marker.len();
        out.push_str(&input[cursor..user_start]);

        let rest = &input[user_start..];
        let seg_len = rest
            .find(|c: char| c == '\\' || c == '/' || c.is_whitespace() || c == '"' || c == '\'')
            .unwrap_or(rest.len());

        if seg_len > 0 {
            out.push_str(replacement);
            cursor = user_start + seg_len;
        } else {
            cursor = user_start;
        }
    }
    out.push_str(&input[cursor..]);
    out
}

fn redact_token_prefix(input: &str, prefix: &str) -> String {
    let lower_input = input.to_ascii_lowercase();
    let lower_prefix = prefix.to_ascii_lowercase();
    let mut out = String::with_capacity(input.len());
    let mut cursor = 0;

    while let Some(rel_idx) = lower_input[cursor..].find(&lower_prefix) {
        let start = cursor + rel_idx;
        let val_start = start + prefix.len();
        out.push_str(&input[cursor..val_start]);

        let rest = &input[val_start..];
        let val_len = rest
            .find(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == ',' || c == '&')
            .unwrap_or(rest.len());

        if val_len > 0 {
            out.push_str("<REDACTED>");
            cursor = val_start + val_len;
        } else {
            cursor = val_start;
        }
    }
    out.push_str(&input[cursor..]);
    out
}

fn redact_kv_secret(input: &str, key_eq: &str) -> String {
    let lower_input = input.to_ascii_lowercase();
    let lower_key = key_eq.to_ascii_lowercase();
    let mut out = String::with_capacity(input.len());
    let mut cursor = 0;

    while let Some(rel_idx) = lower_input[cursor..].find(&lower_key) {
        let start = cursor + rel_idx;
        let val_start = start + key_eq.len();
        out.push_str(&input[cursor..val_start]);

        let rest = &input[val_start..];
        let val_len = rest
            .find(|c: char| c.is_whitespace() || c == '&' || c == ',' || c == '"' || c == '\'')
            .unwrap_or(rest.len());

        if val_len > 0 {
            out.push_str("<REDACTED>");
            cursor = val_start + val_len;
        } else {
            cursor = val_start;
        }
    }
    out.push_str(&input[cursor..]);
    out
}

pub fn build_github_bug_report_url(payload: &GitHubBugReportPayload) -> Result<(Url, bool), String> {
    let area = if ALLOWED_AREAS.contains(&payload.area.trim()) {
        payload.area.trim()
    } else {
        "Other"
    };
    let version = if payload.version.trim().is_empty() {
        format!("v{}", env!("CARGO_PKG_VERSION"))
    } else {
        payload.version.trim().to_string()
    };

    let mut base_params: Vec<(&str, &str)> = vec![("template", GITHUB_BUG_TEMPLATE)];
    let title = payload.title.trim();
    if !title.is_empty() {
        base_params.push(("title", title));
    }
    let description = payload.description.trim();
    let reproduction = payload.reproduction.trim();
    let expected = payload.expected.trim();
    let actual = payload.actual.trim();
    let os = payload.os.trim();

    base_params.push(("description", description));
    base_params.push(("reproduction", reproduction));
    base_params.push(("expected", expected));
    base_params.push(("actual", actual));
    base_params.push(("area", area));
    base_params.push(("os", os));
    base_params.push(("version", &version));

    let base_url = Url::parse_with_params(GITHUB_ISSUES_NEW_URL, &base_params)
        .map_err(|e| format!("Impossibile costruire URL GitHub: {}", e))?;

    let raw_logs = payload.logs.as_deref().unwrap_or("").trim();
    if raw_logs.is_empty() {
        return Ok((base_url, false));
    }

    let sanitized_logs = sanitize_log_text(raw_logs);
    let mut full_params = base_params.clone();
    full_params.push(("logs", &sanitized_logs));
    let full_url = Url::parse_with_params(GITHUB_ISSUES_NEW_URL, &full_params)
        .map_err(|e| format!("Impossibile costruire URL GitHub: {}", e))?;

    if full_url.as_str().len() <= MAX_ISSUE_URL_LEN {
        return Ok((full_url, false));
    }

    // Keep the newest tail of the logs within the safe URL length budget.
    let notice = "... [truncated; full logs copied to clipboard] ...\n";
    let chars: Vec<char> = sanitized_logs.chars().collect();
    let mut low = 0usize;
    let mut high = chars.len();
    let mut best_url: Option<Url> = None;

    while low <= high {
        let mid = (low + high) / 2;
        let tail: String = chars[chars.len().saturating_sub(mid)..].iter().collect();
        let candidate_logs = format!("{}{}", notice, tail);

        let mut params = base_params.clone();
        params.push(("logs", &candidate_logs));
        if let Ok(candidate_url) = Url::parse_with_params(GITHUB_ISSUES_NEW_URL, &params) {
            if candidate_url.as_str().len() <= MAX_ISSUE_URL_LEN {
                best_url = Some(candidate_url);
                low = mid + 1;
                continue;
            }
        }
        if mid == 0 {
            break;
        }
        high = mid - 1;
    }

    if let Some(url) = best_url {
        Ok((url, true))
    } else {
        Ok((base_url, true))
    }
}

fn open_validated_github_url(url: &Url) -> Result<(), String> {
    if url.scheme() != "https" || url.host_str() != Some("github.com") {
        return Err("URL GitHub non valido".to_string());
    }

    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let verb = HSTRING::from("open");
        let target = HSTRING::from(url.as_str());
        let hinst = unsafe { ShellExecuteW(None, &verb, &target, None, None, SW_SHOWNORMAL) };
        if (hinst.0 as isize) <= 32 {
            return Err(format!(
                "Impossibile aprire il browser (ShellExecuteW code {})",
                hinst.0 as isize
            ));
        }
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url.as_str())
            .spawn()
            .map_err(|e| format!("Impossibile aprire il browser: {}", e))?;
        Ok(())
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url.as_str())
            .spawn()
            .map_err(|e| format!("Impossibile aprire il browser: {}", e))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_log_text_redacts_paths_and_tokens() {
        let raw = concat!(
            "2026-11-25 INFO loading DB from C:\\Users\\rinal\\AppData\\Roaming\\Omnis\n",
            "2026-11-25 DEBUG unix path /home/enrico/.local/share/omnis\n",
            "2026-11-25 WARN auth header Bearer secret_abc123 token=mysecret99 api_key=xyz\n",
            "2026-11-25 ERROR ghp_1234567890abcdef"
        );

        let sanitized = sanitize_log_text(raw);
        assert!(!sanitized.contains("rinal"));
        assert!(!sanitized.contains("enrico"));
        assert!(!sanitized.contains("secret_abc123"));
        assert!(!sanitized.contains("mysecret99"));
        assert!(!sanitized.contains("xyz"));
        assert!(!sanitized.contains("1234567890abcdef"));
        assert!(sanitized.contains(r"C:\Users\<USER>\AppData"));
        assert!(sanitized.contains("/home/<USER>/.local"));
        assert!(sanitized.contains("<REDACTED>"));
    }

    #[test]
    fn test_collect_bug_report_context_reads_latest_log_file() {
        let temp_dir = std::env::temp_dir().join(format!(
            "omnis_bug_ctx_test_{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        fs::write(temp_dir.join("omnis-2026-11-24.log"), "OLD LINE\n").unwrap();
        fs::write(
            temp_dir.join("omnis-2026-11-25.log"),
            "INFO line 1\nERROR C:\\Users\\alice\\game crashed\n",
        )
        .unwrap();

        let ctx = collect_bug_report_context(&temp_dir);
        assert_eq!(ctx.log_file_name.as_deref(), Some("omnis-2026-11-25.log"));
        assert!(ctx.logs_excerpt.contains("INFO line 1"));
        assert!(!ctx.logs_excerpt.contains("alice"));
        assert!(ctx.logs_excerpt.contains("<USER>"));
        assert!(ctx.app_version.starts_with('v'));
        assert!(!ctx.os_info.is_empty());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_build_github_bug_report_url_matches_template_and_truncates_huge_logs() {
        let huge_logs = "ERROR something failed at step X\n".repeat(400);
        let payload = GitHubBugReportPayload {
            title: "Crash on launch".to_string(),
            description: "App crashes when clicking Play".to_string(),
            reproduction: "1. Open app\n2. Click Play".to_string(),
            expected: "Game starts".to_string(),
            actual: "App closes".to_string(),
            area: "Process Tracking".to_string(),
            os: "Windows 11 (x86_64)".to_string(),
            version: "v0.28.0".to_string(),
            logs: Some(huge_logs),
        };

        let (url, truncated) = build_github_bug_report_url(&payload).unwrap();
        assert!(truncated);
        assert!(url.as_str().len() <= MAX_ISSUE_URL_LEN);
        assert_eq!(url.host_str(), Some("github.com"));
        assert_eq!(url.path(), "/rinaldinie/omnis/issues/new");

        let pairs: std::collections::HashMap<String, String> = url
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        assert_eq!(pairs.get("template").map(String::as_str), Some("bug_report.yml"));
        assert_eq!(pairs.get("title").map(String::as_str), Some("Crash on launch"));
        assert_eq!(pairs.get("area").map(String::as_str), Some("Process Tracking"));
        assert!(pairs.get("logs").unwrap().contains("truncated"));
    }

    #[test]
    fn test_build_github_bug_report_url_falls_back_area_to_other() {
        let payload = GitHubBugReportPayload {
            title: "Weird bug".to_string(),
            description: "desc".to_string(),
            reproduction: "steps".to_string(),
            expected: "exp".to_string(),
            actual: "act".to_string(),
            area: "UnknownArea".to_string(),
            os: "Windows 11".to_string(),
            version: "".to_string(),
            logs: None,
        };

        let (url, truncated) = build_github_bug_report_url(&payload).unwrap();
        assert!(!truncated);
        let pairs: std::collections::HashMap<String, String> = url
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        assert_eq!(pairs.get("area").map(String::as_str), Some("Other"));
        assert!(pairs.get("version").unwrap().starts_with('v'));
        assert!(!pairs.contains_key("logs"));
    }
}
