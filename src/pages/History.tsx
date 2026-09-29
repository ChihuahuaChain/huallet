import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Coins, ExternalLink, Gift, History, Landmark, Repeat, Undo2, Zap, Rocket } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Amount } from "@/components/Amount";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui";
import { useAddress, useTxHistory } from "@/hooks/queries";
import { useLocale, useT, type MessageKey } from "@/i18n";
import { explorerTxUrl, type ChainInfo } from "@/lib/chains/types";
import type { Coin, TxResponse } from "@/lib/cosmos/rest";
import { formatDateTime, shortAddress } from "@/lib/format";
import { useSelectedChain } from "@/state/chains";

interface Row {
  kind: "send" | "receive" | "delegate" | "undelegate" | "redelegate" | "claim" | "vote" | "ibc" | "swap" | "curve-buy" | "curve-sell" | "contract" | "other";
  coin?: Coin;
  counterparty?: string;
  count: number;
}

const ICONS = {
  send: ArrowUpRight,
  receive: ArrowDownLeft,
  delegate: Coins,
  undelegate: Undo2,
  redelegate: Repeat,
  claim: Gift,
  vote: Landmark,
  ibc: ArrowLeftRight,
  swap: Repeat,
  "curve-buy": Rocket,
  "curve-sell": Rocket,
  contract: Zap,
  other: History,
} as const;

function describe(tx: TxResponse, me: string): Row {
  const msgs = tx.tx.body.messages;
  const m = msgs[0] ?? { "@type": "" };
  const type = m["@type"];
  const count = msgs.length;
  const coin0 = (x: unknown) => (Array.isArray(x) ? (x[0] as Coin) : (x as Coin | undefined));
  switch (type) {
    case "/cosmos.bank.v1beta1.MsgSend":
      return m.from_address === me
        ? { kind: "send", coin: coin0(m.amount), counterparty: String(m.to_address), count }
        : { kind: "receive", coin: coin0(m.amount), counterparty: String(m.from_address), count };
    case "/cosmos.staking.v1beta1.MsgDelegate":
      return { kind: "delegate", coin: coin0(m.amount), counterparty: String(m.validator_address), count };
    case "/cosmos.staking.v1beta1.MsgUndelegate":
      return { kind: "undelegate", coin: coin0(m.amount), counterparty: String(m.validator_address), count };
    case "/cosmos.staking.v1beta1.MsgBeginRedelegate":
      return { kind: "redelegate", coin: coin0(m.amount), counterparty: String(m.validator_dst_address), count };
    case "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward":
      return { kind: "claim", count };
    case "/cosmos.gov.v1beta1.MsgVote":
    case "/cosmos.gov.v1.MsgVote":
      return { kind: "vote", counterparty: `#${m.proposal_id}`, count };
    case "/ibc.applications.transfer.v1.MsgTransfer":
      return { kind: "ibc", coin: coin0(m.token), counterparty: String(m.receiver), count };
    case "/ibc.core.channel.v1.MsgRecvPacket":
      return { kind: "receive", count };
    case "/liquidity.v1beta1.MsgDirectSwap":
      return { kind: "swap", coin: coin0(m.offer_coin), count };
    case "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn":
      return { kind: "swap", coin: coin0(m.token_in), count };
    case "/osmosis.poolmanager.v1beta1.MsgSplitRouteSwapExactAmountIn": {
      const routes = (m.routes as Array<{ token_in_amount: string }> | undefined) ?? [];
      const amount = routes.reduce((sum, r) => sum + BigInt(r.token_in_amount || "0"), 0n);
      return { kind: "swap", coin: { denom: String(m.token_in_denom), amount: amount.toString() }, count };
    }
    case "/cosmwasm.wasm.v1.MsgExecuteContract": {
      const inner = m.msg as Record<string, unknown> | undefined;
      if (inner && "buy" in inner) return { kind: "curve-buy", coin: coin0(m.funds), counterparty: String(m.contract), count };
      if (inner && "sell" in inner) return { kind: "curve-sell", coin: coin0(m.funds), counterparty: String(m.contract), count };
      return { kind: "contract", counterparty: String(m.contract), count };
    }
    default:
      return { kind: "other", counterparty: type.split(".").pop(), count };
  }
}

function TxRow({ tx, chain, me }: { tx: TxResponse; chain: ChainInfo; me: string }) {
  const t = useT();
  const locale = useLocale();
  const row = describe(tx, me);
  const Icon = ICONS[row.kind];
  const cur = row.coin && chain.currencies.find((c) => c.coinMinimalDenom === row.coin!.denom);
  const url = explorerTxUrl(chain, tx.txhash);
  const Wrapper = url ? "a" : "div";
  return (
    <Wrapper
      {...(url ? { href: url, target: "_blank", rel: "noopener noreferrer" } : {})}
      className="group flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-2"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-huahua-300/40 text-ink dark:text-huahua-100">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-semibold">
          {t(`history.kind.${row.kind}` as MessageKey)}
          {row.count > 1 && <Badge>+{row.count - 1}</Badge>}
          {tx.code !== 0 && <Badge tone="danger">{t("history.failed")}</Badge>}
        </div>
        <div className="truncate text-xs text-muted">
          {row.counterparty && <span className="font-mono">{row.counterparty.length > 24 ? shortAddress(row.counterparty) : row.counterparty} · </span>}
          {formatDateTime(tx.timestamp, locale)}
        </div>
      </div>
      {row.coin && (
        <Amount
          amount={row.coin.amount}
          decimals={cur?.coinDecimals ?? 0}
          symbol={cur?.coinDenom ?? shortAddress(row.coin.denom, 6, 4)}
          className={row.kind === "receive" ? "font-semibold text-success" : "font-semibold"}
        />
      )}
      {url && <ExternalLink className="size-4 text-muted opacity-0 group-hover:opacity-100" />}
    </Wrapper>
  );
}

export function HistoryPage() {
  const t = useT();
  const chain = useSelectedChain();
  const address = useAddress(chain);
  const txs = useTxHistory(chain, address);
  return (
    <div className="space-y-6">
      <PageHeader title={t("history.title")} subtitle={t("history.subtitle", { chain: chain.chainName })} />
      <Card className="p-2">
        {txs.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-3 h-12" />)}
        {txs.isError && <p className="p-4 text-sm text-danger">{t("history.error")}</p>}
        {txs.data?.length === 0 && <EmptyState icon={<History className="size-8" />} title={t("history.empty")}>{t("history.emptyBody")}</EmptyState>}
        {address && txs.data?.map((tx) => <TxRow key={tx.txhash} tx={tx} chain={chain} me={address} />)}
      </Card>
    </div>
  );
}
