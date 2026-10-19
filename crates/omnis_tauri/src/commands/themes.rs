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
- `target_mode`: "all" | "desktop" | "bigpicture"
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
- `.big-picture-hero`: Hero banner in modalità Big Picture
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

pub fn scan_themes_directory(themes_dir: &Path) -> Vec<ThemeConfig> {
    seed_themes_folder(themes_dir);

    // Start with built-in theme presets in a map keyed by id
    let mut theme_map: HashMap<String, ThemeConfig> = HashMap::new();
    let mut theme_order: Vec<String> = Vec::new();

    for t in get_builtin_themes() {
        theme_order.push(t.id.clone());
        theme_map.insert(t.id.clone(), t);
    }

    // Scan user themes directory
    if let Ok(entries) = std::fs::read_dir(themes_dir) {
        for entry in entries.flatten() {
            let path = entry.path();

            // 1. Directory-based theme (e.g., themes/my_theme/theme.json + style.css)
            if path.is_dir() {
                let json_file = path.join("theme.json");
                if json_file.exists() {
                    if let Ok(content) = std::fs::read_to_string(&json_file) {
                        if let Ok(mut theme) = serde_json::from_str::<ThemeConfig>(&content) {
                            // Check if a companion style.css exists
                            let css_file = path.join("style.css");
                            if css_file.exists() {
                                if let Ok(css_content) = std::fs::read_to_string(&css_file) {
                                    if !css_content.trim().is_empty() {
                                        theme.custom_css = Some(css_content);
                                    }
                                }
                            }
                            theme.is_custom = true;
                            if !theme_order.contains(&theme.id) {
                                theme_order.push(theme.id.clone());
                            }
                            theme_map.insert(theme.id.clone(), theme);
                        }
                    }
                }
            }
            // 2. Flat file-based theme (e.g., themes/my_theme.json)
            else if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(mut theme) = serde_json::from_str::<ThemeConfig>(&content) {
                        theme.is_custom = true;
                        if !theme_order.contains(&theme.id) {
                            theme_order.push(theme.id.clone());
                        }
                        theme_map.insert(theme.id.clone(), theme);
                    }
                }
            }
        }
    }

    // Return themes in deterministic order
    theme_order
        .into_iter()
        .filter_map(|id| theme_map.remove(&id))
        .collect()
}

#[tauri::command]
pub fn get_themes(state: State<'_, AppState>) -> Result<Vec<ThemeConfig>, String> {
    Ok(scan_themes_directory(&state.themes_dir))
}

#[tauri::command]
pub fn save_custom_theme(mut theme: ThemeConfig, state: State<'_, AppState>) -> Result<bool, String> {
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
        assert_eq!(cyberpunk.custom_css.as_deref(), Some(".game-card { border-radius: 20px; }"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

