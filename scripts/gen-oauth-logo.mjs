// One-off: rasterize the DecodeCreator brand SVG into a 512×512 PNG suitable
// for the Google OAuth consent screen. Kept in scripts/ so it's easy to
// re-run if the brand mark ever changes. Not wired into the build.
//
// Usage: `node scripts/gen-oauth-logo.mjs` → writes decodecreator-logo.png
// in this directory. Upload that file in Google Cloud → Google Auth
// Platform → Branding → App logo.

import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(resolve(here, "../extension/icons/icon.svg"));

const png = await sharp(svg, { density: 512 })
  .resize(512, 512)
  .png()
  .toBuffer();

const out = resolve(here, "decodecreator-logo.png");
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length.toLocaleString()} bytes)`);
