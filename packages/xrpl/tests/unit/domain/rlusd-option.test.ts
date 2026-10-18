import type { PaymentOption } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { selectRlusdOption } from "../../../src/domain/rlusd-option.js";

const RLUSD_HEX = "524C555344000000000000000000000000000000";
const MAINNET_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const TESTNET_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";
const PAY_TO = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const INVOICE_ID = "a3f1c2d4e5b60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

function xrplOption(network: "xrpl:0" | "xrpl:1", issuer: string, amount: string): PaymentOption {
  return {
    scheme: "exact",
    network,
    asset: RLUSD_HEX,
    amount,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { issuer, areFeesSponsored: false, sourceTag: 1, invoiceId: INVOICE_ID },
  };
}

const solanaOption: PaymentOption = {
  scheme: "exact",
  network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amount: "0.012",
  payTo: "7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5",
  maxTimeoutSeconds: 60,
  extra: { feePayer: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4" },
};

describe("RLUSD option policy", () => {
  it("Only a Solana option offered", () => {
    expect(selectRlusdOption([solanaOption], "mainnet")).toBeNull();
  });

  it("RLUSD with a wrong issuer", () => {
    const wrong = xrplOption("xrpl:0", TESTNET_ISSUER, "0.012");
    expect(selectRlusdOption([wrong], "mainnet")).toBeNull();
  });

  it("Network mismatch", () => {
    const mainnetOnly = xrplOption("xrpl:0", MAINNET_ISSUER, "0.012");
    expect(selectRlusdOption([mainnetOnly], "testnet")).toBeNull();
  });

  it("RLUSD accepted", () => {
    const option = xrplOption("xrpl:0", MAINNET_ISSUER, "0.012");
    expect(selectRlusdOption([solanaOption, option], "mainnet")).toBe(option);
  });

  it("lowest amount wins", () => {
    const dearer = xrplOption("xrpl:0", MAINNET_ISSUER, "0.024");
    const cheaper = xrplOption("xrpl:0", MAINNET_ISSUER, "0.012");
    expect(selectRlusdOption([dearer, cheaper], "mainnet")).toBe(cheaper);
  });

  it("accepts the testnet issuer on xrpl:1 for a testnet payer", () => {
    const option = xrplOption("xrpl:1", TESTNET_ISSUER, "0.012");
    expect(selectRlusdOption([option], "testnet")).toBe(option);
  });
});
