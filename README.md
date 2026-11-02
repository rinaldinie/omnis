# Omnis

[![CI](https://github.com/rinaldinie/omnis/actions/workflows/ci.yml/badge.svg)](https://github.com/rinaldinie/omnis/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/rinaldinie/omnis)](https://github.com/rinaldinie/omnis/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> High-performance, modular, open-source universal game library manager and launcher built with Rust and Tauri v2.

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
- **Extensibility**: Plugin SDK with native (C-ABI) and WASM plugin hosts, plus a plugin marketplace.
- **Auto-Update**: Signed in-app updates via the Tauri updater.

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
