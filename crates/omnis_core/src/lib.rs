pub mod achievements;
pub mod backup;
pub mod db;
pub mod dynamic_loader;
pub mod event_bus;
pub mod fuzzy_index;
pub mod host;
pub mod launcher;
pub mod marketplace;
pub mod metadata;
pub mod playnite;
pub mod search;
pub mod security;
pub mod theme;
pub mod wasm_host;

pub use achievements::{
    compute_icon_hash, default_achievements_cache_dir, AchievementCacheManager,
};
pub use backup::{
    calculate_next_backup_utc, create_backup, inspect_backup, is_backup_due, restore_backup,
    rotate_backups, sanitize_hostname, BackupError, BackupFrequency, BackupInspection,
    BackupManifest, BackupOptions, BackupResult, BackupScheduleConfig, RestoreResult,
};
pub use db::{
    AchievementRepository, CatalogMaintenanceRepository, Database, DatabaseError, GameRepository,
    GameSearchRepository, LibraryCounts, SecretRepository, SessionRepository, StatsRepository,
};
pub use dynamic_loader::{DynamicNativeMetadataProvider, DynamicPluginHandle, DynamicPluginLoader};
pub use event_bus::EventBus;
pub use fuzzy_index::{FuzzyGameSearchIndex, SearchItem};
pub use host::PluginHost;
pub use launcher::{
    get_current_app_memory_bytes, get_process_tree_memory_bytes,
    get_process_tree_memory_from_system, GameLauncher,
};
pub use marketplace::{
    MarketplaceCatalog, MarketplaceCatalogService, MarketplaceManager, MarketplacePlatformAsset,
    MarketplacePluginItem, PluginPackageInstaller,
};
pub use metadata::{
    FallbackMetadataGenerator, HttpMediaDownloader, MediaDownloader, MetadataCandidateDto,
    MetadataDownloader, MetadataPipelineConfig, MetadataRegistry, ProviderInfo, ProviderRegistry,
};
pub use playnite::{
    execute_playnite_backup_import, export_csharp_script, inspect_playnite_backup,
    map_playnite_plugin_id, scan_litedb_games, BsonDocument, BsonValue, LiteDbError,
    PlayniteBackupImportOptions, PlayniteBackupInspection, PlayniteBackupMatchSample,
    PlayniteGameDto, PlayniteImportOptions, PlayniteImportStats, PlayniteImporter,
};
pub use security::{SecretVault, VaultError, VaultStatus};
pub use theme::{
    parse_and_validate_theme_manifest, validate_theme_css_security, ThemeManifest,
    CURRENT_THEME_API_VERSION,
};
pub use wasm_host::{
    WasmExecutionError, WasmHostState, WasmPluginEngine, WasmPluginInstance, WasmPluginPermissions,
    WasmSandboxConfig,
};
