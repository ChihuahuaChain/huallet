import { Fingerprint } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Modal, PasswordInput } from "@/components/ui";
import { useT } from "@/i18n";
import { biometric, BiometricCancelledError } from "@/lib/biometric";
import { WrongPasswordError } from "@/lib/crypto/vault";

export function PasswordPrompt({
  open,
  onClose,
  onConfirm,
  title,
  body,
  danger,
  confirmLabel,
  allowBiometric,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
  title: string;
  body?: React.ReactNode;
  danger?: boolean;
  confirmLabel?: string;
  /** Offer the fingerprint/face as an alternative to typing the password. */
  allowBiometric?: boolean;
}) {
  return open ? <PasswordPromptInner {...{ onClose, onConfirm, title, body, danger, confirmLabel, allowBiometric }} /> : null;
}

function PasswordPromptInner({ onClose, onConfirm, title, body, danger, confirmLabel, allowBiometric }: Omit<Parameters<typeof PasswordPrompt>[0], "open">) {
  const t = useT();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bio, setBio] = useState(false);
  useEffect(() => {
    if (allowBiometric) void biometric()?.status().then((s) => setBio(s.enabled && s.available));
  }, [allowBiometric]);

  const confirm = async (password: string) => {
    setBusy(true);
    setError("");
    try {
      await onConfirm(password);
    } catch (err) {
      setError(err instanceof WrongPasswordError ? t("unlock.wrong") : err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void confirm(pw);
  };
  const useBiometric = async () => {
    try {
      await confirm(await biometric()!.unlock(title));
    } catch (err) {
      if (!(err instanceof BiometricCancelledError)) setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <form onSubmit={submit} className="space-y-4">
        {body && <div className="text-sm">{body}</div>}
        <PasswordInput autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("unlock.password")} aria-label={t("unlock.password")} invalid={!!error} />
        {error && <p className="text-sm text-danger">{error}</p>}
        {bio && (
          <Button type="button" variant="secondary" block icon={<Fingerprint className="size-4" />} onClick={() => void useBiometric()} disabled={busy}>
            {t("biometric.use")}
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" block onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} block loading={busy} disabled={!pw}>{confirmLabel ?? t("common.confirm")}</Button>
        </div>
      </form>
    </Modal>
  );
}
