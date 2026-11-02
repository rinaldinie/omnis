# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Entries are derived from [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

## [0.9.0] - 2026-11-01

### Added

- **app**: Configure achievement startup sync schedule and timestamp recording
- **ui**: Add achievement sync settings to achievements modal
- **i18n**: Add achievement sync frequency and game exit translations
- **achievements**: Add sync_achievements_on_game_exit state and IPC command
- **achievements**: Auto-sync achievements on game close and app startup
- **backup**: Add automated scheduling, rotation capped at 10, and i18n support
- **backup**: Implement native library backup and restore system

### Fixed

- **achievements**: Defer backend sync to save and add live sync listener in settings modal
- **console**: Align LB/RB category cycling with visible tabs and translate genre labels

## [0.8.0] - 2026-10-30

### Added

- **stats**: Fix Playnite session import, backfill Steam sessions on startup, and add heatmap session inspector
- **stats**: Enhance real database analytics, Playnite session import, theme contrast, and i18n parity
- **i18n**: Add comprehensive localization for game statistics dashboard
- Add global game statistics dashboard, activity heatmap, and game metrics

### Fixed

- **epic**: Resolve catalog game titles, filter DLCs, and prevent OAuth WebView crash
- **oauth**: Immediately close login popup window on redirect

### Changed

- **stats-i18n**: Decompose god components, extract fat functions and purge duplicated i18n keys

## [0.7.0] - 2026-10-29

### Added

- **onboarding**: Add first-launch store detection wizard and auto-scan option

## [0.6.0] - 2026-10-29

### Added

- **playnite**: Support streaming import from Playnite backup ZIP archives

### Fixed

- **playnite**: Support multi-page LiteDB document reassembly and expand backup preview
- **ui**: Store badge fixed

## [0.5.0] - 2026-10-28

### Added

- **ui**: Align view empty states, revamp group popover, and move settings to app menu
- **ui**: Revamp desktop library filtering, recently played shelf, and completion status tracking
- **ui**: Revamp desktop interface with calm themes, app menu, and refined views
- **ui**: Update list view layout, details sidebar, and adopt Epic Games typography
- **ui**: Adopt official store vector icons and remove UI zoom controls

### Fixed

- Correct repository and updater endpoint urls (omins to omnis)

## [0.4.2] - 2026-10-27

### Added

- **console**: Add Q/E tab cycling, adaptive glyphs, and mouse interactivity

### Fixed

- **core,tauri**: Resolve compilation errors and test regressions across domain services

### Changed

- **sdk**: Introduce shared constants for stores, events, and storage layouts
- **core**: Introduce typed serde DTOs and deduplicate Steam and GOG metadata parsers
- **tauri**: Extract AppBootstrap and decouple AchievementService with polymorphic dispatch
- **core**: Decompose playnite import loop and separate launcher tracking strategies
- **core**: Modularize metadata search engine, dynamic plugin loader, and pipeline resolver
- **tauri**: Extract slot, trailer, store action, and theme services from IPC commands
- Resolve major architectural smells across marketplace, playnite importer, and metadata candidate applier
- **tauri**: Extract GameLaunchCoordinator and WindowStateSnapshot from procedural launch_game command
- **db**: Implement reader-writer connection segregation for concurrent SQLite WAL queries
- **metadata**: Extract FallbackMetadataGenerator with canonical English genres and strings
- **tauri**: Decouple OAuthLoginService via OAuthSessionHandler trait
- **db**: Segregate GameRepository into focused domain traits
- **tauri,core**: Decompose StoreAccountManager and GameLauncher into domain services
- **metadata**: Decompose MetadataDownloader god object into domain services
- **core**: Decouple MetadataDownloader into Clean Architecture services
- **core**: Modularize Database god object into Clean Architecture repositories

## [0.4.1] - 2026-10-26

### Added

- **icons**: Application icon update

### Fixed

