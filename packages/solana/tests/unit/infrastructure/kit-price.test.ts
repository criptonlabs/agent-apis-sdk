import type { PaymentOption } from "@criptonlabs/agent-apis-core";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { loadFixture } from "../../../../core/tests/support/credit-fixtures.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { problem } from "../../../../core/tests/support/x402-fixtures.js";
import { PAY_ASSET_MINTS, SOLANA_CAIP2, createSolanaAgentKit } from "../../../src/index.js";
import { startFakeSolanaRpc, type FakeSolanaRpc } from "../../support/fake-solana-rpc.js";
import { slotFixture } from "../../support/interface-kit.js";
import { throwawayAddress, throwawayKey } from "../../support/keys.js";

const RESOURCE_URL = "https://api.criptonlabs.com/v1/pro/solana/slot/latest";
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

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

function challengeOf(accepts: PaymentOption[]) {
  const required = { x402Version: 2, resource: { url: RESOURCE_URL }, accepts };
  return problem("payment-required", 402, { "PAYMENT-REQUIRED": b64(required) });
}

function paidSlot() {
  const settle = { success: true, transaction: "5".repeat(88), network: SOLANA_CAIP2.devnet };
  return { status: 200, headers: { "PAYMENT-RESPONSE": b64(settle) }, body: slotFixture };
}

let rpc: FakeSolanaRpc;

beforeAll(async () => {
  rpc = await startFakeSolanaRpc();
});

afterAll(async () => {
  await rpc.stop();
});

describe("Solana kit price lookup and spend", () => {
  it("priceOf asks GET /v1/pro/requirements?resource= and maps the options", async () => {
    const option = devnetOption("USDC", "1000");
    const fake = new FakeTransport().respond({
      body: { payments_mode: "live", accepts: [option] },
    });
    const kit = createSolanaAgentKit({ transport: fake.transport, tier: "pro" });
    const result = await kit.priceOf("/v1/pro/solana/slot/latest");
    const request = fake.requests[0];
    const url = new URL(request?.url ?? "");
    expect(request?.method).toBe("GET");
    expect(url.pathname).toBe("/v1/pro/requirements");
    expect(url.searchParams.get("resource")).toBe("/v1/pro/solana/slot/latest");
    expect(result.paymentsMode).toBe("live");
    expect(result.options).toEqual([option]);
  });

  it("prices reads the price index", async () => {
    const recorded = loadFixture("price-index");
    const fake = new FakeTransport().respond(recorded);
    const kit = createSolanaAgentKit({ transport: fake.transport, tier: "pro" });
    const index = await kit.prices();
    expect(fake.requests).toHaveLength(1);
    const request = fake.requests[0];
    const url = new URL(request?.url ?? "");
    expect(request?.method).toBe("GET");
    expect(url.pathname).toBe("/v1/pro/requirements");
    expect(url.searchParams.has("resource")).toBe(false);
    expect(index.paymentsMode).toBe("x402");
    const routes = recorded.body.routes as { resource: string }[];
    expect(index.routes.map((entry) => entry.resource)).toEqual(
      routes.map((route) => route.resource),
    );
    expect(index.routes).toContainEqual(
      expect.objectContaining({
        resource: "/v1/pro/xrpl/fee",
        mode: "both",
        denominations: [
          { denomination: "EUR", debit: "0.0005", approxCalls: 2000 },
          { denomination: "USD", debit: "0.0006", approxCalls: 1366 },
        ],
      }),
    );
  });

  it("spent is zero before any paid call", () => {
    expect(createSolanaAgentKit({ transport: new FakeTransport().transport }).spent()).toBe("0");
  });

  it("a kit with a devnet EURC payment config pays the EURC option and records the decimal spend", async () => {
    const usdc = devnetOption("USDC", "30000");
    const eurc = devnetOption("EURC", "14520");
    const fake = new FakeTransport().respond(challengeOf([usdc, eurc])).respond(paidSlot());
    const kit = createSolanaAgentKit({
      transport: fake.transport,
      tier: "pro",
      wallet: {
        key: throwawayKey().base58,
        network: "devnet",
        asset: "EURC",
        rpcUrl: rpc.url,
      },
      payment: { maxPerCall: "0.05" },
    });

    const slot = await kit.data.latestSlot();

    expect(slot.data.slot).toBe(slotFixture.slot);
    expect(kit.spent()).toBe("0.01452");
    const header = fake.requests.at(-1)?.headers["payment-signature"] ?? "";
    const payload = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
      accepted: PaymentOption;
    };
    expect(payload.accepted).toEqual(eurc);
    expect(rpc.methods).toContain("getLatestBlockhash");
  });
});
