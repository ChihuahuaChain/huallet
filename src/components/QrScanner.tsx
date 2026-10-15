import { CameraOff } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Modal, Spinner } from "@/components/ui";
import { useT } from "@/i18n";
import { decodeQr } from "@/lib/qr";

/** A 1x1 transparent GIF. */
const BLANK_POSTER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Camera QR scanner, all in the page: getUserMedia + jsQR, no Google Play
 * Services. Frames are downscaled to at most 640px before decoding.
 */
export function QrScanModal({
  onResult,
  onClose,
  title,
  hint,
  status,
}: {
  /** Return `false` to keep scanning (multi-frame codes); anything else ends the scan. */
  onResult: (text: string) => void | boolean;
  onClose: () => void;
  title?: string;
  hint?: string;
  /** Shown under the camera, e.g. progress of a multi-frame scan. */
  status?: ReactNode;
}) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  // The camera starts once per open; a new callback must not restart it.
  const result = useRef(onResult);
  result.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const tick = () => {
      const v = video.current;
      if (done || !v) return;
      if (v.readyState >= v.HAVE_ENOUGH_DATA && v.videoWidth) {
        const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const text = decodeQr(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (text && result.current(text) !== false) {
          done = true;
          navigator.vibrate?.(60);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (done) return s.getTracks().forEach((tr) => tr.stop());
        stream = s;
        const v = video.current!;
        v.srcObject = s;
        void v.play();
        raf = requestAnimationFrame(tick);
      })
      .catch((e: Error) => setError(e.name === "NotAllowedError" ? t("scan.denied") : t("scan.noCamera")));
    if (!navigator.mediaDevices) setError(t("scan.noCamera"));

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [t]);

  return (
    <Modal open onClose={onClose} title={title ?? t("scan.title")} size="sm">
      {error ? (
        <div className="space-y-4">
          <Alert tone="warning" icon={<CameraOff className="size-4 text-warning" />}>{error}</Alert>
          <Button variant="secondary" block onClick={onClose}>{t("common.close")}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-ink">
            {/* The transparent poster hides Android WebView's grey play-button placeholder;
                the video stays invisible until the camera actually delivers frames. */}
            <video
              ref={video}
              playsInline
              muted
              poster={BLANK_POSTER}
              onPlaying={() => setLive(true)}
              className={`size-full object-cover transition-opacity duration-200 ${live ? "opacity-100" : "opacity-0"}`}
            />
            {!live && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner />
              </div>
            )}
            <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-4 border-huahua-300/90 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
          </div>
          {status}
          <p className="text-center text-sm text-muted">{hint ?? t("scan.hint")}</p>
          <Button variant="secondary" block onClick={onClose}>{t("common.cancel")}</Button>
        </div>
      )}
    </Modal>
  );
}
