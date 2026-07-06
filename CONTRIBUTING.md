# Contributing

Thanks for helping improve This IP. This project is a plain WebExtension:
there is no bundler, no compile step, and no runtime dependency. Most changes
are made directly in `manifest.json`, `scripts/`, `popup/`, `images/`, or
`docs/`.

## Browser targets

This extension supports Chromium-based browsers and Firefox from the same
source tree.

- Edge and other Chromium browsers use `background.service_worker`.
- Firefox Manifest V3 uses `background.scripts`; keep this fallback in
  `manifest.json`.
- Firefox-specific metadata belongs under `browser_specific_settings.gecko`.
- Keep the extension on the `chrome.*` WebExtension APIs unless a change has
  been verified in both Edge and Firefox.

Do not remove the Firefox fallback or Gecko metadata just because Chromium
prints an unknown-key warning.

## Prerequisites

- A recent Node.js installation with `npx`.
- Microsoft Edge for Chromium testing.
- Firefox for Firefox testing.

`web-ext` is run through `npx`, so contributors do not need to install project
dependencies first.

## Local development in Edge

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the repository root, not a zip file.
5. After changing source files, click Reload on the extension card.

Recommended Edge smoke test:

- Visit `https://example.com` and another real website.
- Confirm the floating IP badge appears.
- Click the badge and confirm the IP copies to the clipboard.
- Open the extension popup and confirm hostname, IP, refresh, toggles, theme,
  opacity, and hover delay work.
- Toggle the extension off and on from the popup.
- Check background logs from the extension card's service worker inspect link.
- Check content-script behavior from the page DevTools console.

## Local development in Firefox

Use `web-ext run` so Firefox loads a temporary development copy:

```bash
npx --yes web-ext run -c web-ext.config.cjs --start-url https://example.com
```

If Firefox is not found automatically, pass the binary path:

```bash
npx --yes web-ext run -c web-ext.config.cjs \
  --firefox /Applications/Firefox.app/Contents/MacOS/firefox \
  --start-url https://example.com
```

The temporary add-on is removed when the test Firefox profile closes. To inspect
background behavior, open `about:debugging#/runtime/this-firefox`, find This IP,
and click Inspect.

Recommended Firefox smoke test:

- Visit `https://example.com` and another real website.
- Confirm the floating IP badge appears.
- Click the badge and confirm the IP copies to the clipboard.
- Open the extension popup and confirm hostname, IP, refresh, toggles, theme,
  opacity, and hover delay work.
- Toggle the extension off and on from the popup.
- Enter and exit fullscreen and confirm the badge hides and returns.

## Linting

Run Firefox/AMO validation before submitting a change:

```bash
npx --yes web-ext lint -c web-ext.config.cjs
```

The `BACKGROUND_SERVICE_WORKER_IGNORED` warning is expected. Firefox ignores
`background.service_worker` and uses `background.scripts` instead. Other errors
or warnings should be fixed before submitting.

## Packaging

Build the uploadable extension package with:

```bash
npx --yes web-ext build -c web-ext.config.cjs --overwrite-dest
```

The zip is written to `web-ext-artifacts/`. Upload that generated zip to the
Firefox Add-ons Developer Hub or the Edge Partner Center. Do not zip the whole
repository by hand.

Before uploading a new store version, increase `version` in `manifest.json`.
Store dashboards reject packages with a version that is not higher than the
already-uploaded version.

## Package ignore rules

The shared `web-ext.config.cjs` excludes files that should not be shipped inside
browser extension packages:

- `docs` and `docs/**`: marketing/privacy site files, not runtime extension
  code.
- `web-ext-artifacts` and `web-ext-artifacts/**`: generated build output.
- `.git` and `.git/**`: repository metadata.
- `.gitignore`, `CONTRIBUTING.md`, and `web-ext.config.cjs`: contributor and
  tooling files.
- `.DS_Store`: macOS metadata.
- `*.zip`: local release archives.

The repository `.gitignore` also ignores `*.zip` and `web-ext-artifacts/` so
generated packages stay out of commits.

## Contribution checklist

- Keep changes focused on the requested behavior.
- Test the change in Edge and Firefox.
- Run `npx --yes web-ext lint -c web-ext.config.cjs`.
- If permissions change, update the privacy/documentation copy.
- Keep the extension privacy-first: no analytics, no tracking, and no external
  services beyond the existing DNS resolution behavior unless explicitly
  discussed.
