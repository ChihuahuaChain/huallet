// Phone-only capabilities (camera QR scanning, NFC, screen brightness, Ledger over USB/Bluetooth). Set by the Android app at
// startup; in the extension and the web app they stay null and the UI hides them.

export interface NfcStatus {
  supported: boolean;
  enabled: boolean;
  hce: boolean;
}

export interface Nfc {
  status(): Promise<NfcStatus>;
  /** Makes this phone readable as an NFC tag holding `uri` until stopped. */
  startEmulation(uri: string): Promise<void>;
  stopEmulation(): Promise<void>;
  /** Waits for a tag or another phone; `onRead` gets its text or an error. */
  startReading(onRead: (r: { value?: string; error?: string }) => void): Promise<void>;
  stopReading(): Promise<void>;
}

export interface Screen {
  /** Full brightness on, or back to the system setting. */
  setMaxBrightness(on: boolean): Promise<void>;
}

export interface LedgerDevice {
  id: string;
  name: string;
  transport: "usb" | "ble";
}

/** Raw Ledger I/O: USB HID reports (64 bytes) or Bluetooth LE frames. Framing lives in lib/ledger/framing. */
export interface LedgerNative {
  /** USB devices plugged in now, plus Bluetooth devices seen while scanning for `scanMs`. */
  list(scanMs: number): Promise<LedgerDevice[]>;
  open(id: string): Promise<LedgerDevice>;
  write(data: Uint8Array): Promise<void>;
  /** Next report or notification; rejects after `timeoutMs`. */
  read(timeoutMs: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

let cameraScan = false;
let nfc: Nfc | null = null;
let screen: Screen | null = null;
let ledger: LedgerNative | null = null;

export function setNative(n: { cameraScan?: boolean; nfc?: Nfc; screen?: Screen; ledger?: LedgerNative }) {
  cameraScan = n.cameraScan ?? cameraScan;
  nfc = n.nfc ?? nfc;
  screen = n.screen ?? screen;
  ledger = n.ledger ?? ledger;
}

/** Whether Send offers the in-app camera QR scanner. */
export const canScanQr = () => cameraScan;
export const nfcApi = () => nfc;
export const screenApi = () => screen;
export const ledgerNativeApi = () => ledger;
