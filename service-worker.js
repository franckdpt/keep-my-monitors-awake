import { createController } from "./service-worker-controller.js";

const controller = createController(chrome, self);

chrome.runtime.onInstalled.addListener(() => {
  void controller.initialize();
});

chrome.runtime.onStartup.addListener(() => {
  void controller.initialize();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void controller.handleAlarm(alarm);
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (typeof changeInfo.audible === "boolean" || changeInfo.url) {
    void controller.handleTabUpdated(changeInfo, tab);
  }
});

chrome.idle.onStateChanged.addListener((newState) => {
  void controller.handleIdleStateChanged(newState);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "service-worker") {
    return false;
  }

  controller.handleMessage(message).then(sendResponse, (error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return true;
});

void controller.reconcile();
