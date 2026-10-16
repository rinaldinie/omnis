use base64::prelude::*;
use omnis_core::{
    Database, EventBus, GameLauncher, LibraryCounts, MetadataCandidateDto, MetadataDownloader,
    MetadataPipelineConfig, PluginHost, ProviderInfo,
};
use omnis_plugin_epic::EpicLibraryPlugin;
use omnis_plugin_steam::SteamPlugin;
use omnis_sdk::{Game, LaunchConfiguration, LibraryPlugin, PluginEvent, ProcessTrackingMode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{State, Window};
use tracing::info;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameDto {
    pub id: String,
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
    pub app_dir: PathBuf,
    pub covers_dir: PathBuf,
    pub backgrounds_dir: PathBuf,
    pub plugins_dir: PathBuf,
    pub themes_dir: PathBuf,
    pub image_cache: Arc<ImageCache>,
}

fn game_to_dto(g: Game, _cache: &ImageCache) -> GameDto {
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

#[tauri::command]
async fn get_games(state: State<'_, AppState>) -> Result<Vec<GameDto>, String> {
    let games = state.db.get_all_games().map_err(|e| e.to_string())?;
    let cache = &state.image_cache;
    Ok(games.into_iter().map(|g| game_to_dto(g, cache)).collect())
}

#[tauri::command]
async fn get_counts(state: State<'_, AppState>) -> Result<LibraryCounts, String> {
    state.db.get_library_counts().map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_library(state: State<'_, AppState>) -> Result<usize, String> {
    state
        .host
        .dispatch_event(
            None,
            PluginEvent::SyncRequested {
                library_id: "all".to_string(),
                force_full: false,
            },
        )
        .await;

    // Scan Epic Games Store library
    let epic_plugin = EpicLibraryPlugin::new();
    match epic_plugin.scan().await {
        Ok(epic_games) => {
            if !epic_games.is_empty() {
                let _ = state.db.ingest_discovered_batch(&epic_games);
            }
        }
        Err(err) => {
            tracing::warn!("Failed scanning Epic Games Store: {}", err);
        }
    }

    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    state.db.count_games().map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct AddCustomGamePayload {
    pub title: String,
    pub executable_path: String,
    pub arguments: Vec<String>,
    pub working_dir: Option<String>,
    pub cover_image_path: Option<String>,
}

#[tauri::command]
async fn add_custom_game(
    payload: AddCustomGamePayload,
    state: State<'_, AppState>,
) -> Result<omnis_sdk::Game, String> {
    let id = Uuid::new_v4();
    let sorting_title = payload.title.to_lowercase();
    let exe_path = PathBuf::from(&payload.executable_path);

    let launch_config = LaunchConfiguration {
        executable: payload.executable_path.clone(),
        arguments: payload.arguments,
        working_dir: payload
            .working_dir
            .map(PathBuf::from)
            .or_else(|| exe_path.parent().map(|p| p.to_path_buf())),
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    };

    let install_dir = exe_path.parent().map(|p| p.to_path_buf());

    state
        .db
        .insert_custom_game(
            id,
            &payload.title,
            &sorting_title,
            install_dir,
            vec![launch_config],
            payload.cover_image_path,
        )
        .map_err(|e| e.to_string())
}


#[tauri::command]
async fn download_all_metadata(state: State<'_, AppState>) -> Result<usize, String> {
    let downloader = state.downloader.clone();
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    downloader
        .download_for_all(db, &covers_dir, |_cur, _tot, _title| {})
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn download_metadata(game_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let downloader = state.downloader.clone();
    downloader
        .download_for_game(&state.db, id, &state.covers_dir)
        .await
        .map(|_| true)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn enrich_single_game(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<GameDto, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    state
        .downloader
        .download_for_game(&state.db, id, &state.covers_dir)
        .await?;
    let game = state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    if let Some(ref p) = game.cover_image_path {
        state.image_cache.invalidate(p);
    }
    if let Some(ref p) = game.background_image_path {
        state.image_cache.invalidate(p);
    }

    Ok(game_to_dto(game, &state.image_cache))
}

#[tauri::command]
async fn get_game(game_id: String, state: State<'_, AppState>) -> Result<omnis_sdk::Game, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    state
        .db
        .get_game_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())
}

#[tauri::command]
async fn update_game_metadata(
    game_update: omnis_sdk::GameUpdateDto,
    state: State<'_, AppState>,
) -> Result<omnis_sdk::Game, String> {
    let updated = state.db.update_game(&game_update).map_err(|e| e.to_string())?;
    if let Some(ref p) = updated.cover_image_path {
        state.image_cache.invalidate(p);
    }
    if let Some(ref p) = updated.background_image_path {
        state.image_cache.invalidate(p);
    }
    Ok(updated)
}

#[tauri::command]
async fn search_metadata_candidates(
    title: String,
    provider_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<MetadataCandidateDto>, String> {
    state
        .downloader
        .search_candidates(&title, provider_id.as_deref())
        .await
}

#[tauri::command]
async fn apply_metadata_candidate(
    game_id: String,
    candidate: MetadataCandidateDto,
    fields: Vec<omnis_sdk::MetadataField>,
    state: State<'_, AppState>,
) -> Result<omnis_sdk::Game, String> {
    let uuid = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let mut patch = omnis_sdk::GameMetadataPatch::default();

    for field in &fields {
        match field {
            omnis_sdk::MetadataField::CoverImage => {
                if let Some(ref url) = candidate.raw_patch.cover_url {
                    if url.starts_with("http://") || url.starts_with("https://") {
                        let covers_dir = state.covers_dir.clone();
                        let _ = std::fs::create_dir_all(&covers_dir);
                        let dest = covers_dir.join(format!("{}.jpg", uuid));
                        match state.downloader.download_image_bytes(url).await {
                            Ok(bytes) => {
                                if let Err(e) = std::fs::write(&dest, bytes) {
                                    tracing::warn!("Impossibile scrivere cover su disco {}: {}", dest.display(), e);
                                } else {
                                    let dest_str = dest.to_string_lossy().to_string();
                                    state.image_cache.invalidate(&dest_str);
                                    patch.cover_url = Some(dest_str);
                                }
                            }
                            Err(e) => {
                                tracing::warn!("Download cover fallito da {}: {}", url, e);
                            }
                        }
                    } else {
                        patch.cover_url = Some(url.clone());
                    }
                }
            }
            omnis_sdk::MetadataField::BackgroundImage => {
                if let Some(ref url) = candidate.raw_patch.background_url {
                    if url.starts_with("http://") || url.starts_with("https://") {
                        let bgs_dir = state.backgrounds_dir.clone();
                        let _ = std::fs::create_dir_all(&bgs_dir);
                        let dest = bgs_dir.join(format!("{}.jpg", uuid));
                        match state.downloader.download_image_bytes(url).await {
                            Ok(bytes) => {
                                if let Err(e) = std::fs::write(&dest, bytes) {
                                    tracing::warn!("Impossibile scrivere background su disco {}: {}", dest.display(), e);
                                } else {
                                    let dest_str = dest.to_string_lossy().to_string();
                                    state.image_cache.invalidate(&dest_str);
                                    patch.background_url = Some(dest_str);
                                }
                            }
                            Err(e) => {
                                tracing::warn!("Download background fallito da {}: {}", url, e);
                            }
                        }
                    } else {
                        patch.background_url = Some(url.clone());
                    }
                }
            }
            omnis_sdk::MetadataField::Icon => {
                patch.icon_url = candidate.raw_patch.icon_url.clone();
            }
            omnis_sdk::MetadataField::CriticScore => {
                patch.critic_score = candidate.raw_patch.critic_score;
            }
            omnis_sdk::MetadataField::CommunityScore => {
                patch.community_score = candidate.raw_patch.community_score;
            }
            omnis_sdk::MetadataField::Description => {
                patch.description = candidate.raw_patch.description.clone();
            }
            omnis_sdk::MetadataField::ReleaseDate => {
                patch.release_date = candidate.raw_patch.release_date.clone();
            }
            omnis_sdk::MetadataField::Genres => {
                patch.genres = candidate.raw_patch.genres.clone();
            }
            omnis_sdk::MetadataField::Developers => {
                patch.developers = candidate.raw_patch.developers.clone();
            }
            omnis_sdk::MetadataField::Publishers => {
                patch.publishers = candidate.raw_patch.publishers.clone();
            }
        }
    }

    state
        .db
        .apply_metadata_patch(uuid, &patch)
        .map_err(|e| e.to_string())?;

    let game = state
        .db
        .get_game_by_id(uuid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Gioco non trovato".to_string())?;

    if let Some(ref p) = game.cover_image_path {
        state.image_cache.invalidate(p);
    }
    if let Some(ref p) = game.background_image_path {
        state.image_cache.invalidate(p);
    }

    Ok(game)
}

#[tauri::command]
async fn get_metadata_providers(state: State<'_, AppState>) -> Result<Vec<ProviderInfo>, String> {
    Ok(state.downloader.get_providers_info().await)
}

#[tauri::command]
async fn refresh_metadata_providers(state: State<'_, AppState>) -> Result<Vec<ProviderInfo>, String> {
    state.downloader.refresh_external_plugins().await
}

#[tauri::command]
async fn save_provider_settings(
    provider_id: String,
    settings: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let map = settings.as_object().cloned().unwrap_or_default();
    state
        .downloader
        .save_provider_settings(&provider_id, map)
        .await?;
    Ok(true)
}

#[tauri::command]
async fn toggle_provider(
    provider_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state.downloader.toggle_provider(&provider_id, enabled).await?;
    Ok(true)
}

#[tauri::command]
async fn test_provider_connection(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state.downloader.test_provider_connection(&provider_id).await
}

#[tauri::command]
async fn get_metadata_pipeline_config(
    state: State<'_, AppState>,
) -> Result<MetadataPipelineConfig, String> {
    Ok(state.downloader.get_pipeline_config().await)
}

#[tauri::command]
async fn save_metadata_pipeline_config(
    config: MetadataPipelineConfig,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state.downloader.save_pipeline_config(config).await?;
    Ok(true)
}


#[tauri::command]
async fn launch_game(game_id: String, state: State<'_, AppState>) -> Result<u64, String> {
    let id = Uuid::parse_str(&game_id).map_err(|e| e.to_string())?;
    let config = LaunchConfiguration {
        executable: if cfg!(windows) {
            "cmd.exe".to_string()
        } else {
            "sh".to_string()
        },
        arguments: if cfg!(windows) {
            vec![
                "/c".to_string(),
                "echo".to_string(),
                "Omnis Game Launched".to_string(),
            ]
        } else {
            vec!["-c".to_string(), "echo Omnis Game Launched".to_string()]
        },
        working_dir: None,
        tracking_mode: ProcessTrackingMode::KernelJobObject,
    };

    let session_duration = GameLauncher::launch_and_track(id, config, |_| {})
        .await
        .map_err(|e| e.to_string())?;

    let _ = state.db.record_play_session(id, session_duration);
    Ok(session_duration)
}

fn get_builtin_themes() -> Vec<ThemeConfig> {
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
        },
    ]
}

#[tauri::command]
fn get_themes(state: State<'_, AppState>) -> Result<Vec<ThemeConfig>, String> {
    let mut themes = get_builtin_themes();

    if let Ok(entries) = std::fs::read_dir(&state.themes_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(mut custom_theme) = serde_json::from_str::<ThemeConfig>(&content) {
                        custom_theme.is_custom = true;
                        themes.push(custom_theme);
                    }
                }
            }
        }
    }

    Ok(themes)
}

#[tauri::command]
fn save_custom_theme(mut theme: ThemeConfig, state: State<'_, AppState>) -> Result<bool, String> {
    theme.is_custom = true;
    let file_path = state.themes_dir.join(format!("{}.json", theme.id));
    let json = serde_json::to_string_pretty(&theme).map_err(|e| e.to_string())?;
    std::fs::write(&file_path, json).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn open_folder(folder_type: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = match folder_type.as_str() {
        "db" | "library" => &state.app_dir,
        "covers" => &state.covers_dir,
        "plugins" => &state.plugins_dir,
        "themes" => &state.themes_dir,
        _ => &state.app_dir,
    };
    open_folder_in_os(path);
    Ok(())
}

#[tauri::command]
fn window_start_dragging(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: Window) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn window_toggle_fullscreen(window: Window) -> Result<bool, String> {
    let current = window.is_fullscreen().map_err(|e| e.to_string())?;
    let next = !current;
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
fn window_set_fullscreen(fullscreen: bool, window: Window) -> Result<(), String> {
    window.set_fullscreen(fullscreen).map_err(|e| e.to_string())
}

#[tauri::command]
fn window_close(window: Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
async fn pick_executable_file() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let file = rfd::FileDialog::new()
            .set_title("Seleziona file eseguibile (.exe)")
            .add_filter("Eseguibili Windows", &["exe", "bat", "cmd", "lnk"])
            .pick_file();
        Ok(file.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pick_directory() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let dir = rfd::FileDialog::new()
            .set_title("Seleziona cartella")
            .pick_folder();
        Ok(dir.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn find_executables_in_folder(folder_path: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let mut exes = Vec::new();
        let path = std::path::Path::new(&folder_path);
        if path.is_dir() {
            let mut search_dirs = vec![path.to_path_buf()];
            if let Ok(entries) = std::fs::read_dir(path) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        let name = p.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                        if ["bin", "binaries", "x64", "win64", "win32", "game"].contains(&name.as_str()) {
                            search_dirs.push(p);
                        }
                    }
                }
            }

            for sdir in search_dirs {
                if let Ok(entries) = std::fs::read_dir(sdir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() {
                            if let Some(ext) = p.extension() {
                                if ext.eq_ignore_ascii_case("exe") {
                                    let fname = p.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                                    if !fname.contains("unins")
                                        && !fname.contains("crash")
                                        && !fname.contains("update")
                                        && !fname.contains("setup")
                                        && !fname.contains("redist")
                                        && !fname.contains("dxsetup")
                                    {
                                        exes.push(p.to_string_lossy().to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(exes)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pick_image_file() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let file = rfd::FileDialog::new()
            .set_title("Seleziona immagine copertina o sfondo")
            .add_filter("Immagini", &["png", "jpg", "jpeg", "webp", "ico", "bmp"])
            .pick_file();
        Ok(file.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn get_app_dir() -> PathBuf {
    if let Ok(local) = env::var("LOCALAPPDATA") {
        PathBuf::from(local).join("OmnisGameLibrary")
    } else {
        PathBuf::from("./data")
    }
}

fn open_folder_in_os(path: &Path) {
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

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    info!("Inizializzazione Omnis Game Library (Epic Games Launcher V2 / Tauri Engine)...");

    let app_dir = get_app_dir();
    let cache_dir = app_dir.join("cache");
    let covers_dir = cache_dir.join("covers");
    let backgrounds_dir = cache_dir.join("backgrounds");
    let plugins_dir = app_dir.join("plugins");
    let themes_dir = app_dir.join("themes");
    let _ = std::fs::create_dir_all(&covers_dir);
    let _ = std::fs::create_dir_all(&backgrounds_dir);
    let _ = std::fs::create_dir_all(&plugins_dir);
    let _ = std::fs::create_dir_all(&themes_dir);

    let db_path = app_dir.join("library.db");
    let db = Arc::new(Database::open(&db_path).expect("Impossibile aprire il database SQLite"));
    let _ = db.seed_sample_games();

    let event_bus = EventBus::new(256);
    let mut host = PluginHost::new(event_bus.clone(), db.clone());
    host.register_plugin(Box::new(SteamPlugin::new()));

    let downloader = Arc::new(MetadataDownloader::new());

    let runtime = tokio::runtime::Runtime::new().expect("Impossibile inizializzare Tokio runtime");
    runtime.block_on(async {
        let _ = host.initialize_all().await;
        downloader.set_plugins_dir(plugins_dir.clone()).await;
    });
    let host = Arc::new(host);
    let image_cache = Arc::new(ImageCache::new());

    let state = AppState {
        db,
        host,
        downloader,
        app_dir,
        covers_dir,
        backgrounds_dir,
        plugins_dir,
        themes_dir,
        image_cache,
    };


    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_games,
            get_counts,
            sync_library,
            download_metadata,
            download_all_metadata,
            enrich_single_game,
            get_metadata_providers,
            refresh_metadata_providers,
            save_provider_settings,
            toggle_provider,
            test_provider_connection,
            get_metadata_pipeline_config,
            save_metadata_pipeline_config,
            launch_game,
            open_folder,
            window_start_dragging,
            window_minimize,
            window_toggle_maximize,
            window_toggle_fullscreen,
            window_set_fullscreen,
            window_close,
            get_themes,
            save_custom_theme,
            add_custom_game,
            get_game,
            update_game_metadata,
            search_metadata_candidates,
            apply_metadata_candidate,
            pick_executable_file,
            pick_directory,
            find_executables_in_folder,
            pick_image_file,
        ])
        .run(tauri::generate_context!())
        .expect("Errore durante l'esecuzione dell'applicazione Tauri");
}
