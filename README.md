# Keep My Monitors Awake

Keep My Monitors Awake is a lightweight Chrome extension that prevents active
studio monitors from entering standby. It periodically plays a local
low-frequency stereo signal through the selected system audio output.

The extension is built for **Google Chrome and Chromium-based browsers** using
Manifest V3. Chrome 109 or newer is required.

## Why version 2 is more reliable

- Manifest V3 service worker instead of the retired persistent background page.
- Chrome Alarms API instead of an in-memory timer that disappears when the
  background process stops.
- Offscreen Audio API for supported background playback in modern Chrome.
- Saved enabled state, signal start and completion times, and errors.
- Smart quiet mode skips the signal during browser audio and video calls.
- Presence detection stops signals when the computer is locked and for one
  minute after it is unlocked.
- Passive listening is not mistaken for absence merely because the keyboard and
  mouse have not moved.
- Presence checks fail closed: if Chrome cannot confirm activity, no signal plays.
- Delayed alarms are discarded after sleep, and browser startup or extension
  updates never trigger an immediate signal.
- A two-minute grace period avoids firing during short pauses between sounds.
- Active wake-up audio stops immediately when a Chrome tab starts playing sound.
- Hardware Play/Pause keys never control or restart the wake-up signal.
- The wake signal is a smooth six-second 45 Hz pulse on both channels, replacing
  the old 20-second 10 Hz asset that some monitors could filter out.
- The offscreen audio document closes as soon as each signal finishes.
- Automatic alarm repair whenever Chrome starts or the service worker wakes up.
- One-click toolbar control with a compact green/gray status indicator.
- No remote scripts, analytics, network requests, or access to page content.

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions/` in Chrome, Brave, Edge, or another compatible
   Chromium browser.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository's root folder.
6. Pin the extension. Click its toolbar icon once to pause it and again to
   reactivate it. Turning it back on immediately plays one wake-up signal.

The extension starts enabled with the original ten-minute interval, 100% signal
level, and smart quiet mode. Those safe defaults are fixed: the extension has no
popup or manual test button. A compact green check means active; a gray dash
means paused. The full state is also available in the icon's tooltip.

An explicit OFF → ON click acts as the only manual wake command: it immediately
plays one signal, even if smart quiet mode would normally skip that cycle, then
returns to the automatic ten-minute schedule.

## How it works

Chrome wakes the extension service worker on a scheduled alarm. The worker opens
a short-lived offscreen document, asks it to play the bundled six-second
`tone.wav`, then
lets Chrome release that document after playback. Chrome manages the alarm, and
the settings live in extension storage, so both survive service-worker suspension
and browser restarts.

Before every automatic signal, smart quiet mode checks the session state through
Chrome's Idle API. It stops immediately when the computer is locked and waits
one minute after it is unlocked. Simple keyboard or mouse inactivity does not
count as absence, because that would interrupt passive listening. It then checks
whether a non-muted Chrome tab is audible, whether audio stopped less than two
minutes ago, or whether a meeting room is open in Google Meet, Microsoft Teams,
Zoom, Webex, Jitsi Meet, or Whereby. If any check is uncertain or blocked, the
signal is skipped.

The extension does not prevent the computer or display itself from sleeping. It
only sends an audio signal intended to keep auto-standby speakers or studio
monitors awake.

Chrome does not expose the global macOS/Windows output level to extensions. Smart
mode can therefore detect browser audio, but not audio produced only by native
applications such as a DAW, Spotify desktop, or a desktop video-call app.
Signals continue during those native applications so a quiet channel cannot let
one monitor enter standby.

## Compatible monitors

The signal has been used with:

- KRK Rokit G3 (RP5, RP7, RP8, RP10)
- KRK Rokit G4 (RP5, RP7, RP8, RP10)
- Focal Alpha (50, 65, 80)

Compatibility depends on the monitor's standby threshold and the complete audio
chain. If another model works, submit a pull request or use the
[compatibility form](https://tally.so/r/31XyNl).

## Troubleshooting

- Confirm that Chrome is routed to the same output as the monitors.
- Leave Chrome running and confirm the toolbar indicator is a green check.
- Laptop sleep suspends Chrome. The extension resumes when the browser and device
  wake; it cannot wake a sleeping computer.
- After updating an unpacked copy, use the reload button on
  `chrome://extensions/`.

## Development

The project has no runtime or development dependencies beyond Node.js 20+.

```bash
npm test
npm run validate
```

`npm test` covers the fixed defaults, alarm lifecycle, serialized toolbar
toggles, meeting and audible-tab detection, the post-audio grace period, and
offscreen-document reuse.
`npm run validate` checks the Manifest V3 package and all referenced assets.
GitHub Actions runs both checks on pushes and pull requests.

## Privacy

All code and assets are packaged locally. The extension stores only its settings
and local playback status in `chrome.storage.local`. The `tabs` permission is used
to check the in-memory audible state and recognize supported meeting URLs. Page
content is never read, URLs are never stored, and no data is collected or sent.

## Support

Please report problems or suggestions in the
[GitHub issue tracker](https://github.com/franckdpt/keep-my-monitors-awake/issues).

## Donation

If this extension helps you, you can offer a coffee:

- [Donate in dollars](https://tally.so/r/w8qy6P)
- Ethereum or Polygon: `0x5180C7aBA0057aD28827b37E57130EC8fA591559`

## Credits

The original concept was inspired by
[KRK_stayawake by @stuartdochertymusic](https://github.com/stuartdochertymusic/KRK_stayawake).
