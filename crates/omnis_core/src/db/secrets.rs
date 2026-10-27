use rusqlite::{params, OptionalExtension, Result};

use crate::db::{Database, DatabaseError};

/// Repository trait for secure credential and secret storage (Requirement D1)
pub trait SecretRepository: Send + Sync {
    /// Store an encrypted secret record
    fn store_secret(
        &self,
        id: &str,
        nonce: &[u8],
        ciphertext: &[u8],
    ) -> Result<(), DatabaseError>;

    /// Retrieve an encrypted secret record by ID
    fn get_secret(&self, id: &str) -> Result<Option<(Vec<u8>, Vec<u8>)>, DatabaseError>;

    /// Delete a secret by ID
    fn delete_secret(&self, id: &str) -> Result<(), DatabaseError>;
}

impl SecretRepository for Database {
    fn store_secret(
        &self,
        id: &str,
        nonce: &[u8],
        ciphertext: &[u8],
    ) -> Result<(), DatabaseError> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT INTO secrets (id, nonce, ciphertext, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET
                nonce = excluded.nonce,
                ciphertext = excluded.ciphertext,
                updated_at = excluded.updated_at",
            params![id, nonce, ciphertext, now],
        )?;
        Ok(())
    }

    fn get_secret(&self, id: &str) -> Result<Option<(Vec<u8>, Vec<u8>)>, DatabaseError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT nonce, ciphertext FROM secrets WHERE id = ?1")?;
        let res = stmt
            .query_row(params![id], |row| {
                let nonce: Vec<u8> = row.get(0)?;
                let ciphertext: Vec<u8> = row.get(1)?;
                Ok((nonce, ciphertext))
            })
            .optional()?;
        Ok(res)
    }

    fn delete_secret(&self, id: &str) -> Result<(), DatabaseError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM secrets WHERE id = ?1", params![id])?;
        Ok(())
    }
}

// Inherent methods forwarding to SecretRepository for backward compatibility
impl Database {
    #[inline]
    pub fn store_secret(
        &self,
        id: &str,
        nonce: &[u8],
        ciphertext: &[u8],
    ) -> Result<(), DatabaseError> {
        SecretRepository::store_secret(self, id, nonce, ciphertext)
    }

    #[inline]
    pub fn get_secret(&self, id: &str) -> Result<Option<(Vec<u8>, Vec<u8>)>, DatabaseError> {
        SecretRepository::get_secret(self, id)
    }

    #[inline]
    pub fn delete_secret(&self, id: &str) -> Result<(), DatabaseError> {
        SecretRepository::delete_secret(self, id)
    }
}
