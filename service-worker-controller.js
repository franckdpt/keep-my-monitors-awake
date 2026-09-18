import {
  ALARM_NAME,
  DEFAULT_SETTINGS,
  DEFAULT_STATUS,
  OFFSCREEN_PATH,
  SETTINGS_KEY,
  STATUS_KEY,
  iconPaths,
  normalizeSettings,
} from "./lib/settings.js";
import {
  detectBlockingActivity,
  isMeetingUrl,
  MISSED_ALARM_TOLERANCE_MS,
  PRESENCE_IDLE_THRESHOLD_SECONDS,
  SKIP_REASONS,
} from "./lib/activity.js";

export function createController(api, workerScope = globalThis) {
  let offscreenCreation = null;
  let toggleQueue = Promise.resolve();

  async function getSettings() {
    const stored = await api.storage.local.get(SETTINGS_KEY);
    return normalizeSettings(stored[SETTINGS_KEY]);
  }

  async function getStatus() {
    const stored = await api.storage.local.get(STATUS_KEY);
    return { ...DEFAULT_STATUS, ...stored[STATUS_KEY] };
  }

  async function saveSettings(patch) {
    const settings = normalizeSettings({ ...(await getSettings()), ...patch });
    await api.storage.local.set({ [SETTINGS_KEY]: settings });
    return settings;
  }

  async function setEnabled(enabled) {
    const settings = await saveSettings({ enabled: Boolean(enabled) });
    await updateAction(settings);

    if (settings.enabled) {
      await ensureAlarm(settings);
      await playSignal({ force: true });
    } else {
      await api.alarms.clear(ALARM_NAME);
      await stopSignal();
    }

    return getState();
  }

  async function toggleEnabled() {
    const operation = toggleQueue.then(async () => {
      const settings = await getSettings();
      return setEnabled(!settings.enabled);
    });

    toggleQueue = operation.catch(() => {});
    return operation;
  }

  async function setStatus(patch) {
    const status = { ...(await getStatus()), ...patch };
    await api.storage.local.set({ [STATUS_KEY]: status });
    return status;
  }

  async function updateAction(settings) {
    const stateLabel = settings.enabled ? "Active" : "Paused";

    await Promise.all([
      api.action.setIcon({ path: iconPaths(settings.enabled) }),
      api.action.setTitle({
        title: `Keep My Monitors Awake — ${stateLabel}`,
      }),
      api.action.setBadgeText({ text: settings.enabled ? "✓" : "–" }),
      api.action.setBadgeBackgroundColor({
        color: settings.enabled ? "#16845b" : "#6b7280",
      }),
    ]);
  }

  async function ensureAlarm(settings) {
    if (!settings.enabled) {
      await api.alarms.clear(ALARM_NAME);
      return null;
    }

    const existingAlarm = await api.alarms.get(ALARM_NAME);
    if (existingAlarm?.periodInMinutes === settings.intervalMinutes) {
      return existingAlarm;
    }

    await api.alarms.create(ALARM_NAME, {
      delayInMinutes: settings.intervalMinutes,
      periodInMinutes: settings.intervalMinutes,
    });

    return api.alarms.get(ALARM_NAME);
  }

  async function hasOffscreenDocument() {
    const offscreenUrl = api.runtime.getURL(OFFSCREEN_PATH);

    if (typeof api.runtime.getContexts === "function") {
      const contexts = await api.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [offscreenUrl],
      });
      return contexts.length > 0;
    }

    const clients = await workerScope.clients.matchAll({
      includeUncontrolled: true,
      type: "window",
    });
    return clients.some((client) => client.url === offscreenUrl);
  }

  async function ensureOffscreenDocument() {
    if (await hasOffscreenDocument()) {
      return;
    }

    if (!offscreenCreation) {
      offscreenCreation = api.offscreen
        .createDocument({
          url: OFFSCREEN_PATH,
          reasons: ["AUDIO_PLAYBACK"],
          justification:
            "Play the periodic local signal that keeps connected monitors awake.",
        })
        .finally(() => {
          offscreenCreation = null;
        });
    }

    await offscreenCreation;
  }

  async function playSignal({ force = false } = {}) {
    const settings = await getSettings();
    let activityStatus = {};
    if (!force && !settings.enabled) {
      return { ok: false, skipped: true };
    }

    try {
      if (!force && settings.smartMode) {
        const status = await getStatus();
        const activity = await detectBlockingActivity(api, status);
        activityStatus = {
          ...(activity.statusPatch ?? {}),
          ...(Number.isFinite(activity.lastAudibleAt)
            ? { lastAudibleAt: activity.lastAudibleAt }
            : {}),
        };

        if (activity.blocked) {
          await setStatus({
            ...activityStatus,
            lastError: null,
            lastSkippedAt: Date.now(),
            lastSkipReason: activity.reason,
          });
          await stopSignal();
          return { ok: true, skipped: true, reason: activity.reason };
        }
      }

      await ensureOffscreenDocument();
      const response = await api.runtime.sendMessage({
        target: "offscreen",
        type: "PLAY_SIGNAL",
        volume: settings.volume,
      });

      if (!response?.ok) {
        throw new Error(response?.error || "The audio document did not respond.");
      }

      await setStatus({
        ...(activityStatus ?? {}),
        lastStartedAt: Date.now(),
        lastError: null,
      });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await setStatus({ lastError: message });
      return { ok: false, error: message };
    }
  }

  async function closeSignalDocument() {
    if (!(await hasOffscreenDocument())) {
      return false;
    }

    await api.offscreen.closeDocument();
    return true;
  }

  async function stopSignal() {
    if (!(await hasOffscreenDocument())) {
      return;
    }

    try {
      await api.runtime.sendMessage({
        target: "offscreen",
        type: "STOP_SIGNAL",
      });
    } finally {
      await closeSignalDocument();
    }
  }

  async function getState() {
    const [settings, status, alarm] = await Promise.all([
      getSettings(),
      getStatus(),
      api.alarms.get(ALARM_NAME),
    ]);

    return {
      ok: true,
      settings,
      status,
      nextSignalAt: settings.enabled ? alarm?.scheduledTime ?? null : null,
    };
  }

  async function reconcile() {
    const stored = await api.storage.local.get(SETTINGS_KEY);
    const settings = normalizeSettings(stored[SETTINGS_KEY]);

    if (!stored[SETTINGS_KEY]) {
      await api.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    }

    api.idle.setDetectionInterval(PRESENCE_IDLE_THRESHOLD_SECONDS);
    await Promise.all([updateAction(settings), ensureAlarm(settings)]);
    return settings;
  }

  async function initialize({ playImmediately = false } = {}) {
    const settings = await reconcile();
    if (playImmediately && settings.enabled) {
      await playSignal();
    }
    return getState();
  }

  async function handleAlarm(alarm) {
    if (alarm.name !== ALARM_NAME) {
      return { ok: false, skipped: true };
    }

    if (
      Number.isFinite(alarm.scheduledTime) &&
      Date.now() - alarm.scheduledTime > MISSED_ALARM_TOLERANCE_MS
    ) {
      await setStatus({
        lastError: null,
        lastSkippedAt: Date.now(),
        lastSkipReason: SKIP_REASONS.SYSTEM_RESUME,
      });
      return {
        ok: true,
        skipped: true,
        reason: SKIP_REASONS.SYSTEM_RESUME,
      };
    }

    return playSignal();
  }

  async function handleTabUpdated(changeInfo, tab) {
    const settings = await getSettings();
    if (!settings.enabled || !settings.smartMode) {
      return;
    }

    const audibleStarted =
      changeInfo.audible === true && !tab.mutedInfo?.muted;
    const meetingOpened =
      typeof changeInfo.url === "string" && isMeetingUrl(tab.url);

    if (audibleStarted) {
      await setStatus({ lastAudibleAt: Date.now() });
    }

    if (audibleStarted || meetingOpened) {
      await stopSignal();
    }
  }

  async function handleIdleStateChanged(newState) {
    const status = await getStatus();
    const isActive = newState === "active";
    const isLocked = newState === "locked";
    await setStatus({
      systemState: newState,
      activeSince:
        isActive && ["locked", "unknown"].includes(status.systemState)
          ? Date.now()
          : isActive
            ? status.activeSince
            : isLocked
              ? null
              : status.activeSince,
    });

    if (isLocked) {
      await stopSignal();
    }
  }

  async function handleMessage(message) {
    switch (message?.type) {
      case "SIGNAL_FINISHED":
        await setStatus({
          lastPlayedAt: Date.now(),
          lastError: null,
        });
        await closeSignalDocument();
        return { ok: true };

      default:
        return { ok: false, error: "Unknown message." };
    }
  }

  return {
    getState,
    handleAlarm,
    handleIdleStateChanged,
    handleMessage,
    handleTabUpdated,
    initialize,
    reconcile,
    toggleEnabled,
  };
}
