import { ArrowLeft, Check } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { requestTx } from "@/components/TxModal";
import { Badge, Button, Card, CardHeader, Skeleton, cx } from "@/components/ui";
import { useAddress, useLiveTally, useMyVote, useProposal } from "@/hooks/queries";
import { useLocale, useT, type MessageKey } from "@/i18n";
import type { ChainInfo } from "@/lib/chains/types";
import type { TallyResult, VoteOption } from "@/lib/cosmos/rest";
import { msg } from "@/lib/cosmos/tx";
import { formatDateTime } from "@/lib/format";
import { useAllChains } from "@/state/chains";
import { statusTone } from "./Governance";

const OPTIONS: VoteOption[] = ["VOTE_OPTION_YES", "VOTE_OPTION_NO", "VOTE_OPTION_NO_WITH_VETO", "VOTE_OPTION_ABSTAIN"];
const COLORS: Record<VoteOption, string> = {
  VOTE_OPTION_YES: "bg-success",
  VOTE_OPTION_NO: "bg-danger",
  VOTE_OPTION_NO_WITH_VETO: "bg-rust-dark",
  VOTE_OPTION_ABSTAIN: "bg-muted",
};

function tallyShares(t: TallyResult): Record<VoteOption, number> {
  const v = { VOTE_OPTION_YES: Number(t.yes), VOTE_OPTION_NO: Number(t.no), VOTE_OPTION_NO_WITH_VETO: Number(t.noWithVeto), VOTE_OPTION_ABSTAIN: Number(t.abstain) };
  const total = Object.values(v).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(v).map(([k, n]) => [k, n / total])) as Record<VoteOption, number>;
}

export function ProposalPage() {
  const { chainId = "", proposalId = "" } = useParams();
  const chain = useAllChains().find((c) => c.chainId === chainId);
  if (!chain || !/^\d+$/.test(proposalId)) return <Navigate to="/governance" replace />;
  return <ProposalInner chain={chain} id={proposalId} />;
}

function ProposalInner({ chain, id }: { chain: ChainInfo; id: string }) {
  const t = useT();
  const locale = useLocale();
  const address = useAddress(chain);
  const proposal = useProposal(chain, id);
  const p = proposal.data;
  const voting = p?.status === "PROPOSAL_STATUS_VOTING_PERIOD";
  const live = useLiveTally(chain, id, voting);
  const myVote = useMyVote(chain, id, address);
  const tally = (voting ? live.data : p?.tally) ?? p?.tally;
  const shares = tally ? tallyShares(tally) : undefined;

  const vote = (option: VoteOption) =>
    address &&
    requestTx({
      chain,
      title: t("gov.voteTitle", { id }),
      msgs: [msg.vote(address, id, option)],
    });

  return (
    <div className="space-y-6">
      <Link to="/governance" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> {t("gov.title")}
      </Link>
      {!p ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <PageHeader
            title={p.title}
            subtitle={
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono">#{p.id}</span>
                <Badge tone={statusTone(p.status)}>{t(`gov.status.${p.status}` as MessageKey)}</Badge>
                <span>{chain.chainName}</span>
              </span>
            }
          />
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <Card>
              <CardHeader title={t("gov.description")} />
              <div className="whitespace-pre-wrap break-words px-5 py-4 text-sm leading-relaxed">{p.summary || "—"}</div>
              {p.messageTypes.length > 0 && (
                <div className="border-t border-line px-5 py-3 text-xs text-muted">
                  {p.messageTypes.map((m) => <div key={m} className="font-mono">{m}</div>)}
                </div>
              )}
            </Card>
            <div className="space-y-6">
              {voting && (
                <Card className="p-5">
                  <h2 className="font-semibold">{t("gov.castVote")}</h2>
                  {myVote.data && (
                    <p className="mt-1 text-sm text-muted">{t("gov.voted", { option: t(`gov.option.${myVote.data}` as MessageKey) })}</p>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {OPTIONS.map((o) => (
                      <Button key={o} variant={myVote.data === o ? "dark" : "secondary"} onClick={() => vote(o)} icon={myVote.data === o ? <Check className="size-4" /> : undefined}>
                        {t(`gov.option.${o}` as MessageKey)}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted">{t("gov.changeVote")}</p>
                </Card>
              )}
              <Card className="p-5">
                <h2 className="font-semibold">{voting ? t("gov.currentTally") : t("gov.finalTally")}</h2>
                {shares ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                      {OPTIONS.map((o) => <div key={o} className={COLORS[o]} style={{ width: `${shares[o] * 100}%` }} />)}
                    </div>
                    {OPTIONS.map((o) => (
                      <div key={o} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2"><span className={cx("size-2.5 rounded-full", COLORS[o])} />{t(`gov.option.${o}` as MessageKey)}</span>
                        <span className="tabular font-semibold">{(shares[o] * 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">—</p>
                )}
              </Card>
              <Card className="space-y-2 p-5 text-sm">
                {p.submitTime && <div className="flex justify-between"><span className="text-muted">{t("gov.submittedAt")}</span><span>{formatDateTime(p.submitTime, locale)}</span></div>}
                {p.votingStart && new Date(p.votingStart).getFullYear() > 1970 && <div className="flex justify-between"><span className="text-muted">{t("gov.votingStart")}</span><span>{formatDateTime(p.votingStart, locale)}</span></div>}
                {p.votingEnd && new Date(p.votingEnd).getFullYear() > 1970 && <div className="flex justify-between"><span className="text-muted">{t("gov.votingEnd")}</span><span>{formatDateTime(p.votingEnd, locale)}</span></div>}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
