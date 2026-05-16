# This IP

<p align="center">
  <img src="images/icon-128.png" alt="This IP Icon" width="128" />
</p>

A minimal browser extension that shows the IP address of every website you visit with the floating badge in the corner of your screen. Built with zero external dependencies, and an eye for clean UI.

## Features

- **Floating Badge** - A subtle glassmorphism badge appears on every page, showing the current site's IP address at a glance.
- **Dual-Stack DNS** - Resolves both IPv4 and IPv6 addresses automatically.
- **Click to Copy** - Click the badge to copy the IP to your clipboard instantly.
- **Auto-Dodge** - The badge moves out of the way when you hover over it. Configurable delay (0–3 seconds).
- **Adjustable Opacity** - Slide the badge from fully visible down to 20% transparent.
- **Light & Dark Theme** - Toggle between light and dark badge themes from the popup.
- **Fullscreen Aware** - The badge automatically hides when you go fullscreen.
- **Popup Dashboard** - Click the extension icon for a detailed view with quick copy and manual refresh.
- **Privacy First** - No analytics, no tracking, no external servers. Uses DNS-over-HTTPS (Google Public DNS) only for name resolution.

## Installation

### Browser Stores

|                                          Browser                                           | Supported  |                                              Download                                              |
| :----------------------------------------------------------------------------------------: | :--------: | :------------------------------------------------------------------------------------------------: |
|   <img src="docs/images/chrome_128x128.png" alt="Chrome" width="32" /></br>Google Chrome   |     ✅     |                  [Download](https://github.com/nh4ttruong/thisip/releases/latest)                  |
|    <img src="docs/images/edge_128x128.png" alt="Edge" width="32" /></br>Microsoft Edge     |     ✅     | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/opeggffopnceofagdhebmghglfnojfln) |
|        <img src="docs/images/brave_128x128.png" alt="Brave" width="32" /></br>Brave        |     ✅     |                  [Download](https://github.com/nh4ttruong/thisip/releases/latest)                  |
| <img src="docs/images/firefox_128x128.png" alt="Firefox" width="32" /></br>Mozilla Firefox | ⚠️ Partial |                  [Download](https://github.com/nh4ttruong/thisip/releases/latest)                  |
|      <img src="docs/images/safari_128x128.png" alt="Safari" width="32" /></br>Safari       |     ❌     |                                                 -                                                  |

### Manually

Since this extension is not fully published to the extension stores, you can install it manually in **Developer Mode**:

1. Clone or download this repository to your local machine.
2. Open browser's extension management page (e.g., `chrome://extensions/`, `edge://extensions/`, etc).
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button.
5. Select the `thisip` folder containing the extension files.
6. The **"This IP"** extension is now installed and active!

## License

MIT License
