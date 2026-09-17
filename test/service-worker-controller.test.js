import assert from "node:assert/strict";
import test from "node:test";

import { ALARM_NAME, SETTINGS_KEY } from "../lib/settings.js";
import { createController } from "../service-worker-controller.js";

function createChromeMock(initialStorage = {}) {
  const data = structuredClone(initialStorage);
  const alarms = new Map();
  const calls = {
    badgeTexts: [],
    closeDocument: 0,
    createDocument: 0,
    idleIntervals: [],
    messages: [],
  };
  let audibleTabs = [];
  let idleState = "active";
  let meetingTabs = [];
  let offscreenOpen = false;

  const api = {
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async ({ text }) => calls.badgeTexts.push(text),
      setIcon: async () => {},
      setTitle: async () => {},
    },
    alarms: {
      clear: async (name) => alarms.delete(name),
      create: async (name, details) => {
        alarms.set(name, { name, scheduledTime: Date.now() + 1000, ...details });
      },
      get: async (name) => alarms.get(name),
    },
    idle: {
      queryState: (_threshold, callback) => callback(idleState),
      setDetectionInterval: (seconds) => calls.idleIntervals.push(seconds),
    },
    offscreen: {
      closeDocument: async () => {
        calls.closeDocument += 1;
        offscreenOpen = false;
      },
      createDocument: async () => {
        calls.createDocument += 1;
        offscreenOpen = true;
      },
    },
    runtime: {
      getContexts: async () => (offscreenOpen ? [{}] : []),
      getURL: (path) => `chrome-extension://test/${path}`,
      sendMessage: async (message) => {
        calls.messages.push(message);
        return { ok: true };
      },
    },
    storage: {
      local: {
        get: async (key) => ({ [key]: structuredClone(data[key]) }),
        set: async (value) => Object.assign(data, structuredClone(value)),
      },
    },
    tabs: {
      query: async (queryInfo) =>
        structuredClone(queryInfo.audible ? audibleTabs : meetingTabs),
    },
  };

  return {
    alarms,
    api,
    calls,
    data,
    setAudibleTabs: (tabs) => {
      audibleTabs = tabs;
    },
    setIdleState: (state) => {
      idleState = state;
    },
    setMeetingTabs: (tabs) => {
      meetingTabs = tabs;
    },
  };
}

test("initialize stores defaults and creates a ten-minute alarm", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);

  const state = await controller.initialize();

  assert.deepEqual(mock.data[SETTINGS_KEY], {
    enabled: true,
    intervalMinutes: 10,
    smartMode: true,
    volume: 1,
  });
  assert.equal(mock.alarms.get(ALARM_NAME).periodInMinutes, 10);
  assert.equal(state.settings.enabled, true);
  assert.deepEqual(mock.calls.idleIntervals, [60]);
});

test("disabling clears the alarm and closes active audio", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize({ playImmediately: true });

  const state = await controller.toggleEnabled();

  assert.equal(state.settings.enabled, false);
  assert.equal(mock.alarms.has(ALARM_NAME), false);
  assert.equal(mock.calls.closeDocument, 1);
  assert.equal(mock.calls.messages.at(-1).type, "STOP_SIGNAL");
});

test("the named alarm plays through one reusable offscreen document", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize();

  assert.equal((await controller.handleAlarm({ name: "other" })).skipped, true);
  await controller.handleAlarm({ name: ALARM_NAME });
  await controller.handleAlarm({ name: ALARM_NAME });

  assert.equal(mock.calls.createDocument, 1);
  assert.equal(mock.calls.messages.length, 2);
  assert.equal(mock.data.status.lastError, null);
  assert.equal(typeof mock.data.status.lastPlayedAt, "number");
});

test("a delayed alarm from system sleep is discarded", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize();

  const result = await controller.handleAlarm({
    name: ALARM_NAME,
    scheduledTime: Date.now() - 61_000,
  });

  assert.deepEqual(result, {
    ok: true,
    skipped: true,
    reason: "system-resume",
  });
  assert.equal(mock.calls.createDocument, 0);
  assert.equal(mock.data.status.lastSkipReason, "system-resume");
});

