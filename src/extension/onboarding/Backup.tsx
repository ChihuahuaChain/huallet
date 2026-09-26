import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { toast } from "@/components/Toaster";
import { Button, Card } from "@/components/ui";
import { useT } from "@/i18n";
import { keyring } from "@/extension/popup/keyring";
import { useKeyring as useWallet } from "@/extension/state/keyringStore";
import { MnemonicGrid, VerifyMnemonic } from "./parts";

export function Backup() {
  const t = useT();
  const navigate = useNavigate();
  const { keyId = "" } = useParams();
  const key = useWallet((s) => s.keys.find((k) => k.id === keyId));
  const [step, setStep] = useState<"show" | "verify">("show");
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  useEffect(() => {
    keyring.pendingBackupSecret(keyId).then(setMnemonic, () => setMnemonic(""));
  }, [keyId]);
  if (mnemonic === null) return null;
  if (!key || key.backedUp || !mnemonic) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Logo size={36} className="mb-8" />
      <Card className="p-5 sm:p-7">
        {step === "show" ? (
          <div className="space-y-5">
            <h1 className="text-xl font-semibold">{t("backup.title", { name: key.name })}</h1>
            <p className="text-sm text-muted">{t("onboarding.create.warnBody")}</p>
            <MnemonicGrid words={mnemonic.split(" ")} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate(-1)}>{t("common.cancel")}</Button>
              <Button block onClick={() => setStep("verify")}>{t("common.continue")}</Button>
            </div>
          </div>
        ) : (
          <VerifyMnemonic
            mnemonic={mnemonic}
            onBack={() => setStep("show")}
            onVerified={async () => {
              await keyring.markBackedUp(key.id);
              toast.success(t("backup.done"));
              navigate("/");
            }}
          />
        )}
      </Card>
    </div>
  );
}
