use base64::prelude::*;
use omnis_core::{Database, MarketplaceManager, MetadataDownloader, PluginHost};
use omnis_sdk::Game;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameDto {
    pub id: String,
    pub external_id: String,
    pub title: String,
    pub library: String,
    pub is_installed: bool,
    pub playtime_seconds: u64,
    pub playtime_formatted: String,
    pub critic_score: Option<u32>,
    pub release_date: Option<String>,
    pub description: Option<String>,
    pub cover_image: Option<String>,
    pub background_image: Option<String>,
    pub icon_image: Option<String>,
    pub genres: Vec<String>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub series: Option<String>,
    pub completion_status: Option<String>,
    pub user_notes: Option<String>,
    #[serde(default)]
    pub features: Vec<String>,
    pub custom_links: Vec<omnis_sdk::CustomLink>,
    #[serde(default)]
    pub extra_metadata: Option<String>,
    #[serde(default)]
    pub last_activity: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeConfig {
    pub id: String,
    #[serde(rename = "apiVersion", default)]
    pub api_version: Option<u32>,
    pub name: String,
    pub description: String,
    pub author: String,
    pub is_custom: bool,
    #[serde(default)]
    pub tokens: HashMap<String, String>,
    #[serde(default)]
    pub styles: Vec<String>,
    #[serde(default)]
    pub layouts: HashMap<String, String>,
    pub bg_base: String,
    pub bg_surface: String,
    pub bg_card: String,
    pub text_primary: String,
    pub text_muted: String,
    pub accent_primary: String,
    pub accent_glow: String,
    pub border_color: String,
    pub card_radius: String,
    pub font_family: String,
    pub custom_css: Option<String>,
    #[serde(default)]
    pub target_mode: Option<String>,
    #[serde(default)]
    pub enable_video_backdrop: bool,
    #[serde(default)]
    pub video_backdrop_opacity: Option<f32>,
    #[serde(default)]
    pub video_delay_ms: Option<u32>,
}

pub struct ImageCache {
    cache: std::sync::RwLock<HashMap<String, String>>,
}

impl ImageCache {
    pub fn new() -> Self {
        Self {
            cache: std::sync::RwLock::new(HashMap::new()),
        }
    }

    pub fn get_or_load(&self, path_str: &str) -> Option<String> {
        if let Ok(guard) = self.cache.read() {
            if let Some(cached) = guard.get(path_str) {
                return Some(cached.clone());
            }
        }

        let path = Path::new(path_str);
        if path.exists() {
            if let Ok(bytes) = std::fs::read(path) {
                let data_url = format!("data:image/jpeg;base64,{}", BASE64_STANDARD.encode(&bytes));
                if let Ok(mut guard) = self.cache.write() {
                    guard.insert(path_str.to_string(), data_url.clone());
                }
                return Some(data_url);
            }
        }
        None
    }

    pub fn invalidate(&self, path_str: &str) {
        if let Ok(mut guard) = self.cache.write() {
            guard.remove(path_str);
        }
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.cache.write() {
            guard.clear();
        }
    }
}

impl Default for ImageCache {
    fn default() -> Self {
        Self::new()
    }
}

pub struct AppState {
    pub db: Arc<Database>,
    pub host: Arc<PluginHost>,
    pub downloader: Arc<MetadataDownloader>,
    pub marketplace: Arc<MarketplaceManager>,
    pub app_dir: PathBuf,
    pub covers_dir: PathBuf,
    pub backgrounds_dir: PathBuf,
    pub plugins_dir: PathBuf,
    pub themes_dir: PathBuf,
    pub image_cache: Arc<ImageCache>,
    pub store_account_manager: Arc<crate::store_manager::StoreAccountManager>,
    pub trailer_cache: Arc<tokio::sync::RwLock<HashMap<String, String>>>,
    pub active_game_manager: Arc<crate::active_game::ActiveGameManager>,
    pub minimize_to_tray: Arc<std::sync::atomic::AtomicBool>,
    pub achievement_service: Arc<crate::achievement_service::AchievementService>,
}

pub fn game_to_dto(g: Game, _cache: &ImageCache) -> GameDto {
    let hours = g.playtime_seconds / 3600;
    let mins = (g.playtime_seconds % 3600) / 60;
    let playtime_formatted = if hours > 0 {
        format!("{}h {}m", hours, mins)
    } else {
        format!("{}m", mins)
    };

    let icon_image = g.icon_image_path.clone().or_else(|| g.cover_image_path.clone());

    GameDto {
        id: g.id.to_string(),
        external_id: g.external_id,
        title: g.title,
        library: g.library_id,
        is_installed: g.is_installed,
        playtime_seconds: g.playtime_seconds,
        playtime_formatted,
        critic_score: g.critic_score.map(|s| s as u32),
        release_date: g.release_date,
        description: g.description,
        cover_image: g.cover_image_path,
        background_image: g.background_image_path,
        icon_image,
        genres: g.genres,
        developers: g.developers,
        publishers: g.publishers,
        series: g.series,
        completion_status: g.completion_status,
        user_notes: g.user_notes,
        features: g.features,
        custom_links: g.custom_links,
        extra_metadata: g.extra_metadata,
        last_activity: g.last_activity.map(|t| t.to_rfc3339()),
    }
}

pub fn open_folder_in_os(path: &Path) {
    if cfg!(windows) {
        let _ = std::process::Command::new("explorer.exe")
            .arg(path)
            .spawn();
    } else if cfg!(target_os = "macos") {
        let _ = std::process::Command::new("open")
            .arg(path)
            .spawn();
    } else {
        let _ = std::process::Command::new("xdg-open")
            .arg(path)
            .spawn();
    }
}

pub use crate::builtin_themes::get_builtin_themes;
