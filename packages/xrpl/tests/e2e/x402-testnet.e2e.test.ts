import { describe, expect, it } from "vite-plus/test";
import { createXrplAgentKit } from "../../src/index.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required`);
  return value;
}

describe("XRPL x402 testnet end to end (human-run only)", () => {
  it("pays a pro fee call on xrpl:1 and records the spend", async () => {
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
      payment: { seed, network: "testnet", maxPerCall: "0.05", sessionBudget: "0.2" },
    });
    const response = await kit.data.fee();

    expect(response.receipt).not.toBeNull();
    expect(response.receipt?.network).toBe("xrpl:1");
    expect(Number(kit.spent())).toBeGreaterThan(0);
  });
});
