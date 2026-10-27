use crate::types::{get_builtin_themes, AppState, ThemeConfig};
use std::collections::HashMap;
use std::path::Path;
use tauri::State;

pub fn seed_themes_folder(themes_dir: &Path) {
    if !themes_dir.exists() {
        let _ = std::fs::create_dir_all(themes_dir);
    }

    let readme_path = themes_dir.join("README.md");
    if !readme_path.exists() {
        let readme_content = r#"# Omnis Launcher - Guida ai Temi & Personalizzazione Interfaccia

Benvenuto nella directory dei temi di Omnis! Qui puoi modificare i temi esistenti o crearne di nuovi.

## Struttura di un Tema
Ogni tema può essere una cartella contenente:
- `theme.json`: Metadati, palette colori e configurazione layout
- `style.css`: Foglio di stile CSS personalizzato per cambiare l'interfaccia a piacimento

## Proprietà in `theme.json`:
- `id`: Identificativo univoco (es. "mio_tema")
- `name`: Nome visualizzato (es. "Mio Tema Personalizzato")
- `description`: Descrizione del tema
- `author`: Nome dell'autore
- `target_mode`: "all" | "desktop" | "fullscreen" (o "bigpicture" per retrocompatibilità)
- `enable_video_backdrop`: `true` per abilitare video trailer di sottofondo, `false` altrimenti
- `video_backdrop_opacity`: Opacità del video (es. 0.55)
- `video_delay_ms`: Ritardo avvio trailer su focus (es. 1000 ms)
- `bg_base`: Colore di sfondo primario
- `bg_surface`: Colore superficie barre laterali e pannelli
- `bg_card`: Colore sfondo schede dei giochi
- `text_primary`: Colore testo principale
- `text_muted`: Colore testo secondario/didascalie
- `accent_primary`: Colore accento primario (pulsanti, focus, selezioni)
- `accent_glow`: Effetto bagliore per ombre e selezioni (es. rgba)
- `border_color`: Colore dei bordi e separatori
- `card_radius`: Raggio di curvatura delle schede (es. "12px", "8px", "0px")
- `font_family`: Font tipografico (es. "system-ui, sans-serif")

## Personalizzazione CSS Avanzata (`style.css`):
Nel file `style.css` puoi scrivere qualsiasi regola CSS valida per sovrascrivere elementi del launcher:
- `.game-card`: Schede dei giochi
- `.fullscreen-hero`, `.big-picture-hero`: Hero banner in modalità Fullscreen
- `.sidebar`: Barra di navigazione laterale
"#;
        let _ = std::fs::write(&readme_path, readme_content);
    }

    // Seed builtin theme folders if not already present
    for builtin in get_builtin_themes() {
        let theme_folder = themes_dir.join(&builtin.id);
        if !theme_folder.exists() {
            if std::fs::create_dir_all(&theme_folder).is_ok() {
                let json_path = theme_folder.join("theme.json");
                if let Ok(pretty) = serde_json::to_string_pretty(&builtin) {
                    let _ = std::fs::write(&json_path, pretty);
                }

                let css_path = theme_folder.join("style.css");
                let css_content = match builtin.custom_css.as_deref() {
                    Some(css) if !css.trim().is_empty() => format!("/* Stile CSS Custom per {} */\n{}\n", builtin.name, css),
                    _ => format!("/* Stile CSS Custom per {}\n   Aggiungi qui le tue regole CSS per personalizzare l'interfaccia */\n", builtin.name),
                };
                let _ = std::fs::write(&css_path, css_content);
            }
        }
    }
}

pub struct ThemeScanner;

impl ThemeScanner {
    /// Scans themes directory for directory-based and flat json themes
    pub fn scan(themes_dir: &Path) -> Vec<ThemeConfig> {
        seed_themes_folder(themes_dir);

        let mut theme_map: HashMap<String, ThemeConfig> = HashMap::new();
        let mut theme_order: Vec<String> = Vec::new();

        for t in get_builtin_themes() {
            theme_order.push(t.id.clone());
            theme_map.insert(t.id.clone(), t);
        }

        if let Ok(entries) = std::fs::read_dir(themes_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(mut theme) = Self::load_theme_entry(&path) {
                    theme.is_custom = true;
                    if !theme_order.contains(&theme.id) {
                        theme_order.push(theme.id.clone());
                    }
                    theme_map.insert(theme.id.clone(), theme);
                }
            }
        }

