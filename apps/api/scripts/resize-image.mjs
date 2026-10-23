#!/usr/bin/env node
/**
 * Optional Node sharp helper for ImageResizeService when PHP GD/Imagick are unavailable.
 * Resolves sharp from apps/web/node_modules when present.
 */
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const input = arg("--input");
const output = arg("--output");
const width = Number(arg("--width") || 0);
const height = Number(arg("--height") || 0);

if (!input || !output || !width || !height) {
  console.error("Usage: resize-image.mjs --input <path> --output <path> --width N --height N");
  process.exit(2);
}

let sharp;
try {
  sharp = require(resolve(__dirname, "../../web/node_modules/sharp"));
} catch {
  try {
    sharp = require("sharp");
  } catch (err) {
    console.error("sharp not available:", err.message);
    process.exit(1);
  }
}

await sharp(input).resize(width, height, { fit: "cover" }).png().toFile(output);
console.log(JSON.stringify({ ok: true, output, width, height }));
