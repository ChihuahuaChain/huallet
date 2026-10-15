import { ArrowLeftRight, ArrowUpRight, Compass, Sunrise, Tag, TrendingUp, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/AppShell";
import { Button, Card, Input } from "@/components/ui";
import { useT } from "@/i18n";
import { isMobileView } from "@/extension/popup/view";
import { dappBrowser } from "@/mobile/dappBridge";

interface DApp {
  name: string;
  host: string;
  url: string;
  blurb: string;
  icon: LucideIcon;
}

// Curated Chihuahua apps. Each already detects window.huallet, so it runs in the
// in-app browser with no change: the wallet injects the provider and the user
// approves every connection and signature.
const APPS: DApp[] = [
  { name: "Woof Morning", host: "wm.chihuahua.wtf", url: "https://wm.chihuahua.wtf", blurb: "Daily gm check-in and streaks.", icon: Sunrise },
  { name: "Huahua P2P", host: "p2p.chihuahua.wtf", url: "https://p2p.chihuahua.wtf", blurb: "Peer-to-peer swaps with on-chain escrow.", icon: ArrowLeftRight },
  { name: "Dogtags", host: "tags.chihuahua.wtf", url: "https://tags.chihuahua.wtf", blurb: "Claim a readable name for your address.", icon: Tag },
  { name: "Predict", host: "predict.chihuahua.wtf", url: "https://predict.chihuahua.wtf", blurb: "Prediction markets on Chihuahua.", icon: TrendingUp },
];

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function AppsPage() {
  const t = useT();
  const [url, setUrl] = useState("");
  const normalized = normalizeUrl(url);

  const open = (target: string) => void dappBrowser.open(target);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("apps.title")} subtitle={t("apps.subtitle")} />

      {!isMobileView() && (
        <Card className="mb-4 text-sm text-muted">{t("apps.mobileOnly")}</Card>
      )}

      <form
        className="mb-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (normalized) open(normalized);
        }}
      >
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("apps.urlPlaceholder")}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Button type="submit" disabled={!normalized}>
          {t("apps.go")}
        </Button>
      </form>

      <div className="space-y-2">
        {APPS.map((app) => (
          <Card key={app.host} className="flex items-center gap-3 p-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-huahua-300 text-ink">
              <app.icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{app.name}</div>
              <div className="text-xs leading-snug text-muted">{app.blurb}</div>
            </div>
            <Button variant="secondary" icon={<ArrowUpRight className="size-4" />} onClick={() => open(app.url)}>
              {t("apps.open")}
            </Button>
          </Card>
        ))}
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted">
        <Compass className="mt-0.5 size-3.5 shrink-0" />
        {t("apps.disclaimer")}
      </p>
    </div>
  );
}
