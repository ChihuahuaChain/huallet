import { useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  BookUser,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code,
  Coins,
  EyeOff,
  Filter,
  Globe,
  Info,
  KeyRound,
  Languages,
  Megaphone,
  Network,
  Palette,
  PanelRight,
  ShieldQuestion,
  Tag,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AddressAvatar } from "@/components/AddressAvatar";
import { PageHeader } from "@/components/layout/AppShell";
import { Card, CardHeader, Select, Switch, cx } from "@/components/ui";
import { LANGUAGES, useT, type MessageKey } from "@/i18n";
import { extApi } from "@/lib/kv";
import { WrongPasswordError } from "@/lib/crypto/vault";
import { useSettings, type Fiat, type Theme } from "@/state/settings";
import { version } from "../../../package.json";
import { keyring } from "../popup/keyring";
import { isMobileView } from "../popup/view";
import { PasswordPrompt } from "../PasswordPrompt";
import { useSelectedKey } from "../state/keyringStore";
import { BiometricCard } from "./Security";

const sidePanelSupported = typeof (extApi() as unknown as { sidePanel?: unknown })?.sidePanel !== "undefined";

const compactSelect = { height: "2.25rem", width: "auto" } as const;

function openUrl(url: string) {
  extApi()?.tabs.create({ url });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>
    </section>
  );
}

function Row({ icon, label, to, onClick, value, control, danger }: {
  icon: ReactNode;
  label: string;
  to?: string;
  onClick?: () => void;
  value?: string;
  control?: ReactNode;
  danger?: boolean;
}) {
  const body = (
    <>
      <span className={cx("grid size-8 shrink-0 place-items-center rounded-lg", danger ? "bg-danger/10 text-danger" : "bg-surface-2 text-muted")}>{icon}</span>
      <span className={cx("min-w-0 flex-1 truncate text-sm font-medium", danger && "text-danger")}>{label}</span>
      {value && <span className="shrink-0 text-sm text-muted">{value}</span>}
      {control}
      {(to || onClick) && <ChevronRight className="size-4 shrink-0 text-muted" />}
    </>
  );
  const base = "flex items-center gap-3 px-4 py-3 text-left";
  if (to) return <Link to={to} className={cx(base, "hover:bg-surface-2")}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cx(base, "w-full hover:bg-surface-2")}>{body}</button>;
  return <div className={base}>{body}</div>;
}

export function SettingsSubPage({ titleKey, children }: { titleKey: MessageKey; children: ReactNode }) {
  const t = useT();
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link to="/settings" aria-label={t("common.back")} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold">{t(titleKey)}</h1>
      </div>
      {children}
    </div>
  );
}

