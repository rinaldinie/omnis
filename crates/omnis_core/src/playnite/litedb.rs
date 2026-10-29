use std::collections::{HashMap, HashSet};
use chrono::DateTime;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::playnite::PlayniteGameDto;

pub const LITEDB_MAGIC: &[u8] = b"** This is a LiteDB file **";
pub const LITEDB_HEADER_MAGIC_OFFSET: usize = 25;
pub const LITEDB_HEADER_VERSION_OFFSET: usize = 52;
pub const LITEDB_PAGE_HEADER_SIZE: usize = 32;

#[derive(Debug, thiserror::Error)]
pub enum LiteDbError {
    #[error("Invalid LiteDB file: missing magic header")]
    InvalidMagic,
    #[error("Corrupt LiteDB header: unexpected structure or length")]
    CorruptHeader,
    #[error("I/O error reading LiteDB database: {0}")]
    Io(#[from] std::io::Error),
    #[error("BSON parsing error at offset {offset}: {message}")]
    BsonParseError { offset: usize, message: String },
}

/// Parsed BSON element value supported by LiteDB
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum BsonValue {
    Double(f64),
    String(String),
    Document(BsonDocument),
    Array(Vec<BsonValue>),
    Binary(Vec<u8>, u8), // data, subtype
    ObjectId([u8; 12]),
    Boolean(bool),
    DateTime(i64), // UTC timestamp in milliseconds
    Null,
    Int32(i32),
    Int64(i64),
    Decimal128([u8; 16]),
    MinKey,
    MaxKey,
}

impl BsonValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            BsonValue::String(s) => Some(s.as_str()),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            BsonValue::Boolean(b) => Some(*b),
            _ => None,
        }
    }

    pub fn as_u64(&self) -> Option<u64> {
        match self {
            BsonValue::Int32(i) if *i >= 0 => Some(*i as u64),
            BsonValue::Int64(i) if *i >= 0 => Some(*i as u64),
            BsonValue::Double(d) if *d >= 0.0 => Some(*d as u64),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            BsonValue::Int32(i) => Some(*i as i64),
            BsonValue::Int64(i) => Some(*i),
            BsonValue::Double(d) => Some(*d as i64),
            BsonValue::DateTime(ms) => Some(*ms),
            _ => None,
        }
    }

    pub fn as_guid_string(&self) -> Option<String> {
        match self {
            BsonValue::Binary(bytes, _) if bytes.len() == 16 => {
                let mut arr = [0u8; 16];
                arr.copy_from_slice(bytes);
                // .NET GUID mixed-endian order
                Some(Uuid::from_bytes_le(arr).to_string())
            }
            BsonValue::String(s) => {
                let trimmed = s.trim();
                if let Ok(u) = Uuid::parse_str(trimmed) {
                    Some(u.to_string())
                } else if !trimmed.is_empty() {
                    Some(trimmed.to_string())
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    pub fn as_datetime_rfc3339(&self) -> Option<String> {
        match self {
            BsonValue::DateTime(ms) if *ms > 0 => {
                DateTime::from_timestamp_millis(*ms).map(|dt| dt.to_rfc3339())
            }
            BsonValue::Int64(ms) if *ms > 0 => {
                DateTime::from_timestamp_millis(*ms).map(|dt| dt.to_rfc3339())
            }
            BsonValue::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
            _ => None,
        }
    }

    pub fn as_str_array(&self) -> Option<Vec<String>> {
        match self {
            BsonValue::Array(arr) => {
                let items: Vec<String> = arr
                    .iter()
                    .filter_map(|item| match item {
                        BsonValue::String(s) => Some(s.clone()),
                        BsonValue::Document(doc) => doc.get_str("Name").map(|n| n.to_string()),
                        _ => item.as_guid_string(),
                    })
                    .collect();
                if items.is_empty() {
                    None
                } else {
                    Some(items)
                }
            }
            _ => None,
        }
    }
}

pub type BsonDocument = HashMap<String, BsonValue>;

pub trait BsonDocumentExt {
    fn get_str(&self, key: &str) -> Option<&str>;
    fn get_bool(&self, key: &str) -> Option<bool>;
    fn get_u64(&self, key: &str) -> Option<u64>;
    fn get_i64(&self, key: &str) -> Option<i64>;
    fn get_guid_string(&self, key: &str) -> Option<String>;
    fn get_datetime_rfc3339(&self, key: &str) -> Option<String>;
    fn get_str_array(&self, key: &str) -> Option<Vec<String>>;
}

impl BsonDocumentExt for BsonDocument {
    fn get_str(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(BsonValue::as_str)
    }

    fn get_bool(&self, key: &str) -> Option<bool> {
        self.get(key).and_then(BsonValue::as_bool)
    }

    fn get_u64(&self, key: &str) -> Option<u64> {
        self.get(key).and_then(BsonValue::as_u64)
    }

    fn get_i64(&self, key: &str) -> Option<i64> {
        self.get(key).and_then(BsonValue::as_i64)
    }

    fn get_guid_string(&self, key: &str) -> Option<String> {
        self.get(key).and_then(BsonValue::as_guid_string)
    }

    fn get_datetime_rfc3339(&self, key: &str) -> Option<String> {
        self.get(key).and_then(BsonValue::as_datetime_rfc3339)
    }

    fn get_str_array(&self, key: &str) -> Option<Vec<String>> {
        self.get(key).and_then(BsonValue::as_str_array)
    }
}

/// Verify if bytes begin with a valid LiteDB file header.
pub fn is_litedb_buffer(data: &[u8]) -> bool {
    if data.len() < 64 {
        return false;
    }
    if data.len() >= LITEDB_HEADER_MAGIC_OFFSET + LITEDB_MAGIC.len()
        && &data[LITEDB_HEADER_MAGIC_OFFSET..LITEDB_HEADER_MAGIC_OFFSET + LITEDB_MAGIC.len()]
            == LITEDB_MAGIC
    {
        return true;
    }
    // Search within first 4096 bytes in case of alternate page offset
    let search_limit = data.len().min(4096);
    data[..search_limit]
        .windows(LITEDB_MAGIC.len())
        .any(|w| w == LITEDB_MAGIC)
}

/// Detect page size of LiteDB buffer (4096 for v4/version 7, 8192 for v5/version 8).
pub fn detect_page_size(data: &[u8]) -> usize {
    if data.len() >= 64 {
        let last_page_id = u32::from_le_bytes([data[59], data[60], data[61], data[62]]) as usize;
        let version = data[LITEDB_HEADER_VERSION_OFFSET];
        if last_page_id > 0 {
            let total_pages = last_page_id + 1;
            let candidate_size = data.len() / total_pages;
            if candidate_size == 4096 || candidate_size == 8192 {
                return candidate_size;
            }
        }
        if version >= 8 {
            return 8192;
        }
    }
    4096
}

/// Parse a single BSON document from a slice.
/// Returns the parsed document and total consumed bytes on success.
pub fn parse_bson_document(slice: &[u8]) -> Option<(BsonDocument, usize)> {
    if slice.len() < 5 {
        return None;
    }
    let doc_len = u32::from_le_bytes(slice[0..4].try_into().ok()?) as usize;
    if doc_len < 5 || doc_len > slice.len() {
        return None;
    }
    if slice[doc_len - 1] != 0 {
        return None;
    }

    let mut map = HashMap::new();
    let mut pos = 4;
    while pos < doc_len - 1 {
        let elem_type = slice[pos];
        pos += 1;

        // Read C-string element name
        let key_start = pos;
        while pos < doc_len - 1 && slice[pos] != 0 {
            pos += 1;
        }
        if pos >= doc_len - 1 {
            return None;
        }
        let key = std::str::from_utf8(&slice[key_start..pos]).ok()?.to_string();
        pos += 1; // skip null byte

        let value = match elem_type {
            0x01 => {
                // Double (8 bytes)
                if pos + 8 > doc_len {
                    return None;
                }
                let val = f64::from_le_bytes(slice[pos..pos + 8].try_into().ok()?);
                pos += 8;
                BsonValue::Double(val)
            }
            0x02 => {
                // String (4 bytes length + bytes + null)
                if pos + 4 > doc_len {
                    return None;
                }
                let str_len = u32::from_le_bytes(slice[pos..pos + 4].try_into().ok()?) as usize;
                pos += 4;
                if str_len == 0 || pos + str_len > doc_len {
                    return None;
                }
                let s = std::str::from_utf8(&slice[pos..pos + str_len - 1])
                    .ok()?
                    .to_string();
                pos += str_len;
                BsonValue::String(s)
            }
            0x03 => {
                // Embedded document
                let (sub_doc, sub_len) = parse_bson_document(&slice[pos..doc_len])?;
                pos += sub_len;
                BsonValue::Document(sub_doc)
            }
            0x04 => {
                // Array (stored as document with sequential keys "0", "1", ...)
                let (sub_doc, sub_len) = parse_bson_document(&slice[pos..doc_len])?;
                pos += sub_len;
                let mut items = Vec::new();
                let mut idx = 0;
                while let Some(v) = sub_doc.get(&idx.to_string()) {
                    items.push(v.clone());
                    idx += 1;
                }
                if items.is_empty() && !sub_doc.is_empty() {
                    for (_, v) in sub_doc {
                        items.push(v);
                    }
                }
                BsonValue::Array(items)
            }
            0x05 => {
                // Binary (4 bytes length + 1 byte subtype + bytes)
                if pos + 4 > doc_len {
                    return None;
                }
                let bin_len = u32::from_le_bytes(slice[pos..pos + 4].try_into().ok()?) as usize;
                pos += 4;
                if pos + 1 > doc_len {
                    return None;
                }
                let subtype = slice[pos];
                pos += 1;
                if pos + bin_len > doc_len {
                    return None;
                }
                let bytes = slice[pos..pos + bin_len].to_vec();
                pos += bin_len;
                BsonValue::Binary(bytes, subtype)
            }
            0x07 => {
                // ObjectId (12 bytes)
                if pos + 12 > doc_len {
                    return None;
                }
                let mut id = [0u8; 12];
                id.copy_from_slice(&slice[pos..pos + 12]);
                pos += 12;
                BsonValue::ObjectId(id)
            }
            0x08 => {
                // Boolean (1 byte)
                if pos + 1 > doc_len {
                    return None;
                }
                let b = slice[pos] != 0;
                pos += 1;
                BsonValue::Boolean(b)
            }
            0x09 => {
                // UTC datetime (8 bytes i64 ms)
                if pos + 8 > doc_len {
                    return None;
                }
                let dt = i64::from_le_bytes(slice[pos..pos + 8].try_into().ok()?);
                pos += 8;
                BsonValue::DateTime(dt)
            }
            0x0a => {
                // Null
                BsonValue::Null
            }
            0x10 => {
                // 32-bit integer (4 bytes)
                if pos + 4 > doc_len {
                    return None;
                }
                let i = i32::from_le_bytes(slice[pos..pos + 4].try_into().ok()?);
                pos += 4;
                BsonValue::Int32(i)
            }
            0x11 => {
                // Timestamp (8 bytes)
                if pos + 8 > doc_len {
                    return None;
                }
                pos += 8;
                BsonValue::Null
            }
            0x12 => {
                // 64-bit integer (8 bytes)
                if pos + 8 > doc_len {
                    return None;
                }
                let i = i64::from_le_bytes(slice[pos..pos + 8].try_into().ok()?);
                pos += 8;
                BsonValue::Int64(i)
            }
            0x13 => {
                // Decimal128 (16 bytes)
                if pos + 16 > doc_len {
                    return None;
                }
                let mut d = [0u8; 16];
                d.copy_from_slice(&slice[pos..pos + 16]);
                pos += 16;
                BsonValue::Decimal128(d)
            }
            0x7f => BsonValue::MaxKey,
            0xff => BsonValue::MinKey,
            _ => {
                // Unknown or unhandled BSON type
                return None;
            }
        };
        map.insert(key, value);
    }
    Some((map, doc_len))
}

/// Convert a parsed BSON document into a `PlayniteGameDto`.
/// Returns `None` if the document is not a game record.
pub fn bson_doc_to_game_dto(doc: &BsonDocument) -> Option<PlayniteGameDto> {
    let name = doc.get_str("Name")?.to_string();
    if name.trim().is_empty() {
        return None;
    }

    // Must be a Playnite game document: games have GameId or PluginId
    let game_id = doc
        .get_str("GameId")
        .map(|s| s.to_string())
        .or_else(|| doc.get_guid_string("GameId"));

    let plugin_id = doc
        .get_guid_string("PluginId")
        .or_else(|| doc.get_str("PluginId").map(|s| s.to_string()));

    if game_id.is_none() && plugin_id.is_none() {
        return None;
    }

    let final_game_id = game_id.or_else(|| doc.get_guid_string("_id"));

    let playtime = doc
        .get_u64("Playtime")
        .or_else(|| doc.get_u64("PlaytimeSeconds"));
    let play_count = doc.get_u64("PlayCount").map(|c| c as u32);

    let last_activity = doc
        .get_datetime_rfc3339("LastActivity")
        .or_else(|| doc.get_datetime_rfc3339("RecentActivity"));

    let added = doc.get_datetime_rfc3339("Added");

    let favorite = doc.get_bool("Favorite");
    let hidden = doc.get_bool("Hidden");

    let completion = doc
        .get_str("CompletionStatus")
        .map(|s| s.to_string())
        .or_else(|| doc.get_str("Completion").map(|s| s.to_string()));

    let install_directory = doc.get_str("InstallDirectory").map(|s| s.to_string());
    let cover = doc
        .get_str("CoverImage")
        .map(|s| s.to_string())
        .or_else(|| doc.get_str("Cover").map(|s| s.to_string()));
    let background = doc
        .get_str("BackgroundImage")
        .map(|s| s.to_string())
        .or_else(|| doc.get_str("Background").map(|s| s.to_string()));

    let tags = doc.get_str_array("Tags");
    let features = doc.get_str_array("Features");
    let categories = doc.get_str_array("Categories");

    Some(PlayniteGameDto {
        Name: name,
        GameId: final_game_id,
        PluginId: plugin_id,
        PlaytimeSeconds: playtime,
        PlayCount: play_count,
        LastActivity: last_activity,
        Added: added,
        Favorite: favorite,
        Hidden: hidden,
        Tags: tags,
        Features: features,
        Categories: categories,
        Completion: completion,
        InstallDirectory: install_directory,
        Cover: cover,
        Background: background,
    })
}

/// Helper to extract a BSON document from LiteDB pages.
/// If the document fits inside a single page, returns a borrowed slice.
/// If the document spans across multiple pages (via NextPageID pointer in the page header),
/// reassembles the chained chunks into an owned byte vector.
pub fn extract_litedb_document<'a>(
    data: &'a [u8],
    doc_start: usize,
    page_size: usize,
    header_size: usize,
) -> Option<std::borrow::Cow<'a, [u8]>> {
    if doc_start + 4 > data.len() {
        return None;
    }
    let doc_len = u32::from_le_bytes(data[doc_start..doc_start + 4].try_into().ok()?) as usize;
    if doc_len < 5 || doc_len > 16 * 1024 * 1024 {
        return None;
    }

    let curr_page = doc_start / page_size;
    let curr_page_end = (curr_page + 1) * page_size;

    // Fast path: document fits completely within current page
    if doc_start + doc_len <= curr_page_end {
        if doc_start + doc_len <= data.len() && data[doc_start + doc_len - 1] == 0 {
            return Some(std::borrow::Cow::Borrowed(&data[doc_start..doc_start + doc_len]));
        }
        return None;
    }

    // Slow path: document spans across multiple chained pages
    if curr_page_end > data.len() {
        return None;
    }

    let mut buf = Vec::with_capacity(doc_len);
    let first_chunk = &data[doc_start..curr_page_end];
    buf.extend_from_slice(first_chunk);
    let mut bytes_needed = doc_len.saturating_sub(first_chunk.len());

    let curr_page_start = curr_page * page_size;
    if curr_page_start + 13 > data.len() {
        return None;
    }
    let mut next_page_id = u32::from_le_bytes(
        data[curr_page_start + 9..curr_page_start + 13]
            .try_into()
            .ok()?,
    );

    let mut depth = 0;
    while bytes_needed > 0 && next_page_id != u32::MAX && depth < 100 {
        depth += 1;
        let p_start = (next_page_id as usize) * page_size;
        if p_start + header_size > data.len() {
            break;
        }

        let available = (page_size - header_size).min(data.len().saturating_sub(p_start + header_size));
        let take = bytes_needed.min(available);
        buf.extend_from_slice(&data[p_start + header_size..p_start + header_size + take]);
        bytes_needed = bytes_needed.saturating_sub(take);

        if p_start + 13 <= data.len() {
            next_page_id = u32::from_le_bytes(
                data[p_start + 9..p_start + 13]
                    .try_into()
                    .unwrap_or([0xff, 0xff, 0xff, 0xff]),
            );
        } else {
            break;
        }
    }

    if buf.len() == doc_len && buf[doc_len - 1] == 0 {
        Some(std::borrow::Cow::Owned(buf))
    } else {
        None
    }
}

/// Scan a LiteDB binary buffer (from `library/games.db`) and extract all game records.
pub fn scan_litedb_games(data: &[u8]) -> Result<Vec<PlayniteGameDto>, LiteDbError> {
    if !is_litedb_buffer(data) {
        return Err(LiteDbError::InvalidMagic);
    }

    let page_size = detect_page_size(data);
    let version = if data.len() > LITEDB_HEADER_VERSION_OFFSET {
        data[LITEDB_HEADER_VERSION_OFFSET]
    } else {
        7
    };
    let header_size = if version >= 8 { 32 } else { 25 };

    let mut games = Vec::new();
    let mut seen_keys = HashSet::new();

    // Fast search for b"_id\0" pattern across DataPages / ExtendPages
    let marker = b"_id\0";
    let mut pos = 0;
    while pos + marker.len() + 5 <= data.len() {
        if let Some(offset) = data[pos..].windows(marker.len()).position(|w| w == marker) {
            let id_marker_pos = pos + offset;
            if id_marker_pos >= 5 {
                let doc_start = id_marker_pos - 5;
                let elem_type = data[doc_start + 4];
                // Type byte must be Binary (0x05), String (0x02), or ObjectId (0x07)
                if elem_type == 0x05 || elem_type == 0x02 || elem_type == 0x07 {
                    if let Some(doc_bytes) = extract_litedb_document(data, doc_start, page_size, header_size) {
                        if let Some((doc, _)) = parse_bson_document(&doc_bytes) {
                            if let Some(game_dto) = bson_doc_to_game_dto(&doc) {
                                let key = format!(
                                    "{}:{}",
                                    game_dto.PluginId.as_deref().unwrap_or(""),
                                    game_dto.GameId.as_deref().unwrap_or(&game_dto.Name)
                                );
                                if seen_keys.insert(key) {
                                    games.push(game_dto);
                                }
                            }
                        }
                    }
                }
            }
            pos = id_marker_pos + marker.len();
        } else {
            break;
        }
    }

    Ok(games)
}
