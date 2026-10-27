use crate::types::{game_to_dto, AppState, GameDto, ImageCache};
use omnis_core::{Database, MetadataCandidateDto, MetadataDownloader};
use omnis_sdk::{Game, GameMetadataPatch, MetadataField};
use std::path::Path;
use tracing::warn;
use uuid::Uuid;

/// Orchestrates applying external metadata candidates onto an existing game record,
/// handling Steam AppID heuristics, asset image downloads, cache management,
/// and database persistence.
pub struct CandidateMetadataApplier<'a> {
    pub db: &'a Database,
    pub downloader: &'a MetadataDownloader,
    pub image_cache: &'a ImageCache,
    pub covers_dir: &'a Path,
    pub backgrounds_dir: &'a Path,
}

impl<'a> CandidateMetadataApplier<'a> {
    pub fn new(
        db: &'a Database,
        downloader: &'a MetadataDownloader,
        image_cache: &'a ImageCache,
        covers_dir: &'a Path,
        backgrounds_dir: &'a Path,
    ) -> Self {
        Self {
            db,
            downloader,
            image_cache,
            covers_dir,
            backgrounds_dir,
        }
    }

    pub fn from_state(state: &'a AppState) -> Self {
        Self {
            db: &state.db,
            downloader: &state.downloader,
            image_cache: &state.image_cache,
            covers_dir: &state.covers_dir,
            backgrounds_dir: &state.backgrounds_dir,
        }
    }

