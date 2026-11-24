import { CriptonResponseError, CriptonValidationError } from "@criptonlabs/agent-apis-core";
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
import feeFixture from "../../fixtures/responses/fee.json" with { type: "json" };
import pathsFixture from "../../fixtures/responses/paths.json" with { type: "json" };
import readinessFixture from "../../fixtures/responses/payment-readiness.json" with { type: "json" };

const SOURCE = "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq";
const DESTINATION = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const ISSUER = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";

function meta(ledgerIndex: number, ledgerState: "validated" | "open" = "validated") {
  return {
    ledger_index: ledgerIndex,
    ledger_state: ledgerState,
    as_of: "2026-10-18T10:00:00.000Z",
    age_seconds: 2,
    cache: "miss" as const,
    stale: false,
  };
}

// 0.27.0 bodies: the recorded fixtures with the parties, amounts and tiers of each scenario.
function readiness(ledgerIndex = 104_200_050, amount = "10"): ReadinessResponse {
  return {
    ...readinessFixture,
    verdict: "ready",
    reasons: [],
    warnings: [],
    checks_failed: [],
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
  tiers: { economy_drops: string; standard_drops: string; priority_drops: string } = {
    economy_drops: "10",
    standard_drops: "12",
    priority_drops: "5000",
  },
): FeeResponse {
  return { ...feeFixture, fee: tiers, meta: meta(ledgerIndex, "open") } satisfies FeeResponse;
}

/** A 1 XRP path spending USD of the issuer (so any issuer). */
function paths(ledgerIndex = 104_200_051, value: string | null = "1.394"): PathsResponse {
  return {
    ...pathsFixture,
    paths_may_be_non_optimal: true,
    alternatives: [
      {
        source_amount: { asset: `USD.${ISSUER}`, value },
        source_any_issuer: true,
        paths_count: 1,
        paths: [[{ currency: "XRP" }]],
        effective_price: "1.394",
        cheapest: true,
        suggested_send_max: "1.40794",
      },
    ],
    source: SOURCE,
    destination: DESTINATION,
    asset: "XRP",
    amount: "1",
    source_assets: [`USD.${ISSUER}`],
    meta: meta(ledgerIndex),
  } satisfies PathsResponse;
}

const crossCurrencyIntent: PaymentIntent = {
  source: SOURCE,
  destination: DESTINATION,
  asset: "XRP",
  amount: "1",
  sourceAsset: `USD.${ISSUER}`,
  sendMaxTolerancePct: "1",
};

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

  it("keeps the case of a lower-case standard code in the Amount", () => {
    const result = buildPreparedPayment(
      { ...xrpIntent, asset: `usd.${DESTINATION}`, amount: "25.5" },
      readiness(),
      null,
      fee(),
    );
    expect(result.transaction.Amount).toEqual({
      currency: "usd",
      issuer: DESTINATION,
      value: "25.5",
    });
  });

  it("Currency code longer than three characters", () => {
    const error = catchError(() =>
      buildPreparedPayment(
        { ...xrpIntent, asset: `RLUSD.${RLUSD_ISSUER}`, amount: "5" },
        readiness(),
        null,
        fee(),
      ),
    );
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect((error as CriptonValidationError).code).toBe("invalid-input");
    expect((error as CriptonValidationError).field).toBe("asset");
  });

  it("Path found", () => {
    const found = paths();
    const result = buildPreparedPayment(
      { ...crossCurrencyIntent, destinationTag: 12345 },
      readiness(),
      found,
      fee(),
    );
    expect(result.transaction.SendMax).toEqual({
      currency: "USD",
      issuer: ISSUER,
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

  it("Matched path without a source value", () => {
    const error = catchError(() =>
      buildPreparedPayment(
        crossCurrencyIntent,
        readiness(104_200_050, "1"),
        paths(104_200_051, null),
        fee(),
      ),
    );
    expect(error).toBeInstanceOf(CriptonResponseError);
    expect((error as CriptonResponseError).code).toBe("invalid-response");
  });

  it("Economy tier read in drops", () => {
    const result = buildPreparedPayment(
      { ...xrpIntent, amount: "1", feeTier: "economy" },
      readiness(104_200_050, "1"),
      null,
      fee(104_200_052, { economy_drops: "10", standard_drops: "12", priority_drops: "15" }),
    );
    expect(result.transaction.Fee).toBe("10");
    expect(result.fee.tier).toBe("economy");
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