        theme_order
            .into_iter()
            .filter_map(|id| theme_map.remove(&id))
            .collect()
    }

    fn load_theme_entry(path: &Path) -> Option<ThemeConfig> {
        if path.is_dir() {
            Self::load_dir_theme(path)
        } else if path.extension().and_then(|e| e.to_str()) == Some("json") {
            Self::load_file_theme(path)
        } else {
            None
        }
    }

    fn load_dir_theme(dir: &Path) -> Option<ThemeConfig> {
        let json_file = dir.join("theme.json");
        if !json_file.exists() {
            return None;
        }

        let content = std::fs::read_to_string(&json_file).ok()?;
        if content.contains("apiVersion") {
            if let Err(err) = omnis_core::parse_and_validate_theme_manifest(&content) {
                eprintln!("Theme at {:?} rejected: {}", dir, err);
                return None;
            }
        }

        let mut theme = serde_json::from_str::<ThemeConfig>(&content).ok()?;
        let combined_css = Self::resolve_dir_css(dir, &theme);
        if !combined_css.trim().is_empty() {
            theme.custom_css = Some(combined_css);
        } else if let Some(ref inline_css) = theme.custom_css {
            if let Err(sec_err) = omnis_core::validate_theme_css_security(inline_css) {
                eprintln!("Theme {:?} inline CSS security violation: {}", theme.id, sec_err);
                theme.custom_css = None;
            }
        }

        Some(theme)
    }

    fn resolve_dir_css(dir: &Path, theme: &ThemeConfig) -> String {
        let mut combined_css = String::new();
        let css_file = dir.join("style.css");
        if css_file.exists() {
            if let Ok(css_content) = std::fs::read_to_string(&css_file) {
                if !css_content.trim().is_empty() {
                    if let Err(sec_err) = omnis_core::validate_theme_css_security(&css_content) {
                        eprintln!("Theme {:?} style.css security violation: {}", theme.id, sec_err);
                    } else {
                        combined_css.push_str(&css_content);
                        combined_css.push('\n');
                    }
                }
            }
        }

        for style_rel in &theme.styles {
            let add_css_path = dir.join(style_rel);
            if add_css_path.exists() && add_css_path != css_file {
                if let Ok(css_content) = std::fs::read_to_string(&add_css_path) {
                    if let Err(sec_err) = omnis_core::validate_theme_css_security(&css_content) {
                        eprintln!("Theme {:?} style '{}' security violation: {}", theme.id, style_rel, sec_err);
                    } else {
                        combined_css.push_str(&css_content);
                        combined_css.push('\n');
                    }
                }
            }
        }

        combined_css
    }

    fn load_file_theme(file: &Path) -> Option<ThemeConfig> {
        let content = std::fs::read_to_string(file).ok()?;
        if content.contains("apiVersion") {
            if let Err(err) = omnis_core::parse_and_validate_theme_manifest(&content) {
                eprintln!("Theme file {:?} rejected: {}", file, err);
                return None;
            }
        }

        let mut theme = serde_json::from_str::<ThemeConfig>(&content).ok()?;
        if let Some(ref inline_css) = theme.custom_css {
            if let Err(sec_err) = omnis_core::validate_theme_css_security(inline_css) {
                eprintln!("Theme {:?} inline CSS security violation: {}", theme.id, sec_err);
                theme.custom_css = None;
            }
        }

        Some(theme)
    }
}

pub fn scan_themes_directory(themes_dir: &Path) -> Vec<ThemeConfig> {
    ThemeScanner::scan(themes_dir)
}

#[tauri::command]
pub fn get_themes(state: State<'_, AppState>) -> Result<Vec<ThemeConfig>, String> {
    Ok(scan_themes_directory(&state.themes_dir))
}

#[tauri::command]
pub fn save_custom_theme(mut theme: ThemeConfig, state: State<'_, AppState>) -> Result<bool, String> {
    if theme.id.is_empty() {
        return Err("ID tema non valido: non può essere vuoto".to_string());
    }
    if !theme.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("ID tema non valido: sono ammessi solo caratteri alfanumerici, trattini e underscore".to_string());
    }
    if theme.id.contains("..") {
        return Err("ID tema non valido: sequenza traversal vietata".to_string());
    }

    if let Some(ref css) = theme.custom_css {
        omnis_core::validate_theme_css_security(css)?;
    }

    theme.is_custom = true;

    // 1. Save in dedicated folder: themes/{id}/theme.json + style.css
    let theme_folder = state.themes_dir.join(&theme.id);
    let _ = std::fs::create_dir_all(&theme_folder);

    let json_path = theme_folder.join("theme.json");
    let json = serde_json::to_string_pretty(&theme).map_err(|e| e.to_string())?;
    std::fs::write(&json_path, &json).map_err(|e| e.to_string())?;

    if let Some(ref css) = theme.custom_css {
        let css_path = theme_folder.join("style.css");
        let _ = std::fs::write(&css_path, css);
    }

    // 2. Also save flat {id}.json for legacy tool compatibility
    let flat_path = state.themes_dir.join(format!("{}.json", theme.id));
    let _ = std::fs::write(&flat_path, &json);

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seed_and_scan_themes_directory() {
        let temp_dir = std::env::temp_dir().join(format!("omnis_test_themes_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let themes = scan_themes_directory(&temp_dir);
        assert!(!themes.is_empty(), "Builtin themes should be seeded and loaded");
        assert!(temp_dir.join("README.md").exists(), "README.md should be created");
        assert!(temp_dir.join("cyberpunk").join("theme.json").exists(), "cyberpunk/theme.json should exist");
        assert!(temp_dir.join("cinema_trailer").join("theme.json").exists(), "cinema_trailer/theme.json should exist");

        // Verify cinema_trailer theme has video backdrop enabled
        let cinema = themes.iter().find(|t| t.id == "cinema_trailer").expect("cinema_trailer must exist");
        assert!(cinema.enable_video_backdrop);
        assert_eq!(cinema.video_backdrop_opacity, Some(0.55));

        // Test editing style.css in a theme folder
        let css_path = temp_dir.join("cyberpunk").join("style.css");
        std::fs::write(&css_path, ".game-card { border-radius: 20px; }").unwrap();

        let updated_themes = scan_themes_directory(&temp_dir);
        let cyberpunk = updated_themes.iter().find(|t| t.id == "cyberpunk").unwrap();
        assert_eq!(cyberpunk.custom_css.as_deref().map(|s| s.trim()), Some(".game-card { border-radius: 20px; }"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

