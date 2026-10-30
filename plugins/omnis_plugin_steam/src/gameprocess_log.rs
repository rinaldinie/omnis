use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use chrono::{DateTime, Local, NaiveDateTime, TimeZone, Utc};

/// Represents an execution session parsed from Steam's `gameprocess_log.txt`
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SteamProcessSession {
    pub appid: u64,
    pub started_at: String, // RFC 3339 string (UTC)
    pub ended_at: String,   // RFC 3339 string (UTC)
    pub duration_seconds: u64,
}

/// Helper to convert a `YYYY-MM-DD HH:MM:SS` local timestamp from Steam log to an RFC 3339 UTC string.
fn local_timestamp_to_utc_rfc3339(dt_str: &str) -> Option<String> {
    let naive = NaiveDateTime::parse_from_str(dt_str.trim(), "%Y-%m-%d %H:%M:%S").ok()?;
    let utc_dt: DateTime<Utc> = match Local.from_local_datetime(&naive) {
        chrono::LocalResult::Single(dt) => dt.with_timezone(&Utc),
        chrono::LocalResult::Ambiguous(dt1, _) => dt1.with_timezone(&Utc),
        chrono::LocalResult::None => naive.and_utc(),
    };
    Some(utc_dt.to_rfc3339())
}

#[derive(Default)]
struct ActiveProcessTracking {
    start_dt_str: String,
    tracked_pids: HashSet<u32>,
    last_exit_dt_str: Option<String>,
}

/// Parse Steam's `logs/gameprocess_log.txt` to extract historical and unrecorded game sessions.
/// Ignores spurious process starts shorter than `min_duration_seconds` (default: 15s).
pub fn parse_gameprocess_log(log_path: &Path) -> Vec<SteamProcessSession> {
    parse_gameprocess_log_with_min_duration(log_path, 15)
}

/// Parse Steam's `logs/gameprocess_log.txt` with configurable minimum duration threshold.
pub fn parse_gameprocess_log_with_min_duration(log_path: &Path, min_duration_seconds: u64) -> Vec<SteamProcessSession> {
    let file = match File::open(log_path) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };

    let reader = BufReader::new(file);
    let mut sessions = Vec::new();
    let mut active: HashMap<u64, ActiveProcessTracking> = HashMap::new();

    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(_) => continue,
        };

        let trimmed = line.trim();
        if trimmed.is_empty() || !trimmed.starts_with('[') {
            continue;
        }

        // Extract timestamp: "[YYYY-MM-DD HH:MM:SS]"
        let ts_end = match trimmed.find(']') {
            Some(idx) => idx,
            None => continue,
        };
        let timestamp_str = &trimmed[1..ts_end];
        let rest = trimmed[ts_end + 1..].trim();

        // 1. Check for: "AppID <appid> adding PID <pid> as a tracked process"
        if let Some(pos) = rest.find("AppID ") {
            let after_appid = &rest[pos + 6..];
            if let Some(space_idx) = after_appid.find(' ') {
                if let Ok(appid) = after_appid[..space_idx].parse::<u64>() {
                    let event_part = &after_appid[space_idx..];
                    if let Some(pid_pos) = event_part.find("adding PID ") {
                        let after_pid = &event_part[pid_pos + 11..];
                        let pid_str = after_pid.split_whitespace().next().unwrap_or("");
                        let pid = pid_str.parse::<u32>().unwrap_or(0);

                        let entry = active.entry(appid).or_insert_with(|| ActiveProcessTracking {
                            start_dt_str: timestamp_str.to_string(),
                            tracked_pids: HashSet::new(),
                            last_exit_dt_str: None,
                        });
                        entry.tracked_pids.insert(pid);
                    } else if let Some(exit_pos) = event_part.find("no longer tracking PID ") {
                        let after_pid = &event_part[exit_pos + 23..];
                        let pid_str = after_pid.split([',', ' ']).next().unwrap_or("");
                        let pid = pid_str.parse::<u32>().unwrap_or(0);

                        if let Some(entry) = active.get_mut(&appid) {
                            entry.tracked_pids.remove(&pid);
                            entry.last_exit_dt_str = Some(timestamp_str.to_string());
                        }
                    }
                }
            }
        }

        // 2. Check for: "Remove <appid> from running list"
        if let Some(pos) = rest.find("Remove ") {
            let after_remove = &rest[pos + 7..];
            if let Some(space_idx) = after_remove.find(" from running list") {
                if let Ok(appid) = after_remove[..space_idx].trim().parse::<u64>() {
                    if let Some(tracking) = active.remove(&appid) {
                        let end_ts = tracking.last_exit_dt_str.as_deref().unwrap_or(timestamp_str);
                        if let (Some(start_utc), Some(end_utc)) = (
                            local_timestamp_to_utc_rfc3339(&tracking.start_dt_str),
                            local_timestamp_to_utc_rfc3339(end_ts),
                        ) {
                            if let (Ok(start_dt), Ok(end_dt)) = (
                                DateTime::parse_from_rfc3339(&start_utc),
                                DateTime::parse_from_rfc3339(&end_utc),
                            ) {
                                let dur = (end_dt - start_dt).num_seconds();
                                if dur >= min_duration_seconds as i64 {
                                    sessions.push(SteamProcessSession {
                                        appid,
                                        started_at: start_utc,
                                        ended_at: end_utc,
                                        duration_seconds: dur as u64,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    sessions
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_parse_steam_gameprocess_log() {
        let temp_dir = std::env::temp_dir().join(format!("steam_log_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let log_file = temp_dir.join("gameprocess_log.txt");

        let sample_log = r#"[2026-10-27 19:58:27] AppID 2751000 adding PID 20796 as a tracked process ""D:\SteamLibrary\steamapps\common\Prince of Persia The Lost Crown\TheLostCrown.exe""
[2026-10-27 22:33:52] AppID 2751000 no longer tracking PID 20796, exit code 0
[2026-10-27 22:33:52] Remove 2751000 from running list
[2026-10-28 21:58:39] AppID 2780710 adding PID 18192 as a tracked process ""D:\SteamLibrary\steamapps\common\Asgard's Fall\AsgardsFall.exe""
[2026-10-28 22:20:20] AppID 2780710 no longer tracking PID 18192, exit code 0
[2026-10-28 22:20:20] Remove 2780710 from running list
"#;
        let mut f = File::create(&log_file).unwrap();
        f.write_all(sample_log.as_bytes()).unwrap();
        drop(f);

        let sessions = parse_gameprocess_log(&log_file);
        assert_eq!(sessions.len(), 2);

        assert_eq!(sessions[0].appid, 2751000);
        assert_eq!(sessions[0].duration_seconds, 9325);

        assert_eq!(sessions[1].appid, 2780710);
        assert_eq!(sessions[1].duration_seconds, 1301);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
