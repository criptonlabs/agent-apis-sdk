import { add, type PaymentReceipt } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { Wallet } from "xrpl";
import { RLUSD_ISSUER, createXrplAgentKit } from "../../src/index.js";
import { decimalOf, guardedBaseUrl, payerSeed } from "./e2e-env.js";

// Public mainnet accounts: the API reads XRPL data from mainnet while payments run on testnet.
// The prepare is unsigned and never submitted. Bitstamp requires a destination tag.
const PREPARE_SOURCE = "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq"; // GateHub
const PREPARE_DESTINATION = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"; // Bitstamp
const PREPARE_DESTINATION_TAG = 12345;

describe("XRPL x402 testnet end to end (opt-in)", () => {
  it("reads the free fee route without credentials or payment", async () => {
    const baseUrl = guardedBaseUrl();

    const kit = createXrplAgentKit({ baseUrl });
    const response = await kit.data.fee();

    expect(response.data.meta).toBeDefined();
    expect(response.receipt).toBeNull();
  }, 60_000);

  // Free tier (design D11): readiness and fee are read from the free routes; nothing is signed, paid or submitted.
  it("Prepared payment against API 0.27", async () => {
    const baseUrl = guardedBaseUrl();
    const source = PREPARE_SOURCE;
    const destination = PREPARE_DESTINATION;

    const kit = createXrplAgentKit({ baseUrl });
    const prepared = await kit.preparePayment({
      source,
      destination,
      destinationTag: PREPARE_DESTINATION_TAG,
      asset: "XRP",
      amount: "1",
    });

    expect(prepared.readiness.verdict).toBe("ready");
    expect(prepared.transaction).toMatchObject({
      TransactionType: "Payment",
      Account: source,
      Destination: destination,
      Amount: "1000000",
      DestinationTag: PREPARE_DESTINATION_TAG,
    });
    expect(prepared.transaction.SendMax).toBeUndefined();
    expect(prepared.transaction.Paths).toBeUndefined();
    expect(prepared.path).toBeNull();
    expect(prepared.fee.tier).toBe("standard");
    expect(prepared.transaction.Fee).toMatch(/^[1-9][0-9]*$/);
    expect(prepared.transaction.Fee).toBe(prepared.fee.drops);
  }, 60_000);

  // Since the API change `per-call-tiers-and-catalog`, every `/v1/pro/*` route is paid per call or
  // with credits; payment-readiness is paid per call here.
  it("pays a pro payment-readiness call on xrpl:1 and records the spend", async () => {
    const baseUrl = guardedBaseUrl();
    const seed = payerSeed();

    const kit = createXrplAgentKit({
      baseUrl,
      tier: "pro",
      wallet: { seed, network: "testnet" },
      payment: { maxPerCall: "0.05", sessionBudget: "0.2" },
    });
    const response = await kit.data.paymentReadiness({
      source: Wallet.fromSeed(seed).classicAddress,
      destination: RLUSD_ISSUER.testnet,
    });

    expect(response.receipt).not.toBeNull();
    expect(response.receipt?.network).toBe("xrpl:1");
    expect(Number(kit.spent())).toBeGreaterThan(0);
    // Live ledger: autofill, signing and the API settlement (up to 8 s) exceed the 5 s default.
  }, 60_000);

  // Design D5 of `kit-xrpl-concurrent-payments`: one wallet, two paid calls started together. The
  // kit signs one XRPL payment at a time per account, so the second payment waits for the first
  // paid retry and both calls answer; amounts come from the receipts, never from this file.
  it("Two paid calls at once from one wallet", async () => {
    const baseUrl = guardedBaseUrl();
    const seed = payerSeed();
    const source = Wallet.fromSeed(seed).classicAddress;

    const kit = createXrplAgentKit({
      baseUrl,
      tier: "pro",
      wallet: { seed, network: "testnet" },
      payment: { maxPerCall: "0.05", sessionBudget: "0.2" },
    });
    const [first, second] = await Promise.all([
      kit.data.paymentReadiness({ source, destination: RLUSD_ISSUER.testnet }),
      kit.data.paymentReadiness({ source, destination: RLUSD_ISSUER.testnet }),
    ]);

    expect(first.data.meta).toBeDefined();
    expect(second.data.meta).toBeDefined();
    const receipts = [first.receipt, second.receipt].filter(
      (receipt): receipt is PaymentReceipt => receipt !== null,
    );
    expect(receipts).toHaveLength(2);
    expect(receipts.map((receipt) => receipt.network)).toEqual(["xrpl:1", "xrpl:1"]);
    const [firstReceipt, secondReceipt] = receipts;
    expect(firstReceipt?.transaction).toBeTruthy();
    expect(secondReceipt?.transaction).toBeTruthy();
    expect(firstReceipt?.transaction).not.toBe(secondReceipt?.transaction);
    expect(kit.spent()).toBe(
      add(
        decimalOf(firstReceipt?.amount, "the first receipt amount"),
        decimalOf(secondReceipt?.amount, "the second receipt amount"),
      ),
    );
    // Two settlements run one after the other (about 8.5 s each), each with autofill, signing and
    // the paid retry, whose floor is 30 s (api-client.ts): 120 s covers two of those floors plus
    // signing, as the top-up test does for one.
  }, 120_000);
});
