export const ALARM_NAME = "keep-monitors-awake";
export const SETTINGS_KEY = "settings";
export const STATUS_KEY = "status";
export const OFFSCREEN_PATH = "offscreen.html";

export const INTERVAL_OPTIONS = Object.freeze([1, 5, 10, 15, 30, 60]);

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  intervalMinutes: 10,
  smartMode: true,
  volume: 1,
});

export const DEFAULT_STATUS = Object.freeze({
  lastAudibleAt: null,
  lastSkippedAt: null,
  lastSkipReason: null,
  lastPlayedAt: null,
  lastError: null,
});

export function normalizeSettings(value = {}) {
  const requestedInterval = Number(value.intervalMinutes);
  const requestedVolume = Number(value.volume);

  return {
    enabled:
      typeof value.enabled === "boolean"
        ? value.enabled
        : DEFAULT_SETTINGS.enabled,
    intervalMinutes: INTERVAL_OPTIONS.includes(requestedInterval)
      ? requestedInterval
      : DEFAULT_SETTINGS.intervalMinutes,
    smartMode:
      typeof value.smartMode === "boolean"
        ? value.smartMode
        : DEFAULT_SETTINGS.smartMode,
    volume: Number.isFinite(requestedVolume)
      ? Math.min(1, Math.max(0.05, requestedVolume))
      : DEFAULT_SETTINGS.volume,
  };
}

export function iconPaths(enabled) {
  const state = enabled ? "on" : "off";

  return {
    16: `images/awake-logo-${state}16.png`,
    32: `images/awake-logo-${state}32.png`,
    48: `images/awake-logo-${state}48.png`,
    128: `images/awake-logo-${state}128.png`,
  };
}
