import { extApi, extensionKV } from "@/lib/kv";
import { PROVIDER_PORT, type Envelope, type UiRequest } from "../shared/protocol";
import { createWalletCore } from "./core";

const api = extApi()!;

(api.storage.session as { setAccessLevel?: (o: { accessLevel: string }) => Promise<void> }).setAccessLevel?.({
  accessLevel: "TRUSTED_CONTEXTS",
}).catch(() => {});

const core = createWalletCore({
  local: extensionKV("local"),
  session: extensionKV("session"),
  async readAppState(name) {
    const r = await api.storage.local.get(name);
    return r[name] as string | undefined;
  },
  async writeAppState(name, value) {
    await api.storage.local.set({ [name]: value });
  },
  async openApproval(id) {
    const url = api.runtime.getURL(`popup.html?view=approval#/approve/${id}`);
    const win = await api.windows.create({ url, type: "popup", width: 400, height: 660, focused: true });
    return win?.id;
  },
  closeApproval(windowId) {
    api.windows.remove(windowId as number).catch(() => {});
  },
  async broadcastKeystoreChange() {
    const tabs = await api.tabs.query({});
    for (const tab of tabs) {
      if (tab.id !== undefined) api.tabs.sendMessage(tab.id, { type: "keystorechange" }).catch(() => {});
    }
  },
});

api.alarms.create("autolock", { periodInMinutes: 1 });
api.alarms.onAlarm.addListener((a) => {
  if (a.name === "autolock") void core.checkAutoLock();
});

api.windows.onRemoved.addListener((windowId) => core.approvalClosed(windowId));

api.runtime.onConnect.addListener((port) => {
  if (port.name !== PROVIDER_PORT) return;
  const sender = port.sender;
  const url = sender?.origin ?? sender?.url;
  let origin: string;
  try {
    const u = new URL(url ?? "");
    if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) {
      port.disconnect();
      return;
    }
    origin = u.origin;
  } catch {
    port.disconnect();
    return;
  }
  port.onMessage.addListener(async (m: { id: string; method: string; params: unknown[] }) => {
    try {
      const result = await core.handleProvider(origin, m.method, Array.isArray(m.params) ? m.params : []);
      port.postMessage({ id: m.id, ok: true, result });
    } catch (e) {
      port.postMessage({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
});

function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === api.runtime.id && !!sender.url?.startsWith(api.runtime.getURL(""));
}

api.runtime.onMessage.addListener((req: UiRequest, sender, sendResponse) => {
  if (!isExtensionPage(sender) || typeof req?.type !== "string") return false;
  core.handleUi(req).then(
    (result) => sendResponse({ ok: true, result } satisfies Envelope<unknown>),
    (e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e), code: core.errorCode(e) } satisfies Envelope<unknown>),
  );
  return true;
});

api.runtime.onConnect.addListener((port) => {
  if (port.name !== "huallet-approval") return;
  port.onMessage.addListener(() => {});
});
