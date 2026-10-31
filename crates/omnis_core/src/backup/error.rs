use thiserror::Error;

#[derive(Error, Debug)]
pub enum BackupError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("SQLite database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("ZIP archive error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("Serialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Invalid backup archive: {0}")]
    InvalidArchive(String),

    #[error("Database integrity check failed: {0}")]
    IntegrityFailed(String),

    #[error("Destination directory not found or inaccessible: {0}")]
    DestinationNotFound(String),
}
