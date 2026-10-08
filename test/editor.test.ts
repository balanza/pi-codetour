import assert from "node:assert/strict";
import { test } from "node:test";
import { nvimGotoKeys } from "../src/editor.js";

test("read-only uses :view, writable uses :edit", () => {
  assert.match(nvimGotoKeys("/repo/a.ts", 10, undefined, true), /:view \+10 \/repo\/a\.ts/);
  assert.match(nvimGotoKeys("/repo/a.ts", 10, undefined, false), /:edit \+10 \/repo\/a\.ts/);
});

test("forces normal mode and recentres", () => {
  const keys = nvimGotoKeys("/repo/a.ts", 10, undefined, true);
  assert.ok(keys.startsWith("<C-\\><C-n>:"), "starts by forcing normal mode");
  assert.ok(keys.endsWith("zz"), "recentres the view");
});

test("line is clamped to >= 1 and floored", () => {
  assert.match(nvimGotoKeys("/repo/a.ts", 0, undefined, true), /\+1 /);
  assert.match(nvimGotoKeys("/repo/a.ts", -5, undefined, true), /\+1 /);
  assert.match(nvimGotoKeys("/repo/a.ts", 7.9, undefined, true), /\+7 /);
});

test("spaces in the path are escaped", () => {
  const keys = nvimGotoKeys("/repo/my dir/a b.ts", 3, undefined, true);
  assert.ok(keys.includes("/repo/my\\ dir/a\\ b.ts"));
});

test("a valid range adds a visual selection of the right span", () => {
  // lines 10..14 -> span of 4 lines down.
  const keys = nvimGotoKeys("/repo/a.ts", 10, 14, true);
  assert.ok(keys.includes("V4j10G"), `expected V4j10G in: ${keys}`);
});

test("an endLine at or before the start adds no selection", () => {
  assert.ok(!nvimGotoKeys("/repo/a.ts", 10, 10, true).includes("V"));
  assert.ok(!nvimGotoKeys("/repo/a.ts", 10, 3, true).includes("V"));
});
