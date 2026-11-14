use omnis_core::{Database, MetadataDownloader, PluginHost};
use omnis_sdk::Game;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

fn default_true() -> bool {
    true
}

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
    #[serde(default)]
    pub community_score: Option<u32>,
    pub release_date: Option<String>,
    pub description: Option<String>,
    pub cover_image: Option<String>,
    pub background_image: Option<String>,
    pub icon_image: Option<String>,
    #[serde(default)]
    pub cover_image_path: Option<String>,
    #[serde(default)]
    pub background_image_path: Option<String>,
    #[serde(default)]
    pub icon_image_path: Option<String>,
    pub genres: Vec<String>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub series: Option<String>,
    #[serde(default)]
    pub age_rating: Option<String>,
    pub completion_status: Option<String>,
    pub user_notes: Option<String>,
    #[serde(default)]
    pub features: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub custom_links: Vec<omnis_sdk::CustomLink>,
    #[serde(default)]
    pub play_actions: Vec<omnis_sdk::LaunchConfiguration>,
    #[serde(default = "default_true")]
    pub use_library_integration: bool,
    #[serde(default)]
    pub extra_metadata: Option<String>,
    #[serde(default)]
    pub last_activity: Option<String>,
    #[serde(default)]
    pub is_hidden: bool,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub hidden_by_duplicate_hider: bool,
    #[serde(default)]
    pub duplicate_group_id: Option<String>,
    #[serde(default)]
    pub other_copies: Vec<omnis_sdk::DuplicateCopyDto>,
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

pub struct AppState {
    pub db: Arc<Database>,
    pub host: Arc<PluginHost>,
    pub downloader: Arc<MetadataDownloader>,
    pub app_dir: PathBuf,
    pub covers_dir: PathBuf,
    pub backgrounds_dir: PathBuf,
    pub plugins_dir: PathBuf,
    pub themes_dir: PathBuf,
    pub media_scope: Arc<crate::media_scope::MediaScope>,
    pub store_account_manager: Arc<crate::store::StoreAccountManager>,
    pub trailer_cache: Arc<tokio::sync::RwLock<HashMap<String, String>>>,
    pub active_game_manager: Arc<crate::services::ActiveGameManager>,
    pub minimize_to_tray: Arc<std::sync::atomic::AtomicBool>,
    pub achievement_service: Arc<crate::services::AchievementService>,
    pub sync_achievements_on_game_exit: Arc<std::sync::atomic::AtomicBool>,
}

pub fn game_to_dto(g: Game) -> GameDto {
    let hours = g.playtime_seconds / 3600;
    let mins = (g.playtime_seconds % 3600) / 60;
    let playtime_formatted = if hours > 0 {
        format!("{}h {}m", hours, mins)
    } else {
        format!("{}m", mins)
    };

    let icon_image = g
        .icon_image_path
        .clone()
        .or_else(|| g.cover_image_path.clone());

    GameDto {
        id: g.id.to_string(),
        external_id: g.external_id,
        title: g.title,
        library: g.library_id,
        is_installed: g.is_installed,
        playtime_seconds: g.playtime_seconds,
        playtime_formatted,
        critic_score: g.critic_score.map(|s| s as u32),
        community_score: g.community_score.map(|s| s as u32),
        release_date: g.release_date,
        description: g.description,
        cover_image: g.cover_image_path.clone(),
        background_image: g.background_image_path.clone(),
        icon_image,
        cover_image_path: g.cover_image_path,
        background_image_path: g.background_image_path,
        icon_image_path: g.icon_image_path,
        genres: g.genres,
        developers: g.developers,
        publishers: g.publishers,
        series: g.series,
        age_rating: g.age_rating,
        completion_status: g.completion_status,
        user_notes: g.user_notes,
        features: g.features,
        tags: g.tags,
        custom_links: g.custom_links,
        play_actions: g.play_actions,
        use_library_integration: g.use_library_integration,
        extra_metadata: g.extra_metadata,
        last_activity: g.last_activity.map(|t| t.to_rfc3339()),
        is_hidden: g.is_hidden,
        is_favorite: g.is_favorite,
        hidden_by_duplicate_hider: g.hidden_by_duplicate_hider,
        duplicate_group_id: g.duplicate_group_id,
        other_copies: Vec::new(),
    }
}

pub fn populate_other_copies(dtos: &mut [GameDto]) {
    let mut groups: HashMap<String, Vec<omnis_sdk::DuplicateCopyDto>> = HashMap::new();

    for dto in dtos.iter() {
        if let Some(ref gid) = dto.duplicate_group_id {
            groups
                .entry(gid.clone())
                .or_default()
                .push(omnis_sdk::DuplicateCopyDto {
                    id: dto.id.clone(),
                    title: dto.title.clone(),
                    library: dto.library.clone(),
                    is_installed: dto.is_installed,
                    playtime_seconds: dto.playtime_seconds,
                    playtime_formatted: dto.playtime_formatted.clone(),
                    is_hidden: dto.is_hidden,
                });
        }
    }

    for copies in groups.values_mut() {
        copies.sort_by(|a, b| {
            b.is_installed
                .cmp(&a.is_installed)
                .then_with(|| a.library.cmp(&b.library))
        });
    }

    for dto in dtos.iter_mut() {
        if let Some(ref gid) = dto.duplicate_group_id {
            if let Some(copies) = groups.get(gid) {
                dto.other_copies = copies
                    .iter()
                    .filter(|c| c.id != dto.id)
                    .cloned()
                    .collect();
            } else {
                dto.other_copies.clear();
            }
        } else {
            dto.other_copies.clear();
        }
    }
}

pub fn open_folder_in_os(path: &Path) {
    if cfg!(windows) {
        let _ = std::process::Command::new("explorer.exe").arg(path).spawn();
    } else if cfg!(target_os = "macos") {
        let _ = std::process::Command::new("open").arg(path).spawn();
    } else {
        let _ = std::process::Command::new("xdg-open").arg(path).spawn();
    }
}

pub use crate::builtin_themes::get_builtin_themes;
