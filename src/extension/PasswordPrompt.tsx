import { useState, type FormEvent } from "react";
import { Button, Modal, PasswordInput } from "@/components/ui";
import { useT } from "@/i18n";
import { WrongPasswordError } from "@/lib/crypto/vault";

export function PasswordPrompt({
  open,
  onClose,
  onConfirm,
  title,
  body,
  danger,
  confirmLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
  title: string;
  body?: React.ReactNode;
  danger?: boolean;
  confirmLabel?: string;
}) {
  return open ? <PasswordPromptInner {...{ onClose, onConfirm, title, body, danger, confirmLabel }} /> : null;
}

function PasswordPromptInner({ onClose, onConfirm, title, body, danger, confirmLabel }: Omit<Parameters<typeof PasswordPrompt>[0], "open">) {
  const t = useT();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onConfirm(pw);
    } catch (err) {
      setError(err instanceof WrongPasswordError ? t("unlock.wrong") : err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <form onSubmit={submit} className="space-y-4">
        {body && <div className="text-sm">{body}</div>}
        <PasswordInput autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("unlock.password")} aria-label={t("unlock.password")} invalid={!!error} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" block onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} block loading={busy} disabled={!pw}>{confirmLabel ?? t("common.confirm")}</Button>
        </div>
      </form>
    </Modal>
  );
}
