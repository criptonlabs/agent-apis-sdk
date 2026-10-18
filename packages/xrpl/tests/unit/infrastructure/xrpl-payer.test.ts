import { CriptonValidationError, type PaymentOption } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { Wallet } from "xrpl";
import { createXrplPayer } from "../../../src/infrastructure/x402/xrpl-payer.js";
import { createFakeXrplClientFactory } from "../../support/fake-xrpl-client-factory.js";

const RLUSD_HEX = "524C555344000000000000000000000000000000";
const TESTNET_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";

function testnetOption(extra: Record<string, unknown> = {}): PaymentOption {
  return {
    scheme: "exact",
    network: "xrpl:1",
    asset: RLUSD_HEX,
    amount: "0.012",
    payTo: Wallet.generate().classicAddress,
    maxTimeoutSeconds: 60,
    extra: { issuer: TESTNET_ISSUER, areFeesSponsored: false, ...extra },
  };
}

function required(option: PaymentOption): unknown {
  return {
    x402Version: 2,
    resource: { url: "https://api.criptonlabs.com/v1/pro/xrpl/fee" },
    accepts: [option],
  };
}

describe("createXrplPayer", () => {
  it("Testnet payer", async () => {
    const seed = Wallet.generate().seed as string;
    const fake = createFakeXrplClientFactory();
    const payer = createXrplPayer({ seed, network: "testnet", clientFactory: fake.factory });
    const option = testnetOption();

    const headers = await payer.createPaymentHeaders(required(option), option);

    const signature = headers["PAYMENT-SIGNATURE"];
    expect(signature).toBeTypeOf("string");
    const payload = JSON.parse(Buffer.from(signature as string, "base64").toString("utf8"));
    expect(payload.accepted.network).toBe("xrpl:1");
  });

  it("Invalid seed", () => {
    let thrown: unknown;
    try {
      createXrplPayer({ seed: "not-a-seed" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CriptonValidationError);
    const error = thrown as CriptonValidationError;
    expect(error.code).toBe("invalid-input");
    expect(error.field).toBe("seed");
    expect(error.message).not.toContain("not-a-seed");
  });

  it("No ticket creation", async () => {
    const seed = Wallet.generate().seed as string;
    const fake = createFakeXrplClientFactory({ ticketSequences: [] });
    const payer = createXrplPayer({ seed, network: "testnet", clientFactory: fake.factory });
    const option = testnetOption({ assetTransferMethod: "ticketSequence" });

    await payer.createPaymentHeaders(required(option), option).catch(() => undefined);

    expect(fake.requests).toContain("account_objects");
    expect(fake.submissions).toEqual([]);
  });

  it("delegates option selection to the RLUSD policy", () => {
    const payer = createXrplPayer({
      seed: Wallet.generate().seed as string,
      network: "testnet",
      clientFactory: createFakeXrplClientFactory().factory,
    });
    const wanted = testnetOption();
    const solana: PaymentOption = { ...wanted, network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" };

    expect(payer.selectOption([solana, wanted])).toBe(wanted);
  });
});
