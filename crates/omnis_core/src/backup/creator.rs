use crate::backup::error::BackupError;
use crate::backup::manifest::BackupManifest;
use crate::backup::rotation::{rotate_backups, sanitize_hostname};
use crate::db::Database;
use omnis_sdk::constants::storage;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Seek, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

/// Options configuring backup creation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupOptions {
    /// Target directory where `.omnisbackup` bundle should be saved
    pub destination_dir: PathBuf,
    /// Whether cover and background cached images should be included
    pub include_artwork: bool,
    /// Keep only the newest N backups in the destination folder (None = keep all)
    pub keep_last: Option<usize>,
}

impl Default for BackupOptions {
    fn default() -> Self {
        Self {
            destination_dir: PathBuf::from("./backups"),
            include_artwork: false,
            keep_last: Some(5),
        }
    }
}

/// Result returned upon successful backup creation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BackupResult {
    /// Final absolute path to the `.zip` file
    pub backup_path: PathBuf,
    /// File size of the generated archive in bytes
    pub file_size_bytes: u64,
    /// Total games count stored in the backup
    pub total_games: usize,
    /// Whether cache artwork was included
    pub artwork_included: bool,
    /// Creation timestamp (ISO 8601 UTC)
    pub timestamp: String,
}

/// Executes hot SQLite database snapshot, sanitizes credentials, and bundles into `.zip`
pub fn create_backup(
    db: &Database,
    app_dir: &Path,
    options: &BackupOptions,
) -> Result<BackupResult, BackupError> {
    if !options.destination_dir.exists() {
        fs::create_dir_all(&options.destination_dir)?;
    }

    let now = chrono::Utc::now();
    let timestamp_str = now.format("%Y%m%d_%H%M%S").to_string();

    let hostname = sysinfo::System::host_name()
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .or_else(|| std::env::var("HOSTNAME").ok())
        .unwrap_or_else(|| "pc".to_string());
    let clean_host = sanitize_hostname(&hostname);

    let bundle_filename = format!("omnis_backup_{}_{}.zip", clean_host, timestamp_str);
    let final_bundle_path = options.destination_dir.join(&bundle_filename);

    // Create temporary work directory for snapshot
    let temp_dir = std::env::temp_dir().join(format!("omnis_backup_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temp_dir)?;

    let temp_db_path = temp_dir.join("database_snapshot.db");

    // 1. Snapshot database using hot VACUUM INTO
    let result = (|| -> Result<BackupResult, BackupError> {
        db.snapshot_to(&temp_db_path)?;

        // 2. CRITICAL SECURITY SANITIZATION: Delete all encrypted secrets/tokens from snapshot
        let snap_conn = rusqlite::Connection::open(&temp_db_path)?;
        let _ = snap_conn.execute("DELETE FROM secrets;", []);
        let _ = snap_conn.execute("VACUUM;", []);

        let total_games: usize = snap_conn
            .query_row("SELECT COUNT(*) FROM games;", [], |row| row.get(0))
            .unwrap_or(0);
        let schema_version: u32 = snap_conn
            .query_row("PRAGMA user_version;", [], |row| row.get(0))
            .unwrap_or(1);
        drop(snap_conn);

        // 3. Prepare ZIP options
        let zip_opts = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // Write directly to temporary bundle first for atomic commit
        let temp_bundle_path = temp_dir.join("bundle.zip");
        let zip_file = File::create(&temp_bundle_path)?;
        let mut zip = ZipWriter::new(zip_file);

        // 4. Write manifest.json
        let manifest = BackupManifest {
            format_version: 1,
            created_at_utc: now.to_rfc3339(),
            omnis_version: env!("CARGO_PKG_VERSION").to_string(),
            schema_version,
            hostname: hostname.clone(),
            include_artwork: options.include_artwork,
            total_games,
            backup_size_bytes: 0,
        };
        let manifest_bytes = serde_json::to_vec_pretty(&manifest)?;
        zip.start_file("manifest.json", zip_opts)?;
        zip.write_all(&manifest_bytes)?;

        // 5. Write database.db
        zip.start_file("database.db", zip_opts)?;
        let mut db_file = File::open(&temp_db_path)?;
        std::io::copy(&mut db_file, &mut zip)?;
        drop(db_file);

        // 6. Write settings.json
        let settings_path = app_dir.join("settings.json");
        let settings_bytes = if settings_path.is_file() {
            fs::read(&settings_path)?
        } else {
            b"{}".to_vec()
        };
        zip.start_file("settings.json", zip_opts)?;
        zip.write_all(&settings_bytes)?;

        // 7. Write custom themes
        let themes_dir = app_dir.join(storage::THEMES_DIR);
        if themes_dir.is_dir() {
            add_dir_contents_to_zip(&mut zip, &themes_dir, &themes_dir, "custom_themes", zip_opts)?;
        }

        // 8. Write artwork if requested
        if options.include_artwork {
            let covers_dir = app_dir.join(storage::CACHE_DIR).join(storage::COVERS_DIR);
            if covers_dir.is_dir() {
                add_dir_contents_to_zip(&mut zip, &covers_dir, &covers_dir, "cache/covers", zip_opts)?;
            }

            let backgrounds_dir = app_dir.join(storage::CACHE_DIR).join(storage::BACKGROUNDS_DIR);
            if backgrounds_dir.is_dir() {
                add_dir_contents_to_zip(&mut zip, &backgrounds_dir, &backgrounds_dir, "cache/backgrounds", zip_opts)?;
            }
        }

        zip.finish()?;

        // Move temporary bundle to target destination
        if final_bundle_path.exists() {
            let _ = fs::remove_file(&final_bundle_path);
        }
        fs::copy(&temp_bundle_path, &final_bundle_path)?;

        let file_size_bytes = fs::metadata(&final_bundle_path)?.len();

        // 9. Prune older backups if retention limit configured
        if let Some(keep) = options.keep_last {
            if keep > 0 {
                let _ = rotate_backups(&options.destination_dir, &clean_host, keep.min(10));
            }
        }

        Ok(BackupResult {
            backup_path: final_bundle_path,
            file_size_bytes,
            total_games,
            artwork_included: options.include_artwork,
            timestamp: now.to_rfc3339(),
        })
    })();

    // Always clean up temp folder
    let _ = fs::remove_dir_all(&temp_dir);

    result
}

fn add_dir_contents_to_zip<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    base_dir: &Path,
    current_dir: &Path,
    zip_prefix: &str,
    opts: SimpleFileOptions,
) -> Result<(), BackupError> {
    if !current_dir.is_dir() {
        return Ok(());
    }

    for entry in fs::read_dir(current_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() {
            if let Ok(rel) = path.strip_prefix(base_dir) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                let zip_name = if zip_prefix.is_empty() {
                    rel_str
                } else {
                    format!("{}/{}", zip_prefix.trim_matches('/'), rel_str)
                };

                zip.start_file(zip_name, opts)?;
                let mut f = File::open(&path)?;
                std::io::copy(&mut f, zip)?;
            }
        } else if path.is_dir() {
            add_dir_contents_to_zip(zip, base_dir, &path, zip_prefix, opts)?;
        }
    }

    Ok(())
}