test("a finished signal closes the offscreen document without replaying it", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize({ playImmediately: true });
  const messagesBeforeCleanup = mock.calls.messages.length;

  const result = await controller.handleMessage({ type: "SIGNAL_FINISHED" });

  assert.deepEqual(result, { ok: true });
  assert.equal(mock.calls.closeDocument, 1);
  assert.equal(mock.calls.messages.length, messagesBeforeCleanup);
});

test("smart mode skips scheduled playback while a browser tab is audible", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize();
  mock.setAudibleTabs([{ audible: true, mutedInfo: { muted: false } }]);

  const result = await controller.handleAlarm({ name: ALARM_NAME });

  assert.deepEqual(result, {
    ok: true,
    skipped: true,
    reason: "browser-audio",
  });
  assert.equal(mock.calls.createDocument, 0);
  assert.equal(mock.data.status.lastSkipReason, "browser-audio");
  assert.equal(typeof mock.data.status.lastAudibleAt, "number");
});

test("smart mode fails closed while the computer is idle", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize();
  mock.setIdleState("idle");

  const result = await controller.handleAlarm({ name: ALARM_NAME });

  assert.deepEqual(result, {
    ok: true,
    skipped: true,
    reason: "user-idle",
  });
  assert.equal(mock.calls.createDocument, 0);
  assert.equal(mock.data.status.systemState, "idle");
});

test("returning from idle waits before automatic playback resumes", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize();

  await controller.handleIdleStateChanged("idle");
  await controller.handleIdleStateChanged("active");
  const result = await controller.handleAlarm({ name: ALARM_NAME });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "return-grace");
  assert.equal(mock.calls.createDocument, 0);
  assert.equal(mock.data.status.systemState, "active");
  assert.equal(typeof mock.data.status.activeSince, "number");
});

test("becoming idle stops an active signal immediately", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize({ playImmediately: true });

  await controller.handleIdleStateChanged("locked");

  assert.equal(mock.calls.closeDocument, 1);
  assert.equal(mock.calls.messages.at(-1).type, "STOP_SIGNAL");
  assert.equal(mock.data.status.systemState, "locked");
});

test("smart mode skips scheduled playback on a video meeting page", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize();
  mock.setMeetingTabs([
    { discarded: false, url: "https://meet.google.com/abc-defg-hij" },
  ]);

  const result = await controller.handleAlarm({ name: ALARM_NAME });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "video-meeting");
  assert.equal(mock.calls.createDocument, 0);
});

test("toolbar clicks toggle the extension without playing immediately", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize();

  const disabledState = await controller.toggleEnabled();
  const enabledState = await controller.toggleEnabled();

  assert.equal(disabledState.settings.enabled, false);
  assert.equal(enabledState.settings.enabled, true);
  assert.equal(mock.alarms.get(ALARM_NAME).periodInMinutes, 10);
  assert.equal(mock.calls.createDocument, 0);
  assert.equal(mock.calls.messages.length, 0);
  assert.deepEqual(mock.calls.badgeTexts, ["✓", "–", "✓"]);
});

test("rapid toolbar clicks are serialized and preserve the expected state", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize();

  const [disabledState, enabledState] = await Promise.all([
    controller.toggleEnabled(),
    controller.toggleEnabled(),
  ]);

  assert.equal(disabledState.settings.enabled, false);
  assert.equal(enabledState.settings.enabled, true);
  assert.equal(mock.alarms.get(ALARM_NAME).periodInMinutes, 10);
  assert.deepEqual(mock.calls.badgeTexts, ["✓", "–", "✓"]);
});

test("new browser audio immediately stops an active wake-up signal", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize({ playImmediately: true });

  await controller.handleTabUpdated(
    { audible: true },
    { mutedInfo: { muted: false } },
  );

  assert.equal(mock.calls.closeDocument, 1);
  assert.equal(mock.calls.messages.at(-1).type, "STOP_SIGNAL");
  assert.equal(typeof mock.data.status.lastAudibleAt, "number");
});
