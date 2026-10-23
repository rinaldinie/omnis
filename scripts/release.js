#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bumpVersion, updateCargoToml, updateTauriConfig, updatePackageJson } from "./release-lib.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const uiDir = path.join(rootDir, "crates", "omnis_tauri", "ui");

const args = process.argv.slice(2);
const bumpType = args.find((a) => !a.startsWith("-")) || "patch";
const doBuild = args.includes("--build");
const doPush = args.includes("--push");
const isForce = args.includes("--force") || args.includes("-f");

// Pre-flight check: working tree status
try {
  const status = execSync("git status --porcelain", { cwd: rootDir, encoding: "utf-8" }).trim();
  if (status) {
    if (isForce) {
      console.warn("⚠️ Warning: Working tree has uncommitted changes (--force specified, proceeding anyway).");
    } else {
      console.error("❌ Error: Working tree has uncommitted changes. Please commit or stash them first, or pass --force to bypass.");
      process.exit(1);
    }
  }
} catch (e) {
  console.warn("⚠️ Warning: Could not verify git status:", e.message);
}

// 1. Read current version from root Cargo.toml
const cargoPath = path.join(rootDir, "Cargo.toml");
const tauriConfigPath = path.join(rootDir, "crates", "omnis_tauri", "tauri.conf.json");
const uiPkgPath = path.join(uiDir, "package.json");

const cargoContent = fs.readFileSync(cargoPath, "utf-8");
const match = cargoContent.match(/\[workspace\.package\][^\[]*?version\s*=\s*"([^"]+)"/);
if (!match) {
  console.error("Could not find [workspace.package].version in Cargo.toml");
  process.exit(1);
}
const currentVersion = match[1];
const newVersion = bumpVersion(currentVersion, bumpType);
const targetTag = `v${newVersion}`;

// Pre-flight check: target tag existence
try {
  const existingTag = execSync(`git tag -l "${targetTag}"`, { cwd: rootDir, encoding: "utf-8" }).trim();
  if (existingTag) {
    if (isForce) {
      console.warn(`⚠️ Warning: Git tag ${targetTag} already exists (--force specified, proceeding anyway).`);
    } else {
      console.error(`❌ Error: Git tag ${targetTag} already exists! Aborting release.`);
      process.exit(1);
    }
  }
} catch (e) {
  console.warn("⚠️ Warning: Could not check existing git tags:", e.message);
}

console.log(`\n🚀 Preparing Release: v${currentVersion} -> v${newVersion}\n`);

// 2. Update files
fs.writeFileSync(cargoPath, updateCargoToml(cargoContent, newVersion), "utf-8");
fs.writeFileSync(tauriConfigPath, updateTauriConfig(fs.readFileSync(tauriConfigPath, "utf-8"), newVersion), "utf-8");
fs.writeFileSync(uiPkgPath, updatePackageJson(fs.readFileSync(uiPkgPath, "utf-8"), newVersion), "utf-8");

console.log("✓ Updated Cargo.toml");
console.log("✓ Updated crates/omnis_tauri/tauri.conf.json");
console.log("✓ Updated crates/omnis_tauri/ui/package.json");

// 3. Synchronize package-lock.json
try {
  console.log("Synchronizing package-lock.json...");
  execSync("npm install --package-lock-only", { cwd: uiDir, stdio: "inherit" });
  console.log("✓ Synchronized crates/omnis_tauri/ui/package-lock.json");
} catch (e) {
  console.warn("⚠️ Warning: Failed to sync package-lock.json:", e.message);
}

// 4. Git commit & tag
try {
  execSync(
    `git add Cargo.toml crates/omnis_tauri/tauri.conf.json crates/omnis_tauri/ui/package.json crates/omnis_tauri/ui/package-lock.json`,
    { cwd: rootDir, stdio: "inherit" }
  );
  execSync(`git commit -m "chore(release): v${newVersion}"`, { cwd: rootDir, stdio: "inherit" });
  execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { cwd: rootDir, stdio: "inherit" });
  console.log(`✓ Created git commit and tag: v${newVersion}`);
} catch (e) {
  console.error("Git commit/tagging failed:", e.message);
  process.exit(1);
}

// 5. Optional Build
if (doBuild) {
  console.log("\n📦 Building signed Tauri update bundle...");
  execSync("npm run build && npm run tauri build", { cwd: uiDir, stdio: "inherit" });
}

// 6. Optional Push
if (doPush) {
  console.log("\n🌐 Pushing commits and tags to remote...");
  execSync("git push && git push --tags", { cwd: rootDir, stdio: "inherit" });
}

console.log(`\n🎉 Release v${newVersion} ready!\n`);
