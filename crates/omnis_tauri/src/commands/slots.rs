use crate::types::AppState;
use omnis_sdk::SlotWidget;
use tauri::State;
use uuid::Uuid;

/// Helper function to resolve a dotted value key (e.g. "howlongtobeat.main_story") from a JSON value
fn resolve_json_key<'a>(val: &'a serde_json::Value, path: &str) -> Option<&'a serde_json::Value> {
    let mut current = val;
    for part in path.split('.') {
        match current {
            serde_json::Value::Object(map) => {
                current = map.get(part)?;
            }
            _ => return None,
        }
    }
    Some(current)
}

/// Retrieves and validates declarative plugin slot widgets for a given slot name
#[tauri::command]
pub async fn get_slot_widgets(
    slot_name: String,
    game_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<SlotWidget>, String> {
    let mut widgets = Vec::new();

    // 1. If game_id is provided, resolve dynamic plugin widgets from game.extra_metadata
    if let Some(ref gid_str) = game_id {
        if let Ok(gid) = Uuid::parse_str(gid_str) {
            if let Ok(Some(game)) = state.db.get_game_by_id(gid) {
                let extra_json: Option<serde_json::Value> = game
                    .extra_metadata
                    .as_deref()
                    .and_then(|s| serde_json::from_str(s).ok());

                // Read all registered and enabled providers
                let providers_info = state.downloader.get_providers_info().await;
                for prov in providers_info {
                    if !prov.is_enabled {
                        continue;
                    }
                    for slot_decl in &prov.ui_slots {
                        if slot_decl.slot == slot_name {
                            for template in &slot_decl.widgets {
                                match template.widget_type.as_str() {
                                    "stat" => {
                                        let label = template.label.clone().unwrap_or_default();
                                        let mut value = None;
                                        if let (Some(json), Some(key)) = (extra_json.as_ref(), template.value_key.as_deref()) {
                                            if let Some(found_val) = resolve_json_key(json, key) {
                                                if let Some(s) = found_val.as_str() {
                                                    value = Some(s.to_string());
                                                } else if let Some(n) = found_val.as_i64() {
                                                    value = Some(n.to_string());
                                                } else if let Some(n) = found_val.as_f64() {
                                                    value = Some(format!("{:.1}", n));
                                                }
                                            }
                                        }
                                        if let Some(val_str) = value {
                                            widgets.push(SlotWidget::Stat {
                                                label,
                                                value: val_str,
                                                icon: template.icon.clone(),
                                            });
                                        }
                                    }
                                    "progress" => {
                                        let label = template.label.clone().unwrap_or_default();
                                        let mut val_num = 0u64;
                                        let mut max_num = 100u64;
                                        if let (Some(json), Some(key)) = (extra_json.as_ref(), template.value_key.as_deref()) {
                                            if let Some(found) = resolve_json_key(json, key).and_then(|v| v.as_u64()) {
                                                val_num = found;
                                            }
                                        }
                                        if let (Some(json), Some(key)) = (extra_json.as_ref(), template.max_key.as_deref()) {
                                            if let Some(found) = resolve_json_key(json, key).and_then(|v| v.as_u64()) {
                                                max_num = found;
                                            }
                                        }
                                        widgets.push(SlotWidget::Progress {
                                            label,
                                            value: val_num,
                                            max: max_num,
                                        });
                                    }
                                    "text" => {
                                        let mut content_str = template.content.clone();
                                        if let (Some(json), Some(key)) = (extra_json.as_ref(), template.value_key.as_deref()) {
                                            if let Some(found) = resolve_json_key(json, key).and_then(|v| v.as_str()) {
                                                content_str = Some(found.to_string());
                                            }
                                        }
                                        if let Some(c) = content_str {
                                            widgets.push(SlotWidget::Text { content: c });
                                        }
                                    }
                                    "badge-list" => {
                                        let mut badges = Vec::new();
                                        if let (Some(json), Some(key)) = (extra_json.as_ref(), template.value_key.as_deref()) {
                                            if let Some(arr) = resolve_json_key(json, key).and_then(|v| v.as_array()) {
                                                for item in arr {
                                                    if let Some(s) = item.as_str() {
                                                        badges.push(s.to_string());
                                                    }
                                                }
                                            }
                                        }
                                        if !badges.is_empty() {
                                            widgets.push(SlotWidget::BadgeList { badges });
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Fallbacks for system slots if no dynamic plugin widgets were resolved
    if widgets.is_empty() {
        match slot_name.as_str() {
            "details.hero" => {
                widgets.push(SlotWidget::Progress {
                    label: "Obiettivi Sbloccati".to_string(),
                    value: 34,
                    max: 50,
                });
                widgets.push(SlotWidget::Stat {
                    label: "Valutazione Community".to_string(),
                    value: "Molto positiva (92%)".to_string(),
                    icon: Some("thumbs-up".to_string()),
                });
            }
            "bigpicture.hero" => {
                widgets.push(SlotWidget::Progress {
                    label: "Completamento Campagna".to_string(),
                    value: 68,
                    max: 100,
                });
            }
            _ => {}
        }
    }

    // Validate each widget before returning (reject non-conforming widgets)
    let mut validated = Vec::new();
    for widget in widgets {
        match widget.validate() {
            Ok(()) => validated.push(widget),
            Err(e) => {
                eprintln!("Discarding invalid slot widget in '{}': {}", slot_name, e);
            }
        }
    }

    Ok(validated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_resolve_json_key_nested() {
        let data = json!({
            "howlongtobeat": {
                "main_story": "12.5 ore",
                "main_extra": "24 ore",
                "completionist": "50 ore",
                "count": 42
            },
            "achievements": {
                "unlocked": 34,
                "total": 50
            }
        });

        assert_eq!(
            resolve_json_key(&data, "howlongtobeat.main_story").and_then(|v| v.as_str()),
            Some("12.5 ore")
        );
        assert_eq!(
            resolve_json_key(&data, "howlongtobeat.completionist").and_then(|v| v.as_str()),
            Some("50 ore")
        );
        assert_eq!(
            resolve_json_key(&data, "howlongtobeat.count").and_then(|v| v.as_i64()),
            Some(42)
        );
        assert_eq!(
            resolve_json_key(&data, "achievements.unlocked").and_then(|v| v.as_u64()),
            Some(34)
        );
        assert_eq!(resolve_json_key(&data, "nonexistent.key"), None);
        assert_eq!(resolve_json_key(&data, "howlongtobeat.missing"), None);
    }

    #[test]
    fn test_hltb_manifest_slot_declaration_deserialization() {
        let manifest_json = r#"{
            "id": "howlongtobeat",
            "name": "HowLongToBeat Community Extension",
            "version": "1.1.0",
            "author": "HLTB Community",
            "description": "Recupera i tempi stimati di completamento.",
            "plugin_type": "metadata",
            "ui_slots": [
                {
                    "slot": "details.info",
                    "widgets": [
                        {
                            "type": "stat",
                            "label": "Storia Principale",
                            "value_key": "howlongtobeat.main_story",
                            "icon": "clock"
                        },
                        {
                            "type": "stat",
                            "label": "Storia + Extra",
                            "value_key": "howlongtobeat.main_extra",
                            "icon": "compass"
                        },
                        {
                            "type": "stat",
                            "label": "Completamento 100%",
                            "value_key": "howlongtobeat.completionist",
                            "icon": "trophy"
                        }
                    ]
                }
            ]
        }"#;

        let manifest: omnis_sdk::PluginManifest = serde_json::from_str(manifest_json).unwrap();
        assert_eq!(manifest.ui_slots.len(), 1);
        assert_eq!(manifest.ui_slots[0].slot, "details.info");
        assert_eq!(manifest.ui_slots[0].widgets.len(), 3);
        assert_eq!(manifest.ui_slots[0].widgets[0].widget_type, "stat");
        assert_eq!(manifest.ui_slots[0].widgets[0].value_key.as_deref(), Some("howlongtobeat.main_story"));
        assert_eq!(manifest.ui_slots[0].widgets[0].icon.as_deref(), Some("clock"));
    }
}

