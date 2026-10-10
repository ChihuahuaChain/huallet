import type { AminoConverters } from "@cosmjs/stargate";
import { GenericAuthorization } from "cosmjs-types/cosmos/authz/v1beta1/authz";
import type { MsgGrant, MsgRevoke } from "cosmjs-types/cosmos/authz/v1beta1/tx";
import type { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin";
import { StakeAuthorization } from "cosmjs-types/cosmos/staking/v1beta1/authz";
import type { Any } from "cosmjs-types/google/protobuf/any";
import type { Timestamp } from "cosmjs-types/google/protobuf/timestamp";

// Amino JSON for x/authz, as the SDK's aminojson encoder (v0.47+) renders it from the proto
// `amino.name` / `amino.oneof_name` options. Ledger accounts sign in this mode, so these must be
// byte-exact or the node rejects the signature. createDefaultAminoConverters() has no authz entry.

type AminoCoin = { denom: string; amount: string };
type AminoAuthorization =
  | { type: "cosmos-sdk/GenericAuthorization"; value: { msg: string } }
  | {
      type: "cosmos-sdk/StakeAuthorization";
      value: {
        max_tokens?: AminoCoin;
        // An unset oneof is still written, as null.
        Validators: {
          type: "cosmos-sdk/StakeAuthorization/AllowList" | "cosmos-sdk/StakeAuthorization/DenyList";
          value: { allow_list?: { address: string[] }; deny_list?: { address: string[] } };
        } | null;
        authorization_type?: number;
      };
    };

/** RFC 3339 in UTC, with fractional seconds only when non-zero (Go's time.RFC3339Nano trimming). */
export function timestampToAmino(t: Timestamp): string {
  const iso = new Date(Number(t.seconds) * 1000).toISOString().replace(/\.\d{3}Z$/, "");
  const frac = t.nanos ? `.${String(t.nanos).padStart(9, "0").replace(/0+$/, "")}` : "";
  return `${iso}${frac}Z`;
}

export function timestampFromAmino(s: string): Timestamp {
  const m = /^(.*?)(?:\.(\d{1,9}))?Z$/.exec(s);
  if (!m) throw new Error(`Invalid amino timestamp: ${s}`);
  const ms = Date.parse(`${m[1]}Z`);
  if (Number.isNaN(ms)) throw new Error(`Invalid amino timestamp: ${s}`);
  return { seconds: BigInt(Math.floor(ms / 1000)), nanos: m[2] ? Number(m[2].padEnd(9, "0")) : 0 };
}

const coinToAmino = (c: Coin): AminoCoin => ({ denom: c.denom, amount: c.amount });

function authorizationToAmino(any: Any): AminoAuthorization {
  switch (any.typeUrl) {
    case "/cosmos.authz.v1beta1.GenericAuthorization":
      return { type: "cosmos-sdk/GenericAuthorization", value: { msg: GenericAuthorization.decode(any.value).msg } };
    case StakeAuthorization.typeUrl: {
      const a = StakeAuthorization.decode(any.value);
      const value: Extract<AminoAuthorization, { type: "cosmos-sdk/StakeAuthorization" }>["value"] = {
        Validators: a.allowList
          ? { type: "cosmos-sdk/StakeAuthorization/AllowList", value: { allow_list: { address: a.allowList.address } } }
          : a.denyList
            ? { type: "cosmos-sdk/StakeAuthorization/DenyList", value: { deny_list: { address: a.denyList.address } } }
            : null,
      };
      if (a.maxTokens) value.max_tokens = coinToAmino(a.maxTokens);
      if (a.authorizationType) value.authorization_type = a.authorizationType;
      return { type: "cosmos-sdk/StakeAuthorization", value };
    }
    default:
      throw new Error(`Authorization ${any.typeUrl} has no Amino encoding`);
  }
}

function authorizationFromAmino(a: AminoAuthorization): Any {
  switch (a.type) {
    case "cosmos-sdk/GenericAuthorization":
      return {
        typeUrl: "/cosmos.authz.v1beta1.GenericAuthorization",
        value: GenericAuthorization.encode(GenericAuthorization.fromPartial({ msg: a.value.msg })).finish(),
      };
    case "cosmos-sdk/StakeAuthorization": {
      const v = a.value;
      return {
        typeUrl: StakeAuthorization.typeUrl,
        value: StakeAuthorization.encode(
          StakeAuthorization.fromPartial({
            maxTokens: v.max_tokens,
            allowList: v.Validators?.value.allow_list,
            denyList: v.Validators?.value.deny_list,
            authorizationType: v.authorization_type ?? 0,
          }),
        ).finish(),
      };
    }
    default:
      throw new Error(`Unknown amino authorization ${(a as { type: string }).type}`);
  }
}

export function createAuthzAminoConverters(): AminoConverters {
  return {
    "/cosmos.authz.v1beta1.MsgGrant": {
      aminoType: "cosmos-sdk/MsgGrant",
      toAmino: ({ granter, grantee, grant }: MsgGrant) => {
        if (!grant?.authorization) throw new Error("MsgGrant without an authorization");
        return {
          granter,
          grantee,
          grant: {
            authorization: authorizationToAmino(grant.authorization),
            ...(grant.expiration ? { expiration: timestampToAmino(grant.expiration) } : {}),
          },
        };
      },
      fromAmino: (a: { granter: string; grantee: string; grant: { authorization: AminoAuthorization; expiration?: string } }): MsgGrant => ({
        granter: a.granter,
        grantee: a.grantee,
        grant: {
          authorization: authorizationFromAmino(a.grant.authorization),
          expiration: a.grant.expiration ? timestampFromAmino(a.grant.expiration) : undefined,
        },
      }),
    },
    "/cosmos.authz.v1beta1.MsgRevoke": {
      aminoType: "cosmos-sdk/MsgRevoke",
      toAmino: ({ granter, grantee, msgTypeUrl }: MsgRevoke) => ({ granter, grantee, msg_type_url: msgTypeUrl }),
      fromAmino: (a: { granter: string; grantee: string; msg_type_url: string }): MsgRevoke => ({
        granter: a.granter,
        grantee: a.grantee,
        msgTypeUrl: a.msg_type_url,
      }),
    },
  };
}
