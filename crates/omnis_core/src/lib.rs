pub mod achievements;
pub mod backup;
pub mod db;
pub mod event_bus;
pub mod fuzzy_index;
pub mod host;
pub mod launcher;
pub mod metadata;
pub mod os;
pub mod playnite;
pub mod search;
pub mod security;
pub mod theme;

pub use achievements::{
    compute_icon_hash, default_achievements_cache_dir, AchievementCacheManager,
};
pub use backup::{
    calculate_next_backup_utc, create_backup, inspect_backup, is_backup_due, restore_backup,
    rotate_backups, sanitize_hostname, BackupError, BackupFrequency, BackupInspection,
    BackupManifest, BackupOptions, BackupResult, BackupScheduleConfig, RestoreResult,
};
pub use db::{
    normalize_title_for_dedup, AchievementRepository, CatalogMaintenanceRepository, Database,
    DatabaseError, DuplicateHiderRepository, GameRepository, GameSearchRepository, LibraryCounts,
    SecretRepository, SessionRepository, StatsRepository,
};
pub use event_bus::EventBus;
pub use fuzzy_index::{FuzzyGameSearchIndex, SearchItem};
pub use host::PluginHost;
pub use launcher::{
    build_install_uri, build_play_uri, get_current_app_memory_bytes,
    get_process_tree_memory_bytes, get_process_tree_memory_from_system,
    has_store_integration, resolve_launch_configuration, resolve_launch_plan,
    validate_and_open_store_uri, validate_store_uri, GameLauncher, LaunchPlan,
};
pub use metadata::{
    FallbackMetadataGenerator, GogMetadataProvider, HowLongToBeatProvider, HttpMediaDownloader,
    IgdbMetadataProvider, MediaDownloader, MetadataCandidateDto, MetadataDownloader,
    MetadataPipelineConfig, MetadataRegistry, OpenCriticProvider, ProviderInfo, ProviderRegistry,
    SteamGridDbProvider, SteamMetadataProvider,
};
pub use os::{parse_windows_arguments, resolve_executable_path_sync, ResolvedExecutable};
pub use playnite::{
    execute_playnite_backup_import, export_csharp_script, inspect_playnite_backup,
    map_playnite_plugin_id, scan_litedb_games, BsonDocument, BsonValue, LiteDbError,
    PlayniteBackupImportOptions, PlayniteBackupInspection, PlayniteBackupMatchSample,
    PlayniteGameDto, PlayniteImportOptions, PlayniteImportStats, PlayniteImporter,
};
pub use security::{MasterKeyStore, OsKeyringStore, SecretVault, VaultError, VaultStatus};
pub use theme::{
    parse_and_validate_theme_manifest, validate_theme_css_security, ThemeManifest,
    CURRENT_THEME_API_VERSION,
};
