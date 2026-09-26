import { Download, Sparkles, Usb } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui";
import { useT } from "@/i18n";
import type { NewKey } from "@/lib/keyring/keyring";
import { LedgerConnect } from "./LedgerConnect";
import { ImportSecret, NameAndPassword, ShowMnemonic, VerifyMnemonic } from "./parts";

type Step = "choose" | "show" | "verify" | "import" | "ledger" | "finish";

export function KeyFlow({
  withPassword,
  defaultName,
  onComplete,
  onCancel,
}: {
  withPassword: boolean;
  defaultName: string;
  onComplete: (key: NewKey, password: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useT();
  const [step, setStep] = useState<Step>("choose");
  const [pending, setPending] = useState<Omit<NewKey, "name"> | null>(null);
  const [mnemonic, setMnemonic] = useState("");

  if (step === "choose") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => setStep("show")} className="group text-left">
          <Card className="h-full p-5 transition-colors group-hover:border-rust">
            <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-huahua-300 text-ink">
              <Sparkles className="size-5" />
            </div>
            <div className="font-display text-lg font-semibold">{t("onboarding.choose.create")}</div>
            <p className="mt-1 text-sm text-muted">{t("onboarding.choose.createBody")}</p>
          </Card>
        </button>
        <button onClick={() => setStep("import")} className="group text-left">
          <Card className="h-full p-5 transition-colors group-hover:border-rust">
            <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-coral/80 text-ink">
              <Download className="size-5" />
            </div>
            <div className="font-display text-lg font-semibold">{t("onboarding.choose.import")}</div>
            <p className="mt-1 text-sm text-muted">{t("onboarding.choose.importBody")}</p>
          </Card>
        </button>
        <button onClick={() => setStep("ledger")} className="group text-left sm:col-span-2">
          <Card className="flex h-full items-center gap-4 p-5 transition-colors group-hover:border-rust">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink text-huahua-50 dark:bg-huahua-50 dark:text-ink">
              <Usb className="size-5" />
            </div>
            <div>
              <div className="font-display text-lg font-semibold">{t("ledger.choose")}</div>
              <p className="mt-0.5 text-sm text-muted">{t("ledger.chooseBody")}</p>
            </div>
          </Card>
        </button>
        {onCancel && (
          <button onClick={onCancel} className="text-sm text-muted hover:text-fg sm:col-span-2">
            {t("common.cancel")}
          </button>
        )}
      </div>
    );
  }

  return (
    <Card className="p-5 sm:p-7">
      {step === "show" && (
        <ShowMnemonic
          onBack={() => setStep("choose")}
          onNext={(m) => {
            setMnemonic(m);
            setStep("verify");
          }}
        />
      )}
      {step === "verify" && (
        <VerifyMnemonic
          mnemonic={mnemonic}
          onBack={() => setStep("show")}
          onVerified={() => {
            setPending({ type: "mnemonic", secret: mnemonic, backedUp: true });
            setStep("finish");
          }}
          onSkip={() => {
            setPending({ type: "mnemonic", secret: mnemonic, backedUp: false });
            setStep("finish");
          }}
        />
      )}
      {step === "import" && (
        <ImportSecret
          onBack={() => setStep("choose")}
          onNext={(k) => {
            setPending(k);
            setStep("finish");
          }}
        />
      )}
      {step === "ledger" && (
        <LedgerConnect
          onBack={() => setStep("choose")}
          onNext={(k) => {
            setPending(k);
            setStep("finish");
          }}
        />
      )}
      {step === "finish" && pending && (
        <NameAndPassword
          withPassword={withPassword}
          defaultName={defaultName}
          submitLabel={withPassword ? t("onboarding.password.submit") : t("accounts.add")}
          onBack={() => setStep(pending.type === "ledger" ? "ledger" : pending.type === "mnemonic" && mnemonic ? "verify" : "import")}
          onSubmit={(name, password) => onComplete({ ...pending, name }, password)}
        />
      )}
    </Card>
  );
}
