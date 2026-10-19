pub mod db;
pub mod dynamic_loader;
pub mod event_bus;
pub mod host;
pub mod launcher;
pub mod marketplace;
pub mod metadata;

pub use db::{Database, DatabaseError, LibraryCounts};
pub use dynamic_loader::{DynamicNativeMetadataProvider, DynamicPluginHandle, DynamicPluginLoader};
pub use event_bus::EventBus;
pub use host::PluginHost;
pub use launcher::GameLauncher;
pub use marketplace::{
    MarketplaceCatalog, MarketplaceManager, MarketplacePlatformAsset, MarketplacePluginItem,
};
pub use metadata::{MetadataCandidateDto, MetadataDownloader, MetadataPipelineConfig, ProviderInfo};


