import { Landmark } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { Badge, Card, EmptyState, Skeleton, Tabs } from "@/components/ui";
import { useAddress, useMyVote, useProposals } from "@/hooks/queries";
import { useLocale, useT, type MessageKey } from "@/i18n";
import type { ChainInfo } from "@/lib/chains/types";
import type { Proposal, ProposalStatus } from "@/lib/cosmos/rest";
import { formatDateTime, timeUntil } from "@/lib/format";
import { useSelectedChain } from "@/state/chains";

export function statusTone(s: ProposalStatus): "accent" | "success" | "danger" | "neutral" | "warning" {
  switch (s) {
    case "PROPOSAL_STATUS_VOTING_PERIOD":
      return "accent";
    case "PROPOSAL_STATUS_PASSED":
      return "success";
    case "PROPOSAL_STATUS_REJECTED":
    case "PROPOSAL_STATUS_FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

function MyVoteBadge({ chain, id }: { chain: ChainInfo; id: string }) {
  const t = useT();
  const address = useAddress(chain);
  const vote = useMyVote(chain, id, address);
  if (vote.data === undefined) return null;
  return vote.data ? <Badge tone="success">{t("gov.voted", { option: t(`gov.option.${vote.data}` as MessageKey) })}</Badge> : <Badge tone="warning">{t("gov.notVoted")}</Badge>;
}

function ProposalCard({ p, chain }: { p: Proposal; chain: ChainInfo }) {
  const t = useT();
  const locale = useLocale();
  const voting = p.status === "PROPOSAL_STATUS_VOTING_PERIOD";
  return (
    <Link to={`/governance/${encodeURIComponent(chain.chainId)}/${encodeURIComponent(p.id)}`} className="block">
      <Card className="p-5 transition-colors hover:border-rust">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-muted">#{p.id}</span>
          <Badge tone={statusTone(p.status)}>{t(`gov.status.${p.status}` as MessageKey)}</Badge>
          {p.expedited && <Badge tone="warning">{t("gov.expedited")}</Badge>}
          {voting && <MyVoteBadge chain={chain} id={p.id} />}
        </div>
        <h3 className="mt-2 line-clamp-2 text-base font-semibold">{p.title}</h3>
        <div className="mt-2 text-xs text-muted">
          {voting && p.votingEnd
            ? t("gov.endsIn", { when: timeUntil(p.votingEnd, locale) })
            : p.votingEnd && new Date(p.votingEnd).getFullYear() > 1970
              ? t("gov.ended", { when: formatDateTime(p.votingEnd, locale) })
              : p.submitTime && t("gov.submitted", { when: formatDateTime(p.submitTime, locale) })}
        </div>
      </Card>
    </Link>
  );
}

export function GovernancePage() {
  const t = useT();
  const chain = useSelectedChain();
  const proposals = useProposals(chain);
  const [tab, setTab] = useState<"voting" | "all">("voting");
  const list = (proposals.data ?? []).filter((p) => tab === "all" || p.status === "PROPOSAL_STATUS_VOTING_PERIOD");

  return (
    <div className="space-y-6">
      <PageHeader title={t("gov.title")} subtitle={t("gov.subtitle", { chain: chain.chainName })} action={<Tabs value={tab} onChange={setTab} items={[{ value: "voting", label: t("gov.tab.voting") }, { value: "all", label: t("gov.tab.all") }]} />} />
      {proposals.isLoading && <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>}
      {proposals.isError && <Card className="p-5 text-sm text-danger">{t("common.loadError")}</Card>}
      {!proposals.isLoading && list.length === 0 && (
        <Card>
          <EmptyState icon={<Landmark className="size-8" />} title={tab === "voting" ? t("gov.noneVoting") : t("gov.none")}>
            {t("gov.noneBody")}
          </EmptyState>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((p) => <ProposalCard key={p.id} p={p} chain={chain} />)}
      </div>
    </div>
  );
}
