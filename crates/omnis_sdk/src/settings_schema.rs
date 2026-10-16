use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SettingType {
    String { default: Option<String>, placeholder: Option<String>, regex: Option<String> },
    SecretString { placeholder: Option<String> },
    Boolean { default: bool },
    Integer { default: Option<i64>, min: Option<i64>, max: Option<i64> },
    Path { is_directory: bool },
    Enum { options: Vec<String>, default: Option<String> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SettingField {
    pub key: String,
    pub label: String,
    pub description: Option<String>,
    pub required: bool,
    #[serde(flatten)]
    pub field_type: SettingType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SettingGroup {
    pub id: String,
    pub title: String,
    pub fields: Vec<SettingField>,
}

/// Declarative schema exposed by a plugin for zero-UI settings configuration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginSettingsSchema {
    pub plugin_id: String,
    pub title: String,
    pub groups: Vec<SettingGroup>,
}
