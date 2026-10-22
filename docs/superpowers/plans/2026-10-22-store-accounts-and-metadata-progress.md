# Store Accounts Integration, Mandatory Steam API Key & Progress Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a Playnite-parity store accounts configuration UI for all platforms, make the Steam Web API Key and SteamID64 mandatory with secure Vault storage, fix the progress/achievements synchronization button with explicit user feedback, and introduce a prominent progress bar in the game update modal while replacing "arricchisci" with "Scarica Dati e Copertine".

**Architecture:** 
- Backend (Tauri / Rust): Add `save_store_integration_settings` to validate and persist store options into SQLite and credentials into `SecretVault`. Update `refresh_game_achievements` and `SteamPlugin` to deterministically use the configured API key and emit actionable errors.
- Frontend (React / TypeScript / Tailwind): Redesign `StoreAccountsTab` with a 2-column sidebar-and-tabs layout matching Playnite. Update `GameAchievementsGallery` with clear visual sync states and recovery actions. Upgrade `BatchEnrichModal` and `PluginManagerModal` with continuous progress indicators and rename technical "arricchisci" terminology to user-friendly copy.

**Tech Stack:** Rust (Tauri v2, Tokio, SQLite, SecretVault AES-256-GCM), React 18, TypeScript, Tailwind CSS, Lucide icons.

## Global Constraints
- Preserves existing comments and docstrings.
- Steam API Key (32 hex characters) and SteamID64 (17 digits) must be mandatory for Steam cloud/achievements integration.
- Replace "Arricchisci / Arricchimento" with "Scarica Dati e Copertine" / "Aggiorna Dati" in Italian locales and "Download Metadata & Covers" in English.
- TypeScript build (`npm run build`) and Rust compilation (`cargo check`) must pass with zero errors.

---

### Task 1: Backend - Mandatory Steam API Key Storage & Store Integration Settings IPC

**Files:**
- Modify: `crates/omnis_tauri/src/store_manager.rs`
- Modify: `crates/omnis_tauri/src/commands/stores.rs`
- Modify: `crates/omnis_tauri/src/main.rs`
- Modify: `plugins/omnis_plugin_steam/src/achievements.rs`
- Modify: `plugins/omnis_plugin_steam/src/client.rs`
- Modify: `plugins/omnis_plugin_steam/src/lib.rs`
- Test: `crates/omnis_tauri/tests/` or `crates/omnis_core/tests/store_cloud_sync_tests.rs`

**Interfaces:**
- Produces: `save_store_integration_settings(store_id: String, settings: serde_json::Value, app_handle: AppHandle, state: State<AppState>) -> Result<(), String>`
- Produces: `get_store_integration_settings(store_id: String, state: State<AppState>) -> Result<StoreIntegrationSettingsDto, String>`

- [ ] **Step 1: Write unit test for Steam API key validation and secure session saving**
  - Verify that saving Steam integration without an API key or with invalid SteamID64 fails with a validation error.
  - Verify that saving with a valid 32-character key and 17-digit SteamID64 succeeds, encrypts into SecretVault, and updates the active session.

- [ ] **Step 2: Implement `save_store_integration_settings` in `store_manager.rs` and `commands/stores.rs`**
  - Support common settings (`import_installed`, `import_uninstalled`, `ignore_other_accounts`).
  - For Steam: enforce non-empty `api_key` and `steam_id64`. Save session with `user_id = steam_id64` and `access_token = api_key`.
  - Save settings in SQLite configuration table.

- [ ] **Step 3: Update `SteamPlugin` to enforce Web API Key**
  - In `plugins/omnis_plugin_steam/src/achievements.rs`, ensure `fetch_achievements` retrieves the key from `session.access_token` and doesn't silently swallow errors.
  - In `plugins/omnis_plugin_steam/src/client.rs`, remove unreliable XML fallback when key is missing, explicitly returning an error that the Web API key is required.

- [ ] **Step 4: Register IPC commands in `main.rs` and test with `cargo test`**
  - Run `cargo test -p omnis_tauri -p omnis_plugin_steam` to verify tests pass.

- [ ] **Step 5: Commit changes**
  - `git commit -m "feat(backend): enforce mandatory steam api key and store integration settings"`

---

### Task 2: Backend - Achievements Refresh Command & Clear Error Contract

**Files:**
- Modify: `crates/omnis_tauri/src/commands/achievements.rs`

