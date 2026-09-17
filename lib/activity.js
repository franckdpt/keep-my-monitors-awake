export const AUDIO_GRACE_PERIOD_MS = 2 * 60 * 1000;
export const MISSED_ALARM_TOLERANCE_MS = 60 * 1000;
export const PRESENCE_IDLE_THRESHOLD_SECONDS = 60;
export const PRESENCE_RETURN_GRACE_MS = 60 * 1000;

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
  PRESENCE_UNKNOWN: "presence-unknown",
  RECENT_AUDIO: "recent-audio",
  RETURN_GRACE: "return-grace",
  SESSION_LOCKED: "session-locked",
  SYSTEM_RESUME: "system-resume",
  USER_IDLE: "user-idle",
});

const IDLE_STATES = new Set(["active", "idle", "locked"]);

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

export function queryIdleState(api, thresholdSeconds) {
  if (typeof api.idle?.queryState !== "function") {
    return Promise.resolve("unknown");
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (state) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(IDLE_STATES.has(state) ? state : "unknown");
    };

    try {
      const result = api.idle.queryState(thresholdSeconds, (state) => {
        if (api.runtime?.lastError) {
          finish("unknown");
          return;
        }
        finish(state);
      });

      result?.then?.(finish, () => finish("unknown"));
    } catch {
      finish("unknown");
    }
  });
}

export async function detectUserPresence(api, status, now = Date.now()) {
  const systemState = await queryIdleState(
    api,
    PRESENCE_IDLE_THRESHOLD_SECONDS,
  );
  const wasInactive = ["idle", "locked", "unknown"].includes(
    status.systemState,
  );
  const activeSince =
    systemState === "active"
      ? Number.isFinite(status.activeSince)
        ? status.activeSince
        : wasInactive
          ? now
          : null
      : null;
  const statusPatch = { systemState, activeSince };

  if (systemState === "locked") {
    return {
      blocked: true,
      reason: SKIP_REASONS.SESSION_LOCKED,
      statusPatch,
    };
  }

  if (systemState === "idle") {
    return {
      blocked: true,
      reason: SKIP_REASONS.USER_IDLE,
      statusPatch,
    };
  }

  if (systemState !== "active") {
    return {
      blocked: true,
      reason: SKIP_REASONS.PRESENCE_UNKNOWN,
      statusPatch,
    };
  }

  if (
    Number.isFinite(activeSince) &&
    now - activeSince < PRESENCE_RETURN_GRACE_MS
  ) {
    return {
      blocked: true,
      reason: SKIP_REASONS.RETURN_GRACE,
      statusPatch,
    };
  }

  return { blocked: false, reason: null, statusPatch };
}

export async function detectBlockingActivity(api, status, now = Date.now()) {
  const presence = await detectUserPresence(api, status, now);
  if (presence.blocked) {
    return presence;
  }

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
      statusPatch: presence.statusPatch,
    };
  }

  if (hasAudibleTab) {
    return {
      blocked: true,
      lastAudibleAt: now,
      reason: SKIP_REASONS.BROWSER_AUDIO,
      statusPatch: presence.statusPatch,
    };
  }

  if (
    Number.isFinite(status.lastAudibleAt) &&
    now - status.lastAudibleAt < AUDIO_GRACE_PERIOD_MS
  ) {
    return {
      blocked: true,
      reason: SKIP_REASONS.RECENT_AUDIO,
      statusPatch: presence.statusPatch,
    };
  }

  return {
    blocked: false,
    reason: null,
    statusPatch: presence.statusPatch,
  };
}

export { SKIP_REASONS };
