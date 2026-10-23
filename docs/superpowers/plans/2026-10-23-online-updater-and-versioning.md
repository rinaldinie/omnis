# Online Auto-Updater & Automated Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an automated versioning release script and online auto-update system for Omnis via Tauri v2's official updater plugin, supporting local staging (Local/GitHub) and production releases (GitHub).

**Architecture:** A cross-platform Node.js script (`scripts/release.js`) synchronizes versions across `Cargo.toml`, `tauri.conf.json`, and `package.json`, creating semantic commits and tags. In the client, `tauri-plugin-updater` and `@tauri-apps/plugin-updater` verify Ed25519 signatures, perform background checks on startup, and provide interactive update controls with progress tracking in the Settings UI.

**Tech Stack:** Tauri v2.1 (`tauri-plugin-updater`), React 18, TypeScript 5.7, Node.js (SemVer parser & file sync), Tailwind CSS, Lucide React icons.

## Global Constraints
- Tauri v2 syntax and configuration standards only.
- Working directory changes in shell calls must be absolute or relative to repo root.
- All version changes must be synchronized atomically across `Cargo.toml`, `crates/omnis_tauri/tauri.conf.json`, and `crates/omnis_tauri/ui/package.json`.
- Silent checks must never block or crash the application when offline or when endpoints are unreachable.
- Public key must be embedded in `tauri.conf.json`; private signing key must never be committed to git.

---

### Task 1: Automated Release Script (`scripts/release.js`)

**Files:**
- Create: `scripts/release.js`
- Create: `scripts/test-release.js`
- Modify: `package.json`
- Modify: `crates/omnis_tauri/ui/package.json`

**Interfaces:**
- Consumes: User command-line arguments: `patch`, `minor`, `major`, or `<semver>` (e.g. `0.2.1`), `--build`, `--push`.
- Produces: Atomically updated `Cargo.toml`, `crates/omnis_tauri/tauri.conf.json`, `crates/omnis_tauri/ui/package.json`, git commit `chore(release): vX.Y.Z`, git tag `vX.Y.Z`.

- [ ] **Step 1: Write test script for version bumping and file synchronization**

Create `scripts/test-release.js`:
```javascript
import assert from "node:assert";
import { bumpVersion, updateCargoToml, updateTauriConfig, updatePackageJson } from "./release-lib.js";

// Test 1: SemVer increment
assert.strictEqual(bumpVersion("0.2.0", "patch"), "0.2.1");
assert.strictEqual(bumpVersion("0.2.0", "minor"), "0.3.0");
assert.strictEqual(bumpVersion("0.2.0", "major"), "1.0.0");
assert.strictEqual(bumpVersion("0.2.0", "0.2.5"), "0.2.5");

// Test 2: Cargo.toml replacement
const cargoContent = `[workspace.package]\nversion = "0.2.0"\nedition = "2021"`;
const updatedCargo = updateCargoToml(cargoContent, "0.2.1");
assert.ok(updatedCargo.includes('version = "0.2.1"'));
assert.ok(!updatedCargo.includes('version = "0.2.0"'));

// Test 3: tauri.conf.json replacement
const tauriConfig = JSON.stringify({ productName: "Omnis", version: "0.1.0" }, null, 2);
const updatedTauri = updateTauriConfig(tauriConfig, "0.2.1");
assert.strictEqual(JSON.parse(updatedTauri).version, "0.2.1");

// Test 4: package.json replacement
const pkgJson = JSON.stringify({ name: "omnis", version: "0.1.0" }, null, 2);
const updatedPkg = updatePackageJson(pkgJson, "0.2.1");
assert.strictEqual(JSON.parse(updatedPkg).version, "0.2.1");

console.log("All release-lib tests passed successfully!");
```

- [ ] **Step 2: Run test to verify it fails (module not found)**

Run: `node scripts/test-release.js`
Expected: FAIL with `Cannot find module './release-lib.js'`

- [ ] **Step 3: Implement `scripts/release-lib.js` and `scripts/release.js`**