- **build**: Add explicit type annotation for legacy dir candidates and cfg steam_appid on windows
- **migration**: Migrate legacy cached artwork paths in database to unified app data directory
- **core**: Unify data directory with Tauri app_local_data_dir and add startup migration

## [0.4.0] - 2026-10-25

### Added

- **i18n**: Translate library views, filters and app dialogs
- **i18n**: Translate the theme manager
- **i18n**: Translate store account cards
- **i18n**: Translate the game editor
- **i18n**: Translate metadata resolution and custom game dialogs
- **i18n**: Translate achievements settings
- **i18n**: Translate plugin manager and marketplace
- **i18n**: Translate status bar messages
- **fullscreen**: Console-style fullscreen mode

### Fixed

- **version**: Updated xbox plugin version, updated node version for build

## [0.3.6] - 2026-10-24

### Fixed

- **cargo**: Restore correct crate versions and checksums in Cargo.lock
- **cargo**: Cargo file
- **media**: Upgrade low-resolution hero backgrounds and include Cargo.lock in release script
- **library**: Restore recent games ordering and fullscreen updater controls
- **release**: Renamed release for github
- **update**: Fixed update on fullscreen mode
- **ui**: Fixed hero on details and trailer

## [0.3.5] - 2026-10-24

### Fixed

- **ui,core**: Resolve regressions in slot resolution, carousel index closure, and listener lifecycle

### Changed

- **ui,core**: Optimize carousel navigation, slot event listeners, and rendering

## [0.3.4] - 2026-10-24

### Added

- **ui**: Redesign metadata enrich modal, align TopBar, and standardize modal actions

### Fixed

- **launcher**: Resolve game foreground focus and window minimization on launch

## [0.3.3] - 2026-10-24

### Fixed

- Resolve Tokio block_on panic on game launch and improve fullscreen integration

## [0.3.2] - 2026-10-23

### Fixed

- **build**: Resolve Linux Steam vdf dirs dependency and macOS tray icon resource error

## [0.3.1] - 2026-10-23

### Added

- **fullscreen**: Add single-instance lock, exit menu option, and cancelable game launch

### Fixed

- **updater**: Improve error message extraction and logging during download and install

## [0.3.0] - 2026-10-23

### Added

- **updater**: Add online auto-updater and automated release workflow
- **fullscreen**: Support --fullscreen CLI launch argument and enhance hero background clarity
- **bigpicture**: Convert to true fullscreen 10-foot console mode with Playnite-style menu
- **ui**: Redesign Big Picture game details to fullscreen and fix gamepad navigation
- **ui**: Redesign store accounts tab to match playnite integration dialog, add metadata progress bars, and fix achievements sync feedback
- **backend**: Implement mandatory steam api key validation, store integration settings, and clear achievements errors
- Add native multi-store achievements and tabbed settings overhaul
- **tauri**: Implement game management features and system tray integration
- **filters**: Replace group by with smart filter bar, auto-enrich key features, and add completion status badges
- **details**: Replace player notes with key features and add interactive genre filter badges
- **ui**: Suppress default context menu/devtools and complete EN localization
- **ui**: Polish game details contrast, list view dividers, and direct HLTB refresh
- **support**: Plugin howlongtobeat test
- **plugin**: Added plugin support
- **marketplace**: Decouple external plugins and add remote Forgejo registry with SHA-256 verification
- **ui**: Redesign plugin modal, add reorderable pipeline priority, and fix modal scrollbars
- **core,cli**: Add fuzzy/FTS5 search optimizations and Playnite 10 importer
- **launcher**: Add kernel-level process tracking, incremental sessions, and window orchestration
- Add Playnite-parity process monitoring and Big Picture window lifecycle
- **themes**: Fix cinema trailer video playback with HLS streaming and multi-view support - Expose `external_id` in `GameDto` (Rust & TypeScript) for accurate store ID mapping - Introduce `get_game_trailer_url` Tauri command with in-memory caching, local `trailers/` folder check, custom links, and Steam Store API HLS resolution - Integrate `hls.js` into `VideoBackdrop` for adaptive H.264 video streaming with crossfade and fallback - Render dynamic video backdrop across Grid View, Details Split View, and Big Picture Mode for the Cinema Lounge theme - Add unit tests for `GameDto` serialization and Steam movie data deserialization
- **themes**: Modular multi-file theme engine with dynamic video trailer backdrops
- **stores**: Add Steam & Epic cloud OAuth sync, reorder priority, and fix UI layout
- **store-sync**: Add GOG Galaxy and Xbox cloud store sync with OAuth and OS Keyring
- **core,plugins,ui**: Add IGDB provider, dynamic plugin loader, in-app marketplace, and uninstalled games install actions
- **i18n**: Implement multilingual system and settings language selector

