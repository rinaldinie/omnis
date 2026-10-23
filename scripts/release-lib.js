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
    /(\[workspace\.package\][^\[]*?version\s*=\s*)"[^"]+"/,
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
