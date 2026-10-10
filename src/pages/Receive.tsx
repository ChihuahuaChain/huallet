import { AlertTriangle, ExternalLink, Tag } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { NfcReceive } from "@/components/PayRequest";
import { QrCode } from "@/components/QrCode";
import { useDogtagAlias } from "@/components/RecipientInput";
import { Alert, Card, CardHeader, CopyButton, Skeleton, TokenIcon } from "@/components/ui";
import { useAccountChains, useAddress, useAddresses } from "@/hooks/queries";
import { useT } from "@/i18n";
import { explorerAccountUrl } from "@/lib/chains/types";
import { DOGTAGS_URL, dogtagsContract } from "@/lib/dogtags";
import { shortAddress } from "@/lib/format";
import { useChainsStore, useEnabledChains, useSelectedChain } from "@/state/chains";

export function ReceivePage() {
  const t = useT();
  const chain = useSelectedChain();
  const address = useAddress(chain);
  const chains = useEnabledChains();
  const addresses = useAddresses(chains);
  const unsupported = new Set(useAccountChains().unsupported.map((c) => c.chainId));
  const selectChain = useChainsStore((s) => s.selectChain);
  const explorer = address ? explorerAccountUrl(chain, address) : undefined;
  const alias = useDogtagAlias(chain, address);
  const hasDogtags = !!dogtagsContract(chain);

  return (
    <div className="space-y-6">
      <PageHeader title={t("receive.title")} subtitle={t("receive.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="flex items-center gap-2 font-display text-lg font-semibold">
            <TokenIcon src={chain.chainSymbolImageUrl} symbol={chain.chainName} size={28} />
            {chain.chainName}
          </div>
          {address ? <QrCode value={address} size={220} /> : <Skeleton className="size-[220px]" />}
          <div className="w-full rounded-xl bg-surface-2 p-3">
            <div className="break-all font-mono text-sm">{address ?? "…"}</div>
          </div>
          {alias && (
            <div className="inline-flex items-center gap-2 rounded-full bg-rust/10 py-1 pl-3 pr-1 text-sm">
              <Tag className="size-3.5 text-rust" />
              <span className="text-muted">{t("receive.alias")}</span>
              <span className="font-semibold text-rust">{alias}</span>
              <CopyButton text={alias} />
            </div>
          )}
          <NfcReceive chain={chain} address={address} />
          <div className="flex flex-wrap justify-center gap-2">
            {address && <CopyButton text={address} label={t("common.copyAddress")} className="border border-line px-3" />}
            {explorer && (
              <a href={explorer} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                <ExternalLink className="size-4" /> {t("receive.explorer")}
              </a>
            )}
            {hasDogtags && (
              <a href={DOGTAGS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                <Tag className="size-4" /> {alias ? t("receive.manageDogtag") : t("receive.getAlias")}
              </a>
            )}
          </div>
          <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />}>
            <span className="whitespace-pre-line">{t("receive.warning", { chain: chain.chainName })}</span>
          </Alert>
        </Card>

        <Card>
          <CardHeader title={t("receive.allAddresses")} subtitle={t("receive.allAddressesBody")} />
          <div className="divide-y divide-line p-2">
            {chains.map((c) => (
              <div key={c.chainId} className="flex items-center gap-3 px-3 py-2.5">
                <button onClick={() => selectChain(c.chainId)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <TokenIcon src={c.chainSymbolImageUrl} symbol={c.chainName} size={32} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{c.chainName}</div>
                    <div className="truncate font-mono text-xs text-muted">{addresses[c.chainId] ? shortAddress(addresses[c.chainId]!, 14, 8) : unsupported.has(c.chainId) ? t("ledger.notSupported") : "…"}</div>
                  </div>
                </button>
                {addresses[c.chainId] && <CopyButton text={addresses[c.chainId]!} />}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
