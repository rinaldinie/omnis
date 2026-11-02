//! Envelope Encryption & Secure Storage (Requirement D)
//!
//! Stores a 256-bit AES Master Key in the OS Keyring (with chmod 0600 file fallback),
//! and encrypts sensitive tokens (OAuth, JWT, Xbox XSTS > 2.5KB) with AES-256-GCM in SQLite
//! using Secret ID as Additional Authenticated Data (AAD) to prevent ciphertext swapping.

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use aes_gcm::Aes256Gcm;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use std::path::Path;
use thiserror::Error;
use zeroize::Zeroizing;

#[derive(Error, Debug)]
pub enum VaultError {
    #[error("Encryption failed: {0}")]
    Encryption(String),
    #[error("Decryption failed: {0}")]
    Decryption(String),
    #[error("Key storage error: {0}")]
    KeyStorage(String),
    #[error("Invalid key length")]
    InvalidKeyLength,
}

/// Result of querying system keyring availability
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VaultStatus {
    pub is_fallback: bool,
    pub warning: Option<String>,
}

/// Backend persisting the base64-encoded master key (the OS keyring in production)
pub trait MasterKeyStore {
    /// Returns `Ok(None)` when no key is stored, `Err` when the store is unreachable
    fn get(&self) -> Result<Option<String>, String>;
    fn set(&self, value: &str) -> Result<(), String>;
}

/// OS keyring backend (Windows Credential Manager, macOS Keychain, Secret Service)
pub struct OsKeyringStore;

impl OsKeyringStore {
    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new(SecretVault::KEYRING_SERVICE, SecretVault::KEYRING_USER)
            .map_err(|e| e.to_string())
    }
}

impl MasterKeyStore for OsKeyringStore {
    fn get(&self) -> Result<Option<String>, String> {
        match Self::entry()?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    fn set(&self, value: &str) -> Result<(), String> {
        Self::entry()?
            .set_password(value)
            .map_err(|e| e.to_string())
    }
}

/// Number of attempts made before treating the keyring as unavailable
const KEYRING_ATTEMPTS: u32 = 3;

/// Envelope encryption vault managing master key and AES-256-GCM operations
pub struct SecretVault {
    master_key: Zeroizing<[u8; 32]>,
    is_using_keyring_fallback: bool,
}

impl SecretVault {
    pub const KEYRING_SERVICE: &'static str = "omnis_secrets";
    pub const KEYRING_USER: &'static str = "master_key";
    pub const FALLBACK_KEY_FILE: &'static str = "master.key";

    /// Initialize SecretVault using OS Keyring or falling back to a protected file (Requirement D1, D3)
    pub fn new(app_data_dir: &Path) -> Result<Self, VaultError> {
        Self::with_store(app_data_dir, &OsKeyringStore)
    }

    /// Initialize SecretVault with an explicit key store.
    ///
    /// An existing master key is never replaced: if the stored key is corrupted an error is
    /// returned instead of generating a new one, which would make every stored secret
    /// undecryptable. A fallback key file left over from a previous keyring outage is
    /// migrated into the keyring so the secrets it protects stay readable.
    pub fn with_store(app_data_dir: &Path, store: &dyn MasterKeyStore) -> Result<Self, VaultError> {
        let key_file = app_data_dir.join(Self::FALLBACK_KEY_FILE);

        match Self::get_with_retry(store) {
            Ok(Some(b64)) => {
                let key = Self::decode_key(&b64).map_err(|e| {
                    VaultError::KeyStorage(format!(
                        "Master key stored in the OS keyring is corrupted ({}); refusing to replace it",
                        e
                    ))
                })?;
                Ok(Self::with_key(key, false))
            }
            Ok(None) => {
                let (key, from_file) = if key_file.exists() {
                    (Self::read_fallback_key(&key_file)?, true)
                } else {
                    (Self::generate_key(), false)
                };

                match store.set(&BASE64.encode(*key)) {
                    Ok(()) => {
                        if from_file {
                            tracing::info!("Migrated fallback master key file into the OS keyring");
                            if let Err(e) = std::fs::remove_file(&key_file) {
                                tracing::warn!("Failed to remove migrated master key file: {}", e);
                            }
                        }
                        Ok(Self::with_key(key, false))
                    }
                    Err(e) => {
                        tracing::warn!(
                            "Failed to store master key in OS keyring ({}). Using file fallback.",
                            e
                        );
                        if !from_file {
                            Self::create_fallback_key_file(&key_file, &key)?;
                        }
                        Ok(Self::with_key(key, true))
                    }
                }
            }
            Err(e) => {
                tracing::warn!(
                    "Keyring unavailable ({}), switching to local filesystem fallback",
                    e
                );
                let key = if key_file.exists() {
                    Self::read_fallback_key(&key_file)?
                } else {
                    let key = Self::generate_key();
                    Self::create_fallback_key_file(&key_file, &key)?;
                    key
                };
                Ok(Self::with_key(key, true))
            }
        }
    }

