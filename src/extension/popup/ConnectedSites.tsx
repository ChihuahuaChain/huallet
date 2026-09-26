import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { useT } from "@/i18n";
import { useAllChains } from "@/state/chains";
import type { Permissions } from "../shared/protocol";
import { bg } from "./background";

export function ConnectedSites() {
  const t = useT();
  const qc = useQueryClient();
  const chains = useAllChains();
  const perms = useQuery({ queryKey: ["ext-permissions"], queryFn: () => bg<Permissions>({ type: "listPermissions" }) });
  const entries = Object.entries(perms.data ?? {}).filter(([, ids]) => ids.length > 0);
  const name = (id: string) => chains.find((c) => c.chainId === id)?.chainName ?? id;

  return (
    <Card>
      <CardHeader title={t("ext.sites.title")} subtitle={t("ext.sites.subtitle")} />
      <div className="divide-y divide-line p-2">
        {entries.length === 0 && <EmptyState icon={<Globe className="size-8" />} title={t("ext.sites.empty")}>{t("ext.sites.emptyBody")}</EmptyState>}
        {entries.map(([origin, ids]) => (
          <div key={origin} className="flex items-center gap-3 px-3 py-3">
            <Globe className="size-5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{origin}</div>
              <div className="truncate text-xs text-muted">{ids.map(name).join(", ")}</div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                await bg({ type: "revokePermission", origin });
                await qc.invalidateQueries({ queryKey: ["ext-permissions"] });
              }}
            >
              {t("ext.sites.revoke")}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