Create `scripts/release-lib.js`:
```javascript
export function bumpVersion(current, type) {
  const parts = current.split(".").map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid current SemVer: ${current}`);
  }
  let [major, minor, patch] = parts;
  if (type === "patch") {
    patch += 1;
  } else if (type === "minor") {
    minor += 1;
    patch = 0;
  } else if (type === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (/^\d+\.\d+\.\d+$/.test(type)) {
    return type;
  } else {
    throw new Error(`Unknown bump type: ${type}. Expected patch, minor, major, or X.Y.Z`);
  }
  return `${major}.${minor}.${patch}`;
}

export function updateCargoToml(content, newVersion) {
  return content.replace(
    /(\[workspace\.package\][\s\S]*?version\s*=\s*)"[^"]+"/,
    `$1"${newVersion}"`
  );
}

export function updateTauriConfig(content, newVersion) {
  const parsed = JSON.parse(content);
  parsed.version = newVersion;
  return JSON.stringify(parsed, null, 2) + "\n";
}

export function updatePackageJson(content, newVersion) {
  const parsed = JSON.parse(content);
  parsed.version = newVersion;
  return JSON.stringify(parsed, null, 2) + "\n";
}
```

Create `scripts/release.js`:
```javascript
#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bumpVersion, updateCargoToml, updateTauriConfig, updatePackageJson } from "./release-lib.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const bumpType = args.find((a) => !a.startsWith("-")) || "patch";
const doBuild = args.includes("--build");
const doPush = args.includes("--push");

// 1. Read current version from root Cargo.toml
const cargoPath = path.join(rootDir, "Cargo.toml");
const tauriConfigPath = path.join(rootDir, "crates", "omnis_tauri", "tauri.conf.json");
const uiPkgPath = path.join(rootDir, "crates", "omnis_tauri", "ui", "package.json");

const cargoContent = fs.readFileSync(cargoPath, "utf-8");
const match = cargoContent.match(/\[workspace\.package\][\s\S]*?version\s*=\s*"([^"]+)"/);
if (!match) {
  console.error("Could not find [workspace.package].version in Cargo.toml");
  process.exit(1);
}
const currentVersion = match[1];
const newVersion = bumpVersion(currentVersion, bumpType);

console.log(`\n🚀 Preparing Release: v${currentVersion} -> v${newVersion}\n`);

// 2. Update files
fs.writeFileSync(cargoPath, updateCargoToml(cargoContent, newVersion), "utf-8");
fs.writeFileSync(tauriConfigPath, updateTauriConfig(fs.readFileSync(tauriConfigPath, "utf-8"), newVersion), "utf-8");
fs.writeFileSync(uiPkgPath, updatePackageJson(fs.readFileSync(uiPkgPath, "utf-8"), newVersion), "utf-8");

console.log("✓ Updated Cargo.toml");
console.log("✓ Updated crates/omnis_tauri/tauri.conf.json");
console.log("✓ Updated crates/omnis_tauri/ui/package.json");

// 3. Git commit & tag
try {
  execSync(`git add Cargo.toml crates/omnis_tauri/tauri.conf.json crates/omnis_tauri/ui/package.json`, { cwd: rootDir, stdio: "inherit" });
  execSync(`git commit -m "chore(release): v${newVersion}"`, { cwd: rootDir, stdio: "inherit" });
  execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { cwd: rootDir, stdio: "inherit" });
  console.log(`✓ Created git commit and tag: v${newVersion}`);
} catch (e) {
  console.error("Git commit/tagging failed:", e.message);
  process.exit(1);
}

// 4. Optional Build
if (doBuild) {
  console.log("\n📦 Building signed Tauri update bundle...");
  execSync("npm run build", { cwd: path.join(rootDir, "crates", "omnis_tauri", "ui"), stdio: "inherit" });
}

// 5. Optional Push
if (doPush) {
  console.log("\n🌐 Pushing commits and tags to remote...");
  execSync("git push && git push --tags", { cwd: rootDir, stdio: "inherit" });
}

