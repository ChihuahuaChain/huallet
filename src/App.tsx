import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createHashRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RouteError } from "@/components/RouteError";
import { Toaster } from "@/components/Toaster";
import { useHydrated } from "@/hooks/useHydrated";
import { useTheme } from "@/hooks/useTheme";
import { Mascot } from "@/components/Logo";
import { useEnabledChains, useSelectedChain } from "@/state/chains";
import { connectWallet, rememberedWallet } from "@/lib/wallet/connect";
import { useWallet } from "@/state/wallet";
import { Connect } from "@/pages/Connect";
import { Dashboard } from "@/pages/Dashboard";
import { StakeOverview } from "@/pages/StakeOverview";
import { StakeChain } from "@/pages/StakeChain";
import { SendPage } from "@/pages/Send";
import { SwapPage } from "@/pages/Swap";
import { ReceivePage } from "@/pages/Receive";
import { IbcPage } from "@/pages/Ibc";
import { GovernancePage } from "@/pages/Governance";
import { ProposalPage } from "@/pages/Proposal";
import { ChainsPage } from "@/pages/Chains";
import { HistoryPage } from "@/pages/History";
import { SettingsLayout } from "@/pages/settings/SettingsLayout";
import { GeneralSettings } from "@/pages/settings/General";
import { AddressBookSettings } from "@/pages/settings/AddressBook";
import { TokensSettings } from "@/pages/settings/Tokens";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, refetchOnWindowFocus: false, staleTime: 20_000 },
  },
});

function Gate() {
  const status = useWallet((s) => s.status);
  const chains = useEnabledChains();
  const primary = useSelectedChain();
  const [reconnecting, setReconnecting] = useState(() => !!rememberedWallet());
  const started = useRef(false);

  useEffect(() => {
    const kind = rememberedWallet();
    if (started.current || !kind) return;
    started.current = true;
    connectWallet(kind, chains, primary)
      .catch(() => {})
      .finally(() => setReconnecting(false));
  }, [chains, primary]);

  if (status === "connected") return <Outlet />;
  if (reconnecting) {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true">
        <Mascot size={72} className="animate-pulse" />
      </div>
    );
  }
  return <Connect />;
}

const router = createHashRouter([
  {
    element: <Gate />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
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
            element: <SettingsLayout />,
            children: [
              { index: true, element: <GeneralSettings /> },
              { path: "address-book", element: <AddressBookSettings /> },
              { path: "tokens", element: <TokensSettings /> },
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
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  );
}
