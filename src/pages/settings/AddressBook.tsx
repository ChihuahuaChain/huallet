import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardHeader, CopyButton, EmptyState, Field, Input, Modal, Monogram, TokenIcon } from "@/components/ui";
import { useT } from "@/i18n";
import { fromBech32 } from "@cosmjs/encoding";
import { shortAddress } from "@/lib/format";
import { useAddressBook, type AddressBookEntry } from "@/state/addressBook";
import { useAllChains } from "@/state/chains";

function prefixOf(addr: string): string | undefined {
  try {
    return fromBech32(addr.trim()).prefix;
  } catch {
    return undefined;
  }
}

export function AddressBookSettings() {
  const t = useT();
  const { entries, add, update, remove } = useAddressBook();
  const chains = useAllChains();
  const [editing, setEditing] = useState<Partial<AddressBookEntry> | null>(null);

  const chainFor = (addr: string) => chains.find((c) => c.bech32Config.bech32PrefixAccAddr === prefixOf(addr));
  const validAddr = !!editing?.address && !!prefixOf(editing.address);

  return (
    <>
      <Card>
        <CardHeader title={t("addressBook.title")} action={<Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing({})}>{t("common.add")}</Button>} />
        <div className="divide-y divide-line p-2">
          {entries.length === 0 && <EmptyState title={t("addressBook.empty")}>{t("addressBook.emptyBody")}</EmptyState>}
          {entries.map((e) => {
            const c = chainFor(e.address);
            return (
              <div key={e.id} className="flex items-center gap-3 px-3 py-3">
                <Monogram text={e.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-semibold">
                    {e.name}
                    {c && <TokenIcon src={c.chainSymbolImageUrl} symbol={c.chainName} size={16} />}
                  </div>
                  <div className="truncate font-mono text-xs text-muted">{shortAddress(e.address, 14, 8)}{e.memo ? ` · memo: ${e.memo}` : ""}</div>
                </div>
                <CopyButton text={e.address} />
                <Button size="sm" variant="ghost" onClick={() => setEditing(e)} aria-label={t("common.edit")}><Pencil className="size-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => remove(e.id)} aria-label={t("common.remove")}><Trash2 className="size-4" /></Button>
              </div>
            );
          })}
        </div>
      </Card>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? t("common.edit") : t("addressBook.add")}
        size="sm"
        footer={
          <Button
            block
            disabled={!editing?.name?.trim() || !validAddr}
            onClick={() => {
              const data = { name: editing!.name!.trim(), address: editing!.address!.trim(), memo: editing!.memo?.trim() || undefined };
              if (editing!.id) update(editing!.id, data);
              else add(data);
              setEditing(null);
            }}
          >
            {t("common.save")}
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label={t("addressBook.name")}><Input value={editing?.name ?? ""} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} maxLength={40} /></Field>
          <Field label={t("addressBook.address")} error={editing?.address && !validAddr ? t("send.error.address") : undefined}>
            <Input value={editing?.address ?? ""} onChange={(e) => setEditing((s) => ({ ...s, address: e.target.value }))} className="font-mono text-xs" spellCheck={false} />
          </Field>
          <Field label={t("send.memo")}><Input value={editing?.memo ?? ""} onChange={(e) => setEditing((s) => ({ ...s, memo: e.target.value }))} placeholder={t("common.optional")} /></Field>
        </div>
      </Modal>
    </>
  );
}
