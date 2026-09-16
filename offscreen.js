import { createOffscreenAudioController } from "./lib/offscreen-audio.js";

const controller = createOffscreenAudioController({
  signal: document.querySelector("#signal"),
  runtime: chrome.runtime,
  mediaSession: navigator.mediaSession,
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
  controller.handleMessage(message, sendResponse));
