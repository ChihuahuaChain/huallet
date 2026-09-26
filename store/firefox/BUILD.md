# Building Huallet from source (for add-on reviewers)

The submitted package is produced by a bundler (Vite/Rollup) with minification. No code is obfuscated,
downloaded at runtime or evaluated dynamically.

## Requirements

- Linux or macOS
- Node.js 22.x (tested with 22.17.0) and npm 10.x
- `zip` command-line tool

## Steps

```bash
npm ci
npm run build:ext
```

Output:

- `dist-extension/firefox/` — the unpacked add-on (identical to the submitted package)
- `release/huallet-firefox-<version>.zip` — the submitted package

The build script is `scripts/build-extension.mjs`. Entry points:

| File in package | Source |
|---|---|
| `background.js` | `src/extension/background/index.ts` |
| `content.js` | `src/extension/content/content.ts` |
| `inpage.js` (MAIN world) | `src/extension/content/inpage.ts` |
| `popup.html`, `assets/*` | `popup.html`, `src/extension/popup/main.tsx` |

## Notes for reviewers

- `web-ext lint` reports 0 errors. The warnings come from third-party code: React DOM internals (`innerHTML`),
  Vite's module preload helper (dynamic `import`), and a `globalThis` shim (`Function("return this")`) inside a
  dependency, which is never executed because `self` is always defined in extension contexts.
- Permissions: `storage` (encrypted vault and settings), `alarms` (auto-lock). Content scripts on https pages
  (and localhost) expose the wallet provider (`window.huallet`) so websites can
  request connections and signatures; every request opens a Huallet approval window.
- No data is collected (`data_collection_permissions: none`). Network requests go only to public blockchain
  RPC/REST endpoints, CoinGecko (prices, optional) and the Cosmos chain registry.
- Ledger hardware wallets are not available on Firefox (no WebHID); the UI says so.
- Test mnemonic without funds, for trying the wallet:
  `abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`
