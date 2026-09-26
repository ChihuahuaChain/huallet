# Chrome Web Store — listing

Paste each field into the Developer Dashboard (https://chrome.google.com/webstore/devconsole).

## Package
`release/huallet-chrome-<version>.zip`

## Store listing

**Name** (from manifest): Huallet

**Summary** (manifest description, max 132 chars):
Self-custodial wallet for Chihuahua Chain and the Cosmos ecosystem. Stake, vote, send, bridge — and connect to dApps.

**Category:** Tools
**Language:** English

**Description:**

Huallet is the official wallet of Chihuahua Chain — a self-custodial browser wallet for HUAHUA and the whole Cosmos ecosystem.

YOUR KEYS, YOUR TREATS
• Create a new wallet or import a recovery phrase or private key
• Keys are encrypted on your device (AES-256-GCM) and never leave it
• Ledger hardware wallet support (Cosmos app)
• Auto-lock, multiple accounts, privacy mode

STAKE AND EARN
• Stake, unstake and redelegate HUAHUA and other Cosmos tokens
• Claim rewards from one validator or all at once
• Validator list with voting power and commission, plus decentralization hints

SWAP ON HUAHUASWAP
• Trade HUAHUA and Chihuahua tokens on the native DEX, right from the wallet
• Clear quotes, price impact and slippage protection
• Buy and sell new tokens on the HuahuaSwap Launchpad

SEND, RECEIVE, BRIDGE
• Send native, IBC, tokenfactory and CW20 tokens
• IBC transfers between Cosmos chains, with channels verified on-chain
• Address book, QR codes, and warnings when an address belongs to another chain

GOVERNANCE
• Follow proposals and vote from the popup

CONNECT TO DAPPS
• dApps connect through the Huallet provider (window.huallet)
• Every connection and signature opens a clear review window showing the site, the messages, the fee and the raw data

BUILT-IN CHAINS
Chihuahua, Cosmos Hub, Osmosis, Juno, Celestia — and add any Cosmos chain from the chain registry.

Huallet is open source (Apache-2.0): https://github.com/ChihuahuaChain/huallet — no accounts, no analytics and no tracking. Nobody — including the Chihuahua team — can access or recover your keys: keep your recovery phrase safe and offline.

**Graphics** (`store/assets/`):
- Screenshots (1280×800): `screenshot-1-wallet.png`, `screenshot-2-staking.png`, `screenshot-3-swap.png`, `screenshot-4-signing.png`, `screenshot-5-ledger.png` (max 5)
- Small promo tile (440×280): `promo-small-440x280.png`
- Marquee (1400×560, optional): `promo-marquee-1400x560.png`
- Icon: taken from the package (128×128)

**Official URL / homepage:** https://github.com/ChihuahuaChain/huallet
**Support URL:** https://github.com/ChihuahuaChain/huallet/issues

## Privacy practices tab

**Single purpose:**
Huallet is a cryptocurrency wallet for Chihuahua Chain and other Cosmos networks: it stores the user's keys encrypted on the device, shows balances, signs transactions the user approves, and lets websites (dApps) request connections and signatures.

**Permission justifications:**
- `storage`: stores the user's encrypted wallet vault, settings, address book and the list of sites the user connected. The unlocked state is kept in memory-only session storage.
- `alarms`: locks the wallet automatically after the inactivity period chosen by the user.
- Host permissions (content scripts on https pages, localhost): inject the wallet provider (`window.huallet`) so decentralized apps can ask to connect and request signatures, like other Cosmos wallets. The scripts do not read page content; every request requires explicit approval in a Huallet window.

**Remote code:** No, I am not using remote code. (All JavaScript is included in the package.)

**Data usage:** tick nothing — Huallet does not collect or transmit user data to the developer.
Certify all three statements (no selling, no unrelated use, no creditworthiness use).

**Privacy policy URL:** https://github.com/ChihuahuaChain/huallet/blob/main/PRIVACY.md

## Notes for the reviewer (Distribution → "Additional information", if asked)

Huallet is a self-custodial crypto wallet. Test it with this public test phrase (no funds):
`abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`
Content scripts only expose the wallet provider API (`window.huallet`) to websites; every connection and signature requires the user's approval in a Huallet popup window.
