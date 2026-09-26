import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Monogram, Select, Toggle } from "@/components/ui";
import { useWallet } from "@/state/wallet";
import { useT } from "@/i18n";
import { useSettings, type Fiat, type Theme } from "@/state/settings";

export function GeneralSettings() {
  const t = useT();
  const s = useSettings();
  const qc = useQueryClient();
  const { backend, name, isLedger, disconnect } = useWallet();
  return (
    <>
    {backend && !backend.id.startsWith("local") && (
    <Card>
      <CardHeader title={t("wallet.title")} subtitle={t("wallet.subtitle")} />
      <div className="flex flex-wrap items-center gap-3 p-5">
        <Monogram text={name || "?"} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{name}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            {t("wallet.via", { wallet: backend?.label ?? "" })}
            {isLedger && <Badge>Ledger</Badge>}
          </div>
        </div>
        <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={() => { disconnect(); qc.clear(); }}>
          {t("wallet.disconnect")}
        </Button>
      </div>
    </Card>
    )}
    <Card>
      <CardHeader title={t("settings.general")} />
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settings.fiat")}>
            <Select value={s.fiat} onChange={(e) => s.set({ fiat: e.target.value as Fiat })}>
              <option value="usd">USD</option>
              <option value="eur">EUR</option>
              <option value="chf">CHF</option>
              <option value="gbp">GBP</option>
            </Select>
          </Field>
          <Field label={t("settings.theme")}>
            <Select value={s.theme} onChange={(e) => s.set({ theme: e.target.value as Theme })}>
              <option value="system">{t("settings.theme.system")}</option>
              <option value="light">{t("settings.theme.light")}</option>
              <option value="dark">{t("settings.theme.dark")}</option>
            </Select>
          </Field>
        </div>
        <div className="divide-y divide-line">
          <div className="py-3"><Toggle checked={s.showPrices} onChange={(v) => s.set({ showPrices: v })} label={t("settings.prices")} description={t("settings.pricesBody")} /></div>
          <div className="py-3"><Toggle checked={s.hideSmallBalances} onChange={(v) => s.set({ hideSmallBalances: v })} label={t("dashboard.hideSmall")} /></div>
          <div className="py-3"><Toggle checked={s.hideBalances} onChange={(v) => s.set({ hideBalances: v })} label={t("settings.privacy")} description={t("settings.privacyBody")} /></div>
        </div>
      </div>
    </Card>
    </>
  );
}
