import Transport from "@ledgerhq/hw-transport";
import { Buffer } from "buffer";
import { BLE_MTU_REQUEST, bleFrames, hidFrames, parseBleMtu, Reassembler } from "@/lib/ledger/framing";
import type { LedgerDevice, LedgerNative } from "@/lib/native";

/** Waiting for the user to confirm on the device can take a while. */
const RESPONSE_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_BLE_MTU = 20;

/** A Ledger transport over the Android app's native USB/Bluetooth plugin. */
export class NativeLedgerTransport extends Transport {
  private constructor(
    private readonly native: LedgerNative,
    readonly device: LedgerDevice,
    private readonly mtu: number,
  ) {
    super();
  }

  static async connect(native: LedgerNative, id: string): Promise<NativeLedgerTransport> {
    const device = await native.open(id);
    let mtu = DEFAULT_BLE_MTU;
    if (device.transport === "ble") {
      try {
        await native.write(BLE_MTU_REQUEST);
        mtu = parseBleMtu(await native.read(5_000)) ?? DEFAULT_BLE_MTU;
      } catch {
        mtu = DEFAULT_BLE_MTU;
      }
    }
    return new NativeLedgerTransport(native, device, mtu);
  }

  async exchange(apdu: Buffer): Promise<Buffer> {
    const ble = this.device.transport === "ble";
    for (const f of ble ? bleFrames(apdu, this.mtu) : hidFrames(apdu)) await this.native.write(f);
    const r = new Reassembler(ble ? "ble" : "hid");
    for (;;) {
      const out = r.push(await this.native.read(RESPONSE_TIMEOUT_MS));
      if (out) return Buffer.from(out);
    }
  }

  async close(): Promise<void> {
    await this.native.close();
  }
}
