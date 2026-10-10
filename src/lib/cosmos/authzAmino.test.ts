import { makeSignDoc, serializeSignDoc } from "@cosmjs/amino";
import { fromUtf8 } from "@cosmjs/encoding";
import { describe, expect, it } from "vitest";
import { timestampFromAmino, timestampToAmino } from "./authzAmino";
import { aminoTypes, msg, registry } from "./tx";

const GRANTER = "chihuahua19rl4cm2hmr8afy4kldpxz3fka4jguq0al4qn7h";
const GRANTEE = "chihuahua1grantee";
const VALOPER = "chihuahuavaloper1validator";
const EXPIRES = Date.UTC(2027, 9, 10, 12, 0, 0) / 1000;

describe("authz amino converters", () => {
  it("render REStake grants exactly as the SDK aminojson encoder does", () => {
    const amino = msg.grantRestake(GRANTER, GRANTEE, VALOPER, EXPIRES).map((m) => aminoTypes.toAmino(m));
    const doc = makeSignDoc(amino, { amount: [], gas: "200000" }, "chihuahua-1", "", 1, 2);
    const msgs = JSON.stringify(JSON.parse(fromUtf8(serializeSignDoc(doc))).msgs);
    expect(msgs).toBe(
      JSON.stringify([
        {
          type: "cosmos-sdk/MsgGrant",
          value: {
            grant: {
              authorization: {
                type: "cosmos-sdk/StakeAuthorization",
                value: {
                  Validators: { type: "cosmos-sdk/StakeAuthorization/AllowList", value: { allow_list: { address: [VALOPER] } } },
                  authorization_type: 1,
                },
              },
              expiration: "2027-10-10T12:00:00Z",
            },
            grantee: GRANTEE,
            granter: GRANTER,
          },
        },
        {
          type: "cosmos-sdk/MsgGrant",
          value: {
            grant: {
              authorization: { type: "cosmos-sdk/GenericAuthorization", value: { msg: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward" } },
              expiration: "2027-10-10T12:00:00Z",
            },
            grantee: GRANTEE,
            granter: GRANTER,
          },
        },
      ]),
    );
  });

  it("round-trip to the same protobuf bytes, since the signed body is rebuilt from amino", () => {
    const msgs = [...msg.grantRestake(GRANTER, GRANTEE, VALOPER, EXPIRES), ...msg.revokeRestake(GRANTER, GRANTEE)];
    for (const m of msgs) {
      const back = aminoTypes.fromAmino(aminoTypes.toAmino(m));
      expect(back.typeUrl).toBe(m.typeUrl);
      expect(registry.encode(back)).toEqual(registry.encode(m));
    }
  });

  it("render MsgRevoke with snake_case fields", () => {
    expect(aminoTypes.toAmino(msg.revokeRestake(GRANTER, GRANTEE)[0])).toEqual({
      type: "cosmos-sdk/MsgRevoke",
      value: { granter: GRANTER, grantee: GRANTEE, msg_type_url: "/cosmos.staking.v1beta1.MsgDelegate" },
    });
  });

  it("format timestamps like Go's RFC3339 / RFC3339Nano", () => {
    expect(timestampToAmino({ seconds: 0n, nanos: 0 })).toBe("1970-01-01T00:00:00Z");
    expect(timestampToAmino({ seconds: 1n, nanos: 500_000_000 })).toBe("1970-01-01T00:00:01.5Z");
    expect(timestampToAmino({ seconds: 1n, nanos: 123 })).toBe("1970-01-01T00:00:01.000000123Z");
    expect(timestampFromAmino("1970-01-01T00:00:01.000000123Z")).toEqual({ seconds: 1n, nanos: 123 });
    expect(timestampFromAmino("2027-10-10T12:00:00Z")).toEqual({ seconds: BigInt(EXPIRES), nanos: 0 });
  });
});
