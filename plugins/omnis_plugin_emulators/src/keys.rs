//! Console keys already provided by the user to their emulator (`prod.keys` /
//! `title.keys`), used read-only and in memory to open the "control" section of their
//! game dumps (icon and official title).
//!
//! Omnis never ships, copies, stores or transmits keys: they are read from the
//! emulator's own folder at scan time and dropped right after.

use std::collections::HashMap;
use std::path::Path;

/// Keys needed to read a game's control data.
#[derive(Default, Clone)]
pub struct KeySet {
    /// `header_key`: AES-128-XTS key pair for NCA headers
    pub header_key: Option<[u8; 32]>,
    /// `key_area_key_application_XX`, by master key revision
    pub key_area_keys: HashMap<u8, [u8; 16]>,
    /// `titlekek_XX`, by master key revision
    pub titlekeks: HashMap<u8, [u8; 16]>,
    /// `title.keys`: rights ID -> title key (as stored by the emulator)
    pub title_keys: HashMap<[u8; 16], [u8; 16]>,
}

// Never print key material.
impl std::fmt::Debug for KeySet {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("KeySet")
            .field("header_key", &self.header_key.is_some())
            .field("key_area_keys", &self.key_area_keys.len())
            .field("titlekeks", &self.titlekeks.len())
            .field("title_keys", &self.title_keys.len())
            .finish()
    }
}

impl KeySet {
    /// Whether the set can decrypt NCA headers and key areas at all.
    pub fn is_usable(&self) -> bool {
        self.header_key.is_some() && !self.key_area_keys.is_empty()
    }

    /// Adds keys from a `prod.keys` file content, keeping keys already present.
    pub fn add_prod_keys(&mut self, content: &str) {
        for (name, value) in parse_key_file(content) {
            if name == "header_key" {
                if self.header_key.is_none() {
                    self.header_key = to_array::<32>(&value);
                }
            } else if let Some(rev) = suffix_revision(&name, "key_area_key_application_") {
                if let Some(k) = to_array::<16>(&value) {
                    self.key_area_keys.entry(rev).or_insert(k);
                }
            } else if let Some(rev) = suffix_revision(&name, "titlekek_") {
                if let Some(k) = to_array::<16>(&value) {
                    self.titlekeks.entry(rev).or_insert(k);
                }
            }
        }
    }

    /// Adds entries from a `title.keys` file content.
    pub fn add_title_keys(&mut self, content: &str) {
        for (name, value) in parse_key_file(content) {
            if let (Some(rights), Some(key)) = (
                hex_decode(&name).and_then(|v| to_array::<16>(&v)),
                to_array::<16>(&value),
            ) {
                self.title_keys.entry(rights).or_insert(key);
            }
        }
    }

    /// Loads `prod.keys` and `title.keys` from an emulator keys folder.
    pub fn add_from_dir(&mut self, dir: &Path) {
        if let Ok(c) = std::fs::read_to_string(dir.join("prod.keys")) {
            self.add_prod_keys(&c);
        }
        if let Ok(c) = std::fs::read_to_string(dir.join("title.keys")) {
            self.add_title_keys(&c);
        }
    }
}

/// `name = hexvalue` lines; comments and malformed lines are skipped.
fn parse_key_file(content: &str) -> Vec<(String, Vec<u8>)> {
    content
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
                return None;
            }
            let (name, value) = line.split_once('=')?;
            Some((name.trim().to_lowercase(), hex_decode(value.trim())?))
        })
        .collect()
}

fn suffix_revision(name: &str, prefix: &str) -> Option<u8> {
    u8::from_str_radix(name.strip_prefix(prefix)?, 16).ok()
}

fn to_array<const N: usize>(v: &[u8]) -> Option<[u8; N]> {
    v.try_into().ok()
}

pub fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok())
        .collect()
}

// ---------------------------------------------------------------------------
// AES primitives used by the Switch content formats
// ---------------------------------------------------------------------------

use aes::cipher::{generic_array::GenericArray, BlockDecrypt, BlockEncrypt, KeyInit};
use aes::Aes128;

/// AES-128-ECB decryption of a single 16-byte block (key area / title key unwrap).
pub fn aes_ecb_decrypt_block(key: &[u8; 16], block: &[u8; 16]) -> [u8; 16] {
    let cipher = Aes128::new(GenericArray::from_slice(key));
    let mut b = GenericArray::clone_from_slice(block);
    cipher.decrypt_block(&mut b);
    b.into()
}

/// AES-128-XTS decryption with Nintendo's big-endian sector tweak.
/// `data` must be a whole number of `sector_size` sectors.
pub fn aes_xts_decrypt(key: &[u8; 32], data: &mut [u8], sector_size: usize, first_sector: u64) {
    let data_cipher = Aes128::new(GenericArray::from_slice(&key[..16]));
    let tweak_cipher = Aes128::new(GenericArray::from_slice(&key[16..]));
    for (i, sector) in data.chunks_mut(sector_size).enumerate() {
        let sector_no = first_sector + i as u64;
        let mut tweak = GenericArray::clone_from_slice(&(sector_no as u128).to_be_bytes());
        tweak_cipher.encrypt_block(&mut tweak);
        let mut t: [u8; 16] = tweak.into();
        for block in sector.as_chunks_mut::<16>().0 {
            for (b, x) in block.iter_mut().zip(t.iter()) {
                *b ^= x;
            }
            let mut ga = GenericArray::clone_from_slice(block);
            data_cipher.decrypt_block(&mut ga);
            for ((b, d), x) in block.iter_mut().zip(ga.iter()).zip(t.iter()) {
                *b = d ^ x;
            }
            // Multiply the tweak by alpha in GF(2^128) (little-endian bit order)
            let carry = t[15] >> 7;
            for j in (1..16).rev() {
                t[j] = (t[j] << 1) | (t[j - 1] >> 7);
            }
            t[0] <<= 1;
            if carry != 0 {
                t[0] ^= 0x87;
            }
        }
    }
}

