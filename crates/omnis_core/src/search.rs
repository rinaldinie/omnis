//! Omnis Game Search Subsystems
//!
//! Omnis partitions search into three distinct layers across the architecture:
//!
//! 1. **In-Memory Fuzzy Index** ([`fuzzy_index`](crate::fuzzy_index)):
//!    Typo-tolerant, sub-millisecond RAM matching across thousands of game titles powered by `nucleo-matcher`.
//! 2. **Local Database Full-Text Search** ([`db::search`](crate::db::GameSearchRepository)):
//!    Local SQLite FTS5 trigram virtual table queries, database-to-RAM cache synchronization, and SQL `LIKE` fallbacks.
//! 3. **External Metadata Candidate Search** ([`metadata::search`](crate::metadata::MetadataSearchEngine)):
//!    Remote HTTP candidate queries across online store APIs (Steam Store, GOG, SteamGridDB, IGDB) for game identification.

pub use crate::fuzzy_index::*;
