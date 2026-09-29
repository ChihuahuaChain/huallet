# Huallet Privacy Policy

_Last updated: 2026-09-25_

Huallet is a self-custodial wallet (browser extension and web app) for Chihuahua Chain and other Cosmos networks.
We do not operate servers that receive your data, and we do not collect, sell or share personal information.

## What stays on your device

- **Recovery phrases and private keys** (extension only) are encrypted with AES-256-GCM using a key derived from your
  password (PBKDF2-SHA256, 600,000 iterations) and stored in the browser's extension storage. While the wallet is unlocked,
  decrypted keys are kept in memory-only session storage that is cleared when you lock the wallet or close the browser.
  They are never transmitted anywhere.
- **Ledger accounts** store only the public key; signing happens on your device, which Huallet reaches over USB (WebHID) only when you connect or sign.
- **Settings, address book, custom chains, custom tokens and the list of sites you connected** are stored locally in your browser.

The web app never has access to your keys: it asks the wallet extension you connect for your public address and to sign transactions you approve.

## Network requests

To show balances and send transactions, Huallet connects directly from your browser to:

- **Blockchain nodes (RPC / REST)** of the networks you enable — public endpoints listed in the app, or endpoints you add yourself.
  These nodes necessarily see your public address and the transactions you broadcast, like with any wallet.
- **CoinGecko** (`api.coingecko.com`) for fiat prices — only token identifiers are sent, never your address. This can be turned off in Settings.
- **Cosmos Chain Registry** (`raw.githubusercontent.com/cosmos/chain-registry`) and **cosmos.directory** for public chain and token metadata.
- **Osmosis router** (`sqs.osmosis.zone`), only when you use the Osmosis swap — it receives the tokens and amount you want to quote, never your address. The list of Osmosis assets comes from `raw.githubusercontent.com/osmosis-labs/assetlists`.
- **Token and chain logos** hosted by the chain registry or by the chain configuration you add.

No analytics, tracking pixels, advertising or crash-reporting services are used.

## Websites (dApps)

A website can only see your addresses after you approve a connection request, and every signature requires your explicit
approval in a Huallet window. You can review and revoke connected sites at any time in **Settings → Connected sites**.

## Permissions (extension)

- `storage` — keep the encrypted vault and your settings.
- `alarms` — auto-lock the wallet after inactivity.
- Content scripts on web pages — expose the Huallet wallet provider so dApps can request connections and signatures. They cannot read your keys.

## Contact

Questions about this policy or Huallet: https://github.com/ChihuahuaChain/huallet/issues
