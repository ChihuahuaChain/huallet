import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, Spinner, TokenIcon } from "@/components/ui";
import { useT } from "@/i18n";
import { supportsFeature } from "@/lib/chains/types";
import { getCw20Info } from "@/lib/cosmos/rest";
import { checkAddress } from "@/lib/address";
import { shortAddress } from "@/lib/format";
import { useChainsStore, useSelectedChain } from "@/state/chains";

export function TokensSettings() {
  const t = useT();
  const chain = useSelectedChain();
  const tokens = useChainsStore((s) => s.cw20Tokens[chain.chainId]) ?? [];
  const { addCw20, removeCw20 } = useChainsStore();
  const [contract, setContract] = useState("");
  const wasm = supportsFeature(chain, "cosmwasm");
  const validContract = checkAddress(contract, chain).ok;
  const info = useQuery({
    queryKey: ["cw20-info", chain.chainId, contract],
    queryFn: () => getCw20Info(chain, contract.trim()),
    enabled: wasm && validContract,
    retry: false,
  });

  return (
    <Card>
      <CardHeader title={t("tokens.title")} subtitle={t("tokens.subtitle", { chain: chain.chainName })} />
      <div className="space-y-4 p-5">
        {!wasm ? (
          <Alert tone="info">{t("tokens.noWasm", { chain: chain.chainName })}</Alert>
        ) : (
          <>
            <Field label={t("tokens.contract")} error={contract && !validContract ? t("send.error.address") : info.isError ? t("tokens.notCw20") : undefined}>
              <Input value={contract} onChange={(e) => setContract(e.target.value.trim())} placeholder={`${chain.bech32Config.bech32PrefixAccAddr}1…`} className="font-mono text-xs" spellCheck={false} />
            </Field>
            {info.isLoading && validContract && <Spinner />}
            {info.data && (
              <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3">
                <div>
                  <div className="font-semibold">{info.data.symbol}</div>
                  <div className="text-xs text-muted">{info.data.name} · {info.data.decimals} decimals</div>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    addCw20(chain.chainId, { contract: contract.trim(), symbol: info.data!.symbol, name: info.data!.name, decimals: info.data!.decimals });
                    setContract("");
                  }}
                >
                  {t("common.add")}
                </Button>
              </div>
            )}
            <Alert tone="warning">{t("tokens.warning")}</Alert>
          </>
        )}
        <div className="divide-y divide-line">
          {tokens.length === 0 && wasm && <EmptyState title={t("tokens.empty")} />}
          {tokens.map((tk) => (
            <div key={tk.contract} className="flex items-center gap-3 py-3">
              <TokenIcon symbol={tk.symbol} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{tk.symbol}</div>
                <div className="truncate font-mono text-xs text-muted">{shortAddress(tk.contract, 14, 8)}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => removeCw20(chain.chainId, tk.contract)} aria-label={t("common.remove")}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
