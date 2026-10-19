use base64::prelude::*;
use omnis_core::{Database, MarketplaceManager, MetadataDownloader, PluginHost};
use omnis_sdk::Game;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
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
    pub custom_links: Vec<omnis_sdk::CustomLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub is_custom: bool,
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
        custom_links: g.custom_links,
    }
}

pub fn get_app_dir() -> PathBuf {
    if let Ok(local) = env::var("LOCALAPPDATA") {
        PathBuf::from(local).join("OmnisGameLibrary")
    } else {
        PathBuf::from("./data")
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

pub fn get_builtin_themes() -> Vec<ThemeConfig> {
    vec![
        ThemeConfig {
            id: "cyberpunk".to_string(),
            name: "Cyberpunk Neon (Default)".to_string(),
            description: "Modern high-contrast dark theme with electric indigo and purple ambient glow".to_string(),
            author: "Omnis Team".to_string(),
            is_custom: false,
            bg_base: "#090c14".to_string(),
            bg_surface: "#0e1320".to_string(),
            bg_card: "#141a2c".to_string(),
            text_primary: "#f8fafc".to_string(),
            text_muted: "#94a3b8".to_string(),
            accent_primary: "#6366f1".to_string(),
            accent_glow: "rgba(99, 102, 241, 0.4)".to_string(),
            border_color: "#1e293b".to_string(),
            card_radius: "12px".to_string(),
            font_family: "system-ui, -apple-system, sans-serif".to_string(),
            custom_css: None,
            target_mode: Some("all".to_string()),
            enable_video_backdrop: false,
            video_backdrop_opacity: None,
            video_delay_ms: None,
        },
        ThemeConfig {
            id: "steam_deck".to_string(),
            name: "Steam Deck OLED".to_string(),
            description: "Pure pitch black OLED theme with Steam Deck cyan-blue highlights".to_string(),
            author: "Valve Inspired".to_string(),
            is_custom: false,
            bg_base: "#000000".to_string(),
            bg_surface: "#0b0e14".to_string(),
            bg_card: "#121721".to_string(),
            text_primary: "#ffffff".to_string(),
            text_muted: "#8a9aa8".to_string(),
            accent_primary: "#1a9fff".to_string(),
            accent_glow: "rgba(26, 159, 255, 0.45)".to_string(),
            border_color: "#1e2533".to_string(),
            card_radius: "8px".to_string(),
            font_family: "system-ui, sans-serif".to_string(),
            custom_css: None,
            target_mode: Some("bigpicture".to_string()),
            enable_video_backdrop: false,
            video_backdrop_opacity: None,
            video_delay_ms: None,
        },
        ThemeConfig {
            id: "playnite_dark".to_string(),
            name: "Playnite Classic Dark".to_string(),
            description: "Playnite desktop & fullscreen signature warm slate and radiant orange".to_string(),
            author: "Josef Nemec Inspired".to_string(),
            is_custom: false,
            bg_base: "#181a1f".to_string(),
            bg_surface: "#20232a".to_string(),
            bg_card: "#282c34".to_string(),
            text_primary: "#ffffff".to_string(),
            text_muted: "#abb2bf".to_string(),
            accent_primary: "#ea7300".to_string(),
            accent_glow: "rgba(234, 115, 0, 0.45)".to_string(),
            border_color: "#343842".to_string(),
            card_radius: "6px".to_string(),
            font_family: "Segoe UI, system-ui, sans-serif".to_string(),
            custom_css: None,
            target_mode: Some("desktop".to_string()),
            enable_video_backdrop: false,
            video_backdrop_opacity: None,
            video_delay_ms: None,
        },
        ThemeConfig {
            id: "epic_dark".to_string(),
            name: "Epic Games Launcher V2".to_string(),
            description: "Minimalist graphite dark theme with subtle borders and clean steel accents".to_string(),
            author: "Epic Games Inspired".to_string(),
            is_custom: false,
            bg_base: "#121212".to_string(),
            bg_surface: "#181818".to_string(),
            bg_card: "#202020".to_string(),
            text_primary: "#f5f5f5".to_string(),
            text_muted: "#aaaaaa".to_string(),
            accent_primary: "#0078f2".to_string(),
            accent_glow: "rgba(0, 120, 242, 0.4)".to_string(),
            border_color: "#2a2a2a".to_string(),
            card_radius: "10px".to_string(),
            font_family: "Brutal, system-ui, sans-serif".to_string(),
            custom_css: None,
            target_mode: Some("desktop".to_string()),
            enable_video_backdrop: false,
            video_backdrop_opacity: None,
            video_delay_ms: None,
        },
        ThemeConfig {
            id: "synthwave".to_string(),
            name: "Retro Synthwave 80s".to_string(),
            description: "Vibrant arcade retro vibes with hot neon magenta and deep purple horizons".to_string(),
            author: "RetroWave".to_string(),
            is_custom: false,
            bg_base: "#120024".to_string(),
            bg_surface: "#1d0038".to_string(),
            bg_card: "#2c0252".to_string(),
            text_primary: "#ffffff".to_string(),
            text_muted: "#d896ff".to_string(),
            accent_primary: "#ff007f".to_string(),
            accent_glow: "rgba(255, 0, 127, 0.55)".to_string(),
            border_color: "#58008a".to_string(),
            card_radius: "14px".to_string(),
            font_family: "system-ui, sans-serif".to_string(),
            custom_css: None,
            target_mode: Some("all".to_string()),
            enable_video_backdrop: false,
            video_backdrop_opacity: None,
            video_delay_ms: None,
        },
        ThemeConfig {
            id: "nordic_frost".to_string(),
            name: "Nordic Polar Frost".to_string(),
            description: "Subtle cold arctic palette with frost blues and clean muted contrast".to_string(),
            author: "Nord Theme".to_string(),
            is_custom: false,
            bg_base: "#242933".to_string(),
            bg_surface: "#2e3440".to_string(),
            bg_card: "#3b4252".to_string(),
            text_primary: "#eceff4".to_string(),
            text_muted: "#d8dee9".to_string(),
            accent_primary: "#88c0d0".to_string(),
            accent_glow: "rgba(136, 192, 208, 0.45)".to_string(),
            border_color: "#4c566a".to_string(),
            card_radius: "10px".to_string(),
            font_family: "system-ui, sans-serif".to_string(),
            custom_css: None,
            target_mode: Some("all".to_string()),
            enable_video_backdrop: false,
            video_backdrop_opacity: None,
            video_delay_ms: None,
        },
        ThemeConfig {
            id: "cinema_trailer".to_string(),
            name: "Cinema Lounge (Trailer Videos)".to_string(),
            description: "Cinematic atmosphere with dynamic game trailer video backgrounds and golden amber highlights".to_string(),
            author: "Omnis Cinema".to_string(),
            is_custom: false,
            bg_base: "#08080a".to_string(),
            bg_surface: "#101014".to_string(),
            bg_card: "#18181f".to_string(),
            text_primary: "#ffffff".to_string(),
            text_muted: "#a1a1aa".to_string(),
            accent_primary: "#f59e0b".to_string(),
            accent_glow: "rgba(245, 158, 11, 0.45)".to_string(),
            border_color: "#27272a".to_string(),
            card_radius: "14px".to_string(),
            font_family: "system-ui, sans-serif".to_string(),
            custom_css: Some(".big-picture-hero { backdrop-filter: blur(8px); }".to_string()),
            target_mode: Some("all".to_string()),
            enable_video_backdrop: true,
            video_backdrop_opacity: Some(0.55),
            video_delay_ms: Some(1000),
        },
    ]
}