console.log(`\n🎉 Release v${newVersion} ready!`);
```

Update `crates/omnis_tauri/ui/package.json` to register release scripts:
```json
    "release": "node ../../../scripts/release.js",
    "release:patch": "node ../../../scripts/release.js patch",
    "release:minor": "node ../../../scripts/release.js minor",
    "release:major": "node ../../../scripts/release.js major"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-release.js`
Expected: `All release-lib tests passed successfully!`

- [ ] **Step 5: Commit**

```bash
git add scripts/release-lib.js scripts/release.js scripts/test-release.js crates/omnis_tauri/ui/package.json
git commit -m "feat(release): add automated versioning and release script"
```

---

### Task 2: Tauri Updater Backend & Permissions Configuration

**Files:**
- Modify: `crates/omnis_tauri/Cargo.toml`
- Modify: `crates/omnis_tauri/src/main.rs`
- Modify: `crates/omnis_tauri/tauri.conf.json`
- Modify: `crates/omnis_tauri/capabilities/default.json` (or create if missing)

**Interfaces:**
- Consumes: Tauri v2 plugins system.
- Produces: `tauri-plugin-updater` runtime initialization, update endpoints configured in `tauri.conf.json`, `updater:default` capability allowed for IPC.

- [ ] **Step 1: Update Cargo.toml dependencies**

In `crates/omnis_tauri/Cargo.toml`, add `tauri-plugin-updater`:
```toml
[dependencies]
tauri = { version = "2.1", features = ["protocol-asset", "tray-icon"] }
tauri-plugin-updater = "2"
```

- [ ] **Step 2: Register plugin in main.rs**

In `crates/omnis_tauri/src/main.rs`:
```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
```

- [ ] **Step 3: Configure endpoints & pubkey in tauri.conf.json**

In `crates/omnis_tauri/tauri.conf.json`, configure:
```json
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDM4MkJFMTRFQzcxRjFFMDcKUldSZjYxRmd2a25WZXp1a1pMNEtEbmtJNW12QWJ3OUN0Ym5oR1ZBMzZ2dW5qUG14T25iRml3U2IK",
      "endpoints": [
        "https://github.com/rinaldinie/omins/releases/latest/download/latest.json",
        "https://github.com/rinaldinie/omins/releases/latest/download/latest.json"
      ]
    }
  }
```

- [ ] **Step 4: Configure capabilities permissions**

Check `crates/omnis_tauri/capabilities/default.json` (or add to `crates/omnis_tauri/src`):
Ensure permission `"updater:default"` is granted in permissions array.

- [ ] **Step 5: Verify build files consistency**

Run: `cd crates/omnis_tauri/ui && ./node_modules/typescript/bin/tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 6: Commit**

```bash
git add crates/omnis_tauri/Cargo.toml crates/omnis_tauri/src/main.rs crates/omnis_tauri/tauri.conf.json
git commit -m "feat(updater): configure tauri-plugin-updater backend and endpoints"
```

---

### Task 3: Client Updater Hook & Frontend Integration (`useAppUpdater.ts`)

**Files:**
- Modify: `crates/omnis_tauri/ui/package.json`
- Create: `crates/omnis_tauri/ui/src/hooks/useAppUpdater.ts`
- Modify: `crates/omnis_tauri/ui/src/App.tsx`

**Interfaces:**
- Consumes: `@tauri-apps/plugin-updater` API (`check()`, `relaunch()`).
- Produces: `useAppUpdater` hook returning `{ status, currentVersion, availableVersion, releaseNotes, progress, error, checkForUpdates, downloadAndInstall, relaunch }`.

- [ ] **Step 1: Install `@tauri-apps/plugin-updater` in UI package.json**

In `crates/omnis_tauri/ui/package.json`:
Add `"@tauri-apps/plugin-updater": "^2.1.0"` under `dependencies`.

- [ ] **Step 2: Implement `useAppUpdater.ts`**

