const BLOCKED_MEDIA_ACTIONS = ["play", "pause", "stop"];

function resetMediaSession(mediaSession) {
  if (!mediaSession) {
    return;
  }

  try {
    mediaSession.playbackState = "none";
    mediaSession.metadata = null;
  } catch {
    // Older Chromium builds may expose only part of the Media Session API.
  }
}

export function blockHardwareMediaControls(mediaSession) {
  if (typeof mediaSession?.setActionHandler !== "function") {
    return [];
  }

  const blockedActions = [];
  const ignoreAction = () => {};

  for (const action of BLOCKED_MEDIA_ACTIONS) {
    try {
      mediaSession.setActionHandler(action, ignoreAction);
      blockedActions.push(action);
    } catch {
      // Ignore actions that are not implemented by this Chromium version.
    }
  }

  resetMediaSession(mediaSession);
  return blockedActions;
}

export function createOffscreenAudioController({
  signal,
  runtime,
  mediaSession,
}) {
  if (!signal) {
    throw new Error("The wake-up audio element is missing.");
  }

  blockHardwareMediaControls(mediaSession);

  function stopSignal() {
    signal.pause();
    signal.currentTime = 0;
    resetMediaSession(mediaSession);
  }

  function notifySignalFinished() {
    resetMediaSession(mediaSession);

    try {
      const notification = runtime.sendMessage({
        target: "service-worker",
        type: "SIGNAL_FINISHED",
      });
      notification?.catch?.(() => {});
    } catch {
      // The document may already be closing; there is nothing left to clean up.
    }
  }

  signal.addEventListener("ended", notifySignalFinished);

  function handleMessage(message, sendResponse) {
    if (message?.target !== "offscreen") {
      return false;
    }

    if (message.type === "STOP_SIGNAL") {
      stopSignal();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type !== "PLAY_SIGNAL") {
      return false;
    }

    const requestedVolume = Number(message.volume);
    signal.volume = Number.isFinite(requestedVolume)
      ? Math.min(1, Math.max(0.05, requestedVolume))
      : 1;
    stopSignal();

    let playback;
    try {
      playback = signal.play();
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }

    Promise.resolve(playback).then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );

    return true;
  }

  return { handleMessage, stopSignal };
}
