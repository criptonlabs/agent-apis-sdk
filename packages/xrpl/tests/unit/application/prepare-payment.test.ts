import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { preparePayment } from "../../../src/application/prepare-payment.js";
import type {
  FeeResponse,
  PathsResponse,
  ReadinessResponse,
} from "../../../src/domain/api-types.js";
import { PaymentNotReadyError } from "../../../src/domain/prepared-payment.js";
import { FakeDataPort } from "../../support/fake-data-port.js";

const SOURCE = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const DESTINATION = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const SOURCE_ASSET = `USD.${SOURCE}`;

const META = {
  ledger_index: 104_200_050,
  as_of: "2026-10-18T10:00:00.000Z",
  age_seconds: 1,
  cache: "miss" as const,
  stale: false,
};

function readiness(overrides: Partial<ReadinessResponse> = {}): ReadinessResponse {
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
    amount: "10",
    destination_tag: 12345,
    meta: META,
    ...overrides,
  };
}

function fee(
  values: { standard: string; priority: string } = { standard: "12", priority: "5000" },
) {
  const body: FeeResponse = {
    fee: { economy: "10", ...values },
    congestion: { score: 0, band: "low", load_factor_assumed: false },
    base_fee: "10",
    median_fee: "12",
    minimum_fee: "10",
    open_ledger_fee: "10",
    current_queue_size: "0",
    max_queue_size: "54320",
    meta: META,
  };
  return body;
}

function paths(alternatives: PathsResponse["alternatives"]): PathsResponse {
  return { paths_may_be_non_optimal: true, warnings: [], alternatives, meta: META };
}

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
      .script(
        "paths",
        paths([
          {
            source_amount: { asset: SOURCE_ASSET, value: "1.394" },
            paths_count: 1,
            paths: alternativePaths,
          },
        ]),
      )
      .script("fee", fee());

    const prepared = await preparePayment(fake.port, {
      source: SOURCE,
      destination: DESTINATION,
      asset: "XRP",
      amount: "1",
      sourceAsset: SOURCE_ASSET,
      sendMaxTolerancePct: "1",
    });

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
      issuer: SOURCE,
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

  it("Fee above the cap", async () => {
    const fake = new FakeDataPort()
      .script("paymentReadiness", readiness())
      .script("fee", fee({ standard: "12", priority: "5000" }));

    const error = await preparePayment(fake.port, {
      ...XRP_INTENT,
      feeTier: "priority",
      maxFeeDrops: "1000",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaymentNotReadyError);
    expect((error as PaymentNotReadyError).code).toBe("fee-over-cap");
  });
});
