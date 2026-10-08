import assert from "node:assert/strict";
import { test } from "node:test";
import { isLandscape } from "../src/terminal.js";

test("pixel dimensions decide orientation directly", () => {
  assert.equal(isLandscape({ cols: 80, rows: 24, pixelWidth: 1600, pixelHeight: 900 }), true);
  assert.equal(isLandscape({ cols: 80, rows: 24, pixelWidth: 800, pixelHeight: 1200 }), false);
  // Exactly square counts as landscape (>=).
  assert.equal(isLandscape({ cols: 80, rows: 24, pixelWidth: 1000, pixelHeight: 1000 }), true);
});

test("without pixels, cells are approximated as twice as tall as wide", () => {
  // 200 cols vs 50 rows -> 200 >= 100 -> landscape.
  assert.equal(isLandscape({ cols: 200, rows: 50 }), true);
  // 80 cols vs 50 rows -> 80 < 100 -> portrait.
  assert.equal(isLandscape({ cols: 80, rows: 50 }), false);
  // Boundary: cols === rows*2 counts as landscape.
  assert.equal(isLandscape({ cols: 100, rows: 50 }), true);
});
