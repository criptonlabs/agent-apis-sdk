import { randomBytes } from "node:crypto";
import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { readSolanaEnv } from "../../../src/infrastructure/config/solana-env.js";

function failure(env: NodeJS.ProcessEnv): { field?: string; message: string } {
  try {
    readSolanaEnv(env);
  } catch (error) {
    if (error instanceof CriptonValidationError && error.code === "invalid-input") {
      return { field: error.field, message: error.message };
    }
    return { message: `<unexpected error> ${String(error)}` };
  }
  return { message: "<no error>" };
}

/** A throwaway 64-byte key as a JSON array string, generated per run. */
function throwawayKey(): string {
  return JSON.stringify([...randomBytes(64)]);
}

describe("readSolanaEnv", () => {
  it("Invalid payment asset", () => {
    expect(failure({ CRIPTON_SOLANA_PAY_ASSET: "USDT" }).field).toBe("CRIPTON_SOLANA_PAY_ASSET");
  });

  it("Invalid key never echoed", () => {
    const bad = "notakey!!";
    const result = failure({ CRIPTON_SOLANA_PAYER_KEY: bad, CRIPTON_MAX_PER_CALL: "0.05" });
    expect(result.field).toBe("CRIPTON_SOLANA_PAYER_KEY");
    expect(result.message).not.toContain(bad);
  });

  it("Invalid Solana network", () => {
    expect(failure({ CRIPTON_SOLANA_NETWORK: "testnet" }).field).toBe("CRIPTON_SOLANA_NETWORK");
  });

  it("rejects an invalid RPC URL", () => {
    expect(failure({ CRIPTON_SOLANA_RPC_URL: "not a url" }).field).toBe("CRIPTON_SOLANA_RPC_URL");
  });

  it("configures payment from a key and a cap", () => {
    const key = throwawayKey();
    const config = readSolanaEnv({
      CRIPTON_SOLANA_PAYER_KEY: key,
      CRIPTON_SOLANA_NETWORK: "devnet",
      CRIPTON_SOLANA_PAY_ASSET: "EURC",
      CRIPTON_SOLANA_RPC_URL: "https://api.devnet.solana.com",
      CRIPTON_MAX_PER_CALL: "0.05",
    });
    expect(config.payment).toEqual({
      key,
      network: "devnet",
      asset: "EURC",
      rpcUrl: "https://api.devnet.solana.com",
      maxPerCall: "0.05",
    });
  });

  it("Solana key without a cap", () => {
    const config = readSolanaEnv({ CRIPTON_TIER: "pro", CRIPTON_SOLANA_PAYER_KEY: throwawayKey() });
    expect(config.payment).toBeUndefined();
  });

  it("reads tier and base URL from the common environment", () => {
    const config = readSolanaEnv({
      CRIPTON_TIER: "pro",
      CRIPTON_API_URL: "https://staging.example.test",
    });
    expect(config.tier).toBe("pro");
    expect(config.baseUrl).toBe("https://staging.example.test");
  });
});
