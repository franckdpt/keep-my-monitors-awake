import assert from "node:assert/strict";
import test from "node:test";

import { ALARM_NAME, SETTINGS_KEY } from "../lib/settings.js";
import { createController } from "../service-worker-controller.js";

function createChromeMock(initialStorage = {}) {
  const data = structuredClone(initialStorage);
  const alarms = new Map();
  const calls = {
    closeDocument: 0,
    createDocument: 0,
    messages: [],
  };
  let offscreenOpen = false;

  const api = {
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async () => {},
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
  };

  return { alarms, api, calls, data };
}

test("initialize stores defaults and creates a ten-minute alarm", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);

  const state = await controller.initialize();

  assert.deepEqual(mock.data[SETTINGS_KEY], {
    enabled: true,
    intervalMinutes: 10,
    volume: 1,
  });
  assert.equal(mock.alarms.get(ALARM_NAME).periodInMinutes, 10);
  assert.equal(state.settings.enabled, true);
});

test("disabling clears the alarm and closes active audio", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize({ playImmediately: true });

  const state = await controller.handleMessage({
    type: "SET_ENABLED",
    enabled: false,
  });

  assert.equal(state.settings.enabled, false);
  assert.equal(mock.alarms.has(ALARM_NAME), false);
  assert.equal(mock.calls.closeDocument, 1);
  assert.equal(mock.calls.messages.at(-1).type, "STOP_SIGNAL");
});

test("changing the interval replaces the alarm without playing audio", async () => {
  const mock = createChromeMock();
  const controller = createController(mock.api);
  await controller.initialize();

  await controller.handleMessage({
    type: "UPDATE_SETTINGS",
    settings: { intervalMinutes: 5 },
  });

  assert.equal(mock.alarms.get(ALARM_NAME).periodInMinutes, 5);
  assert.equal(mock.calls.messages.length, 0);
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
