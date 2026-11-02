//! Asset protocol scope management
//!
//! The webview may only read local files through the `asset:` protocol from the
//! application data directory (DB cache, artwork, trailers, achievement icons) and from
//! individual media files explicitly referenced by library entries (e.g. Steam
//! `librarycache` artwork or user-picked custom covers). The static scope in
//! `tauri.conf.json` is intentionally empty: everything is granted here at runtime.

use omnis_sdk::Game;
use std::collections::HashSet;
use std::path::Path;
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
}

impl MediaScope {
    pub fn new(scope: Scope) -> Self {
        Self {
            scope,
            allowed: Mutex::new(HashSet::new()),
        }
    }

    /// Allows recursive read access to an application-owned directory
    pub fn allow_directory(&self, dir: &Path) {
        if let Err(e) = self.scope.allow_directory(dir, true) {
            warn!("Failed to allow asset directory {}: {}", dir.display(), e);
        }
    }

    /// Allows a single local media file referenced by the library.
    /// Remote URLs, relative paths and non-media files are ignored.
    pub fn allow_media_file(&self, path_str: &str) {
        let path_str = path_str.trim();
        if path_str.is_empty() || path_str.contains("://") || path_str.starts_with("data:") {
            return;
        }
        let path = Path::new(path_str);
        if !path.is_absolute() || !is_media_file(path) {
            return;
        }
        // Reject symlinks/junctions pointing at non-media files
        if let Ok(canonical) = path.canonicalize() {
            if !is_media_file(&canonical) {
                return;
            }
        }

        let mut allowed = self.allowed.lock().unwrap_or_else(|e| e.into_inner());
        if !allowed.insert(path_str.to_string()) {
            return;
        }
        if let Err(e) = self.scope.allow_file(path) {
            warn!("Failed to allow asset file {}: {}", path.display(), e);
        }
    }

    /// Allows the cover, background and icon artwork of a game
    pub fn allow_game_media(&self, game: &Game) {
        for path in [
            &game.cover_image_path,
            &game.background_image_path,
            &game.icon_image_path,
        ]
        .into_iter()
        .flatten()
        {
            self.allow_media_file(path);
        }
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
