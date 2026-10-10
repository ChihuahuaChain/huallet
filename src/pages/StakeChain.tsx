import { AlertTriangle, ArrowLeft, ArrowUpDown, Clock, ExternalLink, Repeat, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Amount, Fiat } from "@/components/Amount";
import { PageHeader } from "@/components/layout/AppShell";
import { requestTx } from "@/components/TxModal";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Monogram, Select, Skeleton, Tabs, TokenIcon, cx } from "@/components/ui";
import {
  useAddress,
  useApr,
  useBalanceOf,
  useDelegations,
  useGrants,
  useValidatorLogos,
  usePrices,
  useRestakeOperators,
  useRewards,
  useStakingInfo,
  useUnbondings,
  useValidators,
} from "@/hooks/queries";
import { useLocale, useT } from "@/i18n";
import { feeCurrencyOf, stakeCurrencyOf, type ChainInfo } from "@/lib/chains/types";
import type { RestakeOperator, Validator } from "@/lib/cosmos/rest";
import { computeFee, msg, RESTAKE_GRANT_DURATION_SECONDS } from "@/lib/cosmos/tx";
import { formatDateTime, formatPercent, fromBaseUnits, timeUntil, toBaseUnits, toNumber } from "@/lib/format";
import { useAllChains } from "@/state/chains";

const STAKE_AUTHORIZATION_TYPE = "/cosmos.staking.v1beta1.StakeAuthorization";

type Mode = "delegate" | "undelegate" | "redelegate";

/** A validator's registry logo, falling back to a monogram when missing or it fails to load. */
function ValidatorAvatar({ moniker, logo, size = 36 }: { moniker: string; logo?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (logo && !broken) {
    return (
      <img
        src={logo}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full bg-surface-2 object-cover"
      />
    );
  }
  return <Monogram text={moniker} size={size} />;
}

function safeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  const url = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    const p = new URL(url);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : undefined;
  } catch {
    return undefined;
  }
}

function feeReserve(chain: ChainInfo): bigint {
  return BigInt(computeFee(feeCurrencyOf(chain), "high", 400_000).amount[0].amount);
}

export function StakeChain() {
  const { chainId = "" } = useParams();
  const chain = useAllChains().find((c) => c.chainId === chainId);
  if (!chain) return <Navigate to="/stake" replace />;
  return <StakeChainInner chain={chain} />;
}

