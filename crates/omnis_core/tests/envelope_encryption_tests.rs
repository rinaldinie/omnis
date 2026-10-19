//! Integration Tests for Envelope Encryption & Token Security (Requirement D)

use omnis_core::db::Database;
use omnis_core::security::{SecretVault, VaultError};

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
    assert!(result.is_err(), "Decryption of tampered ciphertext must fail");

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

#[test]
fn test_fallback_file_key_roundtrip() {
    let temp_dir = std::env::temp_dir().join(format!("omnis_test_vault_{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&temp_dir);

    // Create SecretVault pointing to temp directory
    let vault1 = SecretVault::new(&temp_dir).expect("Failed to initialize vault 1");
    let secret_id = "store_account:fallback_test";
    let token = "fallback_protected_token_value_abc";

    let (nonce, ciphertext) = vault1.encrypt(secret_id, token.as_bytes()).unwrap();

    // Re-initialize a second vault instance pointing to same directory
    let vault2 = SecretVault::new(&temp_dir).expect("Failed to initialize vault 2");
    let decrypted = vault2.decrypt(secret_id, &nonce, &ciphertext).unwrap();

    assert_eq!(String::from_utf8(decrypted.to_vec()).unwrap(), token);

    let _ = std::fs::remove_dir_all(&temp_dir);
}
