# Omnis

> High-performance, modular, open-source universal game library manager and launcher built with Rust and Tauri v2.

---

## Overview

Omnis aggregates your PC gaming library across platforms into a single, cohesive, modern desktop and big-picture interface. It provides native process tracking via Windows Kernel Job Objects, offline-resilient metadata resolution (Steam Store, SteamGridDB, OpenCritic), customizable themes, and full gamepad navigation.

### Key Highlights
- **Universal Library Aggregation**: Local automatic scanner plugins for Steam (`libraryfolders.vdf`, `appmanifest`) and Epic Games Store (`.item` manifests), with support for custom executables.
- **Robust Process Tracking**: Windows Kernel Job Objects track game processes and child trees accurately without relying solely on window handles.
- **Embedded SQLite Engine**: Direct local SQLite database with automatic migrations, index optimizations, and WAL mode.
- **Multi-View Interface**: Grid view with dynamic zoom slider, split details panel, and spreadsheet list view with sorting and dynamic grouping (by library, status, genre, developer, completion status).
- **Fullscreen Mode**: Controller-first fullscreen experience with synthesized Web Audio SFX and virtual gamepad keyboard.
- **Metadata Editor**: Manual editor with native file and folder pickers for executables, working directories, and artwork.

---

## Workspace Architecture

```
omnis/
├── crates/
│   ├── omnis_sdk/       # Core plugin interfaces, DTOs, events, settings schema
│   ├── omnis_core/      # Engine: SQLite persistence, process launcher, metadata pipeline
│   ├── omnis_tauri/     # Tauri v2 desktop shell with React 18 & Tailwind CSS UI
│   └── omnis_cli/       # Headless CLI management tool
├── plugins/
│   ├── omnis_plugin_steam/  # Steam library scanner & local VDF parser
│   └── omnis_plugin_epic/   # Epic Games Store manifest scanner
├── .editorconfig         # Unified formatting standards
├── .gitattributes        # Line endings (LF) and binary definitions
├── .gitignore            # Workspace ignore rules
└── rustfmt.toml          # Rust code styling configuration
```

---

## Prerequisites

- **Rust**: 1.75+ (stable toolchain)
- **Node.js**: 18+ and `npm`
- **Operating System**: Windows 10/11 (with Microsoft Edge WebView2 runtime) or Linux/WSL for development

---

## Getting Started

### 1. Build the Frontend
```bash
cd crates/omnis_tauri/ui
npm install
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

### 3. Run Workspace Tests
```bash
cargo test --workspace
```

---

## Maintainability & Development Standards

- **Formatting**: Run `cargo fmt` before submitting changes.
- **Linting**: Ensure `cargo clippy --workspace` passes without warnings.
- **Line Endings**: Repository enforces LF line endings via `.gitattributes` (except Windows batch files).
- **Cross-Platform**: All file path manipulations must use `std::path::Path` / `PathBuf` and handle separators gracefully.

---

## License

This project is licensed under the [MIT License](LICENSE).
