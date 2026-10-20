//! Declarative widget contract for plugin slots in Omnis themes.
//!
//! Plugins supply structured data widgets, never executable React components,
//! allowing themes full control over layout and appearance via semantic CSS selectors.

use serde::{Deserialize, Serialize};

/// Link descriptor for link-list widgets
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WidgetLink {
    pub title: String,
    pub url: String,
}

/// Declarative slot widget supported by Omnis theme engine
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SlotWidget {
    /// Single numerical or text metric with optional icon
    #[serde(rename = "stat")]
    Stat {
        label: String,
        value: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
    },
    /// List of tag or status badges
    #[serde(rename = "badge-list")]
    BadgeList {
        badges: Vec<String>,
    },
    /// Quantitative progress bar (e.g. achievements, completion, download)
    #[serde(rename = "progress")]
    Progress {
        label: String,
        value: u64,
        max: u64,
    },
    /// List of external or internal resource links
    #[serde(rename = "link-list")]
    LinkList {
        links: Vec<WidgetLink>,
    },
    /// Informational text paragraph
    #[serde(rename = "text")]
    Text {
        content: String,
    },
}

/// Declarative template for a slot widget defined in a plugin manifest
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SlotWidgetTemplate {
    #[serde(rename = "type")]
    pub widget_type: String, // "stat", "badge-list", "progress", "link-list", "text"
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub value_key: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub max_key: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
}

/// Slot mapping declared by a plugin
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginSlotDeclaration {
    pub slot: String,
    pub widgets: Vec<SlotWidgetTemplate>,
}

impl SlotWidget {
    /// Validate widget data against safety and size boundaries before sending to UI
    pub fn validate(&self) -> Result<(), String> {
        match self {
            SlotWidget::Stat { label, value, icon } => {
                if label.trim().is_empty() {
                    return Err("Stat widget label must not be empty".to_string());
                }
                if label.len() > 100 {
                    return Err("Stat widget label exceeds maximum length of 100 characters".to_string());
                }
                if value.len() > 100 {
                    return Err("Stat widget value exceeds maximum length of 100 characters".to_string());
                }
                if let Some(i) = icon {
                    if i.len() > 50 {
                        return Err("Stat widget icon identifier exceeds maximum length of 50 characters".to_string());
                    }
                }
                Ok(())
            }
            SlotWidget::BadgeList { badges } => {
                if badges.len() > 20 {
                    return Err("Badge-list widget exceeds maximum count of 20 badges".to_string());
                }
                for badge in badges {
                    if badge.trim().is_empty() {
                        return Err("Badge item must not be empty".to_string());
                    }
                    if badge.len() > 50 {
                        return Err("Badge item exceeds maximum length of 50 characters".to_string());
                    }
                }
                Ok(())
            }
            SlotWidget::Progress { label, value, max } => {
                if label.trim().is_empty() {
                    return Err("Progress widget label must not be empty".to_string());
                }
                if label.len() > 100 {
                    return Err("Progress widget label exceeds maximum length of 100 characters".to_string());
                }
                if *max == 0 {
                    return Err("Progress widget max must be greater than 0".to_string());
                }
                if *value > *max * 100 {
                    return Err("Progress widget value is excessively larger than max".to_string());
                }
                Ok(())
            }
            SlotWidget::LinkList { links } => {
                if links.len() > 15 {
                    return Err("Link-list widget exceeds maximum of 15 links".to_string());
                }
                for link in links {
                    if link.title.trim().is_empty() {
                        return Err("Link title must not be empty".to_string());
                    }
                    if link.title.len() > 100 {
                        return Err("Link title exceeds maximum length of 100 characters".to_string());
                    }
                    if link.url.trim().is_empty() {
                        return Err("Link URL must not be empty".to_string());
                    }
                    let lower = link.url.to_lowercase();
                    if lower.starts_with("javascript:") || lower.starts_with("data:") {
                        return Err("Link URL contains prohibited scheme".to_string());
                    }
                }
                Ok(())
            }
            SlotWidget::Text { content } => {
                if content.trim().is_empty() {
                    return Err("Text widget content must not be empty".to_string());
                }
                if content.len() > 2000 {
                    return Err("Text widget content exceeds maximum length of 2000 characters".to_string());
                }
                Ok(())
            }
        }
    }
}
