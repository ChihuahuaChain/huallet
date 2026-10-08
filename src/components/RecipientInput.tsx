import { BookUser } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useT } from "@/i18n";
import { checkAddress } from "@/lib/address";
import type { ChainInfo } from "@/lib/chains/types";
import { dogtagsContract, isAliasFormat, resolveAlias, reverseLookup } from "@/lib/dogtags";
import { shortAddress } from "@/lib/format";
import { useAddressBook } from "@/state/addressBook";
import { useAllChains } from "@/state/chains";
import { Field, Input, Modal, Monogram, EmptyState } from "./ui";

export interface DogtagResolution {
  /** True when the input isn't an address but looks like a Dogtags alias on a chain that has the contract. */
  isAlias: boolean;
  status: "idle" | "resolving" | "resolved" | "notfound";
  /** The resolved owner address when status is "resolved". */
  address?: string;
  alias?: string;
}

/** Resolves a Dogtags alias in the recipient field (debounced). Only active when the
 * input is not a valid address of any known chain but matches the alias syntax, and
 * the current chain has a Dogtags contract. */
export function useDogtagResolution(value: string, chain: ChainInfo): DogtagResolution {
  const chains = useAllChains();
  const a = value.trim();
  const c = checkAddress(a, chain, chains);
  const isAlias = !!dogtagsContract(chain) && isAliasFormat(a) && !c.ok && c.reason === "invalid";
  const [state, setState] = useState<{ status: DogtagResolution["status"]; address?: string }>({ status: "idle" });
  useEffect(() => {
    if (!isAlias) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "resolving" });
    const id = setTimeout(() => {
      void resolveAlias(chain, a).then((address) => {
        if (!cancelled) setState(address ? { status: "resolved", address } : { status: "notfound" });
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [isAlias, a, chain.chainId]);
  return { isAlias, status: isAlias ? state.status : "idle", address: isAlias ? state.address : undefined, alias: isAlias ? a : undefined };
}

/** Reverse-lookup the Dogtags alias owned by an address (for display), or null. */
export function useDogtagAlias(chain: ChainInfo, address?: string): string | null {
  const [alias, setAlias] = useState<string | null>(null);
  useEffect(() => {
    setAlias(null);
    if (!address || !dogtagsContract(chain)) return;
    let cancelled = false;
    void reverseLookup(chain, address).then((a) => {
      if (!cancelled) setAlias(a);
    });
    return () => {
      cancelled = true;
    };
  }, [chain.chainId, address]);
  return alias;
}

export function useRecipientError(value: string, chain: ChainInfo, own?: string): { error?: string; warning?: string } {
  const t = useT();
  const chains = useAllChains();
  if (!value.trim()) return {};
  const r = checkAddress(value, chain, chains);
  if (!r.ok) {
    if (r.reason === "wrong-prefix")
      return {
        error: r.otherChain
          ? t("send.error.otherChain", { chain: r.otherChain.chainName, expected: r.expected ?? "" })
          : t("send.error.prefix", { expected: r.expected ?? "" }),
      };
    return { error: t("send.error.address") };
  }
  if (own && value.trim() === own) return { warning: t("send.warn.self") };
  return {};
}

export function RecipientInput({
  value,
  onChange,
  onMemo,
  chain,
  own,
  label,
  dogtag,
}: {
  value: string;
  onChange: (v: string) => void;
  onMemo?: (memo: string) => void;
  chain: ChainInfo;
  own?: string;
  label?: string;
  dogtag?: DogtagResolution;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const entries = useAddressBook((s) => s.entries).filter((e) => e.address.startsWith(chain.bech32Config.bech32PrefixAccAddr + "1"));
  const base = useRecipientError(value, chain, own);
  // For a Dogtags alias the on-chain resolution drives the field, not the address check.
  const alias = dogtag?.isAlias ? dogtag : undefined;
  const error = alias
    ? alias.status === "notfound"
      ? t("send.dogtag.notFound", { alias: alias.alias ?? value.trim() })
      : undefined
    : base.error;
  let hint: ReactNode = base.warning ? <span className="text-warning">{base.warning}</span> : undefined;
  if (alias?.status === "resolving") hint = <span className="text-muted">{t("send.dogtag.resolving")}</span>;
  else if (alias?.status === "resolved" && alias.address)
    hint = <span className="text-success">{t("send.dogtag.resolved", { address: shortAddress(alias.address) })}</span>;
  return (
    <>
      <Field label={label ?? t("send.recipient")} error={error} hint={hint}>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={`${chain.bech32Config.bech32PrefixAccAddr}1…`}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          className="font-mono text-xs sm:text-sm"
          invalid={!!error}
          right={
            <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label={t("addressBook.title")}>
              <BookUser className="size-4" />
            </button>
          }
        />
      </Field>
      <Modal open={open} onClose={() => setOpen(false)} title={t("addressBook.title")} size="sm">
        {entries.length === 0 ? (
          <EmptyState title={t("addressBook.empty")}>{t("addressBook.emptyFor", { chain: chain.chainName })}</EmptyState>
        ) : (
          <div className="space-y-1">
            {entries.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  onChange(e.address);
                  if (e.memo) onMemo?.(e.memo);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2"
              >
                <Monogram text={e.name} size={32} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{e.name}</div>
                  <div className="font-mono text-xs text-muted">{shortAddress(e.address)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
