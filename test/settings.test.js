import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SETTINGS,
  iconPaths,
  normalizeSettings,
} from "../lib/settings.js";

test("normalizeSettings applies safe defaults", () => {
  assert.deepEqual(normalizeSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ intervalMinutes: 3, volume: "nope" }), {
    enabled: true,
    intervalMinutes: 10,
    smartMode: true,
    volume: 1,
  });
});

test("normalizeSettings preserves only the enabled state", () => {
  assert.deepEqual(
    normalizeSettings({
      enabled: false,
      intervalMinutes: 5,
      smartMode: false,
      volume: 0.05,
    }),
    { ...DEFAULT_SETTINGS, enabled: false },
  );
});

test("iconPaths returns complete relative icon sets", () => {
  assert.deepEqual(iconPaths(false), {
    16: "images/awake-logo-off16.png",
    32: "images/awake-logo-off32.png",
    48: "images/awake-logo-off48.png",
    128: "images/awake-logo-off128.png",
  });
});
