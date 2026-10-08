import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useEffect } from "react";
import { createHashRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Mascot } from "@/components/Logo";
import { RouteError } from "@/components/RouteError";
import { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui";
import { useHydrated } from "@/hooks/useHydrated";
import { useTheme } from "@/hooks/useTheme";
import { useSyncLanguage, useT } from "@/i18n";
import { extApi } from "@/lib/kv";
import { ChainsPage } from "@/pages/Chains";
import { Dashboard } from "@/pages/Dashboard";
import { GovernancePage } from "@/pages/Governance";
import { HistoryPage } from "@/pages/History";
import { IbcPage } from "@/pages/Ibc";
import { ProposalPage } from "@/pages/Proposal";
import { ReceivePage } from "@/pages/Receive";
import { SendPage } from "@/pages/Send";
import { SwapPage } from "@/pages/Swap";
import { AddressBookSettings } from "@/pages/settings/AddressBook";
import { TokensSettings } from "@/pages/settings/Tokens";
import { StakeChain } from "@/pages/StakeChain";
import { StakeOverview } from "@/pages/StakeOverview";
import { useWallet } from "@/state/wallet";
import { AddAccount } from "../onboarding/AddAccount";
import { Backup } from "../onboarding/Backup";
import { Onboarding } from "../onboarding/Onboarding";
import { AccountsSettings } from "../settings/Accounts";
import { ChangePasswordForm } from "../settings/Security";
import { SettingsAbout, SettingsHome, SettingsSubPage } from "../settings/Settings";
import { useKeyring, useSelectedKey } from "../state/keyringStore";
import { Unlock } from "../Unlock";
import { AccountMenu } from "./AccountMenu";
import { Approve } from "./Approve";
import { bg } from "./background";
import { localBackend } from "./backend";
import { ConnectedSites } from "./ConnectedSites";
import { extView, isPopupView } from "./view";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false, staleTime: 20_000 } },
});

function useActivityPing(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const ping = () => {
      if (Date.now() - last < 20_000) return;
      last = Date.now();
      bg({ type: "activity" }).catch(() => {});
    };
    ping();
    const events = ["pointerdown", "keydown", "wheel"] as const;
    for (const e of events) window.addEventListener(e, ping, { passive: true });
    return () => events.forEach((e) => window.removeEventListener(e, ping));
  }, [enabled]);
}

function Splash() {
  return (
    <div className="flex min-h-[inherit] items-center justify-center py-24">
      <Mascot size={64} className="animate-pulse" />
    </div>
  );
}

function OpenInTab() {
  const t = useT();
  return (
    <div className="paw-bg flex min-h-[inherit] flex-col items-center justify-center gap-4 p-6 text-center">
      <Mascot size={240} />
      <h1 className="text-2xl font-bold">
        {t("onboarding.welcomeTo")} Hua<span className="text-rust">llet</span>
      </h1>
      <p className="text-sm text-muted">{t("ext.setupInTab")}</p>
      <Button
        size="lg"
        icon={<ExternalLink className="size-4" />}
        onClick={() => {
          void extApi()?.tabs.create({ url: extApi()!.runtime.getURL("popup.html") });
          window.close();
        }}
      >
        {t("ext.getStarted")}
      </Button>
    </div>
  );
}

function Gate() {
  const qc = useQueryClient();
  const status = useKeyring((s) => s.status);
  const refresh = useKeyring((s) => s.refresh);
  const key = useSelectedKey();
  const backend = useWallet((s) => s.backend);
  useActivityPing(status === "unlocked");

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (status === "unlocked" && key) useWallet.getState().useBackend(localBackend(key), key.name);
    if (status === "locked") qc.clear();
  }, [status, key, qc]);

  if (status === "loading") return <Splash />;
  if (status === "no-vault") return isPopupView() ? <OpenInTab /> : <Onboarding />;
  if (status === "locked") return <Unlock />;
  if (!backend || backend.id !== `local:${key?.id}`) return <Splash />;
  return <Outlet />;
}

const compact = extView() !== "tab" || document.documentElement.dataset.view === "mobile";

const router = createHashRouter([
  {
    element: <Gate />,
    errorElement: <RouteError />,
    children: [
      { path: "/approve/:id", element: <Approve /> },
      { path: "/accounts/add", element: <AddAccount /> },
      { path: "/backup/:keyId", element: <Backup /> },
      {
        element: <AppShell menu={<AccountMenu />} compact={compact} />,
        children: [
          {
            errorElement: <RouteError />,
            children: [
          { index: true, element: <Dashboard /> },
          { path: "stake", element: <StakeOverview /> },
          { path: "stake/:chainId", element: <StakeChain /> },
          { path: "swap", element: <SwapPage /> },
          { path: "send", element: <SendPage /> },
          { path: "receive", element: <ReceivePage /> },
          { path: "ibc", element: <IbcPage /> },
          { path: "governance", element: <GovernancePage /> },
          { path: "governance/:chainId/:proposalId", element: <ProposalPage /> },
          { path: "chains", element: <ChainsPage /> },
          { path: "history", element: <HistoryPage /> },
          {
            path: "settings",
            children: [
              { index: true, element: <SettingsHome /> },
              { path: "password", element: <SettingsSubPage titleKey="security.changePassword"><ChangePasswordForm /></SettingsSubPage> },
              { path: "sites", element: <SettingsSubPage titleKey="ext.sites.title"><ConnectedSites /></SettingsSubPage> },
              { path: "accounts", element: <SettingsSubPage titleKey="settings.accounts"><AccountsSettings /></SettingsSubPage> },
              { path: "address-book", element: <SettingsSubPage titleKey="settings.addressBook"><AddressBookSettings /></SettingsSubPage> },
              { path: "tokens", element: <SettingsSubPage titleKey="settings.tokens"><TokensSettings /></SettingsSubPage> },
              { path: "about", element: <SettingsSubPage titleKey="settings.about"><SettingsAbout /></SettingsSubPage> },
            ],
          },
          { path: "*", element: <Navigate to="/" replace /> },
            ],
          },
        ],
      },
    ],
  },
]);

function Root() {
  useTheme();
  useSyncLanguage();
  const hydrated = useHydrated();
  if (!hydrated) return <Splash />;
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}

export function PopupApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  );
}
