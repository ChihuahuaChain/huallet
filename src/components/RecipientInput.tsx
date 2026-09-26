import { BookUser } from "lucide-react";
import { useState } from "react";
import { useT } from "@/i18n";
import { checkAddress } from "@/lib/address";
import type { ChainInfo } from "@/lib/chains/types";
import { shortAddress } from "@/lib/format";
import { useAddressBook } from "@/state/addressBook";
import { useAllChains } from "@/state/chains";
import { Field, Input, Modal, Monogram, EmptyState } from "./ui";

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
}: {
  value: string;
  onChange: (v: string) => void;
  onMemo?: (memo: string) => void;
  chain: ChainInfo;
  own?: string;
  label?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const entries = useAddressBook((s) => s.entries).filter((e) => e.address.startsWith(chain.bech32Config.bech32PrefixAccAddr + "1"));
  const { error, warning } = useRecipientError(value, chain, own);
  return (
    <>
      <Field label={label ?? t("send.recipient")} error={error} hint={warning ? <span className="text-warning">{warning}</span> : undefined}>
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
