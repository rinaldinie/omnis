# Design Spec: Store Accounts Integration (Playnite-Parity), Steam API Key Enforcement, Progress Sync & Metadata Modal Progress

- **Date:** 2026-10-22
- **Status:** Approved
- **Scope:** 
  1. Fix progress/achievements synchronization button behavior and feedback.
  2. Enforce mandatory Steam Web API Key and SteamID64 configuration.
  3. Redesign Store Accounts configuration dialog to match Playnite architecture (sidebar platforms, tabs, checkboxes, API fields) across all managed stores.
  4. Add prominent progress bar and live status in the modal updating all games ("Scarica Dati e Copertine"), eliminating niche "arricchisci" terminology.

---

## 1. Context & Problem Statement

1. **Non-functional Progress / Achievements Synchronization Button:**
   - In `GameAchievementsGallery.tsx`, clicking the "Sincronizza" / refresh button failed silently when credentials were missing or an error occurred. The IPC call `refresh_game_achievements` threw an error that was swallowed with `console.warn`, leaving the UI unchanged.
   - For Steam, `SteamPlugin::fetch_achievements` required an API key, but user login via OpenID web login created sessions with dummy tokens (`steam_session:...`), leading to recurring silent failures.
2. **Missing Mandatory API Key Enforcement:**
   - Valve has deprecated open Community XML endpoints and enforces Web API keys for accessing player achievements and owned library games. Steam integration in Omnis must require a valid Web API Key and numeric SteamID64.
3. **Store Accounts Configuration Parity:**
   - As illustrated by `Screenshot 2026-10-22 182018.png`, users expect a Playnite-style store integration manager:
     - Left sidebar listing platforms (Steam, Epic, GOG, Xbox, Amazon Games, etc.).
     - Tabs for the active store (`Generale`, `Account aggiuntivi`, `Avanzate`).
     - Standardized checkboxes: "Importa i giochi installati", "Connetti l'account", "Importa giochi non installati", "Ignora giochi installati da altri account", with store-specific authentication fields.
4. **Unintuitive Terminology & Missing Progress in Batch Metadata Update Modal:**
   - The term "Arricchisci / Arricchimento / Diamond Pipeline" is unintuitive.
   - When updating all games or batch metadata, the modal or settings lacked a clear visual progress bar showing exact game titles, completed counts, and percentage.

---

## 2. Terminology Updates (UI & i18n)

Replace all instances of "Arricchisci / Arricchimento" with standard launcher terminology across Italian and English:
- Italian: **"Scarica Dati e Copertine"** / **"Scarica Metadati e Copertine"** (action: **"Scarica Dati"** / **"Aggiorna Dati"**).
- English: **"Download Metadata & Covers"** (action: **"Download Metadata"**).
- Sub-filters:
  - "Senza HowLongToBeat" -> "Senza Tempi di Gioco (HLTB)"
  - "Senza Copertina" -> "Senza Copertina"
  - "Tutta la Libreria" -> "Tutti i Giochi della Libreria"
  - "Filtro / Ricerca Attiva" -> "Giochi Filtrati Attuali"

---

## 3. Architecture & Component Design

### 3.1 Store Accounts Configuration Interface (`StoreAccountsTab.tsx`)
Redesign `StoreAccountsTab.tsx` into a 2-column Playnite-style configuration view:

```
+---------------------------------------------------------------------------------------+
|  Configura Integrazioni Store                                                         |
+---------------------+-----------------------------------------------------------------+
| Platforms Sidebar   | Store Tabs: [ Generale ] [ Account aggiuntivi ] [ Avanzate ]    |
|                     +-----------------------------------------------------------------+
| [x] Steam           | [x] Importa i giochi installati                                 |
| [ ] Epic Games      | [x] Connetti l'account          [ L'utente è autenticato ]      |
| [ ] GOG Galaxy      |     [x] Importa giochi non installati                           |
| [ ] Xbox Live       |     [x] Ignora giochi installati da altri account               |
| [ ] Amazon Games    |                                                                 |
| [ ] Custom / Other  |     Autenticazione Steam Web API (Obbligatoria)                 |
|                     |     ID account:   [ 76561198016913702 ]  [ Ottieni ID account ] |
|                     |     Chiave API:   [ ••••••••••••••••• ]  [ Ottieni chiave API ] |
|                     |     [ ] Importa generici articoli gratuiti                      |
|                     |     [x] Importa giochi condivisi in famiglia                    |
|                     |                                                                 |
|                     |     [ Risoluzione dei problemi ]                                |
+---------------------+-----------------------------------------------------------------+
| * Richiede il salvataggio per applicare           [ Sincronizza Ora ] [ Salva ]       |
+---------------------------------------------------------------------------------------+
```