/// AES-128-CTR in place. `counter` is the full 16-byte counter for the first block;
/// the low 8 bytes are incremented big-endian per block, as Nintendo content does.
pub fn aes_ctr_apply(key: &[u8; 16], counter: [u8; 16], data: &mut [u8]) {
    let cipher = Aes128::new(GenericArray::from_slice(key));
    let high = u64::from_be_bytes(counter[..8].try_into().unwrap_or_default());
    let mut low = u64::from_be_bytes(counter[8..].try_into().unwrap_or_default());
    for chunk in data.chunks_mut(16) {
        let mut block = [0u8; 16];
        block[..8].copy_from_slice(&high.to_be_bytes());
        block[8..].copy_from_slice(&low.to_be_bytes());
        let mut ga = GenericArray::clone_from_slice(&block);
        cipher.encrypt_block(&mut ga);
        for (b, k) in chunk.iter_mut().zip(ga.iter()) {
            *b ^= k;
        }
        low = low.wrapping_add(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_key_files_without_exposing_values() {
        let mut keys = KeySet::default();
        keys.add_prod_keys(
            "; comment\nheader_key = 00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff\n\
             key_area_key_application_00 = 000102030405060708090a0b0c0d0e0f\n\
             key_area_key_application_0a = 0f0e0d0c0b0a09080706050403020100\n\
             titlekek_00 = ffffffffffffffffffffffffffffffff\n\
             broken_line\nbad_hex = zz\n",
        );
        keys.add_title_keys(
            "01007300020fa0000000000000000000 = 11111111111111111111111111111111\n",
        );
        assert!(keys.is_usable());
        assert_eq!(keys.key_area_keys.len(), 2);
        assert!(keys.key_area_keys.contains_key(&0x0a));
        assert_eq!(keys.titlekeks.len(), 1);
        assert_eq!(keys.title_keys.len(), 1);
        let debug = format!("{:?}", keys);
        assert!(!debug.contains("0011"));
    }

    #[test]
    fn xts_round_trip_matches_reference_construction() {
        // Encrypt with an independent textbook XTS (big-endian tweak) and check that
        // aes_xts_decrypt inverts it.
        let key: [u8; 32] = core::array::from_fn(|i| i as u8);
        let plain: Vec<u8> = (0..0x400).map(|i| (i * 7 % 251) as u8).collect();
        let mut enc = plain.clone();
        let data_cipher = Aes128::new(GenericArray::from_slice(&key[..16]));
        let tweak_cipher = Aes128::new(GenericArray::from_slice(&key[16..]));
        for (s, sector) in enc.chunks_mut(0x200).enumerate() {
            let mut t = GenericArray::clone_from_slice(&((s as u128) + 3).to_be_bytes());
            tweak_cipher.encrypt_block(&mut t);
            let mut t: [u8; 16] = t.into();
            for block in sector.as_chunks_mut::<16>().0 {
                let mut x = [0u8; 16];
                for i in 0..16 {
                    x[i] = block[i] ^ t[i];
                }
                let mut ga = GenericArray::clone_from_slice(&x);
                data_cipher.encrypt_block(&mut ga);
                for i in 0..16 {
                    block[i] = ga[i] ^ t[i];
                }
                let carry = t[15] >> 7;
                for j in (1..16).rev() {
                    t[j] = (t[j] << 1) | (t[j - 1] >> 7);
                }
                t[0] <<= 1;
                if carry != 0 {
                    t[0] ^= 0x87;
                }
            }
        }
        assert_ne!(enc, plain);
        aes_xts_decrypt(&key, &mut enc, 0x200, 3);
        assert_eq!(enc, plain);
    }

    #[test]
    fn ctr_is_symmetric_and_counts_big_endian() {
        let key = [7u8; 16];
        let mut counter = [0u8; 16];
        counter[15] = 0xFF; // forces a carry into byte 14 on the second block
        let plain = vec![0xABu8; 40];
        let mut data = plain.clone();
        aes_ctr_apply(&key, counter, &mut data);
        assert_ne!(data, plain);
        aes_ctr_apply(&key, counter, &mut data);
        assert_eq!(data, plain);

        // Second block must equal encrypting counter+1 directly
        let mut one = vec![0u8; 16];
        let mut next = counter;
        next[15] = 0x00;
        next[14] = 0x01;
        aes_ctr_apply(&key, next, &mut one);
        let mut two = vec![0u8; 32];
        aes_ctr_apply(&key, counter, &mut two);
        assert_eq!(&two[16..], &one[..]);
    }
}
