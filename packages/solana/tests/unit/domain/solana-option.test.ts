import type { PaymentOption } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { selectSolanaOption } from "../../../src/domain/solana-option.js";

const MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const EURC = "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr";
const PAY_TO = "7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5";
const FEE_PAYER = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";

function solanaOption(network: string, asset: string, amount = "12100"): PaymentOption {
  return {
    scheme: "exact",
    network,
    asset,
    amount,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { feePayer: FEE_PAYER },
  };
}

describe("Solana option policy", () => {
  it("USDC accepted on mainnet", () => {
    const eurc = solanaOption(MAINNET, EURC);
    const usdc = solanaOption(MAINNET, USDC_MAINNET);
    const selected = selectSolanaOption([eurc, usdc], "mainnet", "USDC");
    expect(selected).toBe(usdc);
    expect(selected?.asset).toBe(USDC_MAINNET);
  });

  it("EURC accepted on devnet", () => {
    const usdc = solanaOption(DEVNET, USDC_DEVNET);
    const eurc = solanaOption(DEVNET, EURC);
    expect(selectSolanaOption([usdc, eurc], "devnet", "EURC")).toBe(eurc);
  });

  it("Configured asset not offered", () => {
    const usdc = solanaOption(MAINNET, USDC_MAINNET);
    expect(selectSolanaOption([usdc], "mainnet", "EURC")).toBeNull();
  });

  it("Solana network mismatch", () => {
    const devnetOnly = [solanaOption(DEVNET, USDC_DEVNET), solanaOption(DEVNET, EURC)];
    expect(selectSolanaOption(devnetOnly, "mainnet", "USDC")).toBeNull();
  });

  it("rejects an option of the configured asset on another network", () => {
    const devnetEurc = solanaOption(DEVNET, EURC);
    expect(selectSolanaOption([devnetEurc], "mainnet", "EURC")).toBeNull();
  });

  it("rejects a non-exact scheme", () => {
    const upto = { ...solanaOption(MAINNET, USDC_MAINNET), scheme: "upto" };
    expect(selectSolanaOption([upto], "mainnet", "USDC")).toBeNull();
  });

  it("lowest amount wins among matching options", () => {
    const dearer = solanaOption(MAINNET, USDC_MAINNET, "14520");
    const cheaper = solanaOption(MAINNET, USDC_MAINNET, "12100");
    expect(selectSolanaOption([dearer, cheaper], "mainnet", "USDC")).toBe(cheaper);
  });
});
