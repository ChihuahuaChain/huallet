import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { decodeQr } from "./qr";

// Renders a QR the way a camera frame would arrive: RGBA, quiet zone, scaled up.
function frame(text: string, scale = 6, dark = [46, 45, 45], light = [255, 255, 255]) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size + 8;
  const w = n * scale;
  const px = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const mx = Math.floor(x / scale) - 4, my = Math.floor(y / scale) - 4;
      const on = mx >= 0 && my >= 0 && mx < qr.modules.size && my < qr.modules.size && qr.modules.get(mx, my);
      const c = on ? dark : light;
      px.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
  return { px, w };
}

describe("decodeQr", () => {
  it("reads the payment request QR codes Huallet shows", () => {
    const uri = "cosmos:chihuahua19rl4cm2hmr8afy4kldpxz3fka4jguq0al4qn7h?amount=12.5&denom=uhuahua&chain_id=chihuahua-1";
    const { px, w } = frame(uri);
    expect(decodeQr(px, w, w)).toBe(uri);
  });

  it("reads inverted codes and returns null on noise", () => {
    const { px, w } = frame("chihuahua19rl4cm2hmr8afy4kldpxz3fka4jguq0al4qn7h", 5, [255, 255, 255], [20, 20, 20]);
    expect(decodeQr(px, w, w)).toBe("chihuahua19rl4cm2hmr8afy4kldpxz3fka4jguq0al4qn7h");
    const noise = new Uint8ClampedArray(200 * 200 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 2654435761) % 256));
    expect(decodeQr(noise, 200, 200)).toBeNull();
  });
});
