export const AUDIO_GRACE_PERIOD_MS = 2 * 60 * 1000;

export const MEETING_QUERY_PATTERNS = Object.freeze([
  "https://meet.google.com/*",
  "https://teams.microsoft.com/*",
  "https://teams.live.com/*",
  "https://teams.cloud.microsoft/*",
  "https://*.zoom.us/*",
  "https://*.webex.com/*",
  "https://meet.jit.si/*",
  "https://whereby.com/*",
]);

const SKIP_REASONS = Object.freeze({
  BROWSER_AUDIO: "browser-audio",
  MEETING: "video-meeting",
  RECENT_AUDIO: "recent-audio",
});

function hasPath(url) {
  return url.pathname !== "/" && url.pathname.length > 1;
}

export function isMeetingUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const query = url.search.toLowerCase();

  if (host === "meet.google.com") {
    return (
      /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:\/|$)/.test(path) ||
      path.startsWith("/lookup/")
    );
  }

  if (
    host === "teams.microsoft.com" ||
    host === "teams.live.com" ||
    host === "teams.cloud.microsoft"
  ) {
    return (
      path.includes("/meetup-join/") ||
      path.includes("/pre-join-calling/") ||
      path.includes("/meeting/") ||
      path.includes("/meet/") ||
      query.includes("meetingjoin=true") ||
      query.includes("meetingid=")
    );
  }

  if (host === "zoom.us" || host.endsWith(".zoom.us")) {
    return path.startsWith("/j/") || path.includes("/wc/");
  }

  if (host === "webex.com" || host.endsWith(".webex.com")) {
    return (
      path.startsWith("/meet/") ||
      path.startsWith("/join/") ||
      (path.includes("/webappng/sites/") && path.includes("/meeting"))
    );
  }

  if (host === "meet.jit.si" || host === "whereby.com") {
    return hasPath(url);
  }

  return false;
}

export async function detectBlockingActivity(api, status, now = Date.now()) {
  const [audibleTabs, possibleMeetingTabs] = await Promise.all([
    api.tabs.query({ audible: true }),
    api.tabs.query({ url: MEETING_QUERY_PATTERNS }),
  ]);

  const meetingTab = possibleMeetingTabs.find(
    (tab) => !tab.discarded && isMeetingUrl(tab.url),
  );
  const hasAudibleTab = audibleTabs.some(
    (tab) => !tab.discarded && !tab.mutedInfo?.muted,
  );

  if (meetingTab) {
    return {
      blocked: true,
      lastAudibleAt: hasAudibleTab ? now : undefined,
      reason: SKIP_REASONS.MEETING,
    };
  }

  if (hasAudibleTab) {
    return {
      blocked: true,
      lastAudibleAt: now,
      reason: SKIP_REASONS.BROWSER_AUDIO,
    };
  }

  if (
    Number.isFinite(status.lastAudibleAt) &&
    now - status.lastAudibleAt < AUDIO_GRACE_PERIOD_MS
  ) {
    return { blocked: true, reason: SKIP_REASONS.RECENT_AUDIO };
  }

  return { blocked: false, reason: null };
}

export { SKIP_REASONS };
