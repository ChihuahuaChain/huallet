import { useQueryClient } from "@tanstack/react-query";
import { Fingerprint } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Mascot } from "@/components/Logo";
import { Button, Modal, PasswordInput, Input } from "@/components/ui";
import { useT } from "@/i18n";
import { biometric, BiometricCancelledError } from "@/lib/biometric";
import { WrongPasswordError } from "@/lib/crypto/vault";
import { UnlockThrottledError } from "@/lib/keyring/keyring";
import { keyring } from "@/extension/popup/keyring";

export function Unlock() {
  const t = useT();
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [bioReady, setBioReady] = useState(false);

  const bioUnlock = useCallback(async () => {
    const bio = biometric();
    if (!bio) return;
    setError("");
    let secret: string;
    try {
      secret = await bio.unlock(t("biometric.promptUnlock"));
    } catch (err) {
      if (!(err instanceof BiometricCancelledError)) setError(err instanceof Error ? err.message : String(err));
      setBioReady((await bio.status()).enabled);
      return;
    }
    setBusy(true);
    try {
      await keyring.unlock(secret);
    } catch (err) {
      if (err instanceof WrongPasswordError) {
        await bio.disable();
        setBioReady(false);
        setError(t("biometric.stale"));
      } else if (err instanceof UnlockThrottledError) setError(t("unlock.throttled", { s: Math.ceil(err.retryInMs / 1000) }));
      else setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }, [t]);

  // With biometrics on, ask right away; the password stays one tap away.
  useEffect(() => {
    const bio = biometric();
    if (!bio) {
      inputRef.current?.focus();
      return;
    }
    void bio.status().then((s) => {
      setBioReady(s.enabled && s.available);
      if (s.enabled && s.available) void bioUnlock();
      else inputRef.current?.focus();
    });
  }, [bioUnlock]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      await keyring.unlock(password);
    } catch (err) {
      if (err instanceof WrongPasswordError) setError(t("unlock.wrong"));
      else if (err instanceof UnlockThrottledError) setError(t("unlock.throttled", { s: Math.ceil(err.retryInMs / 1000) }));
      else setError(err instanceof Error ? err.message : String(err));
      setPassword("");
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const resetWord = t("unlock.resetWord");

  return (
    <div className="paw-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <Mascot size={120} className="mx-auto mb-4" />
        <h1 className="text-3xl font-bold">{t("unlock.title")}</h1>
        <p className="mt-1 text-muted">{t("unlock.subtitle")}</p>
        <form onSubmit={submit} className="mt-8 space-y-3 text-left">
          <PasswordInput
            ref={inputRef}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("unlock.password")}
            aria-label={t("unlock.password")}
            invalid={!!error}
          />
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <Button type="submit" size="lg" block loading={busy} disabled={!password}>
            {t("unlock.submit")}
          </Button>
        </form>
        {bioReady && (
          <Button variant="secondary" size="lg" block className="mt-3" icon={<Fingerprint className="size-5" />} onClick={() => void bioUnlock()} disabled={busy}>
            {t("biometric.unlock")}
          </Button>
        )}
        <button onClick={() => setResetOpen(true)} className="mt-6 text-sm text-muted underline-offset-2 hover:text-fg hover:underline">
          {t("unlock.forgot")}
        </button>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title={t("unlock.resetTitle")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setResetOpen(false)}>{t("common.cancel")}</Button>
            <Button
              variant="danger"
              block
              disabled={confirmText.trim().toUpperCase() !== resetWord.toUpperCase()}
              onClick={() => {
                qc.clear();
                void keyring.reset();
              }}
            >
              {t("unlock.resetConfirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>{t("unlock.resetBody")}</p>
          <p className="font-medium">{t("unlock.resetType", { word: resetWord })}</p>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </div>
      </Modal>
    </div>
  );
}
