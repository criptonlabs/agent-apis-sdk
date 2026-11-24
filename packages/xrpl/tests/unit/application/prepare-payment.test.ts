import { CriptonResponseError, CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { preparePayment } from "../../../src/application/prepare-payment.js";
import type {
  FeeResponse,
  PathsResponse,
  ReadinessResponse,
} from "../../../src/domain/api-types.js";
import { PaymentNotReadyError } from "../../../src/domain/prepared-payment.js";
import { FakeDataPort } from "../../support/fake-data-port.js";
import feeFixture from "../../fixtures/responses/fee.json" with { type: "json" };
import pathsFixture from "../../fixtures/responses/paths.json" with { type: "json" };
import readinessFixture from "../../fixtures/responses/payment-readiness.json" with { type: "json" };

const GATEHUB = "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq";
const SOURCE = GATEHUB;
const DESTINATION = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const ISSUER = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const SOURCE_ASSET = `USD.${ISSUER}`;
const RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const RLUSD_HEX = "524C555344000000000000000000000000000000";
const USD_STANDARD_HEX = "0000000000000000000000005553440000000000";
const MPT_ISSUANCE_ID = "0000012FFD9EE5DA93AC614B4DB94D7E0FCE415CA51BED47";

const META = {
  ledger_index: 104_200_050,
  ledger_state: "validated" as const,
  as_of: "2026-10-18T10:00:00.000Z",
  age_seconds: 1,
  cache: "miss" as const,
  stale: false,
};

// 0.27.0 bodies: the recorded fixtures with the parties, amounts and tiers of each scenario.
function readiness(overrides: Partial<ReadinessResponse> = {}): ReadinessResponse {
  return {
    ...readinessFixture,
    verdict: "ready",
    reasons: [],
    warnings: [],
    checks_failed: [],
    source: SOURCE,
    destination: DESTINATION,
    asset: "XRP",
    amount: "10",
    destination_tag: 12345,
    meta: META,
    ...overrides,
  };
}

function fee(
  values: { economy_drops: string; standard_drops: string; priority_drops: string } = {
    economy_drops: "10",
    standard_drops: "12",
    priority_drops: "5000",
  },
): FeeResponse {
  return { ...feeFixture, fee: values, meta: { ...META, ledger_state: "open" } };
}

function paths(alternatives: PathsResponse["alternatives"]): PathsResponse {
  return {
    ...pathsFixture,
    paths_may_be_non_optimal: true,
    source: SOURCE,
    destination: DESTINATION,
    asset: "XRP",
    amount: "1",
    source_assets: [SOURCE_ASSET],
    alternatives,
    meta: META,
  };
}

/** An alternative spending `value` of the source asset; the source issues it, so any issuer. */
function usdAlternative(
  value: string | null,
  alternativePaths: PathsResponse["alternatives"][number]["paths"],
): PathsResponse["alternatives"][number] {
  return {
    source_amount: { asset: SOURCE_ASSET, value },
    source_any_issuer: true,
    paths_count: alternativePaths.length,
    paths: alternativePaths,
    effective_price: "1.394",
    cheapest: true,
    suggested_send_max: "1.40794",
  };
}

const CROSS_CURRENCY_INTENT = {
  source: SOURCE,
  destination: DESTINATION,
  asset: "XRP",
  amount: "1",
  sourceAsset: SOURCE_ASSET,
  sendMaxTolerancePct: "1",
};

const XRP_INTENT = {
  source: SOURCE,
  destination: DESTINATION,
  asset: "XRP",
  amount: "10",
  destinationTag: 12345,
};

describe("preparePayment", () => {
  it("Same-asset XRP payment", async () => {
    const fake = new FakeDataPort().script("paymentReadiness", readiness()).script("fee", fee());

    const prepared = await preparePayment(fake.port, XRP_INTENT);

    expect(fake.operations).toEqual(["paymentReadiness", "fee"]);
    expect(fake.operations).not.toContain("paths");
    expect(prepared.transaction).toEqual({
      TransactionType: "Payment",
      Account: SOURCE,
      Destination: DESTINATION,
      Amount: "10000000",
      DestinationTag: 12345,
      Fee: "12",
      Flags: 0,
    });
  });

  it("calls readiness with source, destination, asset, amount and destination tag", async () => {
    const fake = new FakeDataPort().script("paymentReadiness", readiness()).script("fee", fee());

    await preparePayment(fake.port, XRP_INTENT);

    expect(fake.argsOf("paymentReadiness")).toEqual([
      {
        source: SOURCE,
        destination: DESTINATION,
        asset: "XRP",
        amount: "10",
        destinationTag: 12345,
      },
    ]);
  });

  it("Missing destination tag", async () => {
    const fake = new FakeDataPort().script(
      "paymentReadiness",
      readiness({ verdict: "not_ready", reasons: ["destination_tag_required"] }),
    );

    const error = await preparePayment(fake.port, XRP_INTENT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaymentNotReadyError);
    expect((error as PaymentNotReadyError).code).toBe("payment-not-ready");
    expect((error as PaymentNotReadyError).reasons).toEqual(["destination_tag_required"]);
    expect(fake.operations).toEqual(["paymentReadiness"]);
  });

  it("Readiness unknown", async () => {
    const fake = new FakeDataPort().script("paymentReadiness", readiness({ verdict: "unknown" }));

    const error = await preparePayment(fake.port, XRP_INTENT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaymentNotReadyError);
    expect((error as PaymentNotReadyError).code).toBe("payment-readiness-unknown");
  });

  it("Path found", async () => {
    const alternativePaths = [[{ currency: "XRP" }]];
    const fake = new FakeDataPort()
      .script("paymentReadiness", readiness({ amount: "1", destination_tag: null }))
      .script("paths", paths([usdAlternative("1.394", alternativePaths)]))
      .script("fee", fee());

    const prepared = await preparePayment(fake.port, CROSS_CURRENCY_INTENT);

    expect(fake.operations).toEqual(["paymentReadiness", "paths", "fee"]);
    expect(fake.argsOf("paths")).toEqual([
      expect.objectContaining({
        source: SOURCE,
        destination: DESTINATION,
        asset: "XRP",
        amount: "1",
        sourceAssets: [SOURCE_ASSET],
      }),
    ]);
    expect(prepared.transaction.SendMax).toEqual({
      currency: "USD",
      issuer: ISSUER,
      value: "1.40794",
    });
    expect(prepared.transaction.Paths).toEqual(alternativePaths);
  });

  it("No path", async () => {
    const fake = new FakeDataPort()
      .script("paymentReadiness", readiness({ amount: "1" }))
      .script("paths", paths([]))
      .script("fee", fee());

    const error = await preparePayment(fake.port, {
      source: SOURCE,
      destination: DESTINATION,
      asset: "XRP",
      amount: "1",
      sourceAsset: SOURCE_ASSET,
      sendMaxTolerancePct: "1",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaymentNotReadyError);
    expect((error as PaymentNotReadyError).code).toBe("no-path-found");
  });

  it("Tolerance missing", async () => {
    const fake = new FakeDataPort()
      .script("paymentReadiness", readiness())
      .script("paths", paths([]))
      .script("fee", fee());

    const error = await preparePayment(fake.port, {
      source: SOURCE,
      destination: DESTINATION,
      asset: "XRP",
      amount: "1",
      sourceAsset: SOURCE_ASSET,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CriptonValidationError);
    expect((error as CriptonValidationError).field).toBe("sendMaxTolerancePct");
    expect(fake.calls).toEqual([]);
  });

  it("Matched path without a source value", async () => {
    const fake = new FakeDataPort()
      .script("paymentReadiness", readiness({ amount: "1", destination_tag: null }))
      .script("paths", paths([usdAlternative(null, [[{ currency: "XRP" }]])]))
      .script("fee", fee());

    const outcome = await preparePayment(fake.port, CROSS_CURRENCY_INTENT).then(
      (prepared) => prepared,
      (e: unknown) => e,
    );

    expect(outcome).toBeInstanceOf(CriptonResponseError);
    expect((outcome as CriptonResponseError).code).toBe("invalid-response");
    expect(outcome).not.toHaveProperty("transaction");
  });

  it("Fee above the cap", async () => {
    const fake = new FakeDataPort()
      .script("paymentReadiness", readiness())
      .script("fee", fee({ economy_drops: "10", standard_drops: "12", priority_drops: "5000" }));

    const error = await preparePayment(fake.port, {
      ...XRP_INTENT,
      feeTier: "priority",
      maxFeeDrops: "1000",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaymentNotReadyError);
    expect((error as PaymentNotReadyError).code).toBe("fee-over-cap");
  });
  it("Economy tier read in drops", async () => {
    const fake = new FakeDataPort()
      .script("paymentReadiness", readiness({ amount: "1" }))
      .script("fee", fee({ economy_drops: "10", standard_drops: "12", priority_drops: "15" }));

    const prepared = await preparePayment(fake.port, {
      ...XRP_INTENT,
      amount: "1",
      feeTier: "economy",
    });

    expect(prepared.transaction.Fee).toBe("10");
    expect(prepared.fee.tier).toBe("economy");
  });
});

describe("preparePayment asset grammar", () => {
  /** A GateHub to Bitstamp payment of `amount` in `asset`, answered `ready`. */
  function issuedPayment(asset: string, amount: string): FakeDataPort {
    return new FakeDataPort()
      .script(
        "paymentReadiness",
        readiness({
          source: GATEHUB,
          destination: DESTINATION,
          asset,
          amount,
          destination_tag: null,
        }),
      )
      .script("fee", fee());
  }

  async function refusal(
    fake: FakeDataPort,
    intent: Parameters<typeof preparePayment>[1],
  ): Promise<unknown> {
    return preparePayment(fake.port, intent).then(
      (prepared) => prepared,
      (e: unknown) => e,
    );
  }

  it("Hex currency code", async () => {
    const asset = `${RLUSD_HEX.toLowerCase()}.${RLUSD_ISSUER}`;
    const fake = issuedPayment(asset, "5");

    const prepared = await preparePayment(fake.port, {
      source: GATEHUB,
      destination: DESTINATION,
      asset,
      amount: "5",
    });

    expect(prepared.transaction.Amount).toEqual({
      currency: RLUSD_HEX,
      issuer: RLUSD_ISSUER,
      value: "5",
    });
  });

  it("Standard code in hex form", async () => {
    const asset = `${USD_STANDARD_HEX}.${DESTINATION}`;
    const fake = issuedPayment(asset, "25.5");

    const prepared = await preparePayment(fake.port, {
      source: GATEHUB,
      destination: DESTINATION,
      asset,
      amount: "25.5",
    });

    expect(prepared.transaction.Amount).toEqual({
      currency: "USD",
      issuer: DESTINATION,
      value: "25.5",
    });
  });

  it("Currency code longer than three characters", async () => {
    const asset = `RLUSD.${RLUSD_ISSUER}`;
    const fake = issuedPayment(asset, "5");

    const error = await refusal(fake, {
      source: GATEHUB,
      destination: DESTINATION,
      asset,
      amount: "5",
    });

    expect(error).toBeInstanceOf(CriptonValidationError);
    expect((error as CriptonValidationError).code).toBe("invalid-input");
    expect((error as CriptonValidationError).field).toBe("asset");
    expect(fake.calls).toEqual([]);
  });

  it("MPT asset refused locally", async () => {
    const fake = issuedPayment(MPT_ISSUANCE_ID, "150");

    const error = await refusal(fake, {
      source: GATEHUB,
      destination: DESTINATION,
      asset: MPT_ISSUANCE_ID,
      amount: "150",
    });

    expect(error).toBeInstanceOf(CriptonValidationError);
    expect((error as CriptonValidationError).code).toBe("invalid-input");
    expect((error as CriptonValidationError).field).toBe("asset");
    expect(fake.calls).toEqual([]);
  });

  it("MPT source asset refused locally", async () => {
    const fake = new FakeDataPort()
      .script(
        "paymentReadiness",
        readiness({
          source: GATEHUB,
          destination: DESTINATION,
          amount: "1",
          destination_tag: null,
        }),
      )
      .script("paths", { ...paths([]), source: GATEHUB, source_assets: [MPT_ISSUANCE_ID] })
      .script("fee", fee());

    const error = await refusal(fake, {
      source: GATEHUB,
      destination: DESTINATION,
      asset: "XRP",
      amount: "1",
      sourceAsset: MPT_ISSUANCE_ID,
      sendMaxTolerancePct: "1",
    });

    expect(error).toBeInstanceOf(CriptonValidationError);
    expect((error as CriptonValidationError).code).toBe("invalid-input");
    expect((error as CriptonValidationError).field).toBe("sourceAsset");
    expect(fake.calls).toEqual([]);
  });
});
