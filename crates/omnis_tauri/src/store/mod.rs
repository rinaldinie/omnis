//! Store account management, OAuth flows, catalog synchronization, and platform actions
//!
//! Provides:
//! - StoreSessionVault: secure session storage and settings
//! - OAuthLoginService: webview OAuth popup management
//! - StoreCatalogSyncEngine: library sync and progress reporting
//! - StorePlatformDispatcher: store-specific URIs, uninstallers, and shortcuts

pub mod actions;
pub mod manager;
pub mod oauth;
pub mod session;
pub mod sync;

#[cfg(test)]
mod tests;

pub use actions::*;
pub use manager::*;
