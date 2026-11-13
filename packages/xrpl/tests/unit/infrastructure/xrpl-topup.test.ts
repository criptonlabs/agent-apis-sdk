import {
  ApiClient,
  CriptonPaymentError,
  cmp,
  type PaymentOption,
} from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { Wallet } from "xrpl";
import {
  creditToken,
  decodePaymentRequired,
  encodePaymentRequired,
  loadFixture,
  settlementHeader,
  topupCreated,
  type ResponseFixture,
} from "../../../../core/tests/support/credit-fixtures.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { TX_HASH } from "../../../../core/tests/support/x402-fixtures.js";
import { createXrplAgentKit } from "../../../src/index.js";
import { XRPL_DESCRIPTOR } from "../../../src/infrastructure/descriptor.js";
import { createXrplPayer } from "../../../src/infrastructure/x402/xrpl-payer.js";
import { createFakeXrplClientFactory } from "../../support/fake-xrpl-client-factory.js";

const RLUSD_HEX = "524C555344000000000000000000000000000000";
const TESTNET_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";
const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const EURC_MINT = "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr";
const USD_STARTER_URL = "https://api.criptonlabs.com/v1/pro/credits/usd-starter";
const EUR_ONE_URL = "https://api.criptonlabs.com/v1/pro/credits/eur-1";

/** The recorded top-up challenge of `usd-starter`, its offers replaced by `accepts`. */
function challengeOf(bundle: string, accepts: PaymentOption[]): ResponseFixture {
  const recorded = loadFixture("topup-challenge-usd-starter");
  const required = decodePaymentRequired(recorded.headers["payment-required"] ?? "");
  const path = `/v1/pro/credits/${bundle}`;
  const rebound = { ...required, resource: { url: `https://api.criptonlabs.com${path}` }, accepts };
  return {
    ...recorded,
    headers: { ...recorded.headers, "payment-required": encodePaymentRequired(rebound) },
    body: { ...recorded.body, ...rebound, instance: path },
  };
}

/** A Solana entry of the recorded challenge (address fields kept), re-pointed at devnet. */
function solanaDevnetOption(asset: string, amount: string): PaymentOption {
  const recorded = loadFixture("topup-challenge-usd-starter");
  const required = decodePaymentRequired(recorded.headers["payment-required"] ?? "");
  const solana = (required.accepts as PaymentOption[]).find((o) => o.network === SOLANA_MAINNET);
  if (solana === undefined) throw new Error("recorded challenge has no Solana entry");
  return { ...solana, network: SOLANA_DEVNET, asset, amount };
}

function rlusdTestnetOption(amount: string): PaymentOption {
  return {
    scheme: "exact",
    network: "xrpl:1",
    asset: RLUSD_HEX,
    amount,
    payTo: Wallet.generate().classicAddress,
    maxTimeoutSeconds: 60,
    extra: { issuer: TESTNET_ISSUER, areFeesSponsored: false },
  };
}

describe("XRPL top-up", () => {
  it("USD bundle paid in RLUSD", async () => {
    const rlusd = rlusdTestnetOption("1.00");
    const usdc = solanaDevnetOption(USDC_DEVNET_MINT, "1000000");
    const buyer = Wallet.generate().classicAddress;
    const token = creditToken();
    const created = topupCreated(
      token,
      settlementHeader({ transaction: TX_HASH, network: "xrpl:1", payer: buyer }),
      { wallet: `xrpl:1:${buyer}` },
    );
    const fake = new FakeTransport()
      .respond(challengeOf("usd-starter", [usdc, rlusd]))
      .respond(created);
    const wallet = createXrplPayer({
      seed: Wallet.generate().seed as string,
      network: "testnet",
      clientFactory: createFakeXrplClientFactory().factory,
    });
    const client = new ApiClient(XRPL_DESCRIPTOR, { transport: fake.transport, wallet });

    const result = await client.topup({ bundle: "usd-starter", maxAmount: "1.00" });

    expect(fake.requests).toHaveLength(2);
    const retry = fake.requests[1];
    expect(retry?.method).toBe("POST");
    expect(retry?.url).toBe(USD_STARTER_URL);
    const header = retry?.headers["payment-signature"] ?? "";
    expect(header, "paid retry carries a PAYMENT-SIGNATURE").not.toBe("");
    const payload = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
      accepted: PaymentOption;
    };
    expect(payload.accepted).toEqual(rlusd);
    expect(result.token === token, "the top-up result carries the token").toBe(true);
    expect(cmp(client.topupSpent(), "1.00")).toBe(0);
  });

  it("EUR bundle on the XRPL kit", async () => {
    const eurc = solanaDevnetOption(EURC_MINT, "1210000");
    const fake = new FakeTransport().respond(challengeOf("eur-1", [eurc]));
    const kit = createXrplAgentKit({
      transport: fake.transport,
      tier: "pro",
      // Unreachable local WebSocket: a kit that tried to sign could never reach a ledger.
      wallet: {
        seed: Wallet.generate().seed as string,
        network: "testnet",
        wsUrl: "ws://127.0.0.1:9",
      },
    });

    const error = await kit.credits
      .topup({ bundle: "eur-1", maxAmount: "1.21" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "no-supported-payment-option" });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.url).toBe(EUR_ONE_URL);
    expect(fake.requests.some((r) => "payment-signature" in r.headers)).toBe(false);
  });

  it("XRPL kit applies the top-up budget", async () => {
    const fake = new FakeTransport().respond(
      challengeOf("usd-starter", [rlusdTestnetOption("1.00")]),
    );
    const kit = createXrplAgentKit({
      transport: fake.transport,
      tier: "pro",
      // Unreachable local WebSocket: a kit that tried to sign could never reach a ledger.
      wallet: {
        seed: Wallet.generate().seed as string,
        network: "testnet",
        wsUrl: "ws://127.0.0.1:9",
      },
      credits: { topupBudget: "0.5" },
    });

    const error = await kit.credits
      .topup({ bundle: "usd-starter", maxAmount: "1.00" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "payment-budget-exhausted" });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.url).toBe(USD_STARTER_URL);
    expect(fake.requests.some((r) => "payment-signature" in r.headers)).toBe(false);
  });
});
