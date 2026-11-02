//! Integration Tests for Envelope Encryption & Token Security (Requirement D)

use omnis_core::db::Database;
use omnis_core::security::{MasterKeyStore, SecretVault, VaultError};
use std::cell::RefCell;
use std::path::PathBuf;

#[test]
fn test_envelope_encryption_large_xbox_token_roundtrip() {
    let db = Database::open_in_memory().expect("Failed to open DB");
    db.migrate().expect("DB migration failed");

    let vault = SecretVault::from_key([0x42; 32]);
    let secret_id = "store_account:xbox";

    // Build a realistic large Xbox Live XSTS / JWT payload exceeding 2560 bytes (> 3.5 KB)
    let header = "eyJhbGciOiJSU0ExXzUiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0.";
    let signature = ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    let body_padding = "A".repeat(3500); // Exceeds Windows Credential Manager 2560 byte limit
    let large_xsts_token = format!("{}{}{}", header, body_padding, signature);

    assert!(
        large_xsts_token.len() > 3000,
        "Token length must exceed 3000 bytes (actual: {})",
        large_xsts_token.len()
    );

    // 1. Encrypt with AES-256-GCM + secret_id as AAD
    let (nonce, ciphertext) = vault
        .encrypt(secret_id, large_xsts_token.as_bytes())
        .expect("Encryption failed");

    assert_eq!(nonce.len(), 12, "Nonce must be exactly 12 bytes");
    assert!(ciphertext.len() > large_xsts_token.len());

    // 2. Persist in SQLite secrets table
    db.store_secret(secret_id, &nonce, &ciphertext)
        .expect("Failed to store secret in DB");

    // 3. Retrieve from SQLite
    let retrieved = db
        .get_secret(secret_id)
        .expect("Failed to query secret from DB");
    assert!(retrieved.is_some());

    let (ret_nonce, ret_ciphertext) = retrieved.unwrap();
    assert_eq!(ret_nonce, nonce);
    assert_eq!(ret_ciphertext, ciphertext);

    // 4. Decrypt and verify exact match
    let decrypted = vault
        .decrypt(secret_id, &ret_nonce, &ret_ciphertext)
        .expect("Decryption failed");

    let decrypted_str = String::from_utf8(decrypted.to_vec()).expect("Invalid UTF-8");
    assert_eq!(decrypted_str, large_xsts_token);
}

#[test]
fn test_tampered_ciphertext_fails_gracefully() {
    let vault = SecretVault::from_key([0x99; 32]);
    let secret_id = "store_account:gog";
    let token = "my_valid_oauth_access_token_123456";

    let (nonce, mut ciphertext) = vault
        .encrypt(secret_id, token.as_bytes())
        .expect("Encryption failed");

    // Tamper with a single byte in ciphertext
    if let Some(first_byte) = ciphertext.first_mut() {
        *first_byte ^= 0xFF;
    }

    // Decryption must return an error (AEAD authentication tag mismatch), NEVER panic
    let result = vault.decrypt(secret_id, &nonce, &ciphertext);
    assert!(
        result.is_err(),
        "Decryption of tampered ciphertext must fail"
    );

    match result {
        Err(VaultError::Decryption(msg)) => {
            assert!(!msg.is_empty());
        }
        _ => panic!("Expected VaultError::Decryption"),
    }
}

#[test]
fn test_tampered_aad_fails_gracefully() {
    let vault = SecretVault::from_key([0x77; 32]);
    let original_secret_id = "store_account:steam";
    let swapped_secret_id = "store_account:epic";
    let token = "sensitive_session_token_data";

    let (nonce, ciphertext) = vault
        .encrypt(original_secret_id, token.as_bytes())
        .expect("Encryption failed");

    // Attempting to decrypt with a different secret_id (swapped record) must fail AAD check
    let result = vault.decrypt(swapped_secret_id, &nonce, &ciphertext);
    assert!(
        result.is_err(),
        "Ciphertext swapped to different secret_id must fail AAD authentication"
    );
}

#[test]
fn test_tampered_nonce_length_fails_gracefully() {
    let vault = SecretVault::from_key([0x33; 32]);
    let secret_id = "store_account:test";
    let token = "token_data";

    let (_nonce, ciphertext) = vault
        .encrypt(secret_id, token.as_bytes())
        .expect("Encryption failed");

    // Invalid nonce length
    let invalid_nonce = vec![0u8; 8];
    let result = vault.decrypt(secret_id, &invalid_nonce, &ciphertext);
    assert!(result.is_err());
}

