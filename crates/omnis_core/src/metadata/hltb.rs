use std::collections::HashMap;
use std::sync::Arc;
use serde_json::{Map, Value};
use tokio::sync::RwLock;
use omnis_sdk::{MetadataProvider, MetadataSearchRequest};

use super::types::*;

/// Service dedicated to retrieving completion times from HowLongToBeat
pub struct HltbEnrichmentService;

impl HltbEnrichmentService {
    /// Fetches completion times from HowLongToBeat provider or applies fallback heuristics
    pub async fn fetch_hltb_times(
        providers: &Arc<RwLock<HashMap<String, Box<dyn MetadataProvider>>>>,
        settings_cache: &Arc<RwLock<HashMap<String, Map<String, Value>>>>,
        title: &str,
    ) -> (String, String, String) {
        let providers_guard = providers.read().await;
        if let Some(prov) = providers_guard.get("howlongtobeat") {
            let request = MetadataSearchRequest {
                title: title.to_string(),
                external_id: None,
                library_id: "all".to_string(),
            };
            let settings_guard = settings_cache.read().await;
            let settings = settings_guard
                .get("howlongtobeat")
                .cloned()
                .unwrap_or_default();
            if let Ok(patch) = prov.fetch_metadata(&request, &settings).await {
                if let Some(extra_str) = patch.extra_metadata {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&extra_str) {
                        if let Some(hltb) = v.get("howlongtobeat") {
                            let main_s = hltb
                                .get("main_story")
                                .and_then(|x| x.as_str())
                                .unwrap_or("N/D")
                                .to_string();
                            let extra_s = hltb
                                .get("main_extra")
                                .and_then(|x| x.as_str())
                                .unwrap_or("N/D")
                                .to_string();
                            let comp_s = hltb
                                .get("completionist")
                                .and_then(|x| x.as_str())
                                .unwrap_or("N/D")
                                .to_string();
                            return (main_s, extra_s, comp_s);
                        }
                    }
                }
            }
        }
        ExternalMetadataProvider::fallback_hltb_times(title)
    }
}
