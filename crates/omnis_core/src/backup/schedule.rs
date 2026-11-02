use chrono::{DateTime, Duration, Months, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Frequency for automated library backups
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum BackupFrequency {
    #[default]
    Disabled,
    Daily,
    Weekly,
    Monthly,
}

impl BackupFrequency {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::Daily => "daily",
            Self::Weekly => "weekly",
            Self::Monthly => "monthly",
        }
    }

    pub fn from_str_name(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "daily" => Self::Daily,
            "weekly" => Self::Weekly,
            "monthly" => Self::Monthly,
            _ => Self::Disabled,
        }
    }
}

impl std::fmt::Display for BackupFrequency {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for BackupFrequency {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self::from_str_name(s))
    }
}

/// Configuration settings for automated backup schedule
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BackupScheduleConfig {
    pub frequency: BackupFrequency,
    pub destination_dir: Option<PathBuf>,
    pub max_rotations: usize,
    pub last_backup_utc: Option<String>,
    pub include_artwork: bool,
    pub updated_at: String,
}

impl Default for BackupScheduleConfig {
    fn default() -> Self {
        Self {
            frequency: BackupFrequency::Disabled,
            destination_dir: None,
            max_rotations: 10,
            last_backup_utc: None,
            include_artwork: false,
            updated_at: Utc::now().to_rfc3339(),
        }
    }
}

impl BackupScheduleConfig {
    /// Returns max rotations clamped between 1 and 10
    pub fn clamped_max_rotations(&self) -> usize {
        self.max_rotations.clamp(1, 10)
    }
}

/// Helper to parse ISO 8601 or SQLite datetime string into DateTime<Utc>
pub fn parse_timestamp(s: &str) -> Option<DateTime<Utc>> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return None;
    }
    DateTime::parse_from_rfc3339(trimmed)
        .map(|dt| dt.with_timezone(&Utc))
        .or_else(|_| {
            chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S")
                .map(|naive| naive.and_utc())
        })
        .ok()
}

/// Computes the next scheduled backup time formatted as ISO 8601 UTC.
/// Returns None if frequency is Disabled.
/// If last_backup is None or invalid, returns the current time formatted as ISO 8601 UTC.
pub fn calculate_next_backup_utc(
    last_backup: Option<&str>,
    frequency: &BackupFrequency,
    now: DateTime<Utc>,
) -> Option<String> {
    match frequency {
        BackupFrequency::Disabled => None,
        BackupFrequency::Daily => {
            if let Some(last_dt) = last_backup.and_then(parse_timestamp) {
                Some((last_dt + Duration::days(1)).to_rfc3339())
            } else {
                Some(now.to_rfc3339())
            }
        }
        BackupFrequency::Weekly => {
            if let Some(last_dt) = last_backup.and_then(parse_timestamp) {
                Some((last_dt + Duration::weeks(1)).to_rfc3339())
            } else {
                Some(now.to_rfc3339())
            }
        }
        BackupFrequency::Monthly => {
            if let Some(last_dt) = last_backup.and_then(parse_timestamp) {
                let next = last_dt
                    .checked_add_months(Months::new(1))
                    .unwrap_or_else(|| last_dt + Duration::days(30));
                Some(next.to_rfc3339())
            } else {
                Some(now.to_rfc3339())
            }
        }
    }
}