#### Platform Options Schema:
- **Common Options:**
  - `import_installed: boolean` (default: true)
  - `connect_account: boolean` (indicates account connection status)
  - `import_uninstalled: boolean` (default: true)
  - `ignore_other_accounts: boolean` (default: true)
- **Steam Specific:**
  - `steam_id64: string` (required, 17 digits)
  - `api_key: string` (required, 32 hex chars)
  - `import_free_items: boolean` (default: false)
  - `import_family_sharing: boolean` (default: true)
- **Epic Games Specific:**
  - OAuth browser login window via existing webview flow.
  - Username & account id display.
  - `[ Connetti Account Epic ]` / `[ Disconnetti ]`
- **GOG Galaxy Specific:**
  - OAuth GOG connect flow.
  - `[ Connetti Account GOG ]` / `[ Disconnetti ]`
- **Xbox Specific:**
  - Xbox Live authentication.
  - `[ Connetti Account Microsoft / Xbox ]` / `[ Disconnetti ]`
  - `import_game_pass: boolean` (default: true)

### 3.2 Steam API Key Mandatory Validation & Backend Storage
- **IPC Command:** `save_store_integration_settings(store_id: String, payload: Value)`
- For Steam:
  - Validates `api_key` non-empty and `steam_id64` (17 digits).
  - Securely encrypts `api_key` into `SecretVault` under key `steam:api_key`.
  - Creates/updates `StoreAccountSession` for Steam with `user_id = steam_id64`, storing `api_key` as `access_token` so achievement and library providers immediately use it.
  - Persists store preferences in SQLite settings table.
  - Test ping verifies the key against `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/`.

### 3.3 Progress / Achievements Synchronization Fix (`GameAchievementsGallery.tsx`)
- In `refresh_game_achievements_internal` (`crates/omnis_tauri/src/commands/achievements.rs`):
  - Fetches the active `StoreAccountSession` and `SecretVault` key for the game's store (`steam`, `epic`, `gog`, `xbox`).
  - If credentials are not configured, returns clear error string: `"Configura la Steam Web API Key negli Account Store per sincronizzare gli obiettivi."`
- In `GameAchievementsGallery.tsx`:
  - Show loading state while `refreshing = true` (`"Sincronizzazione obiettivi in corso..."`).
  - On error: display informative banner with button: `[ Apri Impostazioni Store ]` which switches to the Store Accounts configuration tab.
  - On success with 0 achievements: display: `"Nessun obiettivo registrato per questo gioco su {Store}"`.
  - On success with achievements: immediately update UI stats, progress bar, and achievement cards with sound effect.

### 3.4 Modal for Updating All Games (`BatchEnrichModal.tsx` & `PluginManagerModal.tsx`)
- Rename header and text: **"Scarica Dati e Copertine"** (instead of "Arricchimento Massivo").
- **Prominent Progress Bar Component:**
  - Shown whenever a batch download is running.
  - Live game title: `"Download dati per: <Titolo Gioco>"`
  - Counter: `<Current> / <Total> (<Percent>%)`
  - High-visibility progress bar with smooth transition and glow.
  - Secondary status: e.g. `"Ricerca copertine SteamGridDB, recensioni OpenCritic e tempi di gioco..."`
  - `[ Ferma ]` cancel button connected to `cancel_metadata_download`.
  - Completion summary banner upon completion with `[ Chiudi ]`.

---

## 4. Verification & Testing Plan

1. **Unit & Backend Tests:**
   - Test Steam API key validation & session persistence in `crates/omnis_tauri/src/store_manager.rs`.
   - Test achievement retrieval with valid key vs missing key returning actionable error.
2. **Frontend UI Tests:**
   - Verify `StoreAccountsTab` sidebar navigation between Steam, Epic, GOG, Xbox, and future platforms.
   - Test validation of required fields on Steam: Save button blocked if API key or SteamID64 is empty.
   - Verify achievement gallery "Sincronizza" button shows spinner, handles errors gracefully, and shows achievements on success.
   - Verify the "Scarica Dati e Copertine" modal shows the animated progress bar, updates title on each event, and calculates percentage correctly.
3. **Build & Lint Verification:**
   - Run `cargo check` and `npm run build` in `crates/omnis_tauri/ui` to guarantee zero compilation or type errors.
