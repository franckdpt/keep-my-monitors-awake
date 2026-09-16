import assert from "node:assert/strict";
import test from "node:test";

import {
  blockHardwareMediaControls,
  createOffscreenAudioController,
} from "../lib/offscreen-audio.js";

function createSignal() {
  const listeners = new Map();
  const calls = { pause: 0, play: 0 };
  const signal = {
    currentTime: 0,
    volume: 1,
    addEventListener: (event, listener) => listeners.set(event, listener),
    pause: () => {
      calls.pause += 1;
    },
    play: async () => {
      calls.play += 1;
    },
  };

  return {
    calls,
    dispatch: (event) => listeners.get(event)?.(),
    signal,
  };
}

test("hardware play, pause, and stop controls are harmless no-ops", () => {
  const handlers = new Map();
  const mediaSession = {
    metadata: { title: "wake signal" },
    playbackState: "playing",
    setActionHandler: (action, handler) => handlers.set(action, handler),
  };

  const blocked = blockHardwareMediaControls(mediaSession);

  assert.deepEqual(blocked, ["play", "pause", "stop"]);
  assert.equal(mediaSession.playbackState, "none");
  assert.equal(mediaSession.metadata, null);
  for (const action of blocked) {
    assert.doesNotThrow(() => handlers.get(action)());
  }
});

test("finishing playback asks the worker to release the audio document", async () => {
  const { dispatch, signal } = createSignal();
  const messages = [];
  createOffscreenAudioController({
    signal,
    runtime: {
      sendMessage: async (message) => {
        messages.push(message);
      },
    },
    mediaSession: null,
  });

  dispatch("ended");
  await Promise.resolve();

  assert.deepEqual(messages, [{
    target: "service-worker",
    type: "SIGNAL_FINISHED",
  }]);
});

test("playing a signal clamps its volume and responds asynchronously", async () => {
  const { calls, signal } = createSignal();
  const controller = createOffscreenAudioController({
    signal,
    runtime: { sendMessage: async () => ({ ok: true }) },
    mediaSession: null,
  });
  let response;

  const asynchronous = controller.handleMessage(
    { target: "offscreen", type: "PLAY_SIGNAL", volume: 4 },
    (value) => {
      response = value;
    },
  );
  await Promise.resolve();

  assert.equal(asynchronous, true);
  assert.equal(signal.volume, 1);
  assert.equal(calls.pause, 1);
  assert.equal(calls.play, 1);
  assert.deepEqual(response, { ok: true });
});
