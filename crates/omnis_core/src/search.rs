use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct SearchItem {
    pub id: Uuid,
    pub title: String,
}

/// In-memory fuzzy search index powered by `nucleo-matcher`.
///
/// Provides typo-tolerant, sub-millisecond search across thousands of game titles.
pub struct FuzzyGameSearchIndex {
    items: Vec<SearchItem>,
    matcher: Mutex<Matcher>,
}

impl Default for FuzzyGameSearchIndex {
    fn default() -> Self {
        Self::new()
    }
}

impl FuzzyGameSearchIndex {
    /// Create an empty fuzzy search index.
    pub fn new() -> Self {
        Self {
            items: Vec::new(),
            matcher: Mutex::new(Matcher::new(Config::DEFAULT)),
        }
    }

    /// Create an index pre-allocated for a known number of titles.
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            items: Vec::with_capacity(capacity),
            matcher: Mutex::new(Matcher::new(Config::DEFAULT)),
        }
    }

    /// Total number of indexed titles.
    pub fn len(&self) -> usize {
        self.items.len()
    }

    /// Whether the index is empty.
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Reset and clear all indexed items.
    pub fn clear(&mut self) {
        self.items.clear();
    }

    /// Rebuild index from a collection of items.
    pub fn build_from_items(&mut self, items: Vec<SearchItem>) {
        self.items = items;
    }

    /// Insert or update a game title.
    pub fn insert_or_update(&mut self, id: Uuid, title: &str) {
        if let Some(item) = self.items.iter_mut().find(|it| it.id == id) {
            item.title = title.to_string();
        } else {
            self.items.push(SearchItem {
                id,
                title: title.to_string(),
            });
        }
    }

    /// Remove a game by ID from the index.
    pub fn remove(&mut self, id: Uuid) {
        self.items.retain(|it| it.id != id);
    }

    /// Perform in-memory fuzzy match across game titles using nucleo-matcher.
    /// Returns a list of (Uuid, score) sorted in descending order of match quality.
    pub fn search(&self, query: &str) -> Vec<(Uuid, u32)> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Vec::new();
        }

        let pattern = Pattern::parse(trimmed, CaseMatching::Ignore, Normalization::Smart);
        let mut matcher = match self.matcher.lock() {
            Ok(m) => m,
            Err(poisoned) => poisoned.into_inner(),
        };

        let mut utf32_buf = Vec::new();
        let mut matches = Vec::new();

        for item in &self.items {
            let haystack = Utf32Str::new(&item.title, &mut utf32_buf);
            if let Some(score) = pattern.score(haystack, &mut matcher) {
                if score > 0 {
                    matches.push((item.id, score));
                }
            }
        }

        // Sort descending by score
        matches.sort_by(|a, b| b.1.cmp(&a.1));
        matches
    }
}
