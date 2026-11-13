import { CriptonPaymentError, cmp, type PaymentOption } from "@criptonlabs/agent-apis-core";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
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
import { PAY_ASSET_MINTS, SOLANA_CAIP2, createSolanaAgentKit } from "../../../src/index.js";
import { startFakeSolanaRpc, type FakeSolanaRpc } from "../../support/fake-solana-rpc.js";
import { throwawayAddress, throwawayKey } from "../../support/keys.js";

const EUR_ONE_URL = "https://api.criptonlabs.com/v1/pro/credits/eur-1";
const SOLANA_SIGNATURE = "5".repeat(88);

function devnetOption(asset: "USDC" | "EURC", amount: string): PaymentOption {
  return {
    scheme: "exact",
    network: SOLANA_CAIP2.devnet,
    asset: PAY_ASSET_MINTS[asset].devnet,
    amount,
    payTo: throwawayAddress(),
    maxTimeoutSeconds: 60,
    extra: { feePayer: throwawayAddress() },
  };
}

/** The recorded top-up challenge of `usd-starter`, rebound to `eur-1` with the given offers. */
function eurOneChallenge(accepts: PaymentOption[]): ResponseFixture {
  const recorded = loadFixture("topup-challenge-usd-starter");
  const required = decodePaymentRequired(recorded.headers["payment-required"] ?? "");
  const path = "/v1/pro/credits/eur-1";
  const rebound = { ...required, resource: { url: `https://api.criptonlabs.com${path}` }, accepts };
  return {
    ...recorded,
    headers: { ...recorded.headers, "payment-required": encodePaymentRequired(rebound) },
    body: { ...recorded.body, ...rebound, instance: path },
  };
}

let rpc: FakeSolanaRpc;

beforeAll(async () => {
  rpc = await startFakeSolanaRpc();
});

afterAll(async () => {
  await rpc.stop();
});

describe("Solana top-up", () => {
  it("EUR bundle paid in EURC", async () => {
    const eurc = devnetOption("EURC", "1210000");
    const key = throwawayKey();
    const token = creditToken();
    const created = topupCreated(
      token,
      settlementHeader({
        transaction: SOLANA_SIGNATURE,
        network: SOLANA_CAIP2.devnet,
        payer: key.address,
      }),
      { wallet: `${SOLANA_CAIP2.devnet}:${key.address}`, denomination: "EUR", balance: "1" },
    );
    const fake = new FakeTransport().respond(eurOneChallenge([eurc])).respond(created);
    const kit = createSolanaAgentKit({
      transport: fake.transport,
      wallet: { key: key.base58, network: "devnet", asset: "EURC", rpcUrl: rpc.url },
    });

    const result = await kit.credits.topup({ bundle: "eur-1", maxAmount: "1.21" });

    expect(fake.requests).toHaveLength(2);
    const retry = fake.requests[1];
    expect(retry?.method).toBe("POST");
    expect(retry?.url).toBe(EUR_ONE_URL);
    const header = retry?.headers["payment-signature"] ?? "";
    expect(header, "paid retry carries a PAYMENT-SIGNATURE").not.toBe("");
    const payload = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
      accepted: PaymentOption;
    };
    expect(payload.accepted).toEqual(eurc);
    expect(result.token === token, "the top-up result carries the token").toBe(true);
    expect(cmp(kit.credits.topupSpent(), "1.21")).toBe(0);
  });

  it("EUR bundle with a USDC wallet", async () => {
    const eurc = devnetOption("EURC", "1210000");
    const fake = new FakeTransport().respond(eurOneChallenge([eurc]));
    const kit = createSolanaAgentKit({
      transport: fake.transport,
      wallet: {
        key: throwawayKey().base58,
        network: "devnet",
        asset: "USDC",
        rpcUrl: rpc.url,
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
});
