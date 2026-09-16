# Keep My Monitors Awake

Keep My Monitors Awake is a lightweight Chrome extension that prevents active
studio monitors from entering standby. It periodically plays a local
low-frequency signal through the selected system audio output.

The extension is built for **Google Chrome and Chromium-based browsers** using
Manifest V3. Chrome 109 or newer is required.

## Why version 2 is more reliable

- Manifest V3 service worker instead of the retired persistent background page.
- Chrome Alarms API instead of an in-memory timer that disappears when the
  background process stops.
- Offscreen Audio API for supported background playback in modern Chrome.
- Saved enabled state, interval, volume, last successful signal, and errors.
- Smart quiet mode skips the signal during browser audio and video calls.
- A two-minute grace period avoids firing during short pauses between sounds.
- Active wake-up audio stops immediately when a Chrome tab starts playing sound.
- Automatic alarm repair whenever Chrome starts or the service worker wakes up.
- Clear ON/OFF toolbar status and a popup for settings and manual testing.
- No remote scripts, analytics, network requests, or access to page content.

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions/` in Chrome, Brave, Edge, or another compatible
   Chromium browser.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository's root folder.
6. Pin the extension, open it, and click **Play a test signal**.

The extension starts enabled with the original ten-minute interval, 100% signal
level, and smart quiet mode. These values can be changed from the popup.

> The volume slider only changes the bundled wake-up signal. Your system and
> audio-interface volumes still determine the final output level.

## How it works

Chrome wakes the extension service worker on a scheduled alarm. The worker opens
a short-lived offscreen document, asks it to play the bundled `tone.wav`, then
lets Chrome release that document after playback. Chrome manages the alarm, and
the settings live in extension storage, so both survive service-worker suspension
and browser restarts.

Before every automatic signal, smart quiet mode checks whether a non-muted Chrome
tab is audible, whether audio stopped less than two minutes ago, or whether a
meeting room is open in Google Meet, Microsoft Teams, Zoom, Webex, Jitsi Meet, or
Whereby. If so, the signal is skipped. The popup explains why it was skipped.
The manual **Play a test signal** button intentionally bypasses smart mode.

The extension does not prevent the computer or display itself from sleeping. It
only sends an audio signal intended to keep auto-standby speakers or studio
monitors awake.

Chrome does not expose the global macOS/Windows output level to extensions. Smart
mode can therefore detect browser audio, but not audio produced only by native
applications such as a DAW, Spotify desktop, or a desktop video-call app.

## Compatible monitors

The signal has been used with:

- KRK Rokit G3 (RP5, RP7, RP8, RP10)
- KRK Rokit G4 (RP5, RP7, RP8, RP10)
- Focal Alpha (50, 65, 80)

Compatibility depends on the monitor's standby threshold and the complete audio
chain. If another model works, submit a pull request or use the
[compatibility form](https://tally.so/r/31XyNl).

## Troubleshooting

- Use **Play a test signal** and check that **Last signal** updates without an
  audio error.
- Confirm that Chrome is routed to the same output as the monitors.
- Increase the extension signal volume or shorten the interval if the monitors
  still enter standby.
- Disable **Smart quiet mode** temporarily if you need the signal to run even
  while Chrome is playing audio.
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

`npm test` covers settings, alarm lifecycle, enable/disable behavior, meeting and
audible-tab detection, the post-audio grace period, and offscreen-document reuse.
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

The sound asset is based on
[KRK_stayawake by @stuartdochertymusic](https://github.com/stuartdochertymusic/KRK_stayawake).
