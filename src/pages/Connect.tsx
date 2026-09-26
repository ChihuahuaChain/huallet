import { ArrowUpRight, KeyRound, Loader2, ShieldCheck, Usb, Wallet, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo, Mascot } from "@/components/Logo";
import { Alert, Card, cx } from "@/components/ui";
import { useT } from "@/i18n";
import { isInstalled, WALLETS, WalletNotInstalledError, type WalletKind } from "@/lib/wallet/extension";
import { useEnabledChains, useSelectedChain } from "@/state/chains";
import { connectWallet } from "@/lib/wallet/connect";
import { useWallet } from "@/state/wallet";

const ORDER: WalletKind[] = ["huallet", "keplr", "leap"];

const BADGE: Record<WalletKind, string> = {
  huallet: "bg-huahua-300 text-ink",
  keplr: "bg-[#2E5BFF] text-white",
  leap: "bg-[#32DA6D] text-ink",
};

export function Connect() {
  const t = useT();
  const chains = useEnabledChains();
  const primary = useSelectedChain();
  const { status, error } = useWallet();
  const [pending, setPending] = useState<WalletKind | null>(null);
  const [installed, setInstalled] = useState<Record<WalletKind, boolean>>({ huallet: false, keplr: false, leap: false });
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    const check = () => setInstalled({ huallet: isInstalled("huallet"), keplr: isInstalled("keplr"), leap: isInstalled("leap") });
    check();
    const timers = [300, 1000, 2500].map((ms) => setTimeout(check, ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  const onConnect = async (kind: WalletKind) => {
    setPending(kind);
    setLocalError("");
    try {
      await connectWallet(kind, chains, primary);
    } catch (e) {
      setLocalError(e instanceof WalletNotInstalledError ? t("connect.notInstalled", { wallet: WALLETS[kind].name }) : t("connect.failed"));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1fr_1.1fr]">
      <section className="paw-bg relative hidden flex-col justify-between bg-huahua-300 p-10 text-ink lg:flex">
        <Logo size={44} />
        <div className="max-w-md">
          <Mascot size={132} className="mb-6 drop-shadow-[0_6px_0_rgba(55,54,54,0.15)]" />
          <h1 className="text-5xl font-bold leading-tight">{t("connect.hero.title")}</h1>
          <p className="mt-4 text-lg text-ink/80">{t("connect.hero.body")}</p>
          <ul className="mt-8 space-y-3 text-sm font-medium">
            <li className="flex items-center gap-3"><KeyRound className="size-5" /> {t("connect.hero.p1")}</li>
            <li className="flex items-center gap-3"><ShieldCheck className="size-5" /> {t("connect.hero.p2")}</li>
            <li className="flex items-center gap-3"><Zap className="size-5" /> {t("connect.hero.p3")}</li>
          </ul>
        </div>
        <p className="text-xs text-ink/60">{t("connect.hero.footer")}</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo size={40} />
          </div>
          <h2 className="mb-1 text-3xl font-bold">{t("connect.title")}</h2>
          <p className="mb-6 text-muted">{t("connect.subtitle")}</p>

          <div className="space-y-3">
            {ORDER.map((kind) => {
              const w = WALLETS[kind];
              const busy = pending === kind || (status === "connecting" && pending === null);
              return installed[kind] ? (
                <button key={kind} onClick={() => onConnect(kind)} disabled={!!pending} className="group block w-full text-left disabled:opacity-70">
                  <Card className="flex items-center gap-4 p-4 transition-colors group-hover:border-rust">
                    <div className={cx("flex size-11 items-center justify-center rounded-xl", BADGE[kind])}>
                      {kind === "huallet" ? <Mascot size={32} /> : <Wallet className="size-5" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-display text-lg font-semibold">{w.name}</div>
                      <div className="text-xs text-success">{t("connect.detected")}</div>
                    </div>
                    {busy && pending === kind ? <Loader2 className="size-5 animate-spin text-muted" /> : <span className="text-sm font-semibold text-rust">{t("connect.cta")}</span>}
                  </Card>
                </button>
              ) : (
                <a
                  key={kind}
                  href={w.installUrl || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cx("group block", !w.installUrl && "pointer-events-none")}
                  aria-disabled={!w.installUrl}
                >
                  <Card className="flex items-center gap-4 p-4 opacity-80 transition-colors group-hover:border-rust group-hover:opacity-100">
                    <div className={cx("flex size-11 items-center justify-center rounded-xl opacity-60", BADGE[kind])}>
                      {kind === "huallet" ? <Mascot size={32} /> : <Wallet className="size-5" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-display text-lg font-semibold">{w.name}</div>
                      <div className="text-xs text-muted">{t("connect.notDetected")}</div>
                    </div>
                    <span className="flex items-center gap-1 text-sm font-medium text-muted">
                      {w.installUrl ? (
                        <>
                          {t("connect.install")} <ArrowUpRight className="size-4" />
                        </>
                      ) : (
                        t("connect.soon")
                      )}
                    </span>
                  </Card>
                </a>
              );
            })}
          </div>

          {(localError || (error && !pending)) && (
            <div className="mt-4">
              <Alert tone="danger">{localError || t("connect.failed")}</Alert>
            </div>
          )}

          <div className="mt-6 space-y-3">
            <Alert tone="info" icon={<ShieldCheck className="size-4 text-success" />} title={t("connect.noKeysTitle")}>
              {t("connect.noKeysBody")}
            </Alert>
            <Alert tone="info" icon={<Usb className="size-4 text-muted" />}>
              {t("connect.ledger")}
            </Alert>
          </div>
        </div>
      </section>
    </div>
  );
}
