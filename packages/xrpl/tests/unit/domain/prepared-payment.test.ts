import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import type {
  FeeResponse,
  PathsResponse,
  ReadinessResponse,
} from "../../../src/domain/api-types.js";
import {
  buildPreparedPayment,
  PaymentNotReadyError,
  type PaymentIntent,
} from "../../../src/domain/prepared-payment.js";

const SOURCE = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const DESTINATION = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const RLUSD_HEX = "524C555344000000000000000000000000000000";

function meta(ledgerIndex: number, asOf = "2026-10-18T10:00:00.000Z") {
  return {
    ledger_index: ledgerIndex,
    as_of: asOf,
    age_seconds: 2,
    cache: "miss" as const,
    stale: false,
  };
}

function readiness(ledgerIndex = 104_200_050, amount = "10"): ReadinessResponse {
  return {
    verdict: "ready",
    reasons: [],
    warnings: [],
    checks_failed: [],
    spendable_xrp: "250.5",
    transfer_fee_pct: null,
    source: SOURCE,
    destination: DESTINATION,
    asset: "XRP",
    amount,
    destination_tag: 12345,
    meta: meta(ledgerIndex),
  } satisfies ReadinessResponse;
}

function fee(
  ledgerIndex = 104_200_052,
  tiers: { economy: string; standard: string; priority: string } = {
    economy: "10",
    standard: "12",
    priority: "5000",
  },
): FeeResponse {
  return {
    fee: tiers,
    congestion: { score: 0.12, band: "low", load_factor_assumed: false },
    base_fee: "10",
    median_fee: "11",
    minimum_fee: "10",
    open_ledger_fee: "10",
    current_queue_size: "0",
    max_queue_size: "2000",
    meta: meta(ledgerIndex),
  } satisfies FeeResponse;
}

function paths(ledgerIndex = 104_200_051): PathsResponse {
  return {
    alternatives: [
      {
        source_amount: { asset: `USD.${SOURCE}`, value: "1.394" },
        paths_count: 1,
        paths: [[{ currency: "XRP" }]],
      },
    ],
    paths_may_be_non_optimal: true,
    warnings: [],
    meta: meta(ledgerIndex),
  } satisfies PathsResponse;
}

function catchError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

const xrpIntent: PaymentIntent = {
  source: SOURCE,
  destination: DESTINATION,
  asset: "XRP",
  amount: "10",
  destinationTag: 12345,
};

describe("buildPreparedPayment", () => {
  it("Same-asset XRP payment", () => {
    const result = buildPreparedPayment(xrpIntent, readiness(), null, fee());
    expect(result.transaction).toEqual({
      TransactionType: "Payment",
      Account: SOURCE,
      Destination: DESTINATION,
      Amount: "10000000",
      DestinationTag: 12345,
      Fee: "12",
      Flags: 0,
    });
    expect(result.transaction).not.toHaveProperty("SendMax");
    expect(result.transaction).not.toHaveProperty("Paths");
    expect(result.path).toBeNull();
  });

  it("returns the chosen fee and the oldest meta of the answers used", () => {
    const result = buildPreparedPayment(
      xrpIntent,
      readiness(104_200_050),
      paths(104_200_040),
      fee(104_200_052),
    );
    expect(result.fee).toEqual({ tier: "standard", drops: "12", congestionBand: "low" });
    expect(result.meta).toEqual(meta(104_200_040));
    expect(result.readiness).toEqual(readiness(104_200_050));
  });

  it("takes the oldest meta from readiness when it has the smallest ledger index", () => {
    const result = buildPreparedPayment(xrpIntent, readiness(104_200_010), null, fee(104_200_052));
    expect(result.meta).toEqual(meta(104_200_010));
  });

  it("Issued-currency amount", () => {
    const result = buildPreparedPayment(
      { ...xrpIntent, asset: `USD.${DESTINATION}`, amount: "25.5" },
      readiness(),
      null,
      fee(),
    );
    expect(result.transaction.Amount).toEqual({
      currency: "USD",
      issuer: DESTINATION,
      value: "25.5",
    });
  });

  it("Currency code longer than three characters", () => {
    const result = buildPreparedPayment(
      { ...xrpIntent, asset: `RLUSD.${RLUSD_ISSUER}`, amount: "5" },
      readiness(),
      null,
      fee(),
    );
    expect(result.transaction.Amount).toEqual({
      currency: RLUSD_HEX,
      issuer: RLUSD_ISSUER,
      value: "5",
    });
  });

  it("Path found", () => {
    const found = paths();
    const result = buildPreparedPayment(
      {
        ...xrpIntent,
        amount: "1",
        sourceAsset: `USD.${SOURCE}`,
        sendMaxTolerancePct: "1",
      },
      readiness(),
      found,
      fee(),
    );
    expect(result.transaction.SendMax).toEqual({
      currency: "USD",
      issuer: SOURCE,
      value: "1.40794",
    });
    expect(result.transaction.Paths).toEqual(found.alternatives[0]?.paths);
    expect(result.path).toEqual(found.alternatives[0]);
  });

  it("Fee above the cap", () => {
    const error = catchError(() =>
      buildPreparedPayment(
        { ...xrpIntent, feeTier: "priority", maxFeeDrops: "1000" },
        readiness(),
        null,
        fee(),
      ),
    );
    expect(error).toBeInstanceOf(PaymentNotReadyError);
    expect((error as PaymentNotReadyError).code).toBe("fee-over-cap");
  });

  it("Precision kept", () => {
    const result = buildPreparedPayment(
      { ...xrpIntent, amount: "0.000001" },
      readiness(104_200_050, "0.000001"),
      null,
      fee(),
    );
    expect(result.transaction.Amount).toBe("1");
  });

  it("Too many decimals", () => {
    const error = catchError(() =>
      buildPreparedPayment(
        { ...xrpIntent, amount: "0.0000001" },
        readiness(104_200_050, "0.0000001"),
        null,
        fee(),
      ),
    );
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect((error as CriptonValidationError).code).toBe("invalid-input");
    expect((error as CriptonValidationError).field).toBe("amount");
  });
});
