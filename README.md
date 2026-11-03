# Omnis

[![CI](https://github.com/rinaldinie/omnis/actions/workflows/ci.yml/badge.svg)](https://github.com/rinaldinie/omnis/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/rinaldinie/omnis)](https://github.com/rinaldinie/omnis/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Modern, lightweight, open-source universal game launcher built in Rust.

![Omnis library grid view](assets/screenshots/library-grid.webp)

---

## Overview

Omnis aggregates your PC gaming library across platforms into a single, cohesive, modern desktop and big-picture interface. It provides native process tracking via Windows Kernel Job Objects, offline-resilient metadata resolution, customizable themes, and full gamepad navigation.

### Key Highlights

- **Universal Library Aggregation**: Built-in integrations for Steam, Epic Games Store, GOG and Xbox / PC Game Pass (local scanners and cloud accounts), plus custom executables.
- **Robust Process Tracking**: Windows Kernel Job Objects track game processes and child trees accurately without relying solely on window handles.
- **Metadata Pipeline**: Pluggable providers (Steam Store, IGDB, SteamGridDB, OpenCritic, HowLongToBeat, GOG) with offline fallback and manual candidate resolution.
- **Achievements**: Per-store achievement sync with local cache, automatic sync on game exit and on startup.
- **Statistics Dashboard**: Playtime analytics, activity heatmap, weekly charts and backlog progress.
- **Backup & Restore**: Native library backups with scheduling and rotation.
- **Playnite Import**: Import library, sessions and media from Playnite databases and backups.
- **Embedded SQLite Engine**: Local SQLite database with automatic migrations, FTS search, index optimizations and WAL mode.
- **Multi-View Interface**: Grid view with dynamic zoom, split details panel, and list view with sorting and dynamic grouping.
- **Fullscreen Mode**: Controller-first fullscreen experience with synthesized SFX and a virtual gamepad keyboard.
- **Themes & Localization**: Built-in themes with a slot-based theme API; UI available in English, Italian, French, German, Spanish and Japanese.
- **Extensibility**: 3-Tier plugin model (built-in Tier 0 integrations, native Tier 1 C-ABI dynamic plugins, and an experimental Tier 2 WebAssembly sandbox, not yet integrated into the app).
- **Auto-Update**: Signed in-app updates via the Tauri updater.

### Screenshots

| Game details | Fullscreen mode |
| :---: | :---: |
| ![Game details with hero banner, OpenCritic score and HowLongToBeat estimates](assets/screenshots/game-details.webp) | ![Controller-first fullscreen mode](assets/screenshots/fullscreen-mode.webp) |
| **Statistics dashboard** | **Achievements** |
| ![Statistics dashboard with activity heatmap and playtime breakdown](assets/screenshots/statistics-dashboard.webp) | ![Achievements gallery and per-game session statistics](assets/screenshots/achievements.webp) |

---

## Workspace Architecture

```
omnis/
├── crates/
│   ├── omnis_sdk/       # Plugin contracts, DTOs, events, settings schema, C-ABI (FFI)
│   ├── omnis_core/      # Engine: SQLite persistence, launcher, metadata, achievements, backup, plugin hosts
│   ├── omnis_tauri/     # Tauri v2 desktop shell
│   │   ├── src/         #   Rust: IPC commands and background services
│   │   ├── ui/          #   React 18 + TypeScript + Tailwind CSS frontend
│   │   └── themes/      #   Built-in themes
│   └── omnis_cli/       # Headless CLI management tool
├── plugins/
│   ├── omnis_plugin_steam/  # Steam scanner (VDF), cloud sync, achievements
│   ├── omnis_plugin_epic/   # Epic Games Store manifests, cloud sync, achievements
│   ├── omnis_plugin_gog/    # GOG Galaxy integration
│   └── omnis_plugin_xbox/   # Xbox Live & PC Game Pass integration
├── examples/
│   └── sample_plugin/   # Reference template for native dynamic plugins
├── scripts/             # Release tooling (version bump, tagging, local update server)
└── .github/             # CI, release workflow, issue/PR templates
```

---

## Plugin Architecture & Extensibility Model

Omnis employs an explicit **3-Tier Hybrid Plugin Architecture** designed to balance out-of-the-box performance with community extensibility:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Omnis Desktop & CLI Shell                       │
├────────────────────────────────────────────────────────────────────────┤
│                     PluginHost & StoreAccountManager                   │
├──────────────────────────┬─────────────────────────┬───────────────────┤
│ Tier 0: Built-in Static  │ Tier 1: Native Dynamic  │ Tier 2: WASM Host │
│ (Steam, Epic, GOG, Xbox) │ (.dll / .so / .dylib)   │ (Experimental)    │
│ Zero-overhead in-process │ C-ABI FFI + Panic Guard │ Wasmtime Sandbox  │
└──────────────────────────┴─────────────────────────┴───────────────────┘
```

### The Canonical Model Explained

Omnis intentionally differentiates between first-party store aggregators and community extensions:

1. **Official Model for Store Integrations (Tier 0 — Built-in Static)**:
   - First-party stores ([`omnis_plugin_steam`](plugins/omnis_plugin_steam), [`omnis_plugin_epic`](plugins/omnis_plugin_epic), [`omnis_plugin_gog`](plugins/omnis_plugin_gog), [`omnis_plugin_xbox`](plugins/omnis_plugin_xbox)) are statically linked into the desktop and CLI binaries.
   - **Why static?**
     - **Zero Cold-Start Overhead**: Instant boot without dynamic library lookups or ABI negotiation overhead.
     - **Deep OS & Vault Wiring**: Direct integration with `SecretVault` (DPAPI/Keyring), OS deep-link OAuth protocols, and Windows Kernel Job Objects for child-process tracking.
     - **Zero Setup**: Users immediately aggregate libraries out-of-the-box without downloading third-party plugins.

2. **Power-User Model for Low-Level Native Code (Tier 1 — Dynamic C-ABI Shared Libraries)**:
   - For community extensions requiring raw system performance or custom integrations.
   - **Current scope**: Currently, native dynamic plugins only load external **metadata providers** (`MetadataProvider`).
   - Loaded dynamically at runtime via `libloading` from the user's `plugins/` directory.
   - Protected by `ffi_guard`, catching any C/Rust panics before they can terminate the main application process.

3. **Experimental Model for Community Extensions & Sandbox (Tier 2 — WebAssembly Sandbox)**:
   - *Status: Experimental / Not yet integrated in the desktop application.*
   - WebAssembly is designed as the sandboxed distribution format for third-party extensions. Note: **WASI is not supported**; modules run as pure WebAssembly bytecode under explicit host capabilities.
   - Executed within a strict `wasmtime` capability sandbox:
     - Explicit domain whitelisting (e.g. `"net:api.igdb.com"`).
     - Storage ACL and fuel consumption limits (preventing runaway loops or memory leaks).
     - Epoch interruption timers to enforce timeouts on synchronous tasks.

### Runtime Discovery & Environments

- **Plugin Directory Layout**:
  - Windows: `%LOCALAPPDATA%\com.omnis.gamelibrary\plugins` (or `%APPDATA%\Omnis Game Library\plugins`)
  - Linux: `~/.local/share/com.omnis.gamelibrary/plugins`
  - macOS: `~/Library/Application Support/com.omnis.gamelibrary/plugins`
  - Portable: `<exe_dir>/data/plugins`
- **Desktop UI (`omnis`)**: Initializes all 4 Tier 0 plugins (local manifest scanning and OAuth cloud synchronization), alongside dynamically discovered Tier 1 dynamic libraries (Tier 2 WebAssembly is experimental and not yet integrated into the desktop shell).
- **Headless CLI (`omnis-cli`)**: Boots in lightweight offline mode with Tier 0 local scanners (`steam`, `epic`). Cloud-only syncs (GOG, Xbox) require interactive OAuth flows managed by the desktop shell.

### Developing External Plugins

- **For Native Plugins (Tier 1)**: Refer to [`examples/sample_plugin`](examples/sample_plugin) and [`crates/omnis_sdk`](crates/omnis_sdk). Currently supports external metadata providers. Expose standard C-ABI symbols:
  - `omnis_plugin_get_manifest`
  - `omnis_metadata_fetch`
  - `omnis_plugin_abi_version`
  - `omnis_free_string`
  - *(optional)* `omnis_metadata_test`
- **For WebAssembly Plugins (Tier 2 — Experimental)**: Experimental sandbox. Compile targeting pure WebAssembly (WASI is not supported). Declare required network permissions in `plugin.json` (e.g., `"permissions": ["net:api.example.com"]`).

---

## Prerequisites

- **Rust**: latest stable toolchain (pinned via [`rust-toolchain.toml`](rust-toolchain.toml), with `rustfmt` and `clippy`)
- **Node.js**: 22 LTS and `npm`
- **Operating System**: Windows 10/11 (with Microsoft Edge WebView2 runtime), Linux or macOS.
  Linux builds need the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/#linux).

---

## Getting Started

### 1. Build the Frontend

```bash
cd crates/omnis_tauri/ui
npm ci
npm run build
cd ../../..
```

### 2. Run the Application

```bash
# Debug mode
cargo run -p omnis_tauri

# Optimized release mode
cargo run -p omnis_tauri --release
```

### 3. Run the Checks

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm --prefix crates/omnis_tauri/ui run typecheck
```

These are the same checks run by CI on every push and pull request.

---

## Releasing

Releases are cut with the scripts in [`scripts/`](scripts), which bump the version in `Cargo.toml`, `tauri.conf.json` and `package.json`, then commit, tag and push:

```bash
npm --prefix crates/omnis_tauri/ui run release:minor
```

Pushing a `v*` tag triggers the [release workflow](.github/workflows/release.yml), which builds signed installers for Windows, Linux and macOS. See [CHANGELOG.md](CHANGELOG.md) for the release history.

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and coding standards, and [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

---

## License

This project is licensed under the [MIT License](LICENSE).
