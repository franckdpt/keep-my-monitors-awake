const signal = document.querySelector("#signal");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") {
    return false;
  }

  if (message.type === "STOP_SIGNAL") {
    signal.pause();
    signal.currentTime = 0;
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
  signal.pause();
  signal.currentTime = 0;

  signal.play().then(
    () => sendResponse({ ok: true }),
    (error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );

  return true;
});