/// In-memory keyring double so tests never touch the real OS credential store
struct MockKeyStore {
    value: RefCell<Option<String>>,
    unavailable: bool,
    reject_writes: bool,
}

impl MockKeyStore {
    fn empty() -> Self {
        Self {
            value: RefCell::new(None),
            unavailable: false,
            reject_writes: false,
        }
    }

    fn with_value(v: &str) -> Self {
        Self {
            value: RefCell::new(Some(v.to_string())),
            ..Self::empty()
        }
    }

    fn unavailable() -> Self {
        Self {
            unavailable: true,
            ..Self::empty()
        }
    }
}

impl MasterKeyStore for MockKeyStore {
    fn get(&self) -> Result<Option<String>, String> {
        if self.unavailable {
            return Err("keyring service not running".to_string());
        }
        Ok(self.value.borrow().clone())
    }

    fn set(&self, value: &str) -> Result<(), String> {
        if self.unavailable || self.reject_writes {
            return Err("keyring write denied".to_string());
        }
        *self.value.borrow_mut() = Some(value.to_string());
        Ok(())
    }
}

fn temp_vault_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("omnis_test_vault_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn roundtrip(writer: &SecretVault, reader: &SecretVault) -> bool {
    let (nonce, ct) = writer.encrypt("store_account:test", b"token").unwrap();
    reader.decrypt("store_account:test", &nonce, &ct).is_ok()
}

#[test]
fn test_fallback_file_key_roundtrip() {
    let temp_dir = temp_vault_dir();
    let store = MockKeyStore::unavailable();

    let vault1 = SecretVault::with_store(&temp_dir, &store).expect("vault 1");
    assert!(vault1.is_fallback());
    assert!(temp_dir.join(SecretVault::FALLBACK_KEY_FILE).exists());

    let vault2 = SecretVault::with_store(&temp_dir, &store).expect("vault 2");
    assert!(roundtrip(&vault1, &vault2));

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_keyring_key_is_created_once_and_reused() {
    let temp_dir = temp_vault_dir();
    let store = MockKeyStore::empty();

    let vault1 = SecretVault::with_store(&temp_dir, &store).unwrap();
    assert!(!vault1.is_fallback());
    assert!(!temp_dir.join(SecretVault::FALLBACK_KEY_FILE).exists());

    let vault2 = SecretVault::with_store(&temp_dir, &store).unwrap();
    assert!(roundtrip(&vault1, &vault2));

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_corrupted_keyring_key_is_not_replaced() {
    let temp_dir = temp_vault_dir();
    let store = MockKeyStore::with_value("not-base64!!");

    let err = SecretVault::with_store(&temp_dir, &store)
        .err()
        .expect("must fail");
    assert!(matches!(err, VaultError::KeyStorage(_)));
    assert_eq!(store.value.borrow().as_deref(), Some("not-base64!!"));
    assert!(!temp_dir.join(SecretVault::FALLBACK_KEY_FILE).exists());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_corrupted_fallback_file_is_not_overwritten() {
    let temp_dir = temp_vault_dir();
    let key_file = temp_dir.join(SecretVault::FALLBACK_KEY_FILE);
    std::fs::write(&key_file, "garbage").unwrap();

    let err = SecretVault::with_store(&temp_dir, &MockKeyStore::unavailable())
        .err()
        .expect("must fail");
    assert!(matches!(err, VaultError::KeyStorage(_)));
    assert_eq!(std::fs::read_to_string(&key_file).unwrap(), "garbage");

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_fallback_file_is_migrated_into_keyring() {
    let temp_dir = temp_vault_dir();

    // Keyring down: secrets get encrypted with a file key
    let offline = SecretVault::with_store(&temp_dir, &MockKeyStore::unavailable()).unwrap();

    // Keyring back (and empty): the file key must be adopted, not replaced
    let store = MockKeyStore::empty();
    let online = SecretVault::with_store(&temp_dir, &store).unwrap();
    assert!(!online.is_fallback());
    assert!(roundtrip(&offline, &online));
    assert!(store.value.borrow().is_some());
    assert!(!temp_dir.join(SecretVault::FALLBACK_KEY_FILE).exists());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_keyring_write_failure_falls_back_to_file() {
    let temp_dir = temp_vault_dir();
    let store = MockKeyStore {
        reject_writes: true,
        ..MockKeyStore::empty()
    };

    let vault1 = SecretVault::with_store(&temp_dir, &store).unwrap();
    assert!(vault1.is_fallback());
    let vault2 = SecretVault::with_store(&temp_dir, &store).unwrap();
    assert!(roundtrip(&vault1, &vault2));

    let _ = std::fs::remove_dir_all(&temp_dir);
}
