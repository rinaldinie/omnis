use std::fs;
use std::path::Path;

/// Sanitizes a hostname so it can safely be included in a cross-platform filename.
pub fn sanitize_hostname(hostname: &str) -> String {
    hostname
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

/// Rotates backup files in `destination_dir` for the specified host, keeping only the newest `keep_last` backups.
/// Returns the number of pruned older backup files.
pub fn rotate_backups(destination_dir: &Path, hostname: &str, keep_last: usize) -> std::io::Result<usize> {
    if keep_last == 0 || !destination_dir.is_dir() {
        return Ok(0);
    }

    let sanitized = sanitize_hostname(hostname);
    let prefix = format!("omnis_backup_{}_", sanitized);

    let mut backups: Vec<(std::time::SystemTime, std::path::PathBuf)> = Vec::new();

    for entry in fs::read_dir(destination_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
            let is_match = (file_name.starts_with(&prefix) || file_name.starts_with("omnis_backup_"))
                && file_name.ends_with(".zip");

            if is_match {
                let mod_time = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                backups.push((mod_time, path));
            }
        }
    }

    // Sort descending: newest files first
    backups.sort_by(|a, b| b.0.cmp(&a.0));

    let mut pruned_count = 0;
    if backups.len() > keep_last {
        for (_, excess_path) in &backups[keep_last..] {
            if fs::remove_file(excess_path).is_ok() {
                pruned_count += 1;
            }
        }
    }

    Ok(pruned_count)
}
