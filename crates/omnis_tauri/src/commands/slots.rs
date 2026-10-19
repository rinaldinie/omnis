use crate::types::AppState;
use omnis_sdk::{SlotWidget, WidgetLink};
use tauri::State;

/// Retrieves and validates declarative plugin slot widgets for a given slot name
#[tauri::command]
pub fn get_slot_widgets(
    slot_name: String,
    _game_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<Vec<SlotWidget>, String> {
    let mut widgets = Vec::new();

    match slot_name.as_str() {
        "game-card.badges" => {
            widgets.push(SlotWidget::BadgeList {
                badges: vec!["Verificato".to_string(), "Cloud Save".to_string()],
            });
        }
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
        "details.info" => {
            widgets.push(SlotWidget::BadgeList {
                badges: vec![
                    "Singleplayer".to_string(),
                    "Supporto Controller".to_string(),
                    "Steam Deck Verified".to_string(),
                ],
            });
            widgets.push(SlotWidget::LinkList {
                links: vec![
                    WidgetLink {
                        title: "PCGamingWiki Guide".to_string(),
                        url: "https://www.pcgamingwiki.com".to_string(),
                    },
                    WidgetLink {
                        title: "ProtonDB Rating".to_string(),
                        url: "https://www.protondb.com".to_string(),
                    },
                ],
            });
            widgets.push(SlotWidget::Text {
                content: "Ottimizzato per 60 FPS con preset grafici avanzati e rendering a bassa latenza.".to_string(),
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
