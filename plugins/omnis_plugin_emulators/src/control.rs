//! Reads a Switch game's *control* data (official name and icon) from its dump, the same
//! way the emulators fill their game list:
//!
//! 1. list the container entries (NSP = `PFS0`, XCI = `HFS0` "secure" partition);
//! 2. decrypt each NCA header (AES-XTS, `header_key`) until the Control NCA is found;
//! 3. derive the section key: key area (`key_area_key_application_XX`) or, for
//!    rights-ID titles, the title key from the dump's ticket / `title.keys`
//!    (`titlekek_XX`);
//! 4. decrypt the RomFS (AES-CTR) and read `control.nacp` and `icon_*.dat` (JPEG).
//!
//! Only a few kilobytes are read per game. Every candidate key is validated against
//! the RomFS header, so a wrong key can never yield garbage.

use crate::keys::{aes_ctr_apply, aes_ecb_decrypt_block, aes_xts_decrypt, KeySet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Data shown by the emulators in their game list.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ControlData {
    /// Official title (English when available)
    pub name: Option<String>,
    /// 256x256 JPEG icon
    pub icon_jpeg: Option<Vec<u8>>,
}

const NCA_HEADER_SIZE: usize = 0xC00;
const MEDIA_UNIT: u64 = 0x200;
const CONTENT_TYPE_CONTROL: u8 = 2;
const ROMFS_HEADER_SIZE: u64 = 0x50;
const MAX_ENTRIES: u32 = 10_000;
const MAX_TABLE: u64 = 4 * 1024 * 1024;
const MAX_ICON: u64 = 1024 * 1024;

/// A file inside a container, with its absolute offset in the dump.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Entry {
    name: String,
    offset: u64,
    size: u64,
}

