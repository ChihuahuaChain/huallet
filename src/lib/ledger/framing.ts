// Ledger APDU framing. USB HID: 64-byte reports, each starting with channel (2 bytes), tag 0x05 and a
// sequence number; the first also carries the APDU length. Bluetooth LE: the same without the channel,
// in frames of the negotiated MTU. Responses come back framed the same way.

const TAG = 0x05;
export const HID_PACKET_SIZE = 64;
export const HID_CHANNEL = 0x0101;

function frames(apdu: Uint8Array, size: number, header: (seq: number) => number[]): Uint8Array[] {
  const data = new Uint8Array(apdu.length + 2);
  data[0] = apdu.length >> 8;
  data[1] = apdu.length & 0xff;
  data.set(apdu, 2);
  const out: Uint8Array[] = [];
  let offset = 0;
  for (let seq = 0; offset < data.length || seq === 0; seq++) {
    const h = header(seq);
    const room = size - h.length;
    if (room <= 0) throw new Error("Frame size too small");
    const chunk = data.subarray(offset, offset + room);
    offset += chunk.length;
    const frame = new Uint8Array(size === HID_PACKET_SIZE && h.length === 5 ? size : h.length + chunk.length);
    frame.set(h, 0);
    frame.set(chunk, h.length);
    out.push(frame);
  }
  return out;
}

export function hidFrames(apdu: Uint8Array, channel = HID_CHANNEL): Uint8Array[] {
  return frames(apdu, HID_PACKET_SIZE, (seq) => [channel >> 8, channel & 0xff, TAG, seq >> 8, seq & 0xff]);
}

export function bleFrames(apdu: Uint8Array, mtu: number): Uint8Array[] {
  return frames(apdu, mtu, (seq) => [TAG, seq >> 8, seq & 0xff]);
}

/** Collects response frames; `push` returns the APDU response once complete. */
export class Reassembler {
  private expected = -1;
  private seq = 0;
  private chunks: Uint8Array[] = [];
  private received = 0;

  constructor(
    private readonly kind: "hid" | "ble",
    private readonly channel = HID_CHANNEL,
  ) {}

  push(frame: Uint8Array): Uint8Array | null {
    let p = 0;
    if (this.kind === "hid") {
      if (frame.length < 5) throw new Error("Short HID frame");
      const ch = (frame[0] << 8) | frame[1];
      if (ch !== this.channel) throw new Error(`Unexpected HID channel ${ch.toString(16)}`);
      p = 2;
    }
    if (frame[p] !== TAG) throw new Error(`Unexpected frame tag ${frame[p]}`);
    const seq = (frame[p + 1] << 8) | frame[p + 2];
    if (seq !== this.seq) throw new Error(`Frame out of order: got ${seq}, expected ${this.seq}`);
    p += 3;
    if (seq === 0) {
      this.expected = (frame[p] << 8) | frame[p + 1];
      p += 2;
    }
    this.seq++;
    const take = Math.min(frame.length - p, this.expected - this.received);
    this.chunks.push(frame.subarray(p, p + take));
    this.received += take;
    if (this.received < this.expected) return null;
    const out = new Uint8Array(this.expected);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

/** Ledger's BLE MTU query: write [0x08,0,0,0,0]; the device answers with the frame size at byte 5. */
export const BLE_MTU_REQUEST = new Uint8Array([0x08, 0, 0, 0, 0]);

export function parseBleMtu(r: Uint8Array): number | null {
  return r.length >= 6 && r[0] === 0x08 && r[5] > 5 ? r[5] : null;
}
