use crate::types::AppState;
use omnis_core::ProviderInfo;
use omnis_sdk::{Game, SlotWidget, SlotWidgetTemplate};
use uuid::Uuid;

/// Helper function to resolve a dotted value key (e.g. "howlongtobeat.main_story") from a JSON value
pub fn resolve_json_key<'a>(val: &'a serde_json::Value, path: &str) -> Option<&'a serde_json::Value> {
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

pub struct SlotWidgetResolver;

impl SlotWidgetResolver {
    pub const NATIVE_SLOTS: &'static [&'static str] = &["details.hero", "fullscreen.hero", "bigpicture.hero"];

    /// Resolves and validates all slot widgets (from plugins and native fallbacks)
    pub async fn resolve_for_slot(
        state: &AppState,
        slot_name: &str,
        game_id: Option<&str>,
    ) -> Vec<SlotWidget> {
        let Some(gid_str) = game_id else {
            return Vec::new();
        };

        let is_native_slot = Self::NATIVE_SLOTS.contains(&slot_name);
        let providers_info = state.downloader.get_providers_info().await;
        let has_matching_slot = providers_info
            .iter()
            .filter(|p| p.is_enabled)
            .any(|prov| prov.ui_slots.iter().any(|s| s.slot == slot_name));

        if !is_native_slot && !has_matching_slot {
            return Vec::new();
        }

        let Ok(gid) = Uuid::parse_str(gid_str) else {
            return Vec::new();
        };

        let Ok(Some(game)) = state.db.get_game_by_id(gid) else {
            return Vec::new();
        };

        let extra_json: Option<serde_json::Value> = game
            .extra_metadata
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok());

        let mut widgets = Self::resolve_plugin_widgets(&providers_info, slot_name, extra_json.as_ref());

        if widgets.is_empty() {
            widgets = Self::resolve_native_fallback(slot_name, &game, extra_json.as_ref());
        }

        Self::validate_widgets(widgets, slot_name)
    }

    /// Resolves declarative plugin widgets defined in provider manifests
    pub fn resolve_plugin_widgets(
        providers_info: &[ProviderInfo],
        slot_name: &str,
        extra_json: Option<&serde_json::Value>,
    ) -> Vec<SlotWidget> {
        let mut widgets = Vec::new();

        for prov in providers_info {
            if !prov.is_enabled {
                continue;
            }
            for slot_decl in &prov.ui_slots {
                if slot_decl.slot == slot_name {
                    for template in &slot_decl.widgets {
                        if let Some(widget) = Self::build_widget_from_template(template, extra_json) {
                            widgets.push(widget);
                        }
                    }
                }
            }
        }

        widgets
    }

    fn build_widget_from_template(
        template: &SlotWidgetTemplate,
        extra_json: Option<&serde_json::Value>,
    ) -> Option<SlotWidget> {
        match template.widget_type.as_str() {
            "stat" => {
                let label = template.label.clone().unwrap_or_default();
                let mut value = None;
                if let (Some(json), Some(key)) = (extra_json, template.value_key.as_deref()) {
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
                value.map(|val_str| SlotWidget::Stat {
                    label,
                    value: val_str,
                    icon: template.icon.clone(),
                })
            }
            "progress" => {
                let label = template.label.clone().unwrap_or_default();
                let mut val_num = 0u64;
                let mut max_num = 100u64;
                if let (Some(json), Some(key)) = (extra_json, template.value_key.as_deref()) {
                    if let Some(found) = resolve_json_key(json, key).and_then(|v| v.as_u64()) {
                        val_num = found;
                    }
                }
                if let (Some(json), Some(key)) = (extra_json, template.max_key.as_deref()) {
                    if let Some(found) = resolve_json_key(json, key).and_then(|v| v.as_u64()) {
                        max_num = found;
                    }
                }
                Some(SlotWidget::Progress {
                    label,
                    value: val_num,
                    max: max_num,
                })
            }
            "text" => {
                let mut content_str = template.content.clone();
                if let (Some(json), Some(key)) = (extra_json, template.value_key.as_deref()) {
                    if let Some(found) = resolve_json_key(json, key).and_then(|v| v.as_str()) {
                        content_str = Some(found.to_string());
                    }
                }
                content_str.map(|c| SlotWidget::Text { content: c })
            }
            "badge-list" => {
                let mut badges = Vec::new();
                if let (Some(json), Some(key)) = (extra_json, template.value_key.as_deref()) {
                    if let Some(arr) = resolve_json_key(json, key).and_then(|v| v.as_array()) {
                        for item in arr {
                            if let Some(s) = item.as_str() {
                                badges.push(s.to_string());
                            }
                        }
                    }
                }
                if !badges.is_empty() {
                    Some(SlotWidget::BadgeList { badges })
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    /// Resolves built-in native fallback widgets from core game properties
    pub fn resolve_native_fallback(
        slot_name: &str,
        game: &Game,
        extra_json: Option<&serde_json::Value>,
    ) -> Vec<SlotWidget> {
        let mut widgets = Vec::new();

        match slot_name {
            "details.hero" => {
                if let Some(json) = extra_json {
                    let total = resolve_json_key(json, "achievements.total")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    let unlocked = resolve_json_key(json, "achievements.unlocked")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    if total > 0 {
                        if unlocked > 0 {
                            widgets.push(SlotWidget::Progress {
                                label: "Obiettivi Sbloccati".to_string(),
                                value: unlocked,
                                max: total,
                            });
                        } else {
                            widgets.push(SlotWidget::Stat {
                                label: "Obiettivi Steam".to_string(),
                                value: format!("{} disponibili", total),
                                icon: Some("award".to_string()),
                            });
                        }
                    }
                }

                if let Some(score) = game.community_score {
                    let score_label = if score >= 85 {
                        format!("Molto positiva ({}%)", score)
                    } else if score >= 70 {
                        format!("Positiva ({}%)", score)
                    } else if score >= 50 {
                        format!("Nella media ({}%)", score)
                    } else {
                        format!("Mista ({}%)", score)
                    };
                    widgets.push(SlotWidget::Stat {
                        label: "Valutazione Community".to_string(),
                        value: score_label,
                        icon: Some("thumbs-up".to_string()),
                    });
                }
            }
            "fullscreen.hero" | "bigpicture.hero" => {
                if let Some(json) = extra_json {
                    let total = resolve_json_key(json, "achievements.total")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    let unlocked = resolve_json_key(json, "achievements.unlocked")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    if total > 0 && unlocked > 0 {
                        widgets.push(SlotWidget::Progress {
                            label: "Obiettivi Sbloccati".to_string(),
                            value: unlocked,
                            max: total,
                        });
                    }
                }
            }
            _ => {}
        }

        widgets
    }

    /// Filters and validates widgets according to SDK constraints
    pub fn validate_widgets(widgets: Vec<SlotWidget>, slot_name: &str) -> Vec<SlotWidget> {
        let mut validated = Vec::new();
        for widget in widgets {
            match widget.validate() {
                Ok(()) => validated.push(widget),
                Err(e) => {
                    eprintln!("Discarding invalid slot widget in '{}': {}", slot_name, e);
                }
            }
        }
        validated
    }
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

    #[test]
    fn test_achievements_json_extraction_real_values() {
        let steam_extra = json!({
            "achievements": {
                "total": 51,
                "unlocked": 12
            }
        });

        let total = resolve_json_key(&steam_extra, "achievements.total")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let unlocked = resolve_json_key(&steam_extra, "achievements.unlocked")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        assert_eq!(total, 51);
        assert_eq!(unlocked, 12);

        let progress = SlotWidget::Progress {
            label: "Obiettivi Sbloccati".to_string(),
            value: unlocked,
            max: total,
        };
        assert!(progress.validate().is_ok());

        // Zero unlocked test
        let steam_extra_zero = json!({
            "achievements": {
                "total": 30,
                "unlocked": 0
            }
        });
        let total_zero = resolve_json_key(&steam_extra_zero, "achievements.total")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let unlocked_zero = resolve_json_key(&steam_extra_zero, "achievements.unlocked")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        assert_eq!(total_zero, 30);
        assert_eq!(unlocked_zero, 0);

        let stat = SlotWidget::Stat {
            label: "Obiettivi Steam".to_string(),
            value: format!("{} disponibili", total_zero),
            icon: Some("award".to_string()),
        };
        assert!(stat.validate().is_ok());
    }

    #[test]
    fn test_native_slot_whitelist() {
        assert!(SlotWidgetResolver::NATIVE_SLOTS.contains(&"details.hero"));
        assert!(SlotWidgetResolver::NATIVE_SLOTS.contains(&"fullscreen.hero"));
        assert!(SlotWidgetResolver::NATIVE_SLOTS.contains(&"bigpicture.hero"));
        assert!(!SlotWidgetResolver::NATIVE_SLOTS.contains(&"game-card.badges"));
        assert!(!SlotWidgetResolver::NATIVE_SLOTS.contains(&"random.unknown.slot"));
    }
}
