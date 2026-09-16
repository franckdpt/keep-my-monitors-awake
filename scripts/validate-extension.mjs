import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));

if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json must use Manifest V3.");
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
