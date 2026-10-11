# LEGO 88012 Car Controller

React + Vite page for controlling a LEGO hub over Web Bluetooth.

Current port mapping:

- Port A: steering motor
- Port B: rear traction motor
- Port D: front traction motor

Keyboard controls:

- Up: drive forward while held
- Down: drive backward while held
- Left: steer left while held
- Right: steer right while held
- Key release: send stop for that axis

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
