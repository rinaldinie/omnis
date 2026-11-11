# Contributing to Omnis

Thanks for your interest in improving Omnis! This guide covers the development workflow and the standards every change is expected to meet.

## Development Setup

Follow the [Getting Started](README.md#getting-started) section of the README to install the prerequisites, build the frontend and run the app.

## Workflow

1. Fork the repository and create a branch from `main` (e.g. `feat/steam-family-sharing`, `fix/launcher-exit-code`).
2. Make focused changes: one logical change per pull request.
3. Run the checks below locally.
4. Open a pull request using the template and link any related issue.

## Required Checks

CI runs these on every push and pull request; please run them before opening a PR:

```bash
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm --prefix crates/omnis_tauri/ui run typecheck
npm --prefix crates/omnis_tauri/ui run build
```

## Commit Messages

The project follows [Conventional Commits](https://www.conventionalcommits.org/). The changelog and release notes are generated from commit subjects, so keep them clear and in English:

```
<type>(<scope>): <short summary>
```

- **Types**: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `chore`, `ci`
- **Scopes** (examples): `core`, `sdk`, `tauri`, `ui`, `i18n`, `stats`, `achievements`, `backup`, `metadata`, `steam`, `epic`, `gog`, `xbox`

## Coding Standards

### Rust

- Automatic formatting (`cargo fmt`) is not enforced in CI. Please avoid blanket formatting passes across unrelated files in pull requests to keep diffs focused.
- Keep `cargo clippy` warning-free. If a lint must be silenced, use a targeted `#[allow(...)]` on the item and explain why.
- Avoid `unwrap()` / `expect()` outside tests; propagate errors with `Result` and `thiserror` types.
- Declare shared dependencies in the root `[workspace.dependencies]` and reference them with `.workspace = true`.
- Use `std::path::Path` / `PathBuf` for all path manipulation; never hard-code separators.
- Platform-specific code goes behind `cfg(windows)` / `cfg(unix)` with a working fallback.

### Frontend (React + TypeScript)

- TypeScript runs in `strict` mode; `npm run typecheck` must pass.
- Every user-facing string goes through the i18n layer and must be added to **all** locales in `ui/src/i18n/locales/`.
- Prefer small, focused components and hooks over adding more state to `App.tsx`.

### Tests

- Add or update tests for behavioural changes. Integration tests for the engine live in `crates/omnis_core/tests/`.

## Store Integrations & Metadata Providers

Store integrations live as modular crates in `plugins/` (e.g. `omnis_plugin_steam`, `omnis_plugin_epic`, `omnis_plugin_gog`, `omnis_plugin_xbox`). Metadata providers (Steam, GOG, IGDB, SteamGridDB, OpenCritic, HowLongToBeat) are implemented natively inside `crates/omnis_core/src/metadata/` using the contracts defined in `crates/omnis_sdk`.

## Reporting Issues

Use the [issue templates](https://github.com/rinaldinie/omnis/issues/new/choose) for bugs, features and plugin requests. Security issues must be reported privately as described in [SECURITY.md](SECURITY.md).
