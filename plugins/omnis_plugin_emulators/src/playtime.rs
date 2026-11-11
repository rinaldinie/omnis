//! Play time recorded by the emulators themselves, so time played before Omnis was
//! installed (or outside Omnis) shows up in the library.
//!
//! - **yuzu family**: `<data root>/play_time/*.bin`, a flat array of 16-byte records
//!   `(u64 title id, u64 seconds)`, little-endian, one file per user profile.
//! - **Ryujinx**: `<data root>/games/<title id>/gui/metadata.json` with
//!   `timespan_played` (.NET `TimeSpan`) and `last_played_utc`.

use crate::emulators::{ConfigFormat, DetectedEmulator};
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::path::Path;

/// Play statistics of one title.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PlayStats {
    pub seconds: u64,
    pub last_played: Option<DateTime<Utc>>,
}

impl PlayStats {
    /// Combines stats of the same title from different emulators or profiles.
    pub fn merge(&mut self, other: &PlayStats) {
        self.seconds = self.seconds.saturating_add(other.seconds);
        self.last_played = match (self.last_played, other.last_played) {
            (Some(a), Some(b)) => Some(a.max(b)),
            (a, b) => a.or(b),
        };
    }
}

/// Play statistics by Title ID, summed across every detected emulator.
pub fn collect_play_stats(emulators: &[DetectedEmulator]) -> HashMap<u64, PlayStats> {
    let mut all: HashMap<u64, PlayStats> = HashMap::new();
    for emulator in emulators {
        for root in &emulator.data_roots {
            let stats = match emulator.spec.format {
                ConfigFormat::YuzuQtIni => read_yuzu_play_time(&root.join("play_time")),
                ConfigFormat::RyujinxJson => read_ryujinx_play_time(&root.join("games")),
            };
            for (id, s) in stats {
                all.entry(id).or_default().merge(&s);
            }
        }
    }
    all
}

/// Parses one yuzu-family `play_time` record file.
pub fn parse_yuzu_play_time(bytes: &[u8]) -> HashMap<u64, PlayStats> {
    let mut out: HashMap<u64, PlayStats> = HashMap::new();
    for record in bytes.as_chunks::<16>().0 {
        let id = u64::from_le_bytes(record[0..8].try_into().unwrap_or_default());
        let seconds = u64::from_le_bytes(record[8..16].try_into().unwrap_or_default());
        if id == 0 || seconds == 0 {
            continue;
        }
        out.entry(id).or_default().merge(&PlayStats {
            seconds,
            last_played: None,
        });
    }
    out
}

fn read_yuzu_play_time(dir: &Path) -> HashMap<u64, PlayStats> {
    let mut out: HashMap<u64, PlayStats> = HashMap::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("bin") {
            continue;
        }
        if let Ok(bytes) = std::fs::read(&path) {
            for (id, s) in parse_yuzu_play_time(&bytes) {
                out.entry(id).or_default().merge(&s);
            }
        }
    }
    out
}

/// Parses a .NET `TimeSpan` in constant format: `[d.]hh:mm:ss[.fffffff]`.
pub fn parse_dotnet_timespan(value: &str) -> Option<u64> {
    let value = value.trim();
    let (days, rest) = match value.split_once(':') {
        Some((head, _)) if head.contains('.') => {
            let (d, h) = head.split_once('.')?;
            (
                d.parse::<u64>().ok()?,
                format!("{}{}", h, &value[head.len()..]),
            )
        }
        _ => (0, value.to_string()),
    };
    let mut parts = rest.split(':');
    let hours: u64 = parts.next()?.parse().ok()?;
    let minutes: u64 = parts.next()?.parse().ok()?;
    let seconds_part = parts.next()?;
    let seconds: u64 = seconds_part.split('.').next()?.parse().ok()?;
    Some(days * 86_400 + hours * 3_600 + minutes * 60 + seconds)
}

/// Parses a Ryujinx `gui/metadata.json`.
pub fn parse_ryujinx_metadata(content: &str) -> Option<PlayStats> {
    let json: serde_json::Value = serde_json::from_str(content).ok()?;
    let seconds = json
        .get("timespan_played")
        .and_then(|v| v.as_str())
        .and_then(parse_dotnet_timespan)
        .unwrap_or(0);
    let last_played = json
        .get("last_played_utc")
        .and_then(|v| v.as_str())
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.with_timezone(&Utc));
    Some(PlayStats {
        seconds,
        last_played,
    })
}

fn read_ryujinx_play_time(games_dir: &Path) -> HashMap<u64, PlayStats> {
    let mut out: HashMap<u64, PlayStats> = HashMap::new();
    let Ok(entries) = std::fs::read_dir(games_dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(id) = name.to_str().and_then(|n| u64::from_str_radix(n, 16).ok()) else {
            continue;
        };
        let meta = entry.path().join("gui").join("metadata.json");
        if let Some(stats) = std::fs::read_to_string(meta)
            .ok()
            .and_then(|c| parse_ryujinx_metadata(&c))
        {
            if stats.seconds > 0 || stats.last_played.is_some() {
                out.entry(id).or_default().merge(&stats);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_yuzu_records() {
        let mut bytes = Vec::new();
        for (id, secs) in [
            (0x0100000000010000u64, 2738u64),
            (0x01001F5010DFA000, 82_440),
            (0x0100000000010000, 62),
            (0, 99),
        ] {
            bytes.extend_from_slice(&id.to_le_bytes());
            bytes.extend_from_slice(&secs.to_le_bytes());
        }
        bytes.extend_from_slice(&[1, 2, 3]); // truncated trailing record is ignored
        let stats = parse_yuzu_play_time(&bytes);
        assert_eq!(stats.len(), 2);
        assert_eq!(stats[&0x0100000000010000].seconds, 2800);
        assert_eq!(stats[&0x01001F5010DFA000].seconds, 82_440);
    }

    #[test]
    fn parses_dotnet_timespans() {
        assert_eq!(parse_dotnet_timespan("00:10:44.6640166"), Some(644));
        assert_eq!(parse_dotnet_timespan("22:54:00"), Some(82_440));
        assert_eq!(parse_dotnet_timespan("1.02:00:30.5"), Some(93_630));
        assert_eq!(parse_dotnet_timespan("garbage"), None);
    }

    #[test]
    fn parses_ryujinx_metadata() {
        let json = r#"{
          "title": "SUPER MARIO ODYSSEY",
          "favorite": false,
          "timespan_played": "00:10:44.6640166",
          "last_played_utc": "2025-11-07T22:47:24.9391038Z"
        }"#;
        let stats = parse_ryujinx_metadata(json).unwrap();
        assert_eq!(stats.seconds, 644);
        assert_eq!(
            stats.last_played.unwrap().to_rfc3339(),
            "2025-11-07T22:47:24.939103800+00:00"
        );
    }

    #[test]
    fn merge_sums_time_and_keeps_latest_date() {
        let early = DateTime::parse_from_rfc3339("2025-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let late = DateTime::parse_from_rfc3339("2025-06-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let mut a = PlayStats {
            seconds: 100,
            last_played: Some(early),
        };
        a.merge(&PlayStats {
            seconds: 50,
            last_played: Some(late),
        });
        a.merge(&PlayStats {
            seconds: 0,
            last_played: None,
        });
        assert_eq!(a.seconds, 150);
        assert_eq!(a.last_played, Some(late));
    }
}
