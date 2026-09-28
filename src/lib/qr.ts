import jsQR from "jsqr";

/** Decodes a QR code from RGBA pixels, or returns null. */
export function decodeQr(data: Uint8ClampedArray, width: number, height: number): string | null {
  return jsQR(data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}