Create `crates/omnis_tauri/ui/src/hooks/useAppUpdater.ts`:
```typescript
import { useState, useEffect, useCallback, useRef } from "react";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "readyToInstall"
  | "error";

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percentage: number;
}

export function useAppUpdater(currentAppVersion: string = "0.2.0") {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const updateRef = useRef<any>(null);

  const checkForUpdates = useCallback(async (silent: boolean = false): Promise<boolean> => {
    try {
      setStatus("checking");
      setErrorMessage(null);

      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();

      if (update && update.available) {
        updateRef.current = update;
        setAvailableVersion(update.version);
        setReleaseNotes(update.body || null);
        setStatus("available");
        return true;
      } else {
        updateRef.current = null;
        setStatus("upToDate");
        return false;
      }
    } catch (err: any) {
      updateRef.current = null;
      if (!silent) {
        setErrorMessage(err?.message || "Impossibile verificare gli aggiornamenti");
        setStatus("error");
      } else {
        // In silent mode (at startup), fail gracefully without alerting
        setStatus("idle");
      }
      return false;
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    try {
      setStatus("downloading");
      setErrorMessage(null);
      setProgress({ downloadedBytes: 0, totalBytes: 0, percentage: 0 });

      let downloaded = 0;
      let total = 0;

      await update.downloadAndInstall((event: any) => {
        if (event.event === "Started") {
          total = event.data.contentLength || 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength || 0;
          const percentage = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          setProgress({ downloadedBytes: downloaded, totalBytes: total, percentage });
        } else if (event.event === "Finished") {
          setProgress({ downloadedBytes: total, totalBytes: total, percentage: 100 });
        }
      });

      setStatus("readyToInstall");
    } catch (err: any) {
      setErrorMessage(err?.message || "Download dell'aggiornamento fallito");
      setStatus("error");
    }
  }, []);

  const relaunch = useCallback(async () => {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      window.location.reload();
    }
  }, []);

  return {
    status,
    currentVersion: currentAppVersion,
    availableVersion,
    releaseNotes,
    progress,
    errorMessage,
    checkForUpdates,
    downloadAndInstall,
    relaunch,
  };
}
```

- [ ] **Step 3: Integrate silent background check in `App.tsx`**

