import { KeyRound, QrCode as QrIcon, ShieldCheck, Usb } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { QrScanModal } from "@/components/QrScanner";
import { Alert, Badge, Button, Field, Input, cx } from "@/components/ui";
import { useT } from "@/i18n";
import type { NewKey } from "@/lib/keyring/keyring";
import {
  formatTransferCode,
  FrameCollector,
  InvalidTransferError,
  isValidTransferCode,
  open,
  toNewKeys,
  WrongTransferCodeError,
  type TransferKey,
} from "@/lib/sync/transfer";

/** Per-frame progress: one segment per QR frame, lit as it arrives. */
function TransferProgress({ collector, tick }: { collector: FrameCollector; tick: number }) {
  const t = useT();
  const total = collector.expected;
  void tick;
  if (!total) return <p className="text-center text-sm font-medium text-muted">{t("transfer.import.waiting")}</p>;
  return (
    <div className="space-y-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={collector.received}>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={cx("h-2 flex-1 rounded-full transition-colors", collector.has(i + 1) ? "bg-rust" : "bg-surface-2")} />
        ))}
      </div>
      <p className="text-center text-sm font-semibold tabular">{t("transfer.import.progress", { received: collector.received, total })}</p>
    </div>
  );
}

/**
 * Receives accounts from another Huallet: scan the animated QR, type the
 * transfer code, review, then hand the accounts to `onKeys`.
 */
export function ImportTransfer({ onKeys, onBack, confirmLabel }: { onKeys: (keys: NewKey[]) => Promise<void>; onBack: () => void; confirmLabel?: (n: number) => string }) {
  const t = useT();
  const collector = useRef(new FrameCollector());
  const [tick, setTick] = useState(0);
  const [scanning, setScanning] = useState(true);
  const [envelope, setEnvelope] = useState<Uint8Array | null>(null);
  const [code, setCode] = useState("");
  const [keys, setKeys] = useState<TransferKey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const restart = () => {
    collector.current = new FrameCollector();
    setTick((x) => x + 1);
    setEnvelope(null);
    setKeys(null);
    setCode("");
    setError("");
    setScanning(true);
  };

  const onFrame = (text: string): boolean => {
    const c = collector.current;
    const r = c.add(text);
    if (r === "new") {
      navigator.vibrate?.(15);
      setTick((x) => x + 1);
    }
    if (!c.complete) return false;
    try {
      setEnvelope(c.envelope());
      setScanning(false);
      return true;
    } catch {
      collector.current = new FrameCollector();
      setTick((x) => x + 1);
      return false;
    }
  };

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!envelope || !isValidTransferCode(code)) return;
    setBusy(true);
    setError("");
    try {
      setKeys(await open(envelope, code));
    } catch (err) {
      setError(
        err instanceof WrongTransferCodeError
          ? t("transfer.import.wrongCode")
          : err instanceof InvalidTransferError
            ? err.message
            : String(err instanceof Error ? err.message : err),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!keys) return;
    setBusy(true);
    setError("");
    try {
      await onKeys(toNewKeys(keys));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  if (keys) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-huahua-300 text-ink">
            <ShieldCheck className="size-5" />
          </div>
          <h2 className="text-xl font-semibold">{t("transfer.import.previewTitle", { n: keys.length })}</h2>
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {keys.map((k, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2.5">
              {k.type === "ledger" ? <Usb className="size-4 shrink-0 text-muted" /> : <KeyRound className="size-4 shrink-0 text-muted" />}
              <span className="min-w-0 flex-1 truncate font-semibold">{k.name}</span>
              <Badge>{t(k.type === "mnemonic" ? "accounts.type.mnemonic" : k.type === "ledger" ? "accounts.type.ledger" : "accounts.type.privateKey")}</Badge>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{t("transfer.import.previewNote")}</p>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={restart} disabled={busy}>
            {t("transfer.import.rescan")}
          </Button>
          <Button block loading={busy} onClick={confirm}>
            {confirmLabel ? confirmLabel(keys.length) : t("transfer.import.confirm", { n: keys.length })}
          </Button>
        </div>
      </div>
    );
  }

  if (envelope) {
    return (
      <form onSubmit={unlock} className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold">{t("transfer.import.codeTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("transfer.import.codeBody")}</p>
        </div>
        <Field label={t("transfer.import.codeLabel")} error={error || undefined}>
          <Input
            value={code}
            onChange={(e) => setCode(formatTransferCode(e.target.value).slice(0, 14))}
            placeholder="XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-lg tracking-widest"
            invalid={!!error}
            autoFocus
          />
        </Field>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={restart} disabled={busy}>
            {t("transfer.import.rescan")}
          </Button>
          <Button block type="submit" loading={busy} disabled={!isValidTransferCode(code)}>
            {t("transfer.import.decrypt")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-huahua-300 text-ink">
          <QrIcon className="size-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{t("transfer.import.choose")}</h2>
          <p className="text-sm text-muted">{t("transfer.import.howTo")}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button block onClick={() => setScanning(true)}>
          {t("transfer.import.scan")}
        </Button>
      </div>
      {scanning && (
        <QrScanModal
          title={t("transfer.import.scanTitle")}
          hint={t("transfer.import.scanHint")}
          status={<TransferProgress collector={collector.current} tick={tick} />}
          onResult={onFrame}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}
