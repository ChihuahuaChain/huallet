import { extApi } from "@/lib/kv";
import { CONTENT_SOURCE, PAGE_SOURCE, PROVIDER_PORT, type ProviderRequest } from "../shared/protocol";

const api = extApi()!;
let port: chrome.runtime.Port | null = null;

function getPort(): chrome.runtime.Port {
  if (port) return port;
  const p = api.runtime.connect({ name: PROVIDER_PORT });
  p.onMessage.addListener((m: { id: string; ok: boolean; result?: unknown; error?: string }) => {
    window.postMessage({ source: CONTENT_SOURCE, id: m.id, ok: m.ok, result: m.result, error: m.error }, window.location.origin);
  });
  p.onDisconnect.addListener(() => {
    port = null;
  });
  port = p;
  return p;
}

window.addEventListener("message", (e: MessageEvent<ProviderRequest>) => {
  if (e.source !== window || e.origin !== window.location.origin) return;
  const d = e.data;
  if (!d || d.source !== PAGE_SOURCE || typeof d.id !== "string" || typeof d.method !== "string") return;
  try {
    getPort().postMessage({ id: d.id, method: d.method, params: d.params });
  } catch {
    port = null;
    getPort().postMessage({ id: d.id, method: d.method, params: d.params });
  }
});

api.runtime.onMessage.addListener((m: { type?: string }) => {
  if (m?.type === "keystorechange") window.postMessage({ source: CONTENT_SOURCE, event: "keystorechange" }, window.location.origin);
});
