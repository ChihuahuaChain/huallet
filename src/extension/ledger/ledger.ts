import type { AminoSignResponse, StdSignDoc } from "@cosmjs/amino";
import { stringToPath } from "@cosmjs/crypto";
import { toHex } from "@cosmjs/encoding";
import { LedgerSigner } from "@cosmjs/ledger-amino";
import type Transport from "@ledgerhq/hw-transport";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import { hdPathFor, LEDGER_COIN_TYPE } from "@/lib/keyring/keyring";
import { ledgerNativeApi, type LedgerDevice, type LedgerNative } from "@/lib/native";
import { chooseLedgerDevice, PickerCancelled } from "./DevicePicker";
import { NativeLedgerTransport } from "./nativeTransport";

export class LedgerError extends Error {
  constructor(
    public readonly code: "unsupported" | "no-device" | "locked" | "app-closed" | "rejected" | "outdated" | "needs-full-view" | "busy" | "unknown",
    message: string,
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

export function isLedgerSupported(): boolean {
  return !!ledgerNativeApi() || (typeof navigator !== "undefined" && "hid" in navigator);
}

/** The Android app talks to the Ledger over USB (OTG cable) or Bluetooth instead of WebHID. */
export const isNativeLedger = () => !!ledgerNativeApi();

const SAVED_DEVICE = "huallet:ledger-device";

function savedDevice(): LedgerDevice | null {
  try {
    const v = localStorage.getItem(SAVED_DEVICE);
    return v ? (JSON.parse(v) as LedgerDevice) : null;
  } catch {
    return null;
  }
}

function saveDevice(d: LedgerDevice) {
  try {
    localStorage.setItem(SAVED_DEVICE, JSON.stringify(d));
  } catch {
    /* only a convenience */
  }
}

/** Reconnects to the last Ledger used; asks the user to pick one when it isn't reachable. */
async function openNativeTransport(native: LedgerNative): Promise<Transport> {
  const last = savedDevice();
  let reason = "";
  if (last) {
    try {
      return await NativeLedgerTransport.connect(native, last.id);
    } catch (e) {
      reason = (e as Error)?.message ?? "";
    }
  }
  for (;;) {
    let picked: LedgerDevice;
    try {
      picked = await chooseLedgerDevice(reason);
    } catch (e) {
      if (e instanceof PickerCancelled) throw new LedgerError("no-device", "No Ledger selected.");
      throw e;
    }
    try {
      const t = await NativeLedgerTransport.connect(native, picked.id);
      saveDevice(t.device);
      return t;
    } catch (e) {
      const err = toLedgerError(e);
      if (err.code !== "unknown") throw err;
      reason = err.message;
      await native.close().catch(() => {});
    }
  }
}

const LEDGER_VENDOR_ID = 0x2c97;

export async function hasPairedLedger(): Promise<boolean> {
  if (!isLedgerSupported()) return false;
  const nav = navigator as Navigator & { hid: { getDevices(): Promise<Array<{ vendorId: number }>> } };
  return (await nav.hid.getDevices()).some((d) => d.vendorId === LEDGER_VENDOR_ID);
}

function toLedgerError(e: unknown): LedgerError {
  if (e instanceof LedgerError) return e;
  const err = e as { message?: string; statusCode?: number; name?: string };
  const msg = err?.message ?? String(e);
  const code = err?.statusCode;
  if (code === 0x5515 || /locked/i.test(msg)) return new LedgerError("locked", "Your Ledger is locked. Unlock it with your PIN and try again.");
  if (code === 0x6986 || code === 0x6985 || /denied|rejected|refused/i.test(msg))
    return new LedgerError("rejected", "The request was rejected on the Ledger.");
  if (/outdated|update/i.test(msg)) return new LedgerError("outdated", "Please update the Cosmos app on your Ledger (via Ledger Live).");
  if (code === 0x6e01 || code === 0x6e00 || code === 0x6d00 || /open the .*app|Cosmos Ledger App is not connected|close .* and open/i.test(msg))
    return new LedgerError("app-closed", "Open the Cosmos app on your Ledger and try again.");
  if (/No device selected|TransportOpenUserCancelled|NotFoundError/i.test(msg) || err?.name === "TransportOpenUserCancelled")
    return new LedgerError("no-device", "No Ledger selected. Connect your Ledger via USB and choose it in the browser prompt.");
  if (/already open|busy|InvalidStateError/i.test(msg)) return new LedgerError("busy", "The Ledger is busy. Close other apps using it (e.g. Ledger Live) and retry.");
  return new LedgerError("unknown", msg);
}

let queue: Promise<unknown> = Promise.resolve();

async function withTransport<T>(fn: (t: Transport) => Promise<T>, opts: { allowChooser: boolean }): Promise<T> {
  const run = async () => {
    if (!isLedgerSupported()) throw new LedgerError("unsupported", "Ledger needs a Chromium-based browser (Chrome, Brave, Edge).");
    if (!isNativeLedger() && !opts.allowChooser && !(await hasPairedLedger())) {
      throw new LedgerError("needs-full-view", "Connect your Ledger from Huallet's full view first (menu → Open in full view).");
    }
    let transport: Transport | undefined;
    try {
      const native = ledgerNativeApi();
      transport = native ? await openNativeTransport(native) : await TransportWebHID.create();
      return await fn(transport);
    } catch (e) {
      throw toLedgerError(e);
    } finally {
      await transport?.close().catch(() => {});
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

function signerFor(transport: Transport, prefix: string, account: number, index: number) {
  return new LedgerSigner(transport, {
    hdPaths: [stringToPath(hdPathFor(LEDGER_COIN_TYPE, account, index))],
    prefix,
    testModeAllowed: false,
  });
}

export function readLedgerPubkey(account: number, index: number): Promise<string> {
  return withTransport(async (t) => {
    const [acc] = await signerFor(t, "cosmos", account, index).getAccounts();
    return toHex(acc.pubkey);
  }, { allowChooser: true });
}

export function showAddressOnLedger(account: number, index: number): Promise<string> {
  return withTransport(async (t) => {
    const r = await signerFor(t, "cosmos", account, index).showAddress(stringToPath(hdPathFor(LEDGER_COIN_TYPE, account, index)));
    return r.address;
  }, { allowChooser: true });
}

export function signAminoWithLedger(
  doc: StdSignDoc,
  signer: string,
  prefix: string,
  account: number,
  index: number,
  opts: { allowChooser: boolean },
): Promise<AminoSignResponse> {
  return withTransport((t) => signerFor(t, prefix, account, index).signAmino(signer, doc), opts);
}
