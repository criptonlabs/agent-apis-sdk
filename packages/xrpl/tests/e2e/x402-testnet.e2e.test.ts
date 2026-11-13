import { describe, expect, it } from "vite-plus/test";
import { Wallet } from "xrpl";
import { RLUSD_ISSUER, createXrplAgentKit } from "../../src/index.js";
import { guardedBaseUrl, payerSeed } from "./e2e-env.js";

describe("XRPL x402 testnet end to end (opt-in)", () => {
  it("reads the free fee route without credentials or payment", async () => {
    const baseUrl = guardedBaseUrl();

    const kit = createXrplAgentKit({ baseUrl });
    const response = await kit.data.fee();

    expect(response.data.meta).toBeDefined();
    expect(response.receipt).toBeNull();
  }, 60_000);

  // The fee route is credits-only in the 2026-10-18 route table; payment-readiness is paid per call.
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
});
