# Release checklist

## 1. Build and verify

```bash
npm ci
npm test
npm run build
npm run build:ext
npm run test:e2e          # needs Chrome at /usr/bin/google-chrome (or CHROME_PATH)
npm run package:source
```

Artifacts in `release/`:

| File | Where it goes |
|---|---|
| `huallet-chrome-<version>.zip` | Chrome Web Store |
| `huallet-firefox-<version>.zip` | Firefox Add-ons |
| `huallet-source-<version>.zip` | Firefox Add-ons, "source code" upload (private to reviewers) |

Every store upload needs a higher `version` in `package.json` than the previous one.

## 2. Publish the privacy policy

Upload `store/privacy.html` to a public URL (for example `https://chihuahua.wtf/huallet/privacy`).
Both stores need this URL. Keep it in sync with `PRIVACY.md`.

## 3. Chrome Web Store

1. https://chrome.google.com/webstore/devconsole — register (one-time fee, 2-step verification on the Google account).
2. *New item* → upload `release/huallet-chrome-<version>.zip`.
3. Fill *Store listing*, *Privacy practices* and *Distribution* from `store/chrome/listing.md`; graphics from `store/assets/`.
4. Submit for review. Expect in-depth review (crypto wallet + content scripts on all sites).

## 4. Firefox Add-ons

1. https://addons.mozilla.org/developers — sign in.
2. *Submit a New Add-on* → *On this site* → upload `release/huallet-firefox-<version>.zip`.
3. Answer "Yes" to "Do you need to submit source code?" and upload `release/huallet-source-<version>.zip`.
4. Fill the listing from `store/firefox/listing.md`; paste the reviewer notes.
5. Submit. Listed add-ons get a human review.

## 5. After approval

- Store links live in `src/lib/wallet/extension.ts` (`HUALLET_CHROME_URL`, `HUALLET_FIREFOX_URL`) and in `README.md`.
- Keep `GECKO_ID` in `scripts/build-extension.mjs` unchanged forever.
- Updates: bump the version, rebuild, upload the new zips (and the new source zip for Firefox).
