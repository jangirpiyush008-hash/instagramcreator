// Converts icons/icon.svg → icons/icon-{16,32,48,128}.png.
//
// Usage: from repo root run  `node extension/build-icons.mjs`
//        (then uncomment the icons block in manifest.json).
//
// Requires the `sharp` npm package. Install with:
//   npm install --no-save sharp
//
// This isn't a runtime dependency — it's only needed once, right before you
// publish to the Chrome Web Store. Chrome will happily load the extension
// without any PNG icons at all (it just uses the default puzzle piece).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(here, "icons/icon.svg");

if (!existsSync(svgPath)) {
  console.error(`✗ ${svgPath} not found`);
  process.exit(1);
}

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error(
    "✗ sharp not installed. Run:\n    npm install --no-save sharp\nfrom the repo root and try again.",
  );
  process.exit(1);
}

const svg = readFileSync(svgPath);
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const outPath = resolve(here, `icons/icon-${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(outPath);
  console.log(`✓ wrote ${outPath}`);
}

console.log(
  "\nDone. Now uncomment the `icons` block in manifest.json and reload the extension.",
);
