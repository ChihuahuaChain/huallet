# Huallet browser extension (Manifest V3)

- `background/` — service worker: owns the keyring, per-site permissions, approval windows, auto-lock and the dApp provider.
- `content/content.ts` — isolated-world bridge between web pages and the background (runtime Port).
- `content/inpage.ts` — MAIN-world `window.huallet` provider (the only global the extension defines).
- `popup/` — React app for the toolbar popup, the full-tab view and approval windows; signs through the background (`backend.ts`).
- `onboarding/`, `settings/`, `Unlock.tsx` — local-key UI.
- `shared/protocol.ts` — message types between all parts.

Build with `npm run build:ext` (see `scripts/build-extension.mjs`), test with `npm run test:e2e`.
