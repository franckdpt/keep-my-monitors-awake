import { DEFAULT_SETTINGS, normalizeSettings } from "./lib/settings.js";

const controls = {
  details: document.querySelector("#details"),
  enabled: document.querySelector("#enabled"),
  interval: document.querySelector("#interval"),
  smartMode: document.querySelector("#smart-mode"),
  summary: document.querySelector("#summary"),
  test: document.querySelector("#test"),
  volume: document.querySelector("#volume"),
  volumeValue: document.querySelector("#volume-value"),
};

function setBusy(busy) {
  controls.enabled.disabled = busy;
  controls.interval.disabled = busy;
  controls.smartMode.disabled = busy;
  controls.test.disabled = busy;
  controls.volume.disabled = busy;
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "Not played yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function render(state) {
  const settings = normalizeSettings(state?.settings ?? DEFAULT_SETTINGS);
  controls.enabled.checked = settings.enabled;
  controls.interval.value = String(settings.intervalMinutes);
  controls.smartMode.checked = settings.smartMode;
  controls.volume.value = String(Math.round(settings.volume * 100));
  controls.volumeValue.value = `${Math.round(settings.volume * 100)}%`;
  controls.summary.textContent = settings.enabled
    ? `Active · every ${settings.intervalMinutes} min`
    : "Paused";

  const error = state?.status?.lastError;
  const lastSkippedAt = state?.status?.lastSkippedAt;
  const lastPlayedAt = state?.status?.lastPlayedAt;
  const skipIsLatest =
    lastSkippedAt && (!lastPlayedAt || lastSkippedAt > lastPlayedAt);
  const skipLabels = {
    "browser-audio": "Chrome was already playing audio",
    "presence-unknown": "presence could not be confirmed",
    "recent-audio": "audio was playing recently",
    "return-grace": "waiting after your return",
    "session-locked": "computer is locked",
    "system-resume": "a delayed sleep alarm was discarded",
    "user-idle": "no recent keyboard or mouse activity",
    "video-meeting": "video call detected",
  };
  controls.details.classList.toggle("error", Boolean(error));
  controls.details.textContent = error
    ? `Audio error: ${error}`
    : skipIsLatest
      ? `Skipped at ${formatTime(lastSkippedAt)} · ${skipLabels[state.status.lastSkipReason] ?? "smart mode"}`
      : `Last signal: ${formatTime(lastPlayedAt)}`;
}

async function send(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({
    target: "service-worker",
    type,
    ...payload,
  });

  if (!response?.ok) {
    throw new Error(response?.error || "The extension did not respond.");
  }

  render(response);
  return response;
}

async function run(action) {
  setBusy(true);
  try {
    await action();
  } catch (error) {
    controls.details.classList.add("error");
    controls.details.textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    setBusy(false);
  }
}

controls.enabled.addEventListener("change", () => {
  void run(() => send("SET_ENABLED", { enabled: controls.enabled.checked }));
});

controls.interval.addEventListener("change", () => {
  void run(() =>
    send("UPDATE_SETTINGS", {
      settings: { intervalMinutes: Number(controls.interval.value) },
    }),
  );
});

controls.smartMode.addEventListener("change", () => {
  void run(() =>
    send("UPDATE_SETTINGS", {
      settings: { smartMode: controls.smartMode.checked },
    }),
  );
});

controls.volume.addEventListener("input", () => {
  controls.volumeValue.value = `${controls.volume.value}%`;
});

controls.volume.addEventListener("change", () => {
  void run(() =>
    send("UPDATE_SETTINGS", {
      settings: { volume: Number(controls.volume.value) / 100 },
    }),
  );
});

controls.test.addEventListener("click", () => {
  void run(() => send("PLAY_NOW"));
});

void run(() => send("GET_STATE"));
