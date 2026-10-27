import { describe, expect, it } from "vite-plus/test";
import { createSolanaAgentKit, SOLANA_CAIP2, type SolanaPayAsset } from "../../src/index.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
// A well-known mainnet account: the API reads Solana data from mainnet while payments run on devnet.
const DESTINATION = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required`);
  return value;
}

describe("Solana x402 devnet end to end (opt-in)", () => {
  // `transfer-readiness` is paid per call in route table 2026-10-18; most other pro routes are credits-only.
  it("pays a pro transfer-readiness call on devnet and records the spend", async () => {
    const baseUrl = requireEnv("CRIPTON_E2E_BASE_URL");
    const key = requireEnv("CRIPTON_SOLANA_PAYER_KEY");
    const source = requireEnv("CRIPTON_E2E_SOLANA_SOURCE");
    if (!LOCAL_HOSTS.has(new URL(baseUrl).hostname)) {
      throw new Error("CRIPTON_E2E_BASE_URL must point to localhost, 127.0.0.1 or [::1]");
    }
    if (process.env["CRIPTON_SOLANA_NETWORK"] !== "devnet") {
      throw new Error("CRIPTON_SOLANA_NETWORK must be 'devnet'");
    }
    const asset = (process.env["CRIPTON_SOLANA_PAY_ASSET"] ?? "USDC") as SolanaPayAsset;

    const kit = createSolanaAgentKit({
      baseUrl,
      tier: "pro",
      payment: { key, network: "devnet", asset, maxPerCall: "0.05", sessionBudget: "0.2" },
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
