import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const trackerHtml = readFileSync(resolve(__dirname, "../public/gps/als-vehicle-tracker.html"), "utf8");

test("GPS tracker includes TNG eTruck provider defaults", () => {
  assert.match(trackerHtml, /id:\s*'tng'/);
  assert.match(trackerHtml, /name:\s*'TNG'/);
  assert.match(trackerHtml, /url:\s*'\/proxy\/etruck\/loc'/);
  assert.match(trackerHtml, /apiKey:\s*'98a5f0574d5e3fc35265b16d934e48ab'/);
  assert.match(trackerHtml, /customerCode:\s*'ALE\.100104'/);
  assert.match(trackerHtml, /adapter:\s*'etruck'/);
});

test("GPS tracker merges newly added default providers into saved configs", () => {
  assert.match(trackerHtml, /const loadedIds = new Set\(loaded\.map\(provider => provider\.id\)\);/);
  assert.match(trackerHtml, /DEFAULT_PROVIDERS\.forEach\(defaultProvider => \{/);
  assert.match(trackerHtml, /if \(!loadedIds\.has\(defaultProvider\.id\)\) loaded\.push\(\{ \.\.\.defaultProvider \}\);/);
});
