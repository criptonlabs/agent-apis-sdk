import { describe, expect, it } from "vite-plus/test";
import { createSolanaAgentKit, SOLANA_CAIP2, type SolanaPayAsset } from "../../src/index.js";
import { guardedBaseUrl, payerKey, requireEnv } from "./e2e-env.js";

// A well-known mainnet account: the API reads Solana data from mainnet while payments run on devnet.
const DESTINATION = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

describe("Solana x402 devnet end to end (opt-in)", () => {
  it("reads the free latest slot without credentials or payment", async () => {
    const baseUrl = guardedBaseUrl();

    const kit = createSolanaAgentKit({ baseUrl });
    const response = await kit.data.latestSlot();

    expect(response.data.meta).toBeDefined();
    expect(response.receipt).toBeNull();
  }, 60_000);

  // `transfer-readiness` is paid per call in route table 2026-10-18; most other pro routes are credits-only.
  it("pays a pro transfer-readiness call on devnet and records the spend", async () => {
    const baseUrl = guardedBaseUrl();
    const key = payerKey();
    const source = requireEnv("CRIPTON_E2E_SOLANA_SOURCE");
    const asset = (process.env["CRIPTON_SOLANA_PAY_ASSET"] ?? "USDC") as SolanaPayAsset;

    const kit = createSolanaAgentKit({
      baseUrl,
      tier: "pro",
      wallet: { key, network: "devnet", asset },
      payment: { maxPerCall: "0.05", sessionBudget: "0.2" },
    });
    const response = await kit.data.transferReadiness({
      source,
      destination: DESTINATION,
      mint: "SOL",
      amount: "0.001",
    });

    expect(response.receipt).not.toBeNull();
    expect(response.receipt?.network).toBe(SOLANA_CAIP2.devnet);
    expect(Number(kit.spent())).toBeGreaterThan(0);
    expect(Number(kit.spent())).toBeLessThanOrEqual(0.05);
  }, 90_000);
});
