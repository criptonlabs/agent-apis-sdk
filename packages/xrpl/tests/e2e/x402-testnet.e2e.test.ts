import { describe, expect, it } from "vite-plus/test";
import { Wallet } from "xrpl";
import { RLUSD_ISSUER, createXrplAgentKit } from "../../src/index.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required`);
  return value;
}

describe("XRPL x402 testnet end to end (human-run only)", () => {
  // The fee route is credits-only in the 2026-10-18 route table; payment-readiness is paid per call.
  it("pays a pro payment-readiness call on xrpl:1 and records the spend", async () => {
    const baseUrl = requireEnv("CRIPTON_E2E_BASE_URL");
    const seed = requireEnv("CRIPTON_XRPL_PAYER_SEED");
    if (!LOCAL_HOSTS.has(new URL(baseUrl).hostname)) {
      throw new Error("CRIPTON_E2E_BASE_URL must point to localhost, 127.0.0.1 or [::1]");
    }
    if (process.env["CRIPTON_XRPL_NETWORK"] !== "testnet") {
      throw new Error("CRIPTON_XRPL_NETWORK must be 'testnet'");
    }

    const kit = createXrplAgentKit({
      baseUrl,
      tier: "pro",
      payment: {
        seed,
        network: "testnet",
        maxPerCall: "0.05",
        sessionBudget: "0.2",
      },
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
