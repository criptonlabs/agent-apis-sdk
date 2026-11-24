import { describe, expect, it } from "vite-plus/test";
import { createSolanaAgentKit, SOLANA_CAIP2, type SolanaPayAsset } from "../../src/index.js";
import { guardedBaseUrl, payerKey, requireEnv } from "./e2e-env.js";

// A well-known mainnet account: the API reads Solana data from mainnet while payments run on devnet.
const DESTINATION = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
// Public mainnet wallet of the recorded fixture: the API reads its mainnet balance, so readiness can
// answer `ready`; the prepare is unsigned and never submitted.
const PREPARE_SOURCE = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";

describe("Solana x402 devnet end to end (opt-in)", () => {
  it("reads the free latest slot without credentials or payment", async () => {
    const baseUrl = guardedBaseUrl();

    const kit = createSolanaAgentKit({ baseUrl });
    const response = await kit.data.latestSlot();

    expect(response.data.meta).toBeDefined();
    expect(response.receipt).toBeNull();
  }, 60_000);

  // Free tier (design D11): readiness is read from the free route; nothing is signed, paid or sent.
  it("Prepared transfer against API 0.27", async () => {
    const baseUrl = guardedBaseUrl();
    const source = PREPARE_SOURCE;

    const kit = createSolanaAgentKit({ baseUrl });
    const prepared = await kit.prepareTransfer({
      source,
      destination: DESTINATION,
      mint: "SOL",
      amount: "0.001",
    });

    expect(prepared.readiness.verdict).toBe("ready");
    expect(prepared.readiness.amount_atomic).toBe("1000000");
    expect(prepared.transaction.feePayer).toBe(source);
    expect(prepared.transaction.recentBlockhash).toBeNull();
    expect(prepared.transaction.instructions).toHaveLength(1);
    const [transfer] = prepared.transaction.instructions;
    expect(transfer?.programAddress).toBe(SYSTEM_PROGRAM);
    expect(transfer?.accounts).toEqual([
      { address: source, signer: true, writable: true },
      { address: DESTINATION, signer: false, writable: true },
    ]);
    // System Program Transfer: u32 LE discriminator 2, then the lamports as u64 LE.
    const data = Buffer.from(transfer?.data ?? "", "base64");
    expect(data.readUInt32LE(0)).toBe(2);
    expect(data.readBigUInt64LE(4)).toBe(1_000_000n);
  }, 60_000);

  // Since the API change `per-call-tiers-and-catalog`, every `/v1/pro/*` route is paid per call or
  // with credits; `transfer-readiness` is paid per call here.
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
