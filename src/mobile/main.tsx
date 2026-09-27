import "@/extension/popup/polyfills";
import { App as NativeApp } from "@capacitor/app";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/index.css";
import { createWalletCore } from "@/extension/background/core";
import { setInProcessBackground } from "@/extension/popup/background";
import { setAppStorage } from "@/lib/kv";
import { mobilePlatform, prefsAppStorage } from "./platform";

// Storage and transport must be in place before any store loads.
setAppStorage(prefsAppStorage);
const refreshKeyring = () => import("@/extension/state/keyringStore").then((m) => m.useKeyring.getState().refresh());
const core = createWalletCore(mobilePlatform(() => void refreshKeyring()));
setInProcessBackground(core.handleUi);

// Auto-lock: checked every 30 s while open, and as soon as the app comes back.
setInterval(() => void core.checkAutoLock().then(refreshKeyring), 30_000);
void NativeApp.addListener("resume", () => void core.checkAutoLock().then(refreshKeyring));
void NativeApp.addListener("backButton", ({ canGoBack }) => (canGoBack ? history.back() : void NativeApp.minimizeApp()));

document.documentElement.dataset.view = "mobile";

const { PopupApp } = await import("@/extension/popup/App");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
