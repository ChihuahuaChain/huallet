import { Lock, ShieldCheck, Zap } from "lucide-react";
import { Mascot, Logo } from "@/components/Logo";
import { useT } from "@/i18n";
import { keyring } from "@/extension/popup/keyring";
import { KeyFlow } from "./KeyFlow";

export function Onboarding() {
  const t = useT();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1fr_1.1fr]">
      <section className="paw-bg relative hidden flex-col justify-between bg-huahua-300 p-10 text-ink lg:flex">
        <Logo size={44} />
        <div className="max-w-md">
          <Mascot size={120} className="mb-6 drop-shadow-[0_6px_0_rgba(55,54,54,0.15)]" />
          <h1 className="text-5xl font-bold leading-tight">{t("onboarding.hero.title")}</h1>
          <p className="mt-4 text-lg text-ink/80">{t("onboarding.hero.body")}</p>
          <ul className="mt-8 space-y-3 text-sm font-medium">
            <li className="flex items-center gap-3"><Lock className="size-5" /> {t("onboarding.hero.p1")}</li>
            <li className="flex items-center gap-3"><ShieldCheck className="size-5" /> {t("onboarding.hero.p2")}</li>
            <li className="flex items-center gap-3"><Zap className="size-5" /> {t("onboarding.hero.p3")}</li>
          </ul>
        </div>
        <p className="text-xs text-ink/60">{t("onboarding.hero.footer")}</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-xl">
          <div className="mb-8 lg:hidden">
            <Logo size={40} />
          </div>
          <h2 className="mb-1 text-3xl font-bold">{t("onboarding.welcome")}</h2>
          <p className="mb-6 text-muted">{t("onboarding.welcomeBody")}</p>
          <KeyFlow withPassword defaultName={t("accounts.defaultName", { n: 1 })} onComplete={async (key, password) => void (await keyring.create(password, key))} />
        </div>
      </section>
    </div>
  );
}
