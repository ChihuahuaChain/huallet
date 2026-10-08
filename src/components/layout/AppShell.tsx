import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ChevronDown,
  Coins,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  Network,
  Plus,
  QrCode,
  Repeat,
  Send,
  Settings,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useT, type MessageKey } from "@/i18n";
import { useAddress } from "@/hooks/queries";
import { explorerAccountUrl } from "@/lib/chains/types";
import { shortAddress } from "@/lib/format";
import { useChainsStore, useEnabledChains, useSelectedChain } from "@/state/chains";
import { useSettings } from "@/state/settings";
import { useWallet } from "@/state/wallet";
import { version } from "../../../package.json";
import { Logo } from "../Logo";
import { TxModalHost } from "../TxModal";
import { Badge, CopyButton, Monogram, TokenIcon, cx } from "../ui";

const NAV: Array<{ to: string; key: MessageKey; icon: typeof LayoutDashboard; mobile?: boolean }> = [
  { to: "/", key: "nav.dashboard", icon: LayoutDashboard, mobile: true },
  { to: "/stake", key: "nav.stake", icon: Coins, mobile: true },
  { to: "/swap", key: "nav.swap", icon: Repeat, mobile: true },
  { to: "/send", key: "nav.send", icon: Send, mobile: true },
  { to: "/receive", key: "nav.receive", icon: QrCode },
  { to: "/ibc", key: "nav.ibc", icon: ArrowLeftRight },
  { to: "/governance", key: "nav.governance", icon: Landmark },
  { to: "/chains", key: "nav.chains", icon: Network },
  { to: "/history", key: "nav.history", icon: History, mobile: true },
  { to: "/settings", key: "nav.settings", icon: Settings, mobile: true },
];

const MOBILE_TABS = NAV.filter((n) => n.mobile).map((n) => n.to);

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, onOutside]);
}

