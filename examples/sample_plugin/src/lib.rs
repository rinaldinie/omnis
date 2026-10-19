use async_trait::async_trait;
use omnis_sdk::{
    export_omnis_plugin, GameMetadataPatch, MetadataField, MetadataProvider, MetadataSearchRequest,
};
use serde_json::{Map, Value};

#[derive(Default)]
pub struct SampleDynamicProvider;

#[async_trait]
impl MetadataProvider for SampleDynamicProvider {
    fn id(&self) -> &str {
        "sample_dynamic"
    }

    fn name(&self) -> &str {
        "Sample Community Plugin"
    }

    fn description(&self) -> &str {
        "Sample external dynamic metadata plugin conforming to Omnis C-ABI FFI contract."
    }

    fn author(&self) -> &str {
        "Omnis Community Developer"
    }

    fn version(&self) -> Option<&str> {
        Some("0.1.0")
    }

    fn supported_fields(&self) -> Vec<MetadataField> {
        vec![
            MetadataField::CriticScore,
            MetadataField::CommunityScore,
            MetadataField::Description,
        ]
    }

    async fn fetch_metadata(
        &self,
        request: &MetadataSearchRequest,
        _settings: &Map<String, Value>,
    ) -> Result<GameMetadataPatch, String> {
        Ok(GameMetadataPatch {
            critic_score: Some(99),
            community_score: Some(95),
            description: Some(format!(
                "Community metadata patch for '{}' via SampleDynamicProvider",
                request.title
            )),
            ..Default::default()
        })
    }

    async fn test_connection(&self, _settings: &Map<String, Value>) -> Result<String, String> {
        Ok("Sample dynamic provider connection OK!".to_string())
    }
}

export_omnis_plugin!(SampleDynamicProvider);
