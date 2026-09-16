import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_GRACE_PERIOD_MS,
  detectBlockingActivity,
  isMeetingUrl,
} from "../lib/activity.js";

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
  const api = {
    tabs: {
      query: async (query) =>
        query.audible ? [{ audible: true, mutedInfo: { muted: true } }] : [],
    },
  };

  assert.deepEqual(await detectBlockingActivity(api, {}, 10_000), {
    blocked: false,
    reason: null,
  });
});

test("detectBlockingActivity keeps a grace period after browser audio", async () => {
  const api = { tabs: { query: async () => [] } };
  const now = 1_000_000;

  assert.deepEqual(
    await detectBlockingActivity(
      api,
      { lastAudibleAt: now - AUDIO_GRACE_PERIOD_MS + 1 },
      now,
    ),
    { blocked: true, reason: "recent-audio" },
  );
  assert.deepEqual(
    await detectBlockingActivity(
      api,
      { lastAudibleAt: now - AUDIO_GRACE_PERIOD_MS },
      now,
    ),
    { blocked: false, reason: null },
  );
});