function StakeChainInner({ chain }: { chain: ChainInfo }) {
  const t = useT();
  const locale = useLocale();
  const cur = stakeCurrencyOf(chain);
  const address = useAddress(chain);
  const validators = useValidators(chain);
  const logos = useValidatorLogos(chain);
  const delegations = useDelegations(chain, address);
  const rewards = useRewards(chain, address);
  const unbondings = useUnbondings(chain, address);
  const info = useStakingInfo(chain);
  const apr = useApr(chain);
  const available = useBalanceOf(chain, address, cur.coinMinimalDenom);
  const price = usePrices(cur.coinGeckoId ? [cur.coinGeckoId] : []).data?.[cur.coinGeckoId ?? ""];
  const operators = useRestakeOperators(chain);
  const grants = useGrants(chain, address);

  const [filter, setFilter] = useState<"active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"power" | "commission" | "name">("power");
  const [action, setAction] = useState<{ mode: Mode; validator: Validator } | null>(null);
  const [restake, setRestake] = useState<{ operator: RestakeOperator; valoper: string; active: boolean } | null>(null);

  const byAddr = useMemo(() => new Map((validators.data ?? []).map((v) => [v.operator_address, v])), [validators.data]);
  const bonded = useMemo(() => (validators.data ?? []).filter((v) => v.status === "BOND_STATUS_BONDED"), [validators.data]);
  const totalPower = useMemo(() => bonded.reduce((s, v) => s + BigInt(v.tokens), 0n), [bonded]);
  const rank = useMemo(() => {
    const sorted = [...bonded].sort((a, b) => (BigInt(b.tokens) > BigInt(a.tokens) ? 1 : -1));
    return new Map(sorted.map((v, i) => [v.operator_address, i + 1]));
  }, [bonded]);

  const rewardOf = (valAddr: string) => {
    const r = rewards.data?.rewards.find((x) => x.validator_address === valAddr)?.reward.find((c) => c.denom === cur.coinMinimalDenom);
    return BigInt((r?.amount ?? "0").split(".")[0]);
  };

  const myDelegations = (delegations.data ?? []).filter((d) => BigInt(d.balance.amount) > 0n);
  const totalStaked = myDelegations.reduce((s, d) => s + BigInt(d.balance.amount), 0n);
  const totalRewards = BigInt((rewards.data?.total.find((c) => c.denom === cur.coinMinimalDenom)?.amount ?? "0").split(".")[0]);
  const validatorsWithRewards = (rewards.data?.rewards ?? []).filter((r) => rewardOf(r.validator_address) > 0n).map((r) => r.validator_address);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (validators.data ?? [])
      .filter((v) => (filter === "active" ? v.status === "BOND_STATUS_BONDED" : v.status !== "BOND_STATUS_BONDED"))
      .filter((v) => !q || v.description.moniker.toLowerCase().includes(q) || v.operator_address.includes(q))
      .sort((a, b) => {
        if (sort === "commission") return Number(a.commission.commission_rates.rate) - Number(b.commission.commission_rates.rate);
        if (sort === "name") return a.description.moniker.localeCompare(b.description.moniker);
        return BigInt(b.tokens) > BigInt(a.tokens) ? 1 : -1;
      });
  }, [validators.data, filter, search, sort]);

  const operatorByValoper = useMemo(() => new Map((operators.data ?? []).map((o) => [o.valoper, o])), [operators.data]);
  const restakeActive = (valoper: string) => {
    const op = operatorByValoper.get(valoper);
    if (!op) return false;
    return (grants.data ?? []).some(
      (g) => g.grantee === op.botAddress && g.type === STAKE_AUTHORIZATION_TYPE && (!g.allowList || g.allowList.includes(valoper)),
    );
  };

  // When fees are paid in the staking token, keep enough back to cover them: trim the re-staked
  // amount only by the shortfall the current balance can't already cover, so a funded account
  // re-stakes the full reward.
  const sameFeeDenom = feeCurrencyOf(chain).coinMinimalDenom === cur.coinMinimalDenom;
  const restakeShortfall = sameFeeDenom && available < feeReserve(chain) ? feeReserve(chain) - available : 0n;
  const restakeAmountOf = (r: bigint) => (r > restakeShortfall ? r - restakeShortfall : 0n);

  const fiat = (x: bigint) => (price === undefined ? undefined : toNumber(x, cur.coinDecimals) * price);
  const claim = (vals: string[]) =>
    address &&
    requestTx({ chain, title: t("stake.claimTitle", { chain: chain.chainName }), msgs: vals.map((v) => msg.withdrawRewards(address, v)) });
  const claimRestake = (vals: string[]) => {
    if (!address) return;
    const msgs = vals.flatMap((v) => {
      const amt = restakeAmountOf(rewardOf(v));
      return amt > 0n ? msg.claimAndRestake(address, v, cur.coinMinimalDenom, amt) : [];
    });
    if (msgs.length) requestTx({ chain, title: t("stake.claimRestakeTitle", { chain: chain.chainName }), msgs });
  };

  return (
    <div className="space-y-6">
      <Link to="/stake" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> {t("stake.title")}
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <TokenIcon src={chain.chainSymbolImageUrl} symbol={chain.chainName} size={40} />
            {t("stake.chainTitle", { chain: chain.chainName })}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {!!apr.data && <span>{t("stake.apr")}: <b className="text-success">{formatPercent(apr.data, locale, 2)}</b></span>}
            {info.data && <span>{t("stake.unbondingPeriod")}: <b className="text-fg">{t("common.days", { n: Math.round(info.data.unbondingTimeSeconds / 86400) })}</b></span>}
          </span>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="text-sm text-muted">{t("stake.available")}</div>
          <Amount amount={available} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="mt-1 block truncate text-2xl font-semibold" />
          <Fiat value={fiat(available)} className="text-sm text-muted" />
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted">{t("stake.staked")}</div>
          <Amount amount={totalStaked} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="mt-1 block truncate text-2xl font-semibold" />
          <Fiat value={fiat(totalStaked)} className="text-sm text-muted" />
        </Card>
        <Card className="bg-huahua-300/25 p-5 dark:bg-surface">
          <div className="text-sm text-muted">{t("stake.rewards")}</div>
          <Amount amount={totalRewards} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="mt-1 block truncate text-2xl font-semibold" />
          <Fiat value={fiat(totalRewards)} className="text-sm text-muted" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={validatorsWithRewards.length === 0} onClick={() => claim(validatorsWithRewards)}>
              {t("stake.claimAll")}
            </Button>
            <Button size="sm" variant="secondary" disabled={validatorsWithRewards.length === 0} onClick={() => claimRestake(validatorsWithRewards)}>
              {t("stake.claimRestakeAll")}
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("stake.myDelegations")} />
        <div className="divide-y divide-line p-2">
          {delegations.isLoading && <Skeleton className="m-3 h-12" />}
          {!delegations.isLoading && myDelegations.length === 0 && (
            <EmptyState title={t("stake.noDelegations")}>{t("stake.noDelegationsBody", { symbol: cur.coinDenom })}</EmptyState>
          )}
          {myDelegations.map((d) => {
            const valoper = d.delegation.validator_address;
            const v = byAddr.get(valoper);
            const r = rewardOf(valoper);
            const op = operatorByValoper.get(valoper);
            const active = restakeActive(valoper);
            return (
              <div key={valoper} className="px-3 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <ValidatorAvatar moniker={v?.description.moniker ?? "?"} logo={logos.data?.[valoper]} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="truncate">{v?.description.moniker ?? valoper}</span>
                      {v?.jailed && <Badge tone="danger" className="shrink-0 whitespace-nowrap">{t("stake.jailed")}</Badge>}
                      {v && v.status !== "BOND_STATUS_BONDED" && !v.jailed && <Badge tone="warning" className="shrink-0 whitespace-nowrap">{t("stake.inactive")}</Badge>}
                    </div>
                    <div className="text-xs text-muted">
                      {t("stake.rewards")}: <Amount amount={r} decimals={cur.coinDecimals} symbol={cur.coinDenom} />
                    </div>
                  </div>
                  <Amount amount={d.balance.amount} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="font-semibold" />
                  <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
                    {v && !v.jailed && <Button size="sm" onClick={() => setAction({ mode: "delegate", validator: v })}>{t("stake.delegate")}</Button>}
                    {v && <Button size="sm" variant="secondary" onClick={() => setAction({ mode: "undelegate", validator: v })}>{t("stake.undelegate")}</Button>}
                    {v && <Button size="sm" variant="secondary" onClick={() => setAction({ mode: "redelegate", validator: v })}>{t("stake.redelegate")}</Button>}
                    <Button size="sm" variant="ghost" disabled={r === 0n} onClick={() => claim([valoper])}>{t("stake.claim")}</Button>
                    {!active && (
                      <Button size="sm" variant="ghost" disabled={restakeAmountOf(r) === 0n} onClick={() => claimRestake([valoper])}>{t("stake.claimRestake")}</Button>
                    )}
                  </div>
                </div>
                {op && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                    <Repeat className="size-3.5 text-muted" />
                    <span className="font-medium">{t("stake.autocompound")}</span>
                    {active ? (
                      <Badge tone="success">{t("stake.autocompoundOnFreq", { freq: op.runTime })}</Badge>
                    ) : (
                      <span className="text-muted">{t("stake.autocompoundOff")}</span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={active ? "secondary" : "primary"}
                        onClick={() => setRestake({ operator: op, valoper, active })}
                      >
                        {active ? t("stake.autocompoundDisable") : t("stake.autocompoundEnable")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {(unbondings.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader title={t("stake.unbonding")} subtitle={t("stake.unbondingBody")} />
          <div className="divide-y divide-line p-2">
            {unbondings.data!.flatMap((u) =>
              u.entries.map((e, i) => (
                <div key={`${u.validator_address}-${i}`} className="flex items-center gap-3 px-3 py-3">
                  <Clock className="size-5 text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{byAddr.get(u.validator_address)?.description.moniker ?? u.validator_address}</div>
                    <div className="text-xs text-muted" title={formatDateTime(e.completion_time, locale)}>
                      {t("stake.completes", { when: timeUntil(e.completion_time, locale) })}
                    </div>
                  </div>
                  <Amount amount={e.balance} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="font-semibold" />
                </div>
              )),
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={t("stake.validators")} subtitle={t("stake.validatorsBody")} />
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          <Tabs value={filter} onChange={setFilter} items={[{ value: "active", label: t("stake.active") }, { value: "inactive", label: t("stake.inactive") }]} />
          <div className="min-w-48 flex-1">
            <Input className="h-9" placeholder={t("stake.searchValidator")} value={search} onChange={(e) => setSearch(e.target.value)} right={<Search className="mr-2 size-4 text-muted" />} />
          </div>
          <Select className="h-9 w-auto! min-w-40" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t("common.sort")}>
            <option value="power">{t("stake.sort.power")}</option>
            <option value="commission">{t("stake.sort.commission")}</option>
            <option value="name">{t("stake.sort.name")}</option>
          </Select>
        </div>
        <div className="mt-2 divide-y divide-line p-2">
          {validators.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-3 h-12" />)}
          {list.map((v) => {
            const power = totalPower > 0n ? Number((BigInt(v.tokens) * 100_000n) / totalPower) / 1000 : 0;
            const r = rank.get(v.operator_address);
            const web = safeUrl(v.description.website);
            return (
              <div key={v.operator_address} className="flex items-center gap-2.5 px-2 py-3 sm:gap-3 sm:px-3">
                <span className="w-6 shrink-0 text-right text-xs text-muted tabular sm:w-7">{r ?? "—"}</span>
                <ValidatorAvatar moniker={v.description.moniker} logo={logos.data?.[v.operator_address]} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{v.description.moniker}</span>
                    {web && (
                      <a href={web} target="_blank" rel="noopener noreferrer nofollow" className="text-muted hover:text-fg" aria-label="website">
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                    {v.jailed && <Badge tone="danger" className="shrink-0 whitespace-nowrap">{t("stake.jailed")}</Badge>}
                  </div>
                  {/* Each stat wraps as a whole: in the narrow popup they stack instead of breaking word by word. */}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span className="whitespace-nowrap">{t("stake.votingPower")}: {power.toLocaleString(locale, { maximumFractionDigits: 2 })}%</span>
                    <span className="whitespace-nowrap">{t("stake.commission")}: {formatPercent(Number(v.commission.commission_rates.rate), locale, 2)}</span>
                  </div>
                </div>
                {/* A jailed validator earns nothing and can be slashed again: no new stake, only exits. */}
                {!v.jailed && (
                  <Button size="sm" className="shrink-0" variant={filter === "active" ? "primary" : "secondary"} onClick={() => setAction({ mode: "delegate", validator: v })}>
                    {t("stake.delegate")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {action && address && (
        <StakeModal
          chain={chain}
          address={address}
          mode={action.mode}
          validator={action.validator}
          validators={bonded}
          rank={rank.get(action.validator.operator_address)}
          available={available}
          delegated={BigInt(myDelegations.find((d) => d.delegation.validator_address === action.validator.operator_address)?.balance.amount ?? "0")}
          unbondingDays={info.data ? Math.round(info.data.unbondingTimeSeconds / 86400) : undefined}
          onClose={() => setAction(null)}
        />
      )}

      {restake && address && (
        <RestakeModal
          chain={chain}
          address={address}
          operator={restake.operator}
          valoper={restake.valoper}
          active={restake.active}
          onClose={() => setRestake(null)}
        />
      )}
    </div>
  );
}

function RestakeModal({
  chain,
  address,
  operator,
  valoper,
  active,
  onClose,
}: {
  chain: ChainInfo;
  address: string;
  operator: RestakeOperator;
  valoper: string;
  active: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const expiryEpoch = Math.floor(Date.now() / 1000) + RESTAKE_GRANT_DURATION_SECONDS;
  const titleKey = active ? "stake.autocompoundDisableTitle" : "stake.autocompoundEnableTitle";

  const confirm = () => {
    const msgs = active
      ? msg.revokeRestake(address, operator.botAddress)
      : msg.grantRestake(address, operator.botAddress, valoper, expiryEpoch);
    onClose();
    requestTx({ chain, title: t(titleKey, { validator: operator.moniker }), msgs });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t(titleKey, { validator: operator.moniker })}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>{t("common.cancel")}</Button>
          <Button block onClick={confirm}>{t("common.continue")}</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {active ? (
          <p>{t("stake.autocompoundDisableBody", { validator: operator.moniker })}</p>
        ) : (
          <>
            <p>{t("stake.autocompoundBody", { validator: operator.moniker, freq: operator.runTime })}</p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>{t("stake.autocompoundPoint1")}</li>
              <li>{t("stake.autocompoundPoint2")}</li>
              <li>{t("stake.autocompoundPoint3", { date: formatDateTime(new Date(expiryEpoch * 1000).toISOString(), locale) })}</li>
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

function StakeModal({
  chain,
  address,
  mode: initialMode,
  validator,
  validators,
  rank,
  available,
  delegated,
  unbondingDays,
  onClose,
}: {
  chain: ChainInfo;
  address: string;
  mode: Mode;
  validator: Validator;
  validators: Validator[];
  rank?: number;
  available: bigint;
  delegated: bigint;
  unbondingDays?: number;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const cur = stakeCurrencyOf(chain);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [amount, setAmount] = useState("");
  const [dest, setDest] = useState("");

  const sameFeeDenom = feeCurrencyOf(chain).coinMinimalDenom === cur.coinMinimalDenom;
  const maxDelegate = sameFeeDenom ? (available > feeReserve(chain) ? available - feeReserve(chain) : 0n) : available;
  const max = mode === "delegate" ? maxDelegate : delegated;

  let parsed: bigint | null = null;
  let error = "";
  if (amount) {
    try {
      parsed = toBaseUnits(amount, cur.coinDecimals);
      if (parsed <= 0n) error = t("send.error.zero");
      else if (parsed > max) error = t("send.error.exceeds");
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  const destValidator = validators.find((v) => v.operator_address === dest);
  const valid = parsed !== null && !error && (mode !== "redelegate" || !!destValidator) && !(mode === "delegate" && validator.jailed);
  const commission = Number(validator.commission.commission_rates.rate);

  const submit = () => {
    if (!valid || parsed === null) return;
    const m =
      mode === "delegate"
        ? msg.delegate(address, validator.operator_address, cur.coinMinimalDenom, parsed)
        : mode === "undelegate"
          ? msg.undelegate(address, validator.operator_address, cur.coinMinimalDenom, parsed)
          : msg.redelegate(address, validator.operator_address, dest, cur.coinMinimalDenom, parsed);
    onClose();
    requestTx({
      chain,
      title: t(`stake.${mode}Title`, { validator: validator.description.moniker }),
      msgs: [m],
    });
  };

  const tabs: Array<{ value: Mode; label: string }> = validator.jailed ? [] : [{ value: "delegate", label: t("stake.delegate") }];
  if (delegated > 0n) tabs.push({ value: "undelegate", label: t("stake.undelegate") }, { value: "redelegate", label: t("stake.redelegate") });

  return (
    <Modal
      open
      onClose={onClose}
      title={validator.description.moniker}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>{t("common.cancel")}</Button>
          <Button block disabled={!valid} onClick={submit}>{t("common.continue")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {tabs.length > 1 && <Tabs value={mode} onChange={(m) => { setMode(m); setAmount(""); }} items={tabs} />}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="text-xs text-muted">{t("stake.commission")}</div>
            <div className="font-semibold">{formatPercent(commission, locale, 2)}</div>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="text-xs text-muted">{t("stake.yourDelegation")}</div>
            <Amount amount={delegated} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="font-semibold" />
          </div>
        </div>

        {mode === "redelegate" && (
          <Field label={t("stake.redelegateTo")}>
            <Select value={dest} onChange={(e) => setDest(e.target.value)}>
              <option value="">{t("stake.chooseValidator")}</option>
              {validators
                .filter((v) => v.operator_address !== validator.operator_address && !v.jailed)
                .sort((a, b) => a.description.moniker.localeCompare(b.description.moniker))
                .map((v) => (
                  <option key={v.operator_address} value={v.operator_address}>
                    {v.description.moniker} — {formatPercent(Number(v.commission.commission_rates.rate), locale, 1)}
                  </option>
                ))}
            </Select>
          </Field>
        )}

        <Field
          label={t("send.amount")}
          error={error}
          hint={
            <span>
              {mode === "delegate" ? t("stake.available") : t("stake.yourDelegation")}:{" "}
              <Amount amount={max} decimals={cur.coinDecimals} symbol={cur.coinDenom} />
            </span>
          }
        >
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(",", "."))}
            invalid={!!error}
            className="text-lg font-semibold tabular"
            right={
              <>
                <span className="text-sm text-muted">{cur.coinDenom}</span>
                <Button size="sm" variant="secondary" onClick={() => setAmount(fromBaseUnits(max, cur.coinDecimals))}>
                  {t("common.max")}
                </Button>
              </>
            }
          />
        </Field>

        {mode === "delegate" && rank !== undefined && rank <= 10 && (
          <Alert tone="info" icon={<ArrowUpDown className="size-4 text-muted" />} title={t("stake.decentralizeTitle")}>
            {t("stake.decentralizeBody", { rank })}
          </Alert>
        )}
        {mode === "delegate" && (validator.jailed || validator.status !== "BOND_STATUS_BONDED") && (
          <Alert tone="danger" icon={<AlertTriangle className="size-4 text-danger" />} title={t("stake.inactiveWarnTitle")}>
            {t("stake.inactiveWarnBody")}
          </Alert>
        )}
        {mode === "delegate" && commission >= 0.2 && (
          <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />}>{t("stake.highCommission")}</Alert>
        )}
        {mode === "undelegate" && (
          <Alert tone="warning" icon={<Clock className="size-4 text-warning" />} title={t("stake.undelegateWarnTitle")}>
            {t("stake.undelegateWarnBody", { days: unbondingDays ?? "?" })}
          </Alert>
        )}
        {mode === "redelegate" && (
          <Alert tone="info" icon={<ArrowUpDown className="size-4 text-muted" />}>{t("stake.redelegateInfo", { days: unbondingDays ?? "?" })}</Alert>
        )}
        <p className={cx("text-xs text-muted", mode !== "delegate" && "hidden")}>{t("stake.feeReserveNote")}</p>
      </div>
    </Modal>
  );
}