**Interfaces:**
- Produces: Detailed error messages for `refresh_game_achievements` (e.g. `ERR_CREDENTIALS_MISSING: Configura la Steam Web API Key negli Account Store...`).

- [ ] **Step 1: Update `refresh_game_achievements_internal` in `commands/achievements.rs`**
  - When game library is `steam`, check if session and API key are configured in `store_account_manager`.
  - If missing, return an error message that directs the user to configure the Steam Web API Key in Store Accounts.
  - For `gog`, `epic`, `xbox`, ensure token expiration triggers automatic refresh or returns clear authentication error.

- [ ] **Step 2: Verify `commands/achievements.rs` compiles cleanly**
  - Run `cargo check -p omnis_tauri`.

- [ ] **Step 3: Commit changes**
  - `git commit -m "feat(backend): return actionable error messages from refresh_game_achievements"`

---

### Task 3: UI - Replace "Arricchisci" Terminology with "Scarica Dati e Copertine"

**Files:**
- Modify: `crates/omnis_tauri/ui/src/i18n/locales/it.ts`
- Modify: `crates/omnis_tauri/ui/src/i18n/locales/en.ts`
- Modify: `crates/omnis_tauri/ui/src/i18n/locales/es.ts`
- Modify: `crates/omnis_tauri/ui/src/i18n/locales/fr.ts`
- Modify: `crates/omnis_tauri/ui/src/i18n/locales/de.ts`
- Modify: `crates/omnis_tauri/ui/src/i18n/locales/ja.ts`
- Modify: `crates/omnis_tauri/ui/src/components/navigation/TopBar.tsx`
- Modify: `crates/omnis_tauri/ui/src/components/views/DetailsSplitView.tsx`

- [ ] **Step 1: Update i18n keys for all locales**
  - In `it.ts`:
    - `enrich_button`: "Scarica Dati e Copertine"
    - `enrich_tooltip`: "Scarica locandine HD, sfondi, voti e tempi di gioco per i titoli selezionati"
    - `enrich_pipeline`: "Scarica Dati Gioco"
    - `enriching`: "Download dati in corso..."
    - `pipeline_running`: "Scaricamento dati catalogo in corso..."
  - In `en.ts`, `es.ts`, `fr.ts`, `de.ts`, `ja.ts`: adapt accordingly with standard terms ("Download Metadata & Covers").

- [ ] **Step 2: Update references in `TopBar.tsx` and `DetailsSplitView.tsx`**
  - Ensure labels, tooltips, and status messages reflect the simplified terminology.

- [ ] **Step 3: Commit changes**
  - `git commit -m "refactor(i18n): replace niche arricchisci with scarica dati e copertine"`

---

### Task 4: UI - Continuous Progress Bar in Modal for Updating All Games

**Files:**
- Modify: `crates/omnis_tauri/ui/src/components/modals/BatchEnrichModal.tsx`
- Modify: `crates/omnis_tauri/ui/src/components/modals/PluginManagerModal.tsx`
- Modify: `crates/omnis_tauri/ui/src/App.tsx`

**Interfaces:**
- Consumes: Tauri event `metadata-progress` `{ current: number, total: number, title: string }`.

- [ ] **Step 1: Enhance `BatchEnrichModal.tsx` with prominent live progress bar**
  - Header: "Scarica Dati e Copertine"
  - When `isRunning` is true:
    - Display large percentage text (e.g. `45%`) with pulse effect.
    - Display current counter: `15 di 33 giochi completati`.
    - Prominently display the active game title: `Download per: "Cyberpunk 2077"`.
    - Animated progress bar with smooth transition (`transition-all duration-300`).
    - Visible `[ Ferma ]` button calling `cancel_metadata_download`.
  - When finished: show completion badge with total updated titles and `[ Chiudi ]`.

- [ ] **Step 2: Update `PluginManagerModal.tsx` massive pipeline section**
  - Add visual progress bar matching `BatchEnrichModal` when library download is running, replacing the plain text string.

- [ ] **Step 3: Test modal rendering and event handling in UI**
  - Verify with TypeScript check `npm run build`.

- [ ] **Step 4: Commit changes**
  - `git commit -m "feat(ui): add prominent progress bar in batch metadata update modal"`

---

### Task 5: UI - Playnite-Parity Store Accounts Configuration (`StoreAccountsTab.tsx`)

