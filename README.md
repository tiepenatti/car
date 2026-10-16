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

## Joystick

**Open joystick** (enabled while connected) opens a full-page joystick. Hold the ball and drag it:

- **Centre:** stop and straighten the wheels. Releasing the ball does the same.
- **Up / down:** drive forward / backward, from the minimum power (default 50%) just outside the centre to 100% at the edge.
- **Left / right:** the steering angle follows how far the ball is to the side, up to the stored travel minus 5° at the edge. The steering motor is too stiff for gentle position commands, so the app pulses it towards the target angle and checks the motor encoder after each pulse. It learns how many degrees the wheels move per millisecond of pulse and sizes each pulse to about 80% of the remaining gap, so it creeps up on the target instead of overshooting. Pulses never exceed the pulse length setting. If it does overshoot, it halves the maximum pulse length. It gives up if four full-length pulses in a row do not move the wheels.
- **Full-lock detection (opt-in, off by default):** with this turned on in Settings and the ball at the side edge, the app ignores the stored travel and pulses until the wheels stop moving (2 pulses in a row with less than 2° of movement). It then holds them there and re-pushes if they get knocked back. If that end stop is further out than the stored travel, the travel is widened.

## Settings

The **Settings** button opens a page with the steering calibration, the servo pulse settings, the tilt sensor and the command log.

- **Auto-calibrate** pushes the wheels left until the encoder stops changing, then right, and sets the centre halfway between the two end stops. Lift the front wheels off the ground first; on the ground the steering can stall before it reaches the end stops, which gives too small a travel. The usable travel is half the range, minus 5° so the joystick never pushes against the end stops.
- **Nudge left / right** and **Set current as centre** fine-tune the centre if the car still pulls to one side.
- **Full-lock detection** is a checkbox, off by default. See the joystick section.
- The travel, tolerance, pulse length, pulse power and full-lock setting are saved in the browser. The encoder is reset to zero when you connect, so the wheels should be straight when you connect, or you should recalibrate.

## STOP

STOP, from the button, the voice command, the joystick page or the camera page, always sends a brake to every motor: rear drive (B), front drive (D) and steering (A). It then centres the steering. The commands are sent even if the app thinks a motor is already stopped, because the keyboard and test keys drive the motors directly.

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
- Each left/right command is a single steering pulse. Increase the pulse duration in Servo Settings (on the Settings page) for bigger turns.
- Microphone access needs HTTPS or `localhost`, the same as Web Bluetooth.
- Motor noise reduces accuracy, so speak close to the device running the page.
- The model is loaded from `https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz` by default. To host it yourself, set `VITE_VOSK_MODEL_URL` at build time to another URL that serves the `.tar.gz` with CORS enabled.

## Camera follow mode

Camera follow mode uses [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) (`@mediapipe/tasks-vision`, Apache 2.0) to find a person, the "commander", in the camera feed. It then steers and drives the car to keep that person centred and close. Everything runs on the device, so no video is sent anywhere.

How to use it:

1. Open the page on a phone and connect to the hub. Android Chrome supports both Web Bluetooth and the camera. iOS browsers do not support Web Bluetooth.
2. Tap **Camera follow** on the main page. All camera controls are on this page, laid out for a phone: the feed on top, then large CAMERA, START FOLLOWING and STOP buttons, then the options and sliders. **Back** turns the camera off and stops the car.
3. Mount the phone on the car with the back camera facing forward, so the feed shows what the car sees.
4. Tap **CAMERA ON**. The camera is off by default. The first time, the pose model (about 6 MB) and the MediaPipe engine (about 4 MB compressed) are downloaded.
5. Check the feed window. The commander is drawn with a skeleton, a bounding box and a dot on the torso. Blue means tracking only.
6. Tap **START FOLLOWING**. The overlay turns green and the car starts following.

How following works:

- **Steering:** the car steers towards the centre of the commander's torso, using the same encoder-guided steering as the joystick. Outside the centre zone, shown by the dashed lines, it aims for one third, two thirds or all of the steering travel, depending on how far off-centre the commander is. Back inside the centre zone it re-centres the wheels. While reversing the steering is mirrored so the car still turns towards the commander. Positive steering is right, the same as the joystick. If the car turns away from you, turn on **Swap left/right**.
- **Distance:** distance is estimated in metres from the length of the commander's torso (shoulders to hips), assuming a 0.5 m torso and a 65° camera field of view across the long side of the image. If the hips are out of frame it falls back to shoulder width. The car drives forward when the commander is more than 15% further than the follow distance and reverses when they are more than 15% closer, then stops once it reaches the follow distance. Change `TORSO_LENGTH_M` or `CAMERA_LONG_SIDE_FOV_DEG` if the estimate in the top right of the feed is consistently off.
- **Power:** the car drives at full power forwards and backwards, the same as the FWD and BWD buttons. Lower power was too weak to move the car.
- **Command overlay:** while following, the bottom of the feed shows the current command. It is an up arrow when driving forward, a down arrow when reversing (both lean the way the wheels are turned), a red STOP at the follow distance, or a grey LOST when nobody is in view.
- **Debug mode:** the **Debug** button keeps follow mode working out commands and drawing them, as yellow arrows with a "DEBUG · commands not sent" banner, but sends nothing over Bluetooth. Turning debug on stops the car.
- **Settings:** the follow distance slider under the feed runs from 3.5 m on the left to 0.5 m on the right, with 2 m in the middle (the default). **Use front / back camera** toggles between the cameras.
- **Avoiding phantom people:** the **Detection strictness** slider (50–90%, default 70%) sets MediaPipe's detection, presence and tracking confidence, and the minimum visibility each landmark needs to count. On top of that, a pose only becomes the commander when both shoulders and at least 8 landmarks are visible for 4 detections in a row (about a quarter of a second). Raise the slider if it tracks things that are not people; lower it if it loses you in poor light or at a distance.

Safety:

- The car stops and centres the steering if nobody is seen for about 0.6 seconds.
- The STOP button, the voice "stop" command, turning the camera off, switching cameras, and switching away from the page all end following.
- The car reverses at full power when the commander comes closer than the follow distance, so keep the space behind it clear.

The pose model is loaded from Google's MediaPipe model storage by default. To host it yourself, set `VITE_POSE_MODEL_URL` at build time. The MediaPipe WebAssembly engine is bundled with the app.

## Lazy loading

Loading the page and driving with the buttons or keyboard downloads only the main app (about 70 KB compressed). The voice and vision libraries, their models, the microphone and the camera are loaded or started only when you press the MIC or CAMERA button.

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
