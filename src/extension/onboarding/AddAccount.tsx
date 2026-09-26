import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { toast } from "@/components/Toaster";
import { useT } from "@/i18n";
import { keyring } from "@/extension/popup/keyring";
import { useKeyring as useWallet } from "@/extension/state/keyringStore";
import { KeyFlow } from "./KeyFlow";

export function AddAccount() {
  const t = useT();
  const navigate = useNavigate();
  const count = useWallet((s) => s.keys.length);
  const selectKey = useWallet((s) => s.selectKey);
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Logo size={36} className="mb-8" />
      <h1 className="mb-6 text-3xl font-bold">{t("accounts.add")}</h1>
      <KeyFlow
        withPassword={false}
        defaultName={t("accounts.defaultName", { n: count + 1 })}
        onCancel={() => navigate(-1)}
        onComplete={async (key) => {
          const meta = await keyring.addKey(key);
          await selectKey(meta.id);
          toast.success(t("accounts.added"), meta.name);
          navigate("/");
        }}
      />
    </div>
  );
}
