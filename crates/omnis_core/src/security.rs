//! Envelope Encryption & Secure Storage (Requirement D)
//!
//! Stores a 256-bit AES Master Key in the OS Keyring (with chmod 0600 file fallback),
//! and encrypts sensitive tokens (OAuth, JWT, Xbox XSTS > 2.5KB) with AES-256-GCM in SQLite
//! using Secret ID as Additional Authenticated Data (AAD) to prevent ciphertext swapping.

use aes_gcm::aead::{Aead, KeyInit, OsRng, AeadCore, Payload};
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
        // 1. Try to load or generate key from OS Keyring
        match keyring::Entry::new(Self::KEYRING_SERVICE, Self::KEYRING_USER) {
            Ok(entry) => {
                match entry.get_password() {
                    Ok(b64) => {
                        if let Ok(raw) = BASE64.decode(b64.trim()) {
                            if raw.len() == 32 {
                                let mut key = [0u8; 32];
                                key.copy_from_slice(&raw);
                                return Ok(Self {
                                    master_key: Zeroizing::new(key),
                                    is_using_keyring_fallback: false,
                                });
                            }
                        }
                    }
                    Err(keyring::Error::NoEntry) => {
                        // Generate a fresh master key and try to persist into OS keyring
                        let key_bytes = Aes256Gcm::generate_key(OsRng);
                        let b64 = BASE64.encode(&key_bytes);
                        if entry.set_password(&b64).is_ok() {
                            let mut key = [0u8; 32];
                            key.copy_from_slice(&key_bytes);
                            return Ok(Self {
                                master_key: Zeroizing::new(key),
                                is_using_keyring_fallback: false,
                            });
                        }
                    }
                    Err(e) => {
                        tracing::warn!(
                            "Keyring unavailable ({}), switching to local filesystem fallback (chmod 0600)",
                            e
                        );
                    }
                }
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to create keyring entry ({}). Using file fallback.",
                    e
                );
            }
        }

        // 2. Fallback to protected local file (Requirement D3)
        let key_file = app_data_dir.join(Self::FALLBACK_KEY_FILE);
        let key = Self::load_or_create_fallback_key(&key_file)?;

        Ok(Self {
            master_key: Zeroizing::new(key),
            is_using_keyring_fallback: true,
        })
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
        let key_bytes = Aes256Gcm::generate_key(OsRng);
        let mut key = [0u8; 32];
        key.copy_from_slice(&key_bytes);
        Self {
            master_key: Zeroizing::new(key),
            is_using_keyring_fallback: true,
        }
    }

    /// Returns true if system keyring was unavailable and local fallback file is active
    pub fn is_fallback(&self) -> bool {
        self.is_using_keyring_fallback
    }

    /// Encrypt plaintext with AES-256-GCM using secret_id as AAD (Requirement D1)
    pub fn encrypt(&self, secret_id: &str, plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>), VaultError> {
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
            return Err(VaultError::Decryption("Invalid nonce length, expected 12 bytes".to_string()));
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

    fn load_or_create_fallback_key(path: &Path) -> Result<[u8; 32], VaultError> {
        if path.exists() {
            let content = std::fs::read_to_string(path)
                .map_err(|e| VaultError::KeyStorage(e.to_string()))?;
            let raw = BASE64
                .decode(content.trim())
                .map_err(|e| VaultError::KeyStorage(e.to_string()))?;
            if raw.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&raw);
                return Ok(key);
            }
        }

        // Generate new key and save to file with restricted permissions (0600 on unix)
        let key_bytes = Aes256Gcm::generate_key(OsRng);
        let b64 = BASE64.encode(&key_bytes);

        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        std::fs::write(path, b64).map_err(|e| VaultError::KeyStorage(e.to_string()))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
        }

        let mut key = [0u8; 32];
        key.copy_from_slice(&key_bytes);
        Ok(key)
    }
}
