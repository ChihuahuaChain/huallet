import QRCode from "qrcode";
import { useMemo } from "react";

export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const { n, path } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
    return { n, path: d };
  }, [value]);
  return (
    <div className="rounded-2xl border border-line bg-white p-3" style={{ width: size, height: size }} role="img" aria-label={value}>
      <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} width="100%" height="100%" shapeRendering="crispEdges">
        <path d={path} fill="#2e2d2d" />
      </svg>
    </div>
  );
}
