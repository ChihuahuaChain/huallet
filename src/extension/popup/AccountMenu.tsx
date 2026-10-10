import { ChevronDown, ExternalLink, Maximize2, Plus, ShieldAlert, Usb, UserCog } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AddressAvatar } from "@/components/AddressAvatar";
import { Popover } from "@/components/layout/AppShell";
import { CopyButton, cx } from "@/components/ui";
import { useAddress } from "@/hooks/queries";
import { useT } from "@/i18n";
import { explorerAccountUrl } from "@/lib/chains/types";
import { shortAddress } from "@/lib/format";
import { extApi } from "@/lib/kv";
import { useSelectedChain } from "@/state/chains";
import { useKeyring, useSelectedKey } from "../state/keyringStore";
import { isPopupView } from "./view";

export function AccountMenu() {
  const t = useT();
  const navigate = useNavigate();
  const keys = useKeyring((s) => s.keys);
  const selectKey = useKeyring((s) => s.selectKey);
  const current = useSelectedKey();
  const chain = useSelectedChain();
  const address = useAddress(chain);
  const explorer = address ? explorerAccountUrl(chain, address) : undefined;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Popover
        trigger={(open) => (
          <button className="flex min-w-0 max-w-full items-center gap-1.5 rounded-xl border border-line bg-surface py-1.5 pl-1.5 pr-2 hover:bg-surface-2" aria-expanded={open}>
            <AddressAvatar seed={current?.name ?? "?"} size={26} />
            <span className="min-w-0 max-w-20 truncate text-sm font-semibold sm:max-w-28">{current?.name}</span>
            {current && !current.backedUp && <ShieldAlert className="size-4 text-warning" aria-label={t("backup.notBackedUp")} />}
            <ChevronDown className="size-4 text-muted" />
          </button>
        )}
      >
        {(close) => (
          <div>
            {address && (
              <div className="mx-1 mb-2 flex items-center gap-1 rounded-xl bg-surface-2 py-1 pl-3 pr-1">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{shortAddress(address, 14, 8)}</span>
                <CopyButton text={address} />
                {explorer && (
                  <a href={explorer} target="_blank" rel="noopener noreferrer" className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-fg" aria-label={t("receive.explorer")}>
                    <ExternalLink className="size-4" />
                  </a>
                )}
              </div>
            )}
            <div className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted">{t("accounts.title")}</div>
            <div className="max-h-56 overflow-y-auto">
              {keys.map((k) => (
                <button
                  key={k.id}
                  onClick={async () => {
                    close();
                    await selectKey(k.id);
                  }}
                  className={cx("flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-surface-2", k.id === current?.id && "bg-surface-2")}
                >
                  <AddressAvatar seed={k.name} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{k.name}</span>
                  {k.type === "ledger" && <Usb className="size-4 text-muted" aria-label="Ledger" />}
                  {!k.backedUp && <ShieldAlert className="size-4 text-warning" />}
                </button>
              ))}
            </div>
            <div className="mt-1 border-t border-line pt-1">
              <MenuItem icon={<Plus className="size-4" />} onClick={() => { close(); navigate("/accounts/add"); }}>{t("accounts.add")}</MenuItem>
              <MenuItem icon={<UserCog className="size-4" />} onClick={() => { close(); navigate("/settings/accounts"); }}>{t("accounts.manage")}</MenuItem>
              {isPopupView() && (
                <MenuItem
                  icon={<Maximize2 className="size-4" />}
                  onClick={() => {
                    close();
                    void extApi()?.tabs.create({ url: extApi()!.runtime.getURL("popup.html") });
                    window.close();
                  }}
                >
                  {t("ext.expand")}
                </MenuItem>
              )}
            </div>
          </div>
        )}
      </Popover>
    </div>
  );
}

function MenuItem({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium hover:bg-surface-2">
      {icon} {children}
    </button>
  );
}
