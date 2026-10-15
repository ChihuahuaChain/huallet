// Bundle injected into the in-app dApp browser's WebView (Android), built as a
// standalone IIFE by scripts/build-mobile.mjs into android assets.
//
// It installs the standard window.huallet provider (shared verbatim with the
// browser extension) and bridges the provider's window.postMessage transport to
// the native plugin, which relays each request to the wallet core running in
// the main app WebView and delivers the answer back here.
import { CONTENT_SOURCE, PAGE_SOURCE } from "../extension/shared/protocol";
import "../extension/content/inpage";

interface NativeBridge {
  postMessage(json: string): void;
}

declare global {
  interface Window {
    HualletNative?: NativeBridge;
    __hualletDeliver?: (envelope: Record<string, unknown>) => void;
    __hualletBridge?: boolean;
  }
}

if (!window.__hualletBridge) {
  window.__hualletBridge = true;

  // Page -> native: forward every provider request to the native plugin, which
  // stamps the page's real origin before handing it to the wallet core.
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const d = e.data as { source?: string; id?: string; method?: string; params?: unknown[] };
    if (!d || d.source !== PAGE_SOURCE || typeof d.id !== "string" || typeof d.method !== "string") return;
    try {
      window.HualletNative?.postMessage(JSON.stringify({ id: d.id, method: d.method, params: d.params ?? [] }));
    } catch {
      /* native bridge gone; the request simply never resolves */
    }
  });

  // Native -> page: deliver a response envelope ({ id, ok, result, error }) or a
  // keystore-change event ({ event: "keystorechange" }) to the injected
  // provider, which listens for CONTENT_SOURCE messages.
  window.__hualletDeliver = (envelope) => {
    window.postMessage({ ...envelope, source: CONTENT_SOURCE }, window.location.origin);
  };
}
