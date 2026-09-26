# Firefox Add-ons (AMO) — listing

Submit at https://addons.mozilla.org/developers/addon/submit/ → "On this site".

## Files
- Add-on: `release/huallet-firefox-<version>.zip`
- Source code (asked because the add-on is bundled/minified): `release/huallet-source-<version>.zip`
  (build instructions inside: `BUILD.md`). The source is only visible to Mozilla reviewers.

## Listing

**Name:** Huallet
**Add-on URL (slug):** huallet
**Summary** (max 250 chars):
The official Chihuahua Chain wallet. Self-custodial wallet for HUAHUA and the Cosmos ecosystem: stake, swap on HuahuaSwap, vote, send and bridge with IBC, and connect to Cosmos dApps. Keys stay encrypted on your device.

**Description:** use the Chrome description (`store/chrome/listing.md`) and add at the end:
"Note: Ledger hardware wallets need WebHID, which Firefox does not support yet. Use a Chromium-based browser for Ledger accounts."

**Categories:** Privacy & Security (primary), Other
**Tags:** crypto, wallet, cosmos, blockchain, staking
**Homepage:** https://github.com/ChihuahuaChain/huallet
**Support site:** https://github.com/ChihuahuaChain/huallet/issues
**License:** Apache License 2.0
**Privacy policy:** paste the text of `PRIVACY.md` (AMO asks for the text itself)
**Screenshots:** `store/assets/screenshot-*.png`

**This add-on requires payment, non-free services or software, or additional hardware?** No
(Ledger is optional.)

## Notes to reviewer
Paste:

Huallet is a self-custodial Cosmos wallet (official wallet of Chihuahua Chain).
- Build: see BUILD.md in the source archive (Node 22, `npm ci && npm run build:ext`). The build is reproducible: the output in dist-extension/firefox is byte-identical to the submitted package.
- web-ext lint: 0 errors. Warnings come from third-party code (React DOM innerHTML handling, Vite's module-preload helper, and a never-executed `Function("return this")` globalThis shim in a dependency).
- Content scripts expose the wallet provider (window.huallet) to websites; every connection and signature request opens a Huallet approval window.
- No data collection; network requests only to public blockchain RPC/REST endpoints, CoinGecko (prices, can be disabled) and the Cosmos chain registry.
- Test phrase without funds: abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