/// Determines whether an automated backup should be triggered now.
/// Returns false if frequency is Disabled or destination_dir is None/empty.
/// Returns true if frequency is enabled, destination_dir is set, and either no previous backup exists or now >= next_backup.
pub fn is_backup_due(config: &BackupScheduleConfig, now: DateTime<Utc>) -> bool {
    if config.frequency == BackupFrequency::Disabled {
        return false;
    }

    if config
        .destination_dir
        .as_ref()
        .map_or(true, |p| p.as_os_str().is_empty())
    {
        return false;
    }

    match &config.last_backup_utc {
        None => true,
        Some(last_str) => {
            let trimmed = last_str.trim();
            if trimmed.is_empty() {
                return true;
            }
            if let Some(next_str) = calculate_next_backup_utc(Some(trimmed), &config.frequency, now)
            {
                if let Some(next_dt) = parse_timestamp(&next_str) {
                    now >= next_dt
                } else {
                    true
                }
            } else {
                false
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_frequency_serde() {
        assert_eq!(
            serde_json::to_string(&BackupFrequency::Disabled).unwrap(),
            "\"disabled\""
        );
        assert_eq!(
            serde_json::to_string(&BackupFrequency::Daily).unwrap(),
            "\"daily\""
        );
        assert_eq!(
            serde_json::to_string(&BackupFrequency::Weekly).unwrap(),
            "\"weekly\""
        );
        assert_eq!(
            serde_json::to_string(&BackupFrequency::Monthly).unwrap(),
            "\"monthly\""
        );

        assert_eq!(
            serde_json::from_str::<BackupFrequency>("\"disabled\"").unwrap(),
            BackupFrequency::Disabled
        );
        assert_eq!(
            serde_json::from_str::<BackupFrequency>("\"daily\"").unwrap(),
            BackupFrequency::Daily
        );
        assert_eq!(
            serde_json::from_str::<BackupFrequency>("\"weekly\"").unwrap(),
            BackupFrequency::Weekly
        );
        assert_eq!(
            serde_json::from_str::<BackupFrequency>("\"monthly\"").unwrap(),
            BackupFrequency::Monthly
        );
    }

    #[test]
    fn test_frequency_string_conversions() {
        assert_eq!(BackupFrequency::Disabled.as_str(), "disabled");
        assert_eq!(BackupFrequency::Daily.as_str(), "daily");
        assert_eq!(BackupFrequency::Weekly.as_str(), "weekly");
        assert_eq!(BackupFrequency::Monthly.as_str(), "monthly");

        assert_eq!(
            BackupFrequency::from_str_name("Daily"),
            BackupFrequency::Daily
        );
        assert_eq!(
            BackupFrequency::from_str_name("weekly"),
            BackupFrequency::Weekly
        );
        assert_eq!(
            BackupFrequency::from_str_name("Monthly"),
            BackupFrequency::Monthly
        );
        assert_eq!(
            BackupFrequency::from_str_name("unknown"),
            BackupFrequency::Disabled
        );
    }

    #[test]
    fn test_default_config() {
        let config = BackupScheduleConfig::default();
        assert_eq!(config.frequency, BackupFrequency::Disabled);
        assert_eq!(config.destination_dir, None);
        assert_eq!(config.max_rotations, 10);
        assert_eq!(config.clamped_max_rotations(), 10);
        assert_eq!(config.last_backup_utc, None);
        assert!(!config.include_artwork);
    }

    #[test]
    fn test_clamped_max_rotations() {
        let mut config = BackupScheduleConfig::default();
        config.max_rotations = 0;
        assert_eq!(config.clamped_max_rotations(), 1);

        config.max_rotations = 5;
        assert_eq!(config.clamped_max_rotations(), 5);

        config.max_rotations = 25;
        assert_eq!(config.clamped_max_rotations(), 10);
    }

    #[test]
    fn test_calculate_next_backup_utc_disabled() {
        let now = Utc.with_ymd_and_hms(2026, 11, 1, 12, 0, 0).unwrap();
        assert_eq!(
            calculate_next_backup_utc(
                Some("2026-11-01T10:00:00Z"),
                &BackupFrequency::Disabled,
                now
            ),
            None
        );
        assert_eq!(
            calculate_next_backup_utc(None, &BackupFrequency::Disabled, now),
            None
        );
    }

    #[test]
    fn test_calculate_next_backup_utc_no_last_backup() {
        let now = Utc.with_ymd_and_hms(2026, 11, 1, 12, 0, 0).unwrap();
        let expected = Some(now.to_rfc3339());
        assert_eq!(
            calculate_next_backup_utc(None, &BackupFrequency::Daily, now),
            expected
        );
        assert_eq!(
            calculate_next_backup_utc(Some(""), &BackupFrequency::Daily, now),
            expected
        );
        assert_eq!(
            calculate_next_backup_utc(Some("invalid-timestamp"), &BackupFrequency::Daily, now),
            expected
        );
    }

    #[test]
    fn test_calculate_next_backup_utc_frequencies() {
        let now = Utc.with_ymd_and_hms(2026, 11, 1, 12, 0, 0).unwrap();
        let last = "2026-10-01T10:00:00+00:00";

        // Daily -> 1 day after last
        let next_daily =
            calculate_next_backup_utc(Some(last), &BackupFrequency::Daily, now).unwrap();
        assert_eq!(next_daily, "2026-10-02T10:00:00+00:00");

        // Weekly -> 7 days after last
        let next_weekly =
            calculate_next_backup_utc(Some(last), &BackupFrequency::Weekly, now).unwrap();
        assert_eq!(next_weekly, "2026-10-08T10:00:00+00:00");

        // Monthly -> 1 calendar month after last
        let next_monthly =
            calculate_next_backup_utc(Some(last), &BackupFrequency::Monthly, now).unwrap();
        assert_eq!(next_monthly, "2026-11-01T10:00:00+00:00");
    }

    #[test]
    fn test_is_backup_due() {
        let t0 = Utc.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap();
        let dest = Some(PathBuf::from("/backups"));

        // 1. Disabled is never due
        let disabled_cfg = BackupScheduleConfig {
            frequency: BackupFrequency::Disabled,
            destination_dir: dest.clone(),
            last_backup_utc: None,
            ..Default::default()
        };
        assert!(!is_backup_due(&disabled_cfg, t0));

        // 2. Missing destination directory is never due
        let no_dest_cfg = BackupScheduleConfig {
            frequency: BackupFrequency::Daily,
            destination_dir: None,
            last_backup_utc: None,
            ..Default::default()
        };
        assert!(!is_backup_due(&no_dest_cfg, t0));

        // 3. Daily with no previous backup is due immediately
        let daily_no_last = BackupScheduleConfig {
            frequency: BackupFrequency::Daily,
            destination_dir: dest.clone(),
            last_backup_utc: None,
            ..Default::default()
        };
        assert!(is_backup_due(&daily_no_last, t0));

        // 4. Daily with last backup 12 hours ago is NOT due
        let daily_12h_ago = BackupScheduleConfig {
            frequency: BackupFrequency::Daily,
            destination_dir: dest.clone(),
            last_backup_utc: Some(t0.to_rfc3339()),
            ..Default::default()
        };
        let t_plus_12h = t0 + Duration::hours(12);
        assert!(!is_backup_due(&daily_12h_ago, t_plus_12h));

        // 5. Daily with last backup exactly 24 hours ago IS due
        let t_plus_24h = t0 + Duration::hours(24);
        assert!(is_backup_due(&daily_12h_ago, t_plus_24h));

        // 6. Weekly with last backup 6 days ago is NOT due, 7 days ago IS due
        let weekly_cfg = BackupScheduleConfig {
            frequency: BackupFrequency::Weekly,
            destination_dir: dest.clone(),
            last_backup_utc: Some(t0.to_rfc3339()),
            ..Default::default()
        };
        assert!(!is_backup_due(&weekly_cfg, t0 + Duration::days(6)));
        assert!(is_backup_due(&weekly_cfg, t0 + Duration::days(7)));
        assert!(is_backup_due(&weekly_cfg, t0 + Duration::days(8)));

        // 7. Monthly with last backup
        let monthly_cfg = BackupScheduleConfig {
            frequency: BackupFrequency::Monthly,
            destination_dir: dest.clone(),
            last_backup_utc: Some(t0.to_rfc3339()),
            ..Default::default()
        };
        assert!(!is_backup_due(&monthly_cfg, t0 + Duration::days(20)));
        let t_feb1 = Utc.with_ymd_and_hms(2026, 2, 1, 12, 0, 0).unwrap();
        assert!(is_backup_due(&monthly_cfg, t_feb1));

        // 8. Malformed last backup string is treated as due
        let malformed_cfg = BackupScheduleConfig {
            frequency: BackupFrequency::Daily,
            destination_dir: dest,
            last_backup_utc: Some("corrupted-date".to_string()),
            ..Default::default()
        };
        assert!(is_backup_due(&malformed_cfg, t0));
    }
}