export function Popover({ trigger, children, align = "right" }: { trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div className={cx("absolute top-full z-40 mt-2 w-72 rounded-2xl border border-line bg-surface p-2 shadow-pop", align === "right" ? "right-0" : "left-0")}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function WalletMenu() {
  const t = useT();
  const qc = useQueryClient();
  const { backend, name, isLedger, disconnect } = useWallet();
  const chain = useSelectedChain();
  const address = useAddress(chain);
  const explorer = address ? explorerAccountUrl(chain, address) : undefined;
  return (
    <Popover
      trigger={(open) => (
        <button className="flex items-center gap-2 rounded-xl border border-line bg-surface py-1.5 pl-1.5 pr-2.5 hover:bg-surface-2" aria-expanded={open}>
          <Monogram text={name || "?"} size={28} />
          <span className="hidden max-w-32 truncate text-sm font-semibold sm:inline">{name}</span>
          <ChevronDown className="size-4 text-muted" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center gap-3 px-2 py-2">
            <Monogram text={name || "?"} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{name}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                {t("wallet.via", { wallet: backend?.label ?? "" })}
                {isLedger && <Badge>Ledger</Badge>}
              </div>
            </div>
          </div>
          {address && (
            <div className="mx-2 mb-2 flex items-center gap-1 rounded-xl bg-surface-2 py-1 pl-3 pr-1">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{shortAddress(address, 14, 8)}</span>
              <CopyButton text={address} />
            </div>
          )}
          <div className="border-t border-line pt-1">
            {explorer && (
              <a href={explorer} target="_blank" rel="noopener noreferrer" onClick={close} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium hover:bg-surface-2">
                <ExternalLink className="size-4" /> {t("receive.explorer")}
              </a>
            )}
            <p className="px-2 py-1.5 text-xs text-muted">{t("wallet.switchHint", { wallet: backend?.label ?? "" })}</p>
            <button
              onClick={() => {
                close();
                disconnect();
                qc.clear();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-danger hover:bg-surface-2"
            >
              <LogOut className="size-4" /> {t("wallet.disconnect")}
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

export function ChainSwitcher() {
  const t = useT();
  const chains = useEnabledChains();
  const selected = useSelectedChain();
  const select = useChainsStore((s) => s.selectChain);
  return (
    <Popover
      align="left"
      trigger={(open) => (
        <button className="flex items-center gap-2 rounded-xl border border-line bg-surface py-1.5 pl-1.5 pr-2.5 hover:bg-surface-2" aria-expanded={open}>
          <TokenIcon src={selected.chainSymbolImageUrl} symbol={selected.chainName} size={26} />
          <span className="text-sm font-semibold">{selected.chainName}</span>
          <ChevronDown className="size-4 text-muted" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted">{t("chains.select")}</div>
          <div className="max-h-80 overflow-y-auto">
            {chains.map((c) => (
              <button
                key={c.chainId}
                onClick={() => {
                  select(c.chainId);
                  close();
                }}
                className={cx("flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-surface-2", c.chainId === selected.chainId && "bg-surface-2")}
              >
                <TokenIcon src={c.chainSymbolImageUrl} symbol={c.chainName} size={28} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{c.chainName}</div>
                  <div className="truncate text-xs text-muted">{c.chainId}</div>
                </div>
              </button>
            ))}
          </div>
          <Link to="/chains" onClick={close} className="mt-1 flex items-center gap-2 rounded-xl border-t border-line px-2 py-2 pt-2.5 text-sm font-medium hover:bg-surface-2">
            <Plus className="size-4" /> {t("chains.manage")}
          </Link>
        </div>
      )}
    </Popover>
  );
}

export function AppShell({ menu = <WalletMenu />, compact = false }: { menu?: ReactNode; compact?: boolean }) {
  const t = useT();
  const { hideBalances, set } = useSettings();
  const localKeys = useWallet((s) => s.backend?.id.startsWith("local:") ?? false);
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useSwipeTabs(mainRef, MOBILE_TABS);

  return (
    <div className="app-shell min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 py-5">
          <Link to="/" aria-label="Huallet">
            <Logo size={38} />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
          {NAV.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-huahua-300/35 text-fg dark:bg-huahua-300/15" : "text-muted hover:bg-surface-2 hover:text-fg",
                )
              }
            >
              <Icon className="size-[18px]" />
              {t(key)}
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-2xl bg-surface-2 p-4 text-xs text-muted paw-bg">
          <div className="font-display text-sm font-semibold text-fg">{t("shell.selfCustody")}</div>
          <p className="mt-1">{t(localKeys ? "shell.selfCustodyBodyLocal" : "shell.selfCustodyBody")}</p>
          <p className="mt-2 text-[11px] text-muted/70">v{version}</p>
        </div>
      </aside>

      <div className="app-shell-body min-w-0 flex-1 pb-20 lg:pb-0">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
          <div className={cx("mx-auto flex h-16 max-w-6xl items-center px-4 lg:px-8", compact ? "gap-1.5 px-3" : "gap-3")}>
            <Link to="/" className="lg:hidden" aria-label="Huallet">
              <Logo size={32} withText={false} />
            </Link>
            <ChainSwitcher />
            <div className="flex-1" />
            <button
              onClick={() => set({ hideBalances: !hideBalances })}
              className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg"
              aria-label={hideBalances ? t("shell.showBalances") : t("shell.hideBalances")}
              title={hideBalances ? t("shell.showBalances") : t("shell.hideBalances")}
            >
              {hideBalances ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
            {menu}
          </div>
        </header>
        <main ref={mainRef} key={pathname} className={cx("swipe-page mx-auto min-h-[70vh] max-w-6xl lg:px-8 lg:py-8", compact ? "px-3 py-4" : "px-4 py-6")}>
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur lg:hidden" aria-label="Main">
        {NAV.filter((n) => n.mobile).map(({ to, key, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => cx("flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", isActive ? "text-rust" : "text-muted")}
          >
            <Icon className="size-5" />
            {t(key)}
          </NavLink>
        ))}
      </nav>
      <TxModalHost />
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