    /// Construct SecretVault directly from a known 32-byte key (for unit tests)
    pub fn from_key(key: [u8; 32]) -> Self {
        Self {
            master_key: Zeroizing::new(key),
            is_using_keyring_fallback: false,
        }
    }

    /// Construct an in-memory ephemeral vault using a cryptographically secure random key
    pub fn ephemeral() -> Self {
        Self::with_key(Self::generate_key(), true)
    }

    /// Returns true if system keyring was unavailable and local fallback file is active
    pub fn is_fallback(&self) -> bool {
        self.is_using_keyring_fallback
    }

    /// Encrypt plaintext with AES-256-GCM using secret_id as AAD (Requirement D1)
    pub fn encrypt(
        &self,
        secret_id: &str,
        plaintext: &[u8],
    ) -> Result<(Vec<u8>, Vec<u8>), VaultError> {
        let cipher = Aes256Gcm::new_from_slice(&*self.master_key)
            .map_err(|e| VaultError::Encryption(e.to_string()))?;
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let payload = Payload {
            msg: plaintext,
            aad: secret_id.as_bytes(),
        };
        let ciphertext = cipher
            .encrypt(&nonce, payload)
            .map_err(|e| VaultError::Encryption(e.to_string()))?;

        Ok((nonce.to_vec(), ciphertext))
    }

    /// Decrypt ciphertext with AES-256-GCM verifying secret_id AAD (Requirement D1)
    pub fn decrypt(
        &self,
        secret_id: &str,
        nonce: &[u8],
        ciphertext: &[u8],
    ) -> Result<Zeroizing<Vec<u8>>, VaultError> {
        let cipher = Aes256Gcm::new_from_slice(&*self.master_key)
            .map_err(|e| VaultError::Decryption(e.to_string()))?;
        if nonce.len() != 12 {
            return Err(VaultError::Decryption(
                "Invalid nonce length, expected 12 bytes".to_string(),
            ));
        }
        let nonce = aes_gcm::Nonce::from_slice(nonce);
        let payload = Payload {
            msg: ciphertext,
            aad: secret_id.as_bytes(),
        };
        let plaintext = cipher
            .decrypt(nonce, payload)
            .map_err(|e| VaultError::Decryption(e.to_string()))?;

        Ok(Zeroizing::new(plaintext))
    }

    fn with_key(key: Zeroizing<[u8; 32]>, is_using_keyring_fallback: bool) -> Self {
        Self {
            master_key: key,
            is_using_keyring_fallback,
        }
    }

    fn generate_key() -> Zeroizing<[u8; 32]> {
        let key_bytes = Aes256Gcm::generate_key(OsRng);
        let mut key = Zeroizing::new([0u8; 32]);
        key.copy_from_slice(&key_bytes);
        key
    }

    fn decode_key(b64: &str) -> Result<Zeroizing<[u8; 32]>, VaultError> {
        let raw = Zeroizing::new(
            BASE64
                .decode(b64.trim())
                .map_err(|e| VaultError::KeyStorage(e.to_string()))?,
        );
        if raw.len() != 32 {
            return Err(VaultError::InvalidKeyLength);
        }
        let mut key = Zeroizing::new([0u8; 32]);
        key.copy_from_slice(&raw);
        Ok(key)
    }

    /// Reads the keyring, retrying transient failures so a momentary outage does not
    /// push the vault onto a different (file) key
    fn get_with_retry(store: &dyn MasterKeyStore) -> Result<Option<String>, String> {
        let mut last_err = String::new();
        for attempt in 1..=KEYRING_ATTEMPTS {
            match store.get() {
                Ok(v) => return Ok(v),
                Err(e) => {
                    last_err = e;
                    if attempt < KEYRING_ATTEMPTS {
                        std::thread::sleep(std::time::Duration::from_millis(100 * attempt as u64));
                    }
                }
            }
        }
        Err(last_err)
    }

    fn read_fallback_key(path: &Path) -> Result<Zeroizing<[u8; 32]>, VaultError> {
        let content = Zeroizing::new(
            std::fs::read_to_string(path).map_err(|e| VaultError::KeyStorage(e.to_string()))?,
        );
        Self::decode_key(&content).map_err(|e| {
            VaultError::KeyStorage(format!(
                "Fallback master key file {} is corrupted ({}); refusing to replace it",
                path.display(),
                e
            ))
        })
    }

    /// Creates the fallback key file without ever overwriting an existing one.
    /// On Unix the file is created with mode 0600; on Windows it inherits the per-user
    /// ACL of the application data directory.
    fn create_fallback_key_file(path: &Path, key: &[u8; 32]) -> Result<(), VaultError> {
        use std::io::Write;

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| VaultError::KeyStorage(e.to_string()))?;
        }

        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }

        let mut file = options
            .open(path)
            .map_err(|e| VaultError::KeyStorage(format!("{}: {}", path.display(), e)))?;
        let b64 = Zeroizing::new(BASE64.encode(key));
        file.write_all(b64.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|e| VaultError::KeyStorage(e.to_string()))
    }
}
