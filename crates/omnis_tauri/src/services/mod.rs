//! Domain services and background workers for Omnis Game Library
//!
//! Separates domain orchestration, background scheduling, hardware monitoring,
//! and asset resolution from Tauri IPC commands.

pub mod achievement_service;
pub mod achievement_sync;
pub mod active_game;
pub mod backup_scheduler;
pub mod candidate_applier;
pub mod launcher_service;
pub mod slot_resolver;
pub mod steam_sync;
pub mod trailer_service;

pub use achievement_service::*;
pub use achievement_sync::*;
pub use active_game::*;
pub use backup_scheduler::*;
pub use candidate_applier::*;
pub use launcher_service::*;
pub use slot_resolver::*;
pub use steam_sync::*;
pub use trailer_service::*;
