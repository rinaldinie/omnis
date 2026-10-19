use crate::types::{get_builtin_themes, AppState, ThemeConfig};
use tauri::State;

#[tauri::command]
pub fn get_themes(state: State<'_, AppState>) -> Result<Vec<ThemeConfig>, String> {
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
pub fn save_custom_theme(mut theme: ThemeConfig, state: State<'_, AppState>) -> Result<bool, String> {
    theme.is_custom = true;
    let file_path = state.themes_dir.join(format!("{}.json", theme.id));
    let json = serde_json::to_string_pretty(&theme).map_err(|e| e.to_string())?;
    std::fs::write(&file_path, json).map_err(|e| e.to_string())?;
    Ok(true)
}
