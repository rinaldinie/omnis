//! Application logging initialization with console + daily rotating file output.

use crate::migration;
use chrono::Local;
use omnis_sdk::constants::storage;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

const LOG_FILE_PREFIX: &str = "omnis-";
const LOG_FILE_EXT: &str = ".log";
const MAX_LOG_FILES: usize = 14;

/// Daily rotating file writer implementing `std::io::Write` (wrapped in `Mutex` as a `MakeWriter`).
struct DailyLogFile {
    log_dir: PathBuf,
    max_files: usize,
    current_date: String,
    file: Option<File>,
}

impl DailyLogFile {
    fn new(log_dir: PathBuf, max_files: usize) -> Self {
        let mut writer = Self {
            log_dir,
            max_files,
            current_date: String::new(),
            file: None,
        };
        let today = Self::today_str();
        writer.rotate_if_needed(&today);
        writer
    }

    fn today_str() -> String {
        Local::now().format("%Y-%m-%d").to_string()
    }

    fn rotate_if_needed(&mut self, date: &str) {
        if self.current_date == date && self.file.is_some() {
            return;
        }

        if fs::create_dir_all(&self.log_dir).is_err() {
            self.file = None;
            return;
        }

        let path = self
            .log_dir
            .join(format!("{}{}{}", LOG_FILE_PREFIX, date, LOG_FILE_EXT));

        match OpenOptions::new().create(true).append(true).open(&path) {
            Ok(f) => {
                self.current_date = date.to_string();
                self.file = Some(f);
                cleanup_old_logs(&self.log_dir, self.max_files);
            }
            Err(_) => {
                self.file = None;
            }
        }
    }
}

impl Write for DailyLogFile {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let today = Self::today_str();
        self.rotate_if_needed(&today);
        if let Some(ref mut file) = self.file {
            // Best-effort write: never panic or break stdout logging if disk write fails
            let _ = file.write_all(buf);
        }
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        if let Some(ref mut file) = self.file {
            let _ = file.flush();
        }
        Ok(())
    }
}

/// Removes oldest `omnis-YYYY-MM-DD.log` files when total count exceeds `max_files`.
fn cleanup_old_logs(log_dir: &Path, max_files: usize) {
    if max_files == 0 {
        return;
    }

    let Ok(entries) = fs::read_dir(log_dir) else {
        return;
    };

    let mut log_files: Vec<(String, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() {
                return None;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with(LOG_FILE_PREFIX) && name.ends_with(LOG_FILE_EXT) {
                Some((name, path))
            } else {
                None
            }
        })
        .collect();

    if log_files.len() <= max_files {
        return;
    }

    // Lexicographical sort on `omnis-YYYY-MM-DD.log` orders oldest -> newest
    log_files.sort_by(|a, b| a.0.cmp(&b.0));
    let to_remove = log_files.len() - max_files;
    for (_, path) in log_files.into_iter().take(to_remove) {
        let _ = fs::remove_file(path);
    }
}

/// Resolves the canonical log directory (`<app_dir>/logs`).
pub fn resolve_logs_dir() -> PathBuf {
    let (app_dir, _) = migration::resolve_app_dir(None);
    app_dir.join(storage::LOGS_DIR)
}

/// Initializes tracing subscriber with stdout and daily rotating file layers, plus a panic hook.
/// Returns the resolved log directory path if file logging could be initialized.
pub fn init() -> Option<PathBuf> {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    let log_dir = resolve_logs_dir();
    let file_writer_opt = fs::create_dir_all(&log_dir)
        .ok()
        .map(|_| Mutex::new(DailyLogFile::new(log_dir.clone(), MAX_LOG_FILES)));

    let stdout_layer = tracing_subscriber::fmt::layer().with_writer(io::stdout);

    if let Some(file_writer) = file_writer_opt {
        let file_layer = tracing_subscriber::fmt::layer()
            .with_ansi(false)
            .with_writer(file_writer);

        tracing_subscriber::registry()
            .with(env_filter)
            .with(stdout_layer)
            .with(file_layer)
            .init();

        install_panic_hook();
        Some(log_dir)
    } else {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(stdout_layer)
            .init();

        install_panic_hook();
        None
    }
}

fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "non-string panic payload".to_string()
        };
        tracing::error!("PANIC at {}: {}", location, payload);
        previous(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_daily_log_file_writes_and_rotates() {
        let temp_dir = std::env::temp_dir().join(format!(
            "omnis_log_test_{}",
            uuid::Uuid::new_v4()
        ));

        let mut writer = DailyLogFile::new(temp_dir.clone(), 14);
        writer.write_all(b"INFO test log line\n").unwrap();
        writer.flush().unwrap();

        let expected_file = temp_dir.join(format!(
            "{}{}{}",
            LOG_FILE_PREFIX,
            DailyLogFile::today_str(),
            LOG_FILE_EXT
        ));
        let content = fs::read_to_string(&expected_file).expect("log file exists");
        assert!(content.contains("INFO test log line"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_cleanup_old_logs_keeps_latest_and_ignores_unrelated_files() {
        let temp_dir = std::env::temp_dir().join(format!(
            "omnis_log_cleanup_{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        for date in ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"] {
            fs::write(temp_dir.join(format!("omnis-{}.log", date)), date).unwrap();
        }
        fs::write(temp_dir.join("notes.txt"), "keep me").unwrap();

        cleanup_old_logs(&temp_dir, 2);

        assert!(!temp_dir.join("omnis-2026-11-01.log").exists());
        assert!(!temp_dir.join("omnis-2026-11-02.log").exists());
        assert!(temp_dir.join("omnis-2026-11-03.log").exists());
        assert!(temp_dir.join("omnis-2026-11-04.log").exists());
        assert!(temp_dir.join("notes.txt").exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
