import { CheckCircle2, Fingerprint } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { StrengthMeter } from "@/extension/onboarding/parts";
import { toast } from "@/components/Toaster";
import { Alert, Button, Card, CardHeader, Field, PasswordInput } from "@/components/ui";
import { useT } from "@/i18n";
import { biometric, BiometricCancelledError, type BiometricStatus } from "@/lib/biometric";
import { WrongPasswordError } from "@/lib/crypto/vault";
import { keyring } from "@/extension/popup/keyring";
import { PasswordPrompt } from "@/extension/PasswordPrompt";

export function ChangePasswordForm() {
  const t = useT();
  const [oldPw, setOldPw] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const change = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const hadBio = (await biometric()?.status())?.enabled;
      await keyring.changePassword(oldPw, pw);
      setOldPw(""); setPw(""); setPw2("");
      toast.success(t("security.changed"));
      if (hadBio) toast.info(t("biometric.offAfterPassword"));
    } catch (err) {
      setError(err instanceof WrongPasswordError ? t("unlock.wrong") : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t("security.changePassword")} />
      <form onSubmit={change} className="space-y-4 p-5">
        <Field label={t("security.currentPassword")}><PasswordInput value={oldPw} onChange={(e) => setOldPw(e.target.value)} /></Field>
        <Field label={t("onboarding.password.label")}><PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <StrengthMeter password={pw} />
        <Field label={t("onboarding.password.confirm")} error={pw2 && pw !== pw2 ? t("onboarding.password.mismatch") : undefined}>
          <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={busy} disabled={!oldPw || pw.length < 8 || pw !== pw2}>{t("security.changePassword")}</Button>
      </form>
    </Card>
  );
}

/** Self-hiding: renders nothing where the platform has no biometric sensor
 * (e.g. the desktop browser extension), shows the enable/disable control on the
 * mobile app which shares this UI. */
export function BiometricCard() {
  const t = useT();
  const bio = biometric();
  const [status, setStatus] = useState<BiometricStatus | null>(null);
  const [asking, setAsking] = useState(false);
  const refresh = () => bio?.status().then(setStatus);
  useEffect(() => void refresh(), []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!bio || !status) return null;

  return (
    <Card>
      <CardHeader title={t("biometric.title")} subtitle={t("biometric.body")} />
      <div className="space-y-3 p-5">
        {!status.available ? (
          <Alert tone="warning" icon={<Fingerprint className="size-4 text-warning" />}>
            {t(status.reason === "none-enrolled" ? "biometric.noneEnrolled" : "biometric.unavailable")}
          </Alert>
        ) : status.enabled ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" /> {t("biometric.on")}
            </span>
            <Button
              variant="secondary"
              onClick={async () => {
                await bio.disable();
                toast.success(t("biometric.disabled"));
                await refresh();
              }}
            >
              {t("biometric.disable")}
            </Button>
          </div>
        ) : (
          <Button icon={<Fingerprint className="size-4" />} onClick={() => setAsking(true)}>
            {t("biometric.enable")}
          </Button>
        )}
      </div>
      <PasswordPrompt
        open={asking}
        onClose={() => setAsking(false)}
        title={t("biometric.title")}
        body={t("biometric.enablePrompt")}
        confirmLabel={t("biometric.enable")}
        onConfirm={async (password) => {
          if (!(await keyring.verifyPassword(password))) throw new WrongPasswordError();
          try {
            await bio.enable(password, t("biometric.promptEnable"));
          } catch (e) {
            if (e instanceof BiometricCancelledError) {
              setAsking(false);
              return;
            }
            throw e;
          }
          setAsking(false);
          toast.success(t("biometric.enabled"));
          await refresh();
        }}
      />
    </Card>
  );
}