In `crates/omnis_tauri/ui/src/App.tsx`:
- Import `useAppUpdater`.
- Initialize `const updater = useAppUpdater("0.2.0");`.
- In a `useEffect`, after a 4-second timeout, invoke `updater.checkForUpdates(true)`.
- If `updater.status === "available"`, render non-blocking notification toast:
```tsx
{updater.status === "available" && (
  <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 p-4 rounded-2xl bg-slate-900/95 border border-sky-500/50 text-white shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5">
    <Sparkles className="w-5 h-5 text-sky-400" />
    <div>
      <h4 className="text-xs font-bold text-white">Aggiornamento {updater.availableVersion} disponibile!</h4>
      <p className="text-[11px] text-slate-400">Apri le Impostazioni per scaricarlo.</p>
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd crates/omnis_tauri/ui && ./node_modules/typescript/bin/tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 5: Commit**

```bash
git add crates/omnis_tauri/ui/package.json crates/omnis_tauri/ui/src/hooks/useAppUpdater.ts crates/omnis_tauri/ui/src/App.tsx
git commit -m "feat(updater): add useAppUpdater hook and background startup check"
```

---

### Task 4: Settings UI & Manual Update Controls

**Files:**
- Modify: `crates/omnis_tauri/ui/src/components/GeneralSettingsTab.tsx`
- Modify: `crates/omnis_tauri/ui/src/i18n/types.ts`
- Modify: `crates/omnis_tauri/ui/src/i18n/locales/*.ts` (all 6 languages)

**Interfaces:**
- Consumes: `updater` object from `useAppUpdater` passed via props or context.
- Produces: Dedicated "Aggiornamenti & Versione" card in General Settings with interactive status, progress bar, release notes, and relaunch button.

- [ ] **Step 1: Add i18n keys for updater**

In `crates/omnis_tauri/ui/src/i18n/types.ts`, add under `general_settings`:
```typescript
    updater_title: string;
    updater_desc: string;
    updater_current_version: string;
    updater_check_button: string;
    updater_checking: string;
    updater_up_to_date: string;
    updater_available: string;
    updater_download_button: string;
    updater_downloading: string;
    updater_ready_to_install: string;
    updater_relaunch_button: string;
    updater_error: string;
```
Add translations to `it.ts`, `en.ts`, `de.ts`, `es.ts`, `fr.ts`, `ja.ts`.

- [ ] **Step 2: Add updater controls in `GeneralSettingsTab.tsx`**

In `crates/omnis_tauri/ui/src/components/GeneralSettingsTab.tsx`:
Add an "Aggiornamenti & Informazioni Versione" card:
```tsx
<div className="p-5 rounded-2xl border border-white/10 bg-slate-800/40 space-y-4">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
        <Sparkles className="w-5 h-5" />
      </div>
      <div>
        <h4 className="text-sm font-bold text-white">{t('general_settings.updater_title')}</h4>
        <p className="text-xs text-slate-400">{t('general_settings.updater_desc')}</p>
      </div>
    </div>
    <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-white/10 text-white">
      v{updater.currentVersion}
    </span>
  </div>

  {updater.status === "available" && (
    <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-200 text-xs space-y-2">
      <div className="font-bold flex items-center gap-2">
        <ArrowDownCircle className="w-4 h-4 text-sky-400" />
        <span>Nuova versione v{updater.availableVersion} disponibile!</span>
      </div>
      {updater.releaseNotes && <p className="text-slate-300 whitespace-pre-line">{updater.releaseNotes}</p>}
    </div>
  )}

  {updater.status === "downloading" && updater.progress && (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-slate-400">
        <span>Scaricamento in corso...</span>
        <span>{updater.progress.percentage}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-slate-700 overflow-hidden">
        <div className="h-full bg-sky-500 transition-all duration-200" style={{ width: `${updater.progress.percentage}%` }} />
      </div>
    </div>
  )}

  {updater.status === "readyToInstall" && (
    <button
      onClick={() => updater.relaunch()}
      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2"
    >
      <RefreshCw className="w-4 h-4" />
      <span>{t('general_settings.updater_relaunch_button')}</span>
    </button>
  )}

  {updater.status !== "readyToInstall" && updater.status !== "downloading" && (
    <button
      onClick={() => updater.status === "available" ? updater.downloadAndInstall() : updater.checkForUpdates(false)}
      disabled={updater.status === "checking"}
      className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
    >
      {updater.status === "checking" && <RefreshCw className="w-4 h-4 animate-spin" />}
      <span>
        {updater.status === "available" ? t('general_settings.updater_download_button') : t('general_settings.updater_check_button')}
      </span>
    </button>
  )}
</div>
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd crates/omnis_tauri/ui && ./node_modules/typescript/bin/tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 4: Commit**

```bash
git add crates/omnis_tauri/ui/src/components/GeneralSettingsTab.tsx crates/omnis_tauri/ui/src/i18n/
git commit -m "feat(updater): add update management UI and localization"
```

---

### Task 5: Operator Guide & Local Test Server (`docs/RELEASE_GUIDE.md`)

**Files:**
- Create: `docs/RELEASE_GUIDE.md`
- Create: `scripts/serve-test-update.js`

**Interfaces:**
- Consumes: Built bundles in `dist-release/`.
- Produces: Live HTTP test server serving `latest.json` on `http://127.0.0.1:8080` and complete operator documentation.

- [ ] **Step 1: Create local mock update server script**

Create `scripts/serve-test-update.js`:
```javascript
#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist-release");
const PORT = 8080;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const filePath = path.join(distDir, req.url === "/" ? "latest.json" : req.url);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const contentType = ext === ".json" ? "application/json" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`File not found: ${req.url}`);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n📡 Local Update Test Server running on http://127.0.0.1:${PORT}`);
  console.log(`Serving files from: ${distDir}\n`);
});
```

- [ ] **Step 2: Create comprehensive operator guide `docs/RELEASE_GUIDE.md`**

Write `docs/RELEASE_GUIDE.md` including:
1. Come rilasciare una nuova versione (comandi `npm run release:patch`, `minor`, `major`).
2. Come generare e conservare le chiavi crittografiche (`tauri signer generate`).
3. Procedura di test in locale (`node scripts/serve-test-update.js`).
4. Procedura di rilascio su Local/GitHub locale (`http://localhost:8080/...`).
5. Procedura di migrazione finale e pubblicazione su GitHub (`https://github.com/rinaldinie/omins.git`).
6. Risoluzione dei problemi comuni.

- [ ] **Step 3: Force add and commit**

```bash
git add -f docs/RELEASE_GUIDE.md scripts/serve-test-update.js
git commit -m "docs: add release guide and local update test server script"
```