/// Reads the control data of the game dump at `path`. Returns `None` if the format is
/// not supported (e.g. compressed NSZ/XCZ contents) or no key opens it.
pub fn read_control(path: &Path, keys: &KeySet) -> Option<ControlData> {
    let header_key = keys.header_key.as_ref()?;
    let mut file = File::open(path).ok()?;
    let entries = list_container(&mut file, path)?;

    let tickets: Vec<([u8; 16], [u8; 16], u8)> = entries
        .iter()
        .filter(|e| e.name.to_lowercase().ends_with(".tik") && e.size <= 0x1000)
        .filter_map(|e| read_at(&mut file, e.offset, e.size as usize).ok())
        .filter_map(|t| parse_ticket(&t))
        .collect();

    for entry in entries
        .iter()
        .filter(|e| e.name.to_lowercase().ends_with(".nca"))
    {
        let Ok(mut header) = read_at(&mut file, entry.offset, NCA_HEADER_SIZE) else {
            continue;
        };
        aes_xts_decrypt(header_key, &mut header, 0x200, 0);
        if &header[0x200..0x204] != b"NCA3" || header[0x205] != CONTENT_TYPE_CONTROL {
            continue;
        }
        if let Some(data) = read_control_nca(&mut file, entry.offset, &header, keys, &tickets) {
            return Some(data);
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

fn list_container(file: &mut File, path: &Path) -> Option<Vec<Entry>> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();
    match ext.as_str() {
        "nsp" | "nsz" => parse_partition(file, 0, *b"PFS0"),
        "xci" | "xcz" => {
            // Some dumps prepend a 0x1000-byte key area before the card header.
            let base = [0u64, 0x1000].into_iter().find(|b| {
                read_at(file, b + 0x100, 4)
                    .map(|m| m == b"HEAD")
                    .unwrap_or(false)
            })?;
            let root_offset = u64_le(&read_at(file, base + 0x130, 8).ok()?, 0);
            let root = parse_partition(file, base + root_offset, *b"HFS0")?;
            let secure = root.iter().find(|e| e.name == "secure")?;
            parse_partition(file, secure.offset, *b"HFS0")
        }
        _ => None,
    }
}

/// Parses a `PFS0` / `HFS0` partition starting at `base`.
fn parse_partition(file: &mut File, base: u64, magic: [u8; 4]) -> Option<Vec<Entry>> {
    let header = read_at(file, base, 0x10).ok()?;
    if header[0..4] != magic {
        return None;
    }
    let count = u32_le(&header, 4);
    let strtab_size = u32_le(&header, 8) as u64;
    let entry_size: u64 = if &magic == b"PFS0" { 0x18 } else { 0x40 };
    let table_size = count as u64 * entry_size + strtab_size;
    if count > MAX_ENTRIES || table_size > MAX_TABLE {
        return None;
    }
    let table = read_at(file, base + 0x10, table_size as usize).ok()?;
    let strtab = &table[(count as u64 * entry_size) as usize..];
    let data_start = base + 0x10 + table_size;

    (0..count as usize)
        .map(|i| {
            let e = &table[i * entry_size as usize..];
            let name_offset = u32_le(e, 16) as usize;
            let name_bytes = strtab.get(name_offset..)?;
            let end = name_bytes.iter().position(|&b| b == 0)?;
            Some(Entry {
                name: String::from_utf8_lossy(&name_bytes[..end]).to_string(),
                offset: data_start + u64_le(e, 0),
                size: u64_le(e, 8),
            })
        })
        .collect()
}

/// Common ticket: (rights ID, encrypted title key, master key revision).
fn parse_ticket(ticket: &[u8]) -> Option<([u8; 16], [u8; 16], u8)> {
    let (sig_size, padding) = match u32_le(ticket, 0) {
        0x10000 | 0x10003 => (0x200, 0x3C),
        0x10001 | 0x10004 => (0x100, 0x3C),
        0x10002 | 0x10005 => (0x3C, 0x40),
        _ => return None,
    };
    let body = 4 + sig_size + padding;
    let b = ticket.get(body..body + 0x170)?;
    if b[0x141] != 0 {
        return None; // personalized ticket: needs the console's private key
    }
    let title_key: [u8; 16] = b[0x40..0x50].try_into().ok()?;
    let rights_id: [u8; 16] = b[0x160..0x170].try_into().ok()?;
    Some((rights_id, title_key, b[0x145]))
}

// ---------------------------------------------------------------------------
// Control NCA
// ---------------------------------------------------------------------------

/// Section 0 of a Control NCA: an AES-CTR encrypted RomFS.
struct RomFsSection {
    nca_offset: u64,
    /// RomFS start, relative to the NCA start
    romfs_offset: u64,
    ctr_high: [u8; 8],
    encrypted: bool,
}

impl RomFsSection {
    /// Reads `len` plain bytes at `offset` within the RomFS.
    fn read(&self, file: &mut File, key: &[u8; 16], offset: u64, len: usize) -> Option<Vec<u8>> {
        let start = self.romfs_offset + offset;
        if !self.encrypted {
            return read_at(file, self.nca_offset + start, len).ok();
        }
        let aligned = start & !0xF;
        let pad = (start - aligned) as usize;
        let total = (pad + len).div_ceil(16) * 16;
        let mut buf = read_at(file, self.nca_offset + aligned, total).ok()?;
        let mut counter = [0u8; 16];
        counter[..8].copy_from_slice(&self.ctr_high);
        counter[8..].copy_from_slice(&(aligned >> 4).to_be_bytes());
        aes_ctr_apply(key, counter, &mut buf);
        Some(buf[pad..pad + len].to_vec())
    }
}

fn read_control_nca(
    file: &mut File,
    nca_offset: u64,
    header: &[u8],
    keys: &KeySet,
    tickets: &[([u8; 16], [u8; 16], u8)],
) -> Option<ControlData> {
    let section_start = u32_le(header, 0x240) as u64 * MEDIA_UNIT;
    let fs = &header[0x400..0x600];
    let (fs_type, hash_type, encryption) = (fs[2], fs[3], fs[4]);
    if fs_type != 0 {
        return None; // not a RomFS
    }
    let data_offset = match hash_type {
        // HierarchicalIntegrity (IVFC): last level holds the RomFS
        3 => {
            if &fs[0x8..0xC] != b"IVFC" {
                return None;
            }
            let levels = u32_le(fs, 0x14).clamp(2, 7) as usize;
            u64_le(fs, 0x18 + (levels - 2) * 0x18)
        }
        // HierarchicalSha256: last layer region holds the data
        2 => {
            let layers = u32_le(fs, 0x2C).clamp(1, 5) as usize;
            u64_le(fs, 0x30 + (layers - 1) * 0x10)
        }
        _ => return None,
    };
    let mut ctr_high = [0u8; 8];
    for (i, b) in fs[0x140..0x148].iter().rev().enumerate() {
        ctr_high[i] = *b;
    }
    let section = RomFsSection {
        nca_offset,
        romfs_offset: section_start + data_offset,
        ctr_high,
        encrypted: encryption == 3,
    };
    if encryption != 1 && encryption != 3 {
        return None;
    }

    let key_generation = header[0x206].max(header[0x220]);
    let revision = key_generation.saturating_sub(1);
    let rights_id: [u8; 16] = header[0x230..0x240].try_into().ok()?;

    let key = candidate_keys(header, keys, tickets, revision, &rights_id)
        .into_iter()
        .find(|k| {
            section
                .read(file, k, 0, 8)
                .map(|h| u64_le(&h, 0) == ROMFS_HEADER_SIZE)
                .unwrap_or(false)
        })?;

    read_romfs_control(file, &section, &key)
}

/// Section key candidates, most likely first.
fn candidate_keys(
    header: &[u8],
    keys: &KeySet,
    tickets: &[([u8; 16], [u8; 16], u8)],
    revision: u8,
    rights_id: &[u8; 16],
) -> Vec<[u8; 16]> {
    let mut out = Vec::new();
    if rights_id.iter().all(|&b| b == 0) {
        // Standard crypto: key area entry 2 (CTR), wrapped with the key-area key
        let wrapped: [u8; 16] = header[0x300 + 0x20..0x300 + 0x30]
            .try_into()
            .unwrap_or_default();
        for kak in ordered(&keys.key_area_keys, revision) {
            out.push(aes_ecb_decrypt_block(&kak, &wrapped));
        }
    } else {
        // Title-key crypto: from the dump's ticket or the emulator's title.keys
        let mut wrapped_keys: Vec<([u8; 16], u8)> = tickets
            .iter()
            .filter(|(r, _, _)| r == rights_id)
            .map(|(_, k, rev)| (*k, *rev))
            .collect();
        if let Some(k) = keys.title_keys.get(rights_id) {
            wrapped_keys.push((*k, revision));
            out.push(*k); // some tools store title keys already unwrapped
        }
        for (wrapped, rev) in wrapped_keys {
            for kek in ordered(&keys.titlekeks, rev) {
                out.push(aes_ecb_decrypt_block(&kek, &wrapped));
            }
        }
    }
    out
}

/// Keys with the expected revision first, then every other one.
fn ordered(map: &std::collections::HashMap<u8, [u8; 16]>, preferred: u8) -> Vec<[u8; 16]> {
    let mut revs: Vec<u8> = map.keys().copied().collect();
    revs.sort_by_key(|r| (*r != preferred, *r));
    revs.iter().map(|r| map[r]).collect()
}

/// Walks the RomFS file table for `control.nacp` and the icon.
fn read_romfs_control(
    file: &mut File,
    section: &RomFsSection,
    key: &[u8; 16],
) -> Option<ControlData> {
    let header = section.read(file, key, 0, ROMFS_HEADER_SIZE as usize)?;
    let file_meta_offset = u64_le(&header, 7 * 8);
    let file_meta_size = u64_le(&header, 8 * 8);
    let data_offset = u64_le(&header, 9 * 8);
    if file_meta_size > MAX_TABLE {
        return None;
    }
    let table = section.read(file, key, file_meta_offset, file_meta_size as usize)?;

    let mut files: Vec<(String, u64, u64)> = Vec::new();
    let mut pos = 0usize;
    while pos + 0x20 <= table.len() {
        let offset = u64_le(&table, pos + 8);
        let size = u64_le(&table, pos + 0x10);
        let name_len = u32_le(&table, pos + 0x1C) as usize;
        let Some(name) = table.get(pos + 0x20..pos + 0x20 + name_len) else {
            break;
        };
        files.push((String::from_utf8_lossy(name).to_string(), offset, size));
        pos += 0x20 + name_len.div_ceil(4) * 4;
    }

    let read_file = |file: &mut File, name_matches: &dyn Fn(&str) -> bool, max: u64| {
        files
            .iter()
            .find(|(n, _, s)| name_matches(n) && *s <= max)
            .and_then(|(_, off, size)| section.read(file, key, data_offset + off, *size as usize))
    };

    let name = read_file(file, &|n| n == "control.nacp", 0x4000).and_then(|n| nacp_title(&n));
    let icon = read_file(file, &|n| n == "icon_AmericanEnglish.dat", MAX_ICON)
        .or_else(|| {
            read_file(
                file,
                &|n| n.starts_with("icon_") && n.ends_with(".dat"),
                MAX_ICON,
            )
        })
        .filter(|jpeg| jpeg.starts_with(&[0xFF, 0xD8]));

    Some(ControlData {
        name,
        icon_jpeg: icon,
    })
}

/// Title from `control.nacp`: American English, then British English, then the first
/// non-empty language. Trademark symbols are dropped for cleaner library titles.
pub fn nacp_title(nacp: &[u8]) -> Option<String> {
    let title_of = |lang: usize| -> Option<String> {
        let raw = nacp.get(lang * 0x300..lang * 0x300 + 0x200)?;
        let end = raw.iter().position(|&b| b == 0).unwrap_or(raw.len());
        let s: String = String::from_utf8_lossy(&raw[..end])
            .chars()
            .filter(|c| !matches!(c, '™' | '®' | '©'))
            .collect();
        let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
        (!s.is_empty()).then_some(s)
    };
    title_of(0)
        .or_else(|| title_of(1))
        .or_else(|| (2..16).find_map(title_of))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn read_at(file: &mut File, offset: u64, len: usize) -> std::io::Result<Vec<u8>> {
    file.seek(SeekFrom::Start(offset))?;
    let mut buf = vec![0u8; len];
    file.read_exact(&mut buf)?;
    Ok(buf)
}

fn u32_le(b: &[u8], at: usize) -> u32 {
    b.get(at..at + 4)
        .and_then(|s| s.try_into().ok())
        .map(u32::from_le_bytes)
        .unwrap_or(0)
}

fn u64_le(b: &[u8], at: usize) -> u64 {
    b.get(at..at + 8)
        .and_then(|s| s.try_into().ok())
        .map(u64::from_le_bytes)
        .unwrap_or(0)
}
