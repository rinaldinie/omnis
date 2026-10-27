use async_trait::async_trait;
use tracing::debug;

use super::MetadataDownloader;

/// Trait for downloading and fallback resolution of game artwork and media assets
#[async_trait]
pub trait MediaDownloader: Send + Sync {
    async fn download_image_bytes(&self, url: &str) -> Result<Vec<u8>, String>;
    async fn download_image_with_fallbacks(
        &self,
        url: &str,
        appid_hint: Option<&str>,
    ) -> Result<Vec<u8>, String>;
}

use tracing::debug;

use super::MetadataDownloader;

impl MetadataDownloader {
    pub async fn download_image_bytes(&self, url: &str) -> Result<Vec<u8>, String> {
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Image download error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Image URL returned HTTP {}", resp.status()));
        }

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Failed to read image bytes: {}", e))?;

        Ok(bytes.to_vec())
    }

    /// Download image with intelligent fallback resolution for Steam CDN and alternative formats
    pub async fn download_image_with_fallbacks(
        &self,
        url: &str,
        appid_hint: Option<&str>,
    ) -> Result<Vec<u8>, String> {
        let trimmed_url = url.trim();

        // 1. Attempt original URL
        match self.download_image_bytes(trimmed_url).await {
            Ok(bytes) => return Ok(bytes),
            Err(err) => {
                debug!(
                    "Primary image download failed for {}: {}. Attempting fallbacks...",
                    trimmed_url, err
                );
            }
        }

        // 2. Determine if this is a Steam image or if we have an appid hint
        let appid = appid_hint.map(|s| s.to_string()).or_else(|| {
            if trimmed_url.contains("/steam/apps/") || trimmed_url.contains("/apps/") {
                trimmed_url
                    .split("/apps/")
                    .nth(1)
                    .and_then(|sub| sub.split('/').next())
                    .map(|id| id.to_string())
            } else {
                None
            }
        });

        if let Some(ref aid) = appid {
            if aid.chars().all(|c| c.is_ascii_digit()) {
                let mut fallback_urls = Vec::new();
                if trimmed_url.contains("library_600x900_2x.jpg") {
                    fallback_urls.push(format!(
                        "https://steamcdn-a.akamaihd.net/steam/apps/{}/library_600x900.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900_2x.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/header.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/capsule_616x353.jpg",
                        aid
                    ));
                } else if trimmed_url.contains("library_hero.jpg") {
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_hero.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/page_bg_generated_v6b.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/header.jpg",
                        aid
                    ));
                } else {
                    fallback_urls.push(format!(
                        "https://steamcdn-a.akamaihd.net/steam/apps/{}/library_600x900_2x.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900_2x.jpg",
                        aid
                    ));
                    fallback_urls.push(format!(
                        "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/header.jpg",
                        aid
                    ));
                }

                for fb in fallback_urls {
                    if fb != trimmed_url {
                        if let Ok(bytes) = self.download_image_bytes(&fb).await {
                            debug!("Fallback image download succeeded from {}", fb);
                            return Ok(bytes);
                        }
                    }
                }
            }
        }

        Err(format!(
            "Failed to download image from {} and all fallbacks",
            trimmed_url
        ))
    }

}

#[async_trait]
impl MediaDownloader for MetadataDownloader {
    #[inline]
    async fn download_image_bytes(&self, url: &str) -> Result<Vec<u8>, String> {
        self.download_image_bytes(url).await
    }

    #[inline]
    async fn download_image_with_fallbacks(
        &self,
        url: &str,
        appid_hint: Option<&str>,
    ) -> Result<Vec<u8>, String> {
        self.download_image_with_fallbacks(url, appid_hint).await
    }
}
