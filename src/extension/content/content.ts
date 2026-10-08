import { extApi } from "@/lib/kv";
import { CONTENT_SOURCE, PAGE_SOURCE, PROVIDER_PORT, type ProviderRequest } from "../shared/protocol";

const api = extApi()!;
let port: chrome.runtime.Port | null = null;

// The extension context dies when the extension is reloaded/updated while a page
// stays open; touching chrome.runtime then throws "Extension context invalidated".
// Fail quietly until the page reloads with a fresh content script.
function contextAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

function getPort(): chrome.runtime.Port | null {
  if (port) return port;
  if (!contextAlive()) return null;
  try {
    const p = api.runtime.connect({ name: PROVIDER_PORT });
    p.onMessage.addListener((m: { id: string; ok: boolean; result?: unknown; error?: string }) => {
      window.postMessage({ source: CONTENT_SOURCE, id: m.id, ok: m.ok, result: m.result, error: m.error }, window.location.origin);
    });
    p.onDisconnect.addListener(() => {
      port = null;
    });
    port = p;
    return p;
  } catch {
    port = null;
    return null;
  }
}

function forward(req: { id: string; method: string; params: unknown }): void {
  const p = getPort();
  if (!p) return;
  try {
    p.postMessage(req);
  } catch {
    // Port went away mid-flight; try a fresh one, then give up quietly.
    port = null;
    try {
      getPort()?.postMessage(req);
    } catch {
      /* extension reloaded — the page needs a refresh */
    }
  }
}

window.addEventListener("message", (e: MessageEvent<ProviderRequest>) => {
  if (e.source !== window || e.origin !== window.location.origin) return;
  const d = e.data;
  if (!d || d.source !== PAGE_SOURCE || typeof d.id !== "string" || typeof d.method !== "string") return;
  forward({ id: d.id, method: d.method, params: d.params });
});

try {
  api.runtime.onMessage.addListener((m: { type?: string }) => {
    if (m?.type === "keystorechange") window.postMessage({ source: CONTENT_SOURCE, event: "keystorechange" }, window.location.origin);
  });
} catch {
  /* context already gone */
}
