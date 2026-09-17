import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);

if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json must use Manifest V3.");
}

if (manifest.version !== packageJson.version) {
  throw new Error("manifest.json and package.json versions must match.");
}

for (const permission of ["alarms", "idle", "offscreen", "storage", "tabs"]) {
  if (!manifest.permissions?.includes(permission)) {
    throw new Error(`manifest.json is missing the ${permission} permission.`);
  }
}

const requiredFiles = new Set([
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...Object.values(manifest.icons ?? {}),
  "offscreen.html",
  "offscreen.js",
  "tone.wav",
]);

for (const relativePath of requiredFiles) {
  if (!relativePath) {
    throw new Error("manifest.json contains an empty required path.");
  }
  await access(resolve(root, relativePath));
}

console.log(`Validated Manifest V${manifest.manifest_version} ${manifest.version}.`);
