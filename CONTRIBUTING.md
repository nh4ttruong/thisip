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

## CI/CD release pipeline

GitHub Actions workflow `.github/workflows/release.yml` validates, packages,
creates a GitHub release, and can submit updates to Firefox Add-ons and
Microsoft Edge Add-ons.

Official references:

- Firefox `web-ext` signing:
  <https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/#sign-and-submit-your-extension-for-publication>
- Microsoft Edge Add-ons Update REST API:
  <https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api>

The workflow runs in three modes:

- Pull requests and pushes to `main`: lint and build only.
- Tags named `vX.Y.Z`: lint, build, create/update a GitHub release, submit to
  Firefox Add-ons, and submit to Microsoft Edge Add-ons.
- Manual `workflow_dispatch`: lint/build, with checkboxes to publish Firefox,
  publish Edge, and create/update the GitHub release.

Before pushing a release tag, make sure the tag matches `manifest.json` exactly.
For example, if the manifest version is `1.0.3`, the tag must be `v1.0.3`.

```bash
git tag v1.0.3
git push origin v1.0.3
```

### GitHub repository secrets and variables

Set these in GitHub repository settings before using store publishing.

Firefox Add-ons secrets:

- `AMO_JWT_ISSUER`: JWT issuer from AMO API credentials.
- `AMO_JWT_SECRET`: JWT secret from AMO API credentials.

Microsoft Edge Add-ons variable:

- `EDGE_PRODUCT_ID`: Product ID GUID from the Edge Partner Center extension
  overview page.

Microsoft Edge Add-ons secrets:

- `EDGE_CLIENT_ID`: Client ID from Partner Center Publish API.
- `EDGE_API_KEY`: API key from Partner Center Publish API.

### Firefox Add-ons publishing notes

The workflow uses:

```bash
npx --yes web-ext sign -c web-ext.config.cjs \
  --channel=listed \
  --api-key="$AMO_JWT_ISSUER" \
  --api-secret="$AMO_JWT_SECRET" \
  --approval-timeout=0
```

`--approval-timeout=0` means CI submits the listed add-on update but does not
wait for human or automated AMO approval. Check AMO after the workflow finishes
to see review status.

For a brand-new listed Firefox add-on, AMO may require listing metadata or
manual setup before fully automated updates work. After the add-on exists and
the manifest keeps a stable `browser_specific_settings.gecko.id`, tagged
updates can be automated.

### Microsoft Edge Add-ons publishing notes

The workflow uses the Microsoft Edge Add-ons Update REST API v1.1. Edge requires
the first submission to be created in Partner Center manually. After the
extension exists in Partner Center and has a Product ID, CI can upload and
publish update submissions.

The Edge publish script is `.github/scripts/publish-edge-addons.mjs`. It:

- Uploads the generated zip to the draft package endpoint.
- Polls the package upload operation until it succeeds or fails.
- Sends certification notes and starts the publish operation.
- Polls the publish operation until it succeeds or fails.

If Edge already has an in-review submission, the API can reject the publish step
with `InProgressSubmission`. Wait for the current review to finish before
retrying.

## Package ignore rules

The shared `web-ext.config.cjs` excludes files that should not be shipped inside
browser extension packages:

- `docs` and `docs/**`: marketing/privacy site files, not runtime extension
  code.
- `web-ext-artifacts` and `web-ext-artifacts/**`: generated build output.
- `.git` and `.git/**`: repository metadata.
- `.github` and `.github/**`: CI/CD workflows and publishing scripts.
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