    /// Resolves the candidate and applies all specified fields onto the game.
    pub async fn apply_candidate(
        &self,
        game_id: &str,
        candidate: &MetadataCandidateDto,
        fields: &[MetadataField],
    ) -> Result<GameDto, String> {
        let uuid = Uuid::parse_str(game_id).map_err(|e| e.to_string())?;
        let existing_game = self
            .db
            .get_game_by_id(uuid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Gioco non trovato".to_string())?;

        let appid_hint = Self::resolve_appid_hint(&existing_game, candidate);
        let patch = self
            .build_patch(uuid, &existing_game, candidate, fields, appid_hint.as_deref())
            .await;

        self.db
            .apply_metadata_patch(uuid, &patch)
            .map_err(|e| e.to_string())?;

        let updated_game = self
            .db
            .get_game_by_id(uuid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Gioco non trovato".to_string())?;

        if let Some(ref p) = updated_game.cover_image_path {
            self.image_cache.invalidate(p);
        }
        if let Some(ref p) = updated_game.background_image_path {
            self.image_cache.invalidate(p);
        }

        Ok(game_to_dto(updated_game, self.image_cache))
    }

    pub fn resolve_appid_hint(
        existing_game: &Game,
        candidate: &MetadataCandidateDto,
    ) -> Option<String> {
        if candidate.provider_id == "steam" {
            if candidate.provider_game_id.chars().all(|c| c.is_ascii_digit()) {
                Some(candidate.provider_game_id.clone())
            } else if existing_game.library_id == "steam" {
                Some(existing_game.external_id.clone())
            } else {
                None
            }
        } else {
            None
        }
    }

    async fn build_patch(
        &self,
        uuid: Uuid,
        existing_game: &Game,
        candidate: &MetadataCandidateDto,
        fields: &[MetadataField],
        appid_hint: Option<&str>,
    ) -> GameMetadataPatch {
        let mut patch = GameMetadataPatch::default();

        for field in fields {
            match field {
                MetadataField::CoverImage => {
                    let cover_url = candidate
                        .cover_url
                        .as_deref()
                        .or(candidate.raw_patch.cover_url.as_deref());
                    if let Some(url) = cover_url {
                        if let Some(saved_path) = self
                            .download_and_store_image(
                                url,
                                self.covers_dir,
                                uuid,
                                appid_hint,
                                existing_game.cover_image_path.as_deref(),
                            )
                            .await
                        {
                            patch.cover_url = Some(saved_path);
                        }
                    }
                }
                MetadataField::BackgroundImage => {
                    let bg_url = candidate
                        .background_url
                        .as_deref()
                        .or(candidate.raw_patch.background_url.as_deref());
                    if let Some(url) = bg_url {
                        if let Some(saved_path) = self
                            .download_and_store_image(
                                url,
                                self.backgrounds_dir,
                                uuid,
                                appid_hint,
                                existing_game.background_image_path.as_deref(),
                            )
                            .await
                        {
                            patch.background_url = Some(saved_path);
                        }
                    }
                }
                MetadataField::Icon => {
                    if let Some(ref icon) = candidate.raw_patch.icon_url {
                        let icon_trim = icon.trim();
                        if !icon_trim.is_empty() {
                            patch.icon_url = Some(icon_trim.to_string());
                        }
                    }
                }
                MetadataField::CriticScore => {
                    if candidate.raw_patch.critic_score.is_some() {
                        patch.critic_score = candidate.raw_patch.critic_score;
                    }
                }
                MetadataField::CommunityScore => {
                    if candidate.raw_patch.community_score.is_some() {
                        patch.community_score = candidate.raw_patch.community_score;
                    }
                }
                MetadataField::Description => {
                    let desc = candidate
                        .description
                        .as_deref()
                        .or(candidate.raw_patch.description.as_deref());
                    if let Some(d) = desc {
                        let d_trim = d.trim();
                        if !d_trim.is_empty() {
                            patch.description = Some(d_trim.to_string());
                        }
                    }
                }
                MetadataField::ReleaseDate => {
                    if let Some(ref rd) = candidate.raw_patch.release_date {
                        let rd_trim = rd.trim();
                        if !rd_trim.is_empty() {
                            patch.release_date = Some(rd_trim.to_string());
                        }
                    } else if let Some(year) = candidate.release_year {
                        patch.release_date = Some(year.to_string());
                    }
                }
                MetadataField::Genres => {
                    if !candidate.raw_patch.genres.is_empty() {
                        patch.genres = candidate.raw_patch.genres.clone();
                    }
                }
                MetadataField::Developers => {
                    if !candidate.raw_patch.developers.is_empty() {
                        patch.developers = candidate.raw_patch.developers.clone();
                    }
                }
                MetadataField::Publishers => {
                    if !candidate.raw_patch.publishers.is_empty() {
                        patch.publishers = candidate.raw_patch.publishers.clone();
                    }
                }
            }
        }

        patch
    }

    async fn download_and_store_image(
        &self,
        raw_url: &str,
        target_dir: &Path,
        uuid: Uuid,
        appid_hint: Option<&str>,
        old_image_path: Option<&str>,
    ) -> Option<String> {
        let url_trim = raw_url.trim();
        if url_trim.is_empty() {
            return None;
        }

        if !url_trim.starts_with("http://") && !url_trim.starts_with("https://") {
            return Some(url_trim.to_string());
        }

        let _ = std::fs::create_dir_all(target_dir);
        let now_ts = chrono::Utc::now().timestamp_millis();
        let dest = target_dir.join(format!("{}_{}.jpg", uuid, now_ts));

        match self
            .downloader
            .download_image_with_fallbacks(url_trim, appid_hint)
            .await
        {
            Ok(bytes) => {
                if let Err(e) = std::fs::write(&dest, bytes) {
                    warn!(
                        "Impossibile scrivere immagine su disco {}: {}",
                        dest.display(),
                        e
                    );
                    Some(url_trim.to_string())
                } else {
                    // Clean up old image file if managed by omnis
                    if let Some(old_path_str) = old_image_path {
                        let old_path = Path::new(old_path_str);
                        if old_path.exists()
                            && old_path.starts_with(target_dir)
                            && old_path != &dest
                        {
                            let _ = std::fs::remove_file(old_path);
                        }
                        self.image_cache.invalidate(old_path_str);
                    }
                    let dest_str = dest.to_string_lossy().to_string();
                    self.image_cache.invalidate(&dest_str);
                    Some(dest_str)
                }
            }
            Err(e) => {
                warn!("Download immagine fallito da {}: {}", url_trim, e);
                Some(url_trim.to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_appid_hint_digit_steam() {
        let game = Game::new("custom".to_string(), "non_numeric".to_string(), "Test Game".to_string());

        let candidate = MetadataCandidateDto {
            provider_id: "steam".to_string(),
            provider_game_id: "730".to_string(),
            title: "Counter-Strike 2".to_string(),
            release_year: Some(2012),
            cover_url: None,
            background_url: None,
            description: None,
            raw_patch: GameMetadataPatch::default(),
        };

        let hint = CandidateMetadataApplier::resolve_appid_hint(&game, &candidate);
        assert_eq!(hint, Some("730".to_string()));
    }

    #[test]
    fn test_resolve_appid_hint_fallback_to_steam_library_external_id() {
        let game = Game::new("steam".to_string(), "570".to_string(), "Dota 2".to_string());

        let candidate = MetadataCandidateDto {
            provider_id: "steam".to_string(),
            provider_game_id: "app-dota2".to_string(), // non numeric
            title: "Dota 2".to_string(),
            release_year: Some(2013),
            cover_url: None,
            background_url: None,
            description: None,
            raw_patch: GameMetadataPatch::default(),
        };

        let hint = CandidateMetadataApplier::resolve_appid_hint(&game, &candidate);
        assert_eq!(hint, Some("570".to_string()));
    }

    #[test]
    fn test_resolve_appid_hint_non_steam_provider() {
        let game = Game::new("steam".to_string(), "570".to_string(), "Dota 2".to_string());

        let candidate = MetadataCandidateDto {
            provider_id: "igdb".to_string(),
            provider_game_id: "12345".to_string(),
            title: "Dota 2".to_string(),
            release_year: Some(2013),
            cover_url: None,
            background_url: None,
            description: None,
            raw_patch: GameMetadataPatch::default(),
        };

        let hint = CandidateMetadataApplier::resolve_appid_hint(&game, &candidate);
        assert_eq!(hint, None);
    }
}