export function SettingsHome() {
  const t = useT();
  const s = useSettings();
  const qc = useQueryClient();
  const key = useSelectedKey();
  const [resetOpen, setResetOpen] = useState(false);

  const icon = "size-4";
  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.settings")} />

      {key && (
        <Link to="/settings/accounts" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2">
          <AddressAvatar seed={key.name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{key.name}</div>
            <div className="text-xs text-muted">{t("accounts.manage")}</div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted" />
        </Link>
      )}

      <Section title={t("settings.sectionChains")}>
        <Row icon={<Network className={icon} />} label={t("nav.chains")} to="/chains" />
        <Row icon={<Coins className={icon} />} label={t("settings.tokens")} to="/settings/tokens" />
        <Row icon={<BookUser className={icon} />} label={t("settings.addressBook")} to="/settings/address-book" />
      </Section>

      <Section title={t("settings.general")}>
        <Row
          icon={<Languages className={icon} />}
          label={t("settings.language")}
          control={
            <Select style={compactSelect} value={s.language} onChange={(e) => s.set({ language: e.target.value })}>
              <option value="auto">{t("settings.languageAuto")}</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </Select>
          }
        />
        <Row
          icon={<Banknote className={icon} />}
          label={t("settings.fiat")}
          control={
            <Select style={compactSelect} value={s.fiat} onChange={(e) => s.set({ fiat: e.target.value as Fiat })}>
              <option value="usd">USD</option>
              <option value="eur">EUR</option>
              <option value="chf">CHF</option>
              <option value="gbp">GBP</option>
            </Select>
          }
        />
        <Row
          icon={<Palette className={icon} />}
          label={t("settings.theme")}
          control={
            <Select style={compactSelect} value={s.theme} onChange={(e) => s.set({ theme: e.target.value as Theme })}>
              <option value="system">{t("settings.theme.system")}</option>
              <option value="light">{t("settings.theme.light")}</option>
              <option value="dark">{t("settings.theme.dark")}</option>
            </Select>
          }
        />
        {sidePanelSupported && (
          <Row icon={<PanelRight className={icon} />} label={t("settings.sidePanel")} control={<Switch checked={s.sidePanel} onChange={(v) => s.set({ sidePanel: v })} aria-label={t("settings.sidePanel")} />} />
        )}
        <Row icon={<Tag className={icon} />} label={t("settings.prices")} control={<Switch checked={s.showPrices} onChange={(v) => s.set({ showPrices: v })} aria-label={t("settings.prices")} />} />
        <Row icon={<Filter className={icon} />} label={t("dashboard.hideSmall", { currency: s.fiat.toUpperCase() })} control={<Switch checked={s.hideSmallBalances} onChange={(v) => s.set({ hideSmallBalances: v })} aria-label={t("dashboard.hideSmall", { currency: s.fiat.toUpperCase() })} />} />
        <Row icon={<ShieldQuestion className={icon} />} label={t("settings.hideUnverified")} control={<Switch checked={s.hideUnverified} onChange={(v) => s.set({ hideUnverified: v })} aria-label={t("settings.hideUnverified")} />} />
        <Row icon={<EyeOff className={icon} />} label={t("settings.privacy")} control={<Switch checked={s.hideBalances} onChange={(v) => s.set({ hideBalances: v })} aria-label={t("settings.privacy")} />} />
        {!isMobileView() && (
          <Row icon={<Megaphone className={icon} />} label={t("settings.promotions")} control={<Switch checked={s.showPromotions} onChange={s.setShowPromotions} aria-label={t("settings.promotions")} />} />
        )}
      </Section>

      <BiometricCard />

      <Section title={t("settings.sectionSecurity")}>
        <Row icon={<KeyRound className={icon} />} label={t("security.changePassword")} to="/settings/password" />
        <Row
          icon={<Clock className={icon} />}
          label={t("security.autoLock")}
          control={
            <Select style={compactSelect} value={s.autoLockMinutes} onChange={(e) => s.set({ autoLockMinutes: Number(e.target.value) })}>
              {[1, 5, 15, 30, 60].map((m) => <option key={m} value={m}>{t("security.minutes", { n: m })}</option>)}
            </Select>
          }
        />
        <Row icon={<Globe className={icon} />} label={t("ext.sites.title")} to="/settings/sites" />
      </Section>

      <Section title={t("settings.sectionMore")}>
        <Row icon={<Info className={icon} />} label={t("settings.about")} to="/settings/about" />
        <Row icon={<Trash2 className={icon} />} label={t("security.resetTitle")} onClick={() => setResetOpen(true)} danger />
      </Section>

      <p className="pb-2 text-center text-xs text-muted">v{version}</p>

      <PasswordPrompt
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title={t("security.resetTitle")}
        body={t("security.resetWarn")}
        danger
        confirmLabel={t("unlock.resetConfirm")}
        onConfirm={async (password) => {
          if (!(await keyring.verifyPassword(password))) throw new WrongPasswordError();
          qc.clear();
          await keyring.reset(password);
        }}
      />
    </div>
  );
}

export function SettingsAbout() {
  const t = useT();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={t("security.howTitle")} />
        <ul className="space-y-2.5 p-5 text-sm">
          {(["security.how1", "security.how2", "security.how3", "security.how4", "security.how5"] as const).map((k) => (
            <li key={k} className="flex gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /><span>{t(k)}</span></li>
          ))}
        </ul>
      </Card>
      <Section title={t("settings.links")}>
        <Row icon={<Globe className="size-4" />} label={t("settings.website")} onClick={() => openUrl("https://chihuahua.wtf")} />
        <Row icon={<Code className="size-4" />} label={t("settings.sourceCode")} onClick={() => openUrl("https://github.com/ChihuahuaChain/huallet")} />
      </Section>
      <p className="pb-2 text-center text-xs text-muted">v{version}</p>
    </div>
  );
}
