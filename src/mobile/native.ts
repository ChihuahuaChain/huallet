import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { Nfc, NfcStatus, Screen } from "@/lib/native";

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
