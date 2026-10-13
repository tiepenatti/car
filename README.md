# LEGO 88012 Car Controller

React + Vite page for controlling a LEGO hub over Web Bluetooth.

Current port mapping:

- Port A: steering motor
- Port B: rear traction motor
- Port C: tilt sensor (an alarm sounds when tilted more than 15° on either axis; use the Arm/Disarm button in the sensor panel)
- Port D: front traction motor

Keyboard controls:

- Up: drive forward while held
- Down: drive backward while held
- Left: steer left while held
- Right: steer right while held
- Key release: send stop for that axis

## Voice control

Voice control uses [Vosk](https://alphacephei.com/vosk/) via [vosk-browser](https://github.com/ccoreilly/vosk-browser) (Apache 2.0). Speech is recognised entirely in the browser, so no audio is sent to a server. The recogniser is limited to the command phrases below, which makes it accurate for short commands and makes it ignore other speech.

How to use it:

1. Connect to the hub.
2. Tap the big **MIC** button under the control pad. Voice control is off by default and the page does not listen to anything until you turn it on.
3. Allow microphone access when the browser asks. The first time, the English speech model (about 40 MB) is downloaded, which can take a little while. After that it comes from the browser cache.
4. Say a command, starting with "car".
5. Tap the MIC button again to turn voice control off. This also stops the car.

Commands:

| Say | Action |
| --- | --- |
| "car go forward" / "car forward" / "car go" | Drive forward until stopped |
| "car go back" / "car back" / "car reverse" | Drive backward until stopped |
| Any forward or backward phrase + "two seconds" / "for two seconds" | Drive for that many seconds (one to ten), then stop |
| "car turn left" / "car left" | One steering pulse left |
| "car turn right" / "car right" | One steering pulse right |
| "stop" / "car stop" | Stop driving and centre steering |

Notes:

- "Stop" works without "car" and is acted on as soon as it is heard, before the phrase finishes.
- Forward and backward keep driving until you say "stop", press STOP, or turn the mic off, unless you give a duration such as "car go forward two seconds".
- Steering commands during a timed drive do not cancel the timer. A new forward, backward or stop command replaces it.
- Each left/right command is a single steering pulse. Increase the pulse duration in Servo Settings for bigger turns.
- Microphone access needs HTTPS or `localhost`, the same as Web Bluetooth.
- Motor noise reduces accuracy, so speak close to the device running the page.
- The model is loaded from `https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz` by default. To host it yourself, set `VITE_VOSK_MODEL_URL` at build time to another URL that serves the `.tar.gz` with CORS enabled.

## GitHub Pages

The app is hosted on GitHub Pages at [https://tiepenatti.github.io/tmp-car/](https://tiepenatti.github.io/tmp-car/).
The site is built with Vite and deployed from the `pages` branch by the GitHub Actions workflow. The HTTPS site provides the secure context required by Web Bluetooth; open it in a supported browser and connect to the LEGO hub.

## Run on localhost

Web Bluetooth requires a secure context. `localhost` is allowed, so run the app locally with Vite.

1. Install dependencies:

```bash
npm install
```

2. Start the local development server:

```bash
npm run start
```

This command:

- serves the app on port 8081, reachable from localhost and your network IP
- watches files for changes
- rebuilds automatically
- hot refreshes the page in the browser

3. Open:

```text
http://localhost:8081/
```

Web Bluetooth only works from `localhost` or HTTPS, not from a plain `http://<ip>` address.

### HTTPS for testing on a phone

To test on another device (for example a phone on the same Wi-Fi), serve over HTTPS:

```bash
npm run start:https
```

Open the `Network: https://<your-ip>:8081/` address it prints. The certificate is self-signed, so the browser shows a warning the first time; choose **Advanced → Proceed** to continue. Hot reload works the same as `npm run start`.

You can still use `npm run dev` if you want the default Vite command, but `npm run start` is the intended local workflow.

## Production preview

To test the production build locally:

```bash
npm run build
npm run preview
```

## Disconnect / unpair note

The Disconnect button stops the motors and closes the active GATT connection from the page.

Browsers do not expose a reliable way for a webpage to force a full OS-level Bluetooth unpair or “forget device” action. If you need to fully remove the remembered pairing, do that from the operating system Bluetooth settings.
