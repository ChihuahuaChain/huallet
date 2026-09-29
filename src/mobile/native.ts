import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { fromHex, toHex } from "@cosmjs/encoding";
import type { LedgerDevice, LedgerNative, Nfc, NfcStatus, Screen } from "@/lib/native";

interface NativeNfc {
  status(): Promise<NfcStatus>;
  startEmulation(o: { uri: string }): Promise<void>;
  stopEmulation(): Promise<void>;
  startReading(): Promise<void>;
  stopReading(): Promise<void>;
  addListener(event: "tag", cb: (e: { value?: string; error?: string }) => void): Promise<PluginListenerHandle>;
}

const native = registerPlugin<NativeNfc>("HualletNfc");
let listener: PluginListenerHandle | null = null;

export const androidNfc: Nfc = {
  status: () => native.status(),
  startEmulation: (uri) => native.startEmulation({ uri }),
  stopEmulation: () => native.stopEmulation(),
  async startReading(onRead) {
    await listener?.remove();
    listener = await native.addListener("tag", onRead);
    await native.startReading();
  },
  async stopReading() {
    await listener?.remove();
    listener = null;
    await native.stopReading();
  },
};

const nativeScreen = registerPlugin<{ setMaxBrightness(o: { on: boolean }): Promise<void> }>("HualletScreen");

export const androidScreen: Screen = {
  setMaxBrightness: (on) => nativeScreen.setMaxBrightness({ on }),
};

interface NativeLedger {
  list(o: { scanMs: number }): Promise<{ devices: LedgerDevice[] }>;
  open(o: { id: string }): Promise<LedgerDevice>;
  write(o: { data: string }): Promise<void>;
  read(o: { timeoutMs: number }): Promise<{ data: string }>;
  close(): Promise<void>;
}

const nativeLedger = registerPlugin<NativeLedger>("HualletLedger");

export const androidLedger: LedgerNative = {
  list: async (scanMs) => (await nativeLedger.list({ scanMs })).devices,
  open: (id) => nativeLedger.open({ id }),
  write: (data) => nativeLedger.write({ data: toHex(data) }),
  read: async (timeoutMs) => fromHex((await nativeLedger.read({ timeoutMs })).data),
  close: () => nativeLedger.close(),
};
