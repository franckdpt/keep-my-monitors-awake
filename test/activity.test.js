import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_GRACE_PERIOD_MS,
  detectBlockingActivity,
  detectUserPresence,
  isMeetingUrl,
  PRESENCE_RETURN_GRACE_MS,
} from "../lib/activity.js";

function createActivityApi({
  audibleTabs = [],
  idleState = "active",
  meetingTabs = [],
} = {}) {
  return {
    idle: {
      queryState: (_threshold, callback) => callback(idleState),
    },
    runtime: {},
    tabs: {
      query: async (query) => query.audible ? audibleTabs : meetingTabs,
    },
  };
}

test("isMeetingUrl recognizes active meeting routes without matching home pages", () => {
  const meetingUrls = [
    "https://meet.google.com/abc-defg-hij",
    "https://teams.microsoft.com/l/meetup-join/19%3ameeting_test",
    "https://teams.live.com/v2/?meetingjoin=true",
    "https://example.zoom.us/wc/123456/join",
    "https://example.webex.com/meet/franck",
    "https://meet.jit.si/ProjectRoom",
    "https://whereby.com/project-room",
  ];

  for (const url of meetingUrls) {
    assert.equal(isMeetingUrl(url), true, url);
  }

  assert.equal(isMeetingUrl("https://meet.google.com/"), false);
  assert.equal(isMeetingUrl("https://teams.microsoft.com/v2/"), false);
  assert.equal(isMeetingUrl("https://zoom.us/"), false);
  assert.equal(isMeetingUrl("not a url"), false);
});

test("detectBlockingActivity ignores muted tabs", async () => {
  const api = createActivityApi({
    audibleTabs: [{ audible: true, mutedInfo: { muted: true } }],
  });

  assert.deepEqual(await detectBlockingActivity(api, {}, 10_000), {
    blocked: false,
    reason: null,
    statusPatch: { activeSince: null, systemState: "active" },
  });
});

test("detectBlockingActivity keeps a grace period after browser audio", async () => {
  const api = createActivityApi();
  const now = 1_000_000;

  assert.deepEqual(
    await detectBlockingActivity(
      api,
      { lastAudibleAt: now - AUDIO_GRACE_PERIOD_MS + 1 },
      now,
    ),
    {
      blocked: true,
      reason: "recent-audio",
      statusPatch: { activeSince: null, systemState: "active" },
    },
  );
  assert.deepEqual(
    await detectBlockingActivity(
      api,
      { lastAudibleAt: now - AUDIO_GRACE_PERIOD_MS },
      now,
    ),
    {
      blocked: false,
      reason: null,
      statusPatch: { activeSince: null, systemState: "active" },
    },
  );
});

test("presence detection fails closed while idle, locked, or unavailable", async () => {
  for (const [idleState, reason] of [
    ["idle", "user-idle"],
    ["locked", "session-locked"],
    ["unexpected", "presence-unknown"],
  ]) {
    const result = await detectUserPresence(
      createActivityApi({ idleState }),
      {},
      10_000,
    );

    assert.equal(result.blocked, true);
    assert.equal(result.reason, reason);
  }
});

test("presence detection waits after the user returns", async () => {
  const now = 1_000_000;
  const api = createActivityApi();

  assert.equal(
    (await detectUserPresence(
      api,
      { activeSince: now - PRESENCE_RETURN_GRACE_MS + 1 },
      now,
    )).reason,
    "return-grace",
  );
  assert.equal(
    (await detectUserPresence(
      api,
      { activeSince: now - PRESENCE_RETURN_GRACE_MS },
      now,
    )).blocked,
    false,
  );
});

test("presence detection infers a return if the state event was missed", async () => {
  const now = 1_000_000;
  const result = await detectUserPresence(
    createActivityApi(),
    { activeSince: null, systemState: "idle" },
    now,
  );

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "return-grace");
  assert.equal(result.statusPatch.activeSince, now);
});

test("presence detection blocks when the idle API fails", async () => {
  const api = createActivityApi();
  api.idle.queryState = () => {
    throw new Error("idle service unavailable");
  };

  const result = await detectUserPresence(api, {}, 10_000);

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "presence-unknown");
});