**Files:**
- Modify: `crates/omnis_tauri/ui/src/components/StoreAccountsTab.tsx`
- Create / Split helper components in: `crates/omnis_tauri/ui/src/components/store_accounts/`
  - `PlatformSidebar.tsx`: sidebar listing platforms (Steam, Epic, GOG, Xbox, Amazon Games, Altri).
  - `StoreGeneralTab.tsx`: "Generale" tab with checkboxes and platform-specific authentication forms.
  - `StoreAdvancedTab.tsx`: "Avanzate" tab for custom paths and options.

**Interfaces:**
- Matches `Screenshot 2026-10-22 182018.png` layout.
- Provides mandatory Steam fields: Account ID (SteamID64) and Chiave API with direct links ("Ottieni ID account", "Ottieni la chiave API").
- Disables / highlights Steam save if API key or SteamID64 is empty.

- [ ] **Step 1: Implement Store Accounts layout with sidebar and tabs**
  - Left column: vertical list of platforms with icons, active highlight, and connected status pill.
  - Top tabs: `Generale`, `Account aggiuntivi`, `Avanzate`.
  - Footer: note `* Le impostazioni vengono salvate nel Vault locale`, `[ Sincronizza Ora ]`, `[ Salva ]`, `[ Cancella ]`.

- [ ] **Step 2: Implement "Generale" tab for Steam matching screenshot**
  - `[x] Importa i giochi installati`
  - `[x] Connetti l'account` with status badge: `L'utente è autenticato` (green) / `Non autenticato` (slate/amber).
  - `[x] Importa giochi non installati`
  - `[x] Ignora giochi installati da altri account`
  - Mandatory API Key Login section:
    - `ID account (SteamID64)` input + link/button `Ottieni ID account` (opens steam profile URL / steamid finder).
    - `Chiave API` password input + link/button `Ottieni la chiave API` (opens `https://steamcommunity.com/dev/apikey`).
    - `[ ] Importa generici articoli gratuiti`
    - `[x] Importa giochi condivisi in famiglia`
  - Link: `Risoluzione dei problemi` (with helpful guidance modal/tooltip).

- [ ] **Step 3: Implement "Generale" tab for Epic, GOG, Xbox**
  - Common checkboxes: `Importa i giochi installati`, `Importa giochi non installati`, `Ignora giochi installati da altri account`.
  - Dedicated OAuth Connect / Disconnect button with authenticated user details (username, avatar, last sync timestamp).

- [ ] **Step 4: Wire saving and validation logic**
  - Call `save_store_integration_settings` on `[ Salva ]`.
  - Block saving Steam if API key or SteamID64 is missing, displaying clear validation feedback.
  - Provide instant `[ Sincronizza Ora ]` button for the active platform.

- [ ] **Step 5: Verify UI build**
  - Run `npm run build` in `crates/omnis_tauri/ui`.

- [ ] **Step 6: Commit changes**
  - `git commit -m "feat(ui): redesign store accounts tab to match playnite integration dialog"`

---

### Task 6: UI - Fix Achievements Gallery Sync Button & Visual Feedback

**Files:**
- Modify: `crates/omnis_tauri/ui/src/components/achievements/GameAchievementsGallery.tsx`

**Interfaces:**
- Consumes: `refresh_game_achievements(gameId: string)`.

- [ ] **Step 1: Enhance `fetchAchievements` in `GameAchievementsGallery.tsx`**
  - Track `error: string | null` state.
  - While refreshing: show animated spinner with text: `"Sincronizzazione obiettivi dallo store in corso..."`.
  - If call succeeds: clear error, show updated achievements, play success sound effect.
  - If call fails: capture error message and display an inline alert:
    - If error indicates missing API key: display `"Chiave Steam Web API non configurata."` with button `[ Configura nelle Impostazioni ]`.
    - If other error: display `"Impossibile sincronizzare gli obiettivi: <errore>"` with retry button.
  - If store has no achievements: display `"Nessun obiettivo registrato per questo gioco su <Store>"`.

- [ ] **Step 2: Commit changes**
  - `git commit -m "fix(ui): provide visual feedback and error recovery for achievements sync button"`

---

### Task 7: Full Verification & Integration Test

- [ ] **Step 1: Compile all Rust crates**
  - Run `cargo test --all` and `cargo check --all`.
- [ ] **Step 2: Build frontend**
  - Run `npm run build` in `crates/omnis_tauri/ui`.
- [ ] **Step 3: End-to-end sanity check**
  - Verify zero TypeScript or Rust compiler warnings/errors.
- [ ] **Step 4: Final commit and summary**
