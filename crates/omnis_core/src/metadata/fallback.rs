use omnis_sdk::GameMetadataPatch;

/// Generator for fallback metadata when external providers yield no results.
///
/// When external metadata providers (Steam, GOG, IGDB, OpenCritic) do not have an entry
/// for a requested game, this returns minimal truthful metadata: only the known title is set,
/// leaving all unknown fields empty (None / empty Vec) without inventing scores, developers,
/// publishers, platform, tags, or fake descriptions.
pub struct FallbackMetadataGenerator;

impl FallbackMetadataGenerator {
    /// Generate a fallback `GameMetadataPatch` for a game given its title and source library.
    ///
    /// Preserves only the title, leaving all other metadata fields unset so the UI
    /// correctly displays empty state / "N/A" instead of invented values.
    pub fn generate(title: &str, _library: &str) -> GameMetadataPatch {
        GameMetadataPatch {
            name: Some(title.to_string()),
            description: None,
            release_date: None,
            cover_url: None,
            background_url: None,
            icon_url: None,
            critic_score: None,
            community_score: None,
            genres: Vec::new(),
            developers: Vec::new(),
            publishers: Vec::new(),
            tags: Vec::new(),
            features: Vec::new(),
            series: None,
            age_rating: None,
            region: None,
            platform: None,
            custom_links: Vec::new(),
            install_size_bytes: None,
            extra_metadata: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fallback_does_not_invent_metadata() {
        let patch = FallbackMetadataGenerator::generate("The Witcher 3: Wild Hunt", "steam");
        assert_eq!(patch.name.as_deref(), Some("The Witcher 3: Wild Hunt"));
        assert_eq!(patch.description, None);
        assert_eq!(patch.release_date, None);
        assert_eq!(patch.critic_score, None);
        assert_eq!(patch.community_score, None);
        assert!(patch.genres.is_empty());
        assert!(patch.developers.is_empty());
        assert!(patch.publishers.is_empty());
        assert!(patch.tags.is_empty());
        assert!(patch.features.is_empty());
        assert_eq!(patch.platform, None);
    }

    #[test]
    fn test_fallback_non_pc_library_has_no_invented_platform_or_publishers() {
        let patch = FallbackMetadataGenerator::generate("Metroid Dread", "switch");
        assert_eq!(patch.name.as_deref(), Some("Metroid Dread"));
        assert_eq!(patch.platform, None);
        assert!(patch.publishers.is_empty());
        assert!(patch.developers.is_empty());
        assert_eq!(patch.critic_score, None);
        assert_eq!(patch.community_score, None);
    }
}
