/**
 * Assembles the loadable MV3 extension in apps/extension/dist:
 *  - runs the two Vite builds (page/service-worker + content script)
 *  - copies the manifest and public assets
 *  - copies tesseract OCR assets (best effort) so OCR runs fully local
 *  - downloads a small OCR language model (best effort; skipped offline)
 */
import { execSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, "..");
const distDir = join(appDir, "dist");
const publicDir = join(appDir, "public");
const ocrDir = join(distDir, "ocr");
const langDir = join(ocrDir, "lang");

function run(label, cmd) {
  console.log(`[build] ${label}`);
  execSync(cmd, { cwd: appDir, stdio: "inherit" });
}

run("icons", "node scripts/icons.mjs");
run("vite (main)", "npx vite build --config vite.config.ts");
run("vite (content)", "npx vite build --config vite.content.config.ts");

// manifest + icons
copyFileSync(join(appDir, "manifest.json"), join(distDir, "manifest.json"));
if (existsSync(publicDir)) cpSync(publicDir, distDir, { recursive: true });

// --- OCR assets (best effort) ---
mkdirSync(ocrDir, { recursive: true });
mkdirSync(langDir, { recursive: true });

const candidates = [
  { local: "node_modules/tesseract.js/dist/worker.min.js", dest: "ocr/worker.min.js" },
  { local: "node_modules/tesseract.js/dist/tesseract.min.js", dest: "ocr/tesseract.min.js" },
];

for (const c of candidates) {
  const hoisted = join(resolve(appDir, "../../node_modules"), "tesseract.js/dist/" + c.local.split("/").pop());
  const src = existsSync(join(appDir, c.local)) ? join(appDir, c.local) : existsSync(hoisted) ? hoisted : null;
  if (src) copyFileSync(src, join(distDir, c.dest));
}

// tesseract.js-core: copy all files so the wasm loader can resolve neighbours.
const coreCandidates = [
  join(appDir, "node_modules/tesseract.js-core"),
  resolve(appDir, "../../node_modules/tesseract.js-core"),
];
const coreDir = coreCandidates.find((p) => existsSync(p));
if (coreDir) {
  const coreOut = join(ocrDir, "core");
  mkdirSync(coreOut, { recursive: true });
  for (const f of readdirSync(coreDir)) {
    const full = join(coreDir, f);
    if (statSync(full).isFile()) copyFileSync(full, join(coreOut, f));
  }
  console.log("[build] tesseract-core copied from", coreDir);
} else {
  console.log("[build] WARN: tesseract.js-core not found; OCR will be unavailable");
}

// Language model (best effort; skip offline)
const langUrl = "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz";
const langFile = join(langDir, "eng.traineddata.gz");
if (!existsSync(langFile)) {
  try {
    const res = await fetch(langUrl, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(langFile, buf);
      console.log("[build] OCR language model downloaded");
    } else {
      console.log("[build] WARN: OCR language model download failed; OCR needs network at runtime");
    }
  } catch (err) {
    console.log("[build] WARN: OCR language model download skipped (offline?) —", err.message);
  }
}

console.log("\n[build] done →", distDir);