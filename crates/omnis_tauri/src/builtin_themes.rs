use crate::types::ThemeConfig;
use std::collections::HashMap;

/// Returns the built-in theme presets packaged with Omnis
pub fn get_builtin_themes() -> Vec<ThemeConfig> {
    vec![
        ThemeConfig {
            id: "cyberpunk".to_string(),
            api_version: Some(1),
            name: "Cyberpunk Neon (Default)".to_string(),
            description: "Modern high-contrast dark theme with electric indigo and purple ambient glow".to_string(),
            author: "Omnis Team".to_string(),
            is_custom: false,
            tokens: HashMap::new(),
            styles: Vec::new(),
            layouts: HashMap::new(),
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
            api_version: Some(1),
            name: "Steam Deck OLED".to_string(),
            description: "Pure pitch black OLED theme with Steam Deck cyan-blue highlights".to_string(),
            author: "Valve Inspired".to_string(),
            is_custom: false,
            tokens: HashMap::new(),
            styles: Vec::new(),
            layouts: HashMap::new(),
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
            target_mode: Some("fullscreen".to_string()),
            enable_video_backdrop: false,
            video_backdrop_opacity: None,
            video_delay_ms: None,
        },
        ThemeConfig {
            id: "playnite_dark".to_string(),
            api_version: Some(1),
            name: "Playnite Classic Dark".to_string(),
            description: "Playnite desktop & fullscreen signature warm slate and radiant orange".to_string(),
            author: "Josef Nemec Inspired".to_string(),
            is_custom: false,
            tokens: HashMap::new(),
            styles: Vec::new(),
            layouts: HashMap::new(),
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
            api_version: Some(1),
            name: "Epic Games Launcher V2".to_string(),
            description: "Minimalist graphite dark theme with subtle borders and clean steel accents".to_string(),
            author: "Epic Games Inspired".to_string(),
            is_custom: false,
            tokens: HashMap::new(),
            styles: Vec::new(),
            layouts: HashMap::new(),
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
            api_version: Some(1),
            name: "Retro Synthwave 80s".to_string(),
            description: "Vibrant arcade retro vibes with hot neon magenta and deep purple horizons".to_string(),
            author: "RetroWave".to_string(),
            is_custom: false,
            tokens: HashMap::new(),
            styles: Vec::new(),
            layouts: HashMap::new(),
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
            api_version: Some(1),
            name: "Nordic Polar Frost".to_string(),
            description: "Subtle cold arctic palette with frost blues and clean muted contrast".to_string(),
            author: "Nord Theme".to_string(),
            is_custom: false,
            tokens: HashMap::new(),
            styles: Vec::new(),
            layouts: HashMap::new(),
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
            api_version: Some(1),
            name: "Cinema Lounge (Trailer Videos)".to_string(),
            description: "Cinematic atmosphere with dynamic game trailer video backgrounds and golden amber highlights".to_string(),
            author: "Omnis Cinema".to_string(),
            is_custom: false,
            tokens: {
                let mut map = HashMap::new();
                map.insert("--omnis-accent".to_string(), "#f59e0b".to_string());
                map.insert("--omnis-card-radius".to_string(), "14px".to_string());
                map.insert("--omnis-bg-base".to_string(), "#08080a".to_string());
                map.insert("--omnis-bg-surface".to_string(), "#101014".to_string());
                map.insert("--omnis-bg-card".to_string(), "#18181f".to_string());
                map
            },
            styles: vec!["style.css".to_string()],
            layouts: {
                let mut map = HashMap::new();
                map.insert("library".to_string(), "grid-large".to_string());
                map
            },
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
            custom_css: Some(r#"
[data-omnis="game-card"] {
  border-radius: var(--omnis-card-radius, 14px);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
}
[data-omnis="game-card"]:hover {
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.35);
}
[data-omnis="game-card.cover"] {
  border-radius: var(--omnis-card-radius, 14px);
}
[data-omnis="details.hero"] {
  backdrop-filter: blur(8px);
}
[data-omnis="details.title"] {
  color: var(--omnis-accent, #f59e0b);
}
[data-omnis-slot="details.hero"] [data-omnis-widget="progress"] {
  color: var(--omnis-accent, #f59e0b);
}
"#.trim().to_string()),
            target_mode: Some("all".to_string()),
            enable_video_backdrop: true,
            video_backdrop_opacity: Some(0.55),
            video_delay_ms: Some(1000),
        },
    ]
}
