import { NavLink, Outlet } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { cx } from "@/components/ui";
import { useT, type MessageKey } from "@/i18n";

export type SettingsTab = { to: string; key: MessageKey };

export const WEB_SETTINGS_TABS: SettingsTab[] = [
  { to: "/settings", key: "settings.general" },
  { to: "/settings/address-book", key: "settings.addressBook" },
  { to: "/settings/tokens", key: "settings.tokens" },
  { to: "/chains", key: "nav.chains" },
];

export function SettingsLayout({ tabs = WEB_SETTINGS_TABS }: { tabs?: SettingsTab[] }) {
  const t = useT();
  return (
    <div>
      <PageHeader title={t("nav.settings")} />
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav className="flex flex-wrap gap-1 md:flex-col md:flex-nowrap" aria-label={t("nav.settings")}>
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                cx("whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium", isActive ? "bg-huahua-300/35 text-fg dark:bg-huahua-300/15" : "text-muted hover:bg-surface-2 hover:text-fg")
              }
            >
              {t(tab.key)}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 space-y-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
