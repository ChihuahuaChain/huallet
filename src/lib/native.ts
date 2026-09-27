// Phone-only capabilities (QR scanner, NFC). Set by the Android app at
// startup; in the extension and the web app they stay null and the UI hides them.

export interface QrScanner {
  /** Opens the camera; resolves with the text, or null if the user backed out. */
  scan(): Promise<string | null>;
}

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

let scanner: QrScanner | null = null;
let nfc: Nfc | null = null;

export function setNative(n: { scanner?: QrScanner; nfc?: Nfc }) {
  scanner = n.scanner ?? scanner;
  nfc = n.nfc ?? nfc;
}

export const qrScanner = () => scanner;
export const nfcApi = () => nfc;
