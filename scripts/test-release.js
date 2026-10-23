import assert from "node:assert";
import { bumpVersion, updateCargoToml, updateTauriConfig, updatePackageJson } from "./release-lib.js";

// Test 1: SemVer increment
assert.strictEqual(bumpVersion("0.2.0", "patch"), "0.2.1");
assert.strictEqual(bumpVersion("0.2.0", "minor"), "0.3.0");
assert.strictEqual(bumpVersion("0.2.0", "major"), "1.0.0");
assert.strictEqual(bumpVersion("0.2.0", "0.2.5"), "0.2.5");

// Error handling in bumpVersion
assert.throws(() => bumpVersion("invalid", "patch"), /Invalid current SemVer/);
assert.throws(() => bumpVersion("0.2", "patch"), /Invalid current SemVer/);
assert.throws(() => bumpVersion("0.2.0", "invalid-type"), /Unknown bump type/);

// Test 2: Cargo.toml replacement
const cargoContent = `[workspace]
members = ["crates/omnis_core"]

[workspace.package]
version = "0.2.0"
edition = "2021"

[workspace.dependencies]
serde = { version = "1.0", features = ["derive"] }
`;
const updatedCargo = updateCargoToml(cargoContent, "0.2.1");
assert.ok(updatedCargo.includes('version = "0.2.1"'));
assert.ok(!updatedCargo.includes('version = "0.2.0"'));
assert.ok(updatedCargo.includes('serde = { version = "1.0"'), "Dependencies should not be mutated");

const cargoWithoutPackageVersion = `[workspace.package]
edition = "2021"

[workspace.dependencies]
foo = { version = "1.0.0" }
`;
const notUpdated = updateCargoToml(cargoWithoutPackageVersion, "2.0.0");
assert.strictEqual(notUpdated, cargoWithoutPackageVersion, "Should not match version in subsequent sections");

// Test 3: tauri.conf.json replacement
const tauriConfig = JSON.stringify({ productName: "Omnis", version: "0.1.0", bundle: { active: true } }, null, 2);
const updatedTauri = updateTauriConfig(tauriConfig, "0.2.1");
const parsedTauri = JSON.parse(updatedTauri);
assert.strictEqual(parsedTauri.version, "0.2.1");
assert.strictEqual(parsedTauri.productName, "Omnis");
assert.strictEqual(parsedTauri.bundle.active, true);

// Test 4: package.json replacement
const pkgJson = JSON.stringify({ name: "omnis", version: "0.1.0", dependencies: { react: "^18.0.0" } }, null, 2);
const updatedPkg = updatePackageJson(pkgJson, "0.2.1");
const parsedPkg = JSON.parse(updatedPkg);
assert.strictEqual(parsedPkg.version, "0.2.1");
assert.strictEqual(parsedPkg.name, "omnis");
assert.strictEqual(parsedPkg.dependencies.react, "^18.0.0");

console.log("All release-lib tests passed successfully!");