### Fixed

- **fullscreen**: Clean footer hints, remove dead refresh buttons, and add empty state for 0 filter results
- **ui**: Canonicalize i18n translations, remove series descriptor, and fix gamepad input loop
- **achievements**: Background icon caching and fix race condition on game switch
- **ui**: Open external store links and web URLs in default OS browser
- **var**: Minor fixes
- **ui**: Fix window controls overlap and add responsive menu in TopBar
- **sync**: Resolve infinite spinner lockup and add batch metadata enrichment
- **ui**: Project name and build
- **metadata**: Rewrite correctly info
- **metadata**: Restored metadata images
- **metadata**: Fix candidate cover saving, GameDto IPC mapping, and prevent overwriting existing metadata
- **metadata**: A lot of enrichment
- **login**: Fixed login and sidebar
- **ui**: Improve store banner layout, prevent badge wrapping and fix Epic button contrast

### Changed

- **core,tauri,ui**: Decompose monolithic god objects into focused modules" -m "- crates/omnis_tauri/src/main.rs: Extracted IPC commands into commands/ and types.rs (reduced from 1,   053 to 94 lines).     - crates/omnis_core/src/db.rs: Extracted SQL migrations into db/migrations.rs and tests into tests/database_tests.rs (reduced from 1,182 to 738 lines).     - crates/omnis_core/src/metadata.rs: Extracted metadata/types.rs, metadata/utils.rs, and metadata/scaffold.rs (reduced from 1,766 to 1,381 lines).     - crates/omnis_tauri/ui/src/components/GameEditorModal.tsx: Modularized editor tabs into components/game_editor/ (reduced from 1,334 to 365 lines).     - crates/omnis_tauri/ui/src/components/StoreAccountsTab.tsx: Modularized store cards into components/store_accounts/ (reduced from 881 to 304 lines).     - crates/omnis_tauri/ui/src/App.tsx: Decomposed shell into hooks/, views/, navigation/, and modals/ (reduced from 4,859 to 975 lines).     - Verified zero functional regressions: clean TypeScript build and 67+ tests passing across the workspace.

## [0.1.0] - 2026-10-16

### Added

- Initial commit for Omnis Game Library

### Fixed

- **ui**: Eliminate text blurring on button hover by removing scale transforms and adding font smoothing

[Unreleased]: https://github.com/rinaldinie/omnis/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/rinaldinie/omnis/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/rinaldinie/omnis/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/rinaldinie/omnis/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/rinaldinie/omnis/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/rinaldinie/omnis/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/rinaldinie/omnis/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/rinaldinie/omnis/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/rinaldinie/omnis/compare/v0.3.6...v0.4.0
[0.3.6]: https://github.com/rinaldinie/omnis/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/rinaldinie/omnis/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/rinaldinie/omnis/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/rinaldinie/omnis/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/rinaldinie/omnis/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/rinaldinie/omnis/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/rinaldinie/omnis/compare/v0.1.0...v0.3.0
[0.1.0]: https://github.com/rinaldinie/omnis/releases/tag/v0.1.0
