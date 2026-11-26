//! Asset protocol scope management
//!
//! The webview may only read local files through the `asset:` protocol from the
//! application data directory (DB cache, artwork, trailers, achievement icons) and from
//! individual media files explicitly referenced by library entries (e.g. Steam
//! `librarycache` artwork or user-picked custom covers). The static scope in
//! `tauri.conf.json` is intentionally empty: everything is granted here at runtime.

use omnis_sdk::Game;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::scope::fs::Scope;
use tracing::warn;

/// File extensions the webview is allowed to load from outside the app data directory
const MEDIA_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "gif", "bmp", "ico", "avif", "mp4", "webm",
];

/// Returns true if the path has an image/video extension servable to the webview
pub fn is_media_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| MEDIA_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Grants the webview read access to specific local media files on demand
pub struct MediaScope {
    scope: Scope,
    allowed: Mutex<HashSet<String>>,
    allowed_dirs: Mutex<Vec<PathBuf>>,
}

impl MediaScope {
    pub fn new(scope: Scope) -> Self {
        Self {
            scope,
            allowed: Mutex::new(HashSet::new()),
            allowed_dirs: Mutex::new(Vec::new()),
        }
    }

    /// Allows recursive read access to an application-owned directory
    pub fn allow_directory(&self, dir: &Path) {
        if let Err(e) = self.scope.allow_directory(dir, true) {
            warn!("Failed to allow asset directory {}: {}", dir.display(), e);
        } else {
            let canonical = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
            let needs_raw = canonical != dir;
            let mut dirs = self.allowed_dirs.lock().unwrap_or_else(|e| e.into_inner());
            if !dirs.contains(&canonical) {
                dirs.push(canonical);
            }
            if needs_raw {
                let raw = dir.to_path_buf();
                if !dirs.contains(&raw) {
                    dirs.push(raw);
                }
            }
        }
    }

    /// Allows a batch of local media file paths using a single lock acquisition
    pub fn allow_media_paths<'a>(&self, paths: impl IntoIterator<Item = &'a str>) {
        let allowed_dirs = self.allowed_dirs.lock().unwrap_or_else(|e| e.into_inner());
        let mut allowed = self.allowed.lock().unwrap_or_else(|e| e.into_inner());

        for raw in paths {
            let path_str = raw.trim();
            if path_str.is_empty() || path_str.contains("://") || path_str.starts_with("data:") {
                continue;
            }
            if allowed.contains(path_str) {
                continue;
            }

            let path = Path::new(path_str);
            if !path.is_absolute() || !is_media_file(path) {
                continue;
            }
            // Fast path: files already inside an allowed recursive directory need no canonicalize/allow_file
            if allowed_dirs.iter().any(|dir| path.starts_with(dir)) {
                allowed.insert(path_str.to_string());
                continue;
            }

            if let Ok(canonical) = path.canonicalize() {
                if !is_media_file(&canonical) {
                    continue;
                }
            }

            allowed.insert(path_str.to_string());
            if let Err(e) = self.scope.allow_file(path) {
                warn!("Failed to allow asset file {}: {}", path.display(), e);
            }
        }
    }

    /// Allows a single local media file referenced by the library.
    /// Remote URLs, relative paths and non-media files are ignored.
    pub fn allow_media_file(&self, path_str: &str) {
        self.allow_media_paths(std::iter::once(path_str));
    }

    /// Allows the cover, background and icon artwork of a game
    pub fn allow_game_media(&self, game: &Game) {
        self.allow_media_paths(
            [
                game.cover_image_path.as_deref(),
                game.background_image_path.as_deref(),
                game.icon_image_path.as_deref(),
            ]
            .into_iter()
            .flatten(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_media_file() {
        assert!(is_media_file(Path::new("cover.PNG")));
        assert!(is_media_file(Path::new("/a/b/trailer.webm")));
        assert!(!is_media_file(Path::new("/home/user/.ssh/id_rsa")));
        assert!(!is_media_file(Path::new("library.db")));
        assert!(!is_media_file(Path::new("master.key")));
        assert!(!is_media_file(Path::new("noext")));
    }
}
