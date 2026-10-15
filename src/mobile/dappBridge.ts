import { registerPlugin } from "@capacitor/core";
import type { WalletCore } from "@/extension/background/core";

interface ProviderRequestEvent {
  /** The browsed page's origin, stamped natively (never trusted from the page). */
  origin: string;
  /** JSON of { id, method, params } exactly as the injected provider sent it. */
  message: string;
}

interface DappPlugin {
  open(o: { url: string }): Promise<void>;
  close(): Promise<void>;
  respond(o: { message: string }): Promise<void>;
  setOverlayVisible(o: { visible: boolean }): Promise<void>;
  keystoreChanged(): Promise<void>;
  addListener(event: "providerRequest", cb: (e: ProviderRequestEvent) => void): Promise<{ remove: () => Promise<void> }>;
}

const plugin = registerPlugin<DappPlugin>("HualletDapp");

// A JSON string is a valid JS expression except for these two line terminators,
// which are legal in JSON but break a JS source literal. The native side
// injects the envelope with evaluateJavascript, so escape them.
function jsonForEval(value: unknown): string {
  return JSON.stringify(value).split("\u2028").join("\\u2028").split("\u2029").join("\\u2029");
}

let wired = false;

/**
 * Wire the in-app dApp browser (Android) to the wallet core: every provider
 * request from the browsed page is answered by core.handleProvider, with the
 * page's real origin stamped natively. A no-op where the plugin is absent
 * (extension, web), since those builds never open the native browser.
 */
export function setupDappBridge(core: WalletCore): void {
  if (wired) return;
  wired = true;

  void plugin.addListener("providerRequest", async (e) => {
    let reply: string;
    try {
      const req = JSON.parse(e.message) as { id: string; method: string; params?: unknown[] };
      const result = await core.handleProvider(e.origin, req.method, req.params ?? []);
      reply = jsonForEval({ id: req.id, ok: true, result: result ?? null });
    } catch (err) {
      const id = safeId(e.message);
      reply = jsonForEval({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    await plugin.respond({ message: reply }).catch(() => {});
  });

  // Keep the overlay out of the way while an approval screen shows in the main
  // app WebView, and show it again otherwise. Driven purely by the route hash,
  // so it is robust to Approve/Reject, request expiry and the hardware back
  // button alike.
  const syncOverlay = () => {
    const onApproval = location.hash.startsWith("#/approve/");
    void plugin.setOverlayVisible({ visible: !onApproval }).catch(() => {});
  };
  window.addEventListener("hashchange", syncOverlay);
}

function safeId(message: string): string {
  try {
    return String((JSON.parse(message) as { id?: string }).id ?? "");
  } catch {
    return "";
  }
}

/** Controls for the native dApp browser. Safe to call anywhere; resolves to a
 * no-op where the plugin is absent. */
export const dappBrowser = {
  open: (url: string) => plugin.open({ url }).catch(() => {}),
  close: () => plugin.close().catch(() => {}),
  keystoreChanged: () => plugin.keystoreChanged().catch(() => {}),
};
