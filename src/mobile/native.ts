import { BarcodeFormat, BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { Nfc, NfcStatus, QrScanner, Screen } from "@/lib/native";

// Google's scanner UI from Play Services: no camera permission for the app.
export const androidScanner: QrScanner = {
  async scan() {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
      await new Promise<void>((resolve, reject) => {
        void BarcodeScanner.addListener("googleBarcodeScannerModuleInstallProgress", (e) => {
          if (e.state === 4) resolve(); // COMPLETED
          if (e.state === 5 || e.state === 3) reject(new Error("Could not install the QR scanner from Google Play")); // FAILED / CANCELED
        });
      });
    }
    try {
      const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
      return barcodes[0]?.rawValue ?? null;
    } catch (e) {
      // Backing out of Google's scanner reports "Failed to scan code." rather than a cancel.
      if (/cancel|failed to scan code/i.test(String((e as Error)?.message ?? e))) return null;
      throw e;
    }
  },
};

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
