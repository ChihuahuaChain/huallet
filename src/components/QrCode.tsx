import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n";
import { screenApi } from "@/lib/native";

function useQrPath(value: string) {
  return useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
    return { n, path: d };
  }, [value]);
}

function QrSvg({ n, path }: { n: number; path: string }) {
  return (
    <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} width="100%" height="100%" shapeRendering="crispEdges">
      <path d={path} fill="#2e2d2d" />
    </svg>
  );
}

/** A QR code; tapping it shows it full screen (at full brightness on the phone). */
export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const t = useT();
  const qr = useQrPath(value);
  const [full, setFull] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setFull(true)}
        className="rounded-2xl border border-line bg-white p-3 transition active:scale-[0.98]"
        style={{ width: size, height: size }}
        aria-label={`${t("qr.enlarge")}: ${value}`}
        title={t("qr.enlarge")}
      >
        <QrSvg {...qr} />
      </button>
      {full && <QrFullScreen qr={qr} value={value} onClose={() => setFull(false)} />}
    </>
  );
}

function QrFullScreen({ qr, value, onClose }: { qr: { n: number; path: string }; value: string; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    const screen = screenApi();
    void screen?.setMaxBrightness(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      void screen?.setMaxBrightness(false);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-white p-6 text-ink"
      style={{ paddingTop: "calc(1.5rem + var(--sat, 0px))", paddingBottom: "calc(1.5rem + var(--sab, 0px))" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("qr.enlarge")}
    >
      <div className="aspect-square w-full max-w-[min(92vw,70vh)]">
        <QrSvg {...qr} />
      </div>
      <div className="max-w-md break-all text-center font-mono text-sm">{value}</div>
      <div className="text-xs text-[#6b6660]">{t("qr.tapToClose")}</div>
    </div>,
    document.body,
  );
}
