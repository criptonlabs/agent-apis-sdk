import {
  ApiClient,
  CriptonNetworkError,
  CriptonValidationError,
} from "@criptonlabs/agent-apis-core";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createXrplAgentKit } from "../../../src/index.js";
import { createXrplDataClient } from "../../../src/infrastructure/http/xrpl-client.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import feeFixture from "../../fixtures/responses/fee.json" with { type: "json" };
import healthFixture from "../../fixtures/responses/health.json" with { type: "json" };
import networkHealthFixture from "../../fixtures/responses/network-health.json" with { type: "json" };
import historyFixture from "../../fixtures/responses/health-history.json" with { type: "json" };
import ledgerFixture from "../../fixtures/responses/ledger-latest.json" with { type: "json" };
import orderbookFixture from "../../fixtures/responses/orderbook.json" with { type: "json" };
import slippageFixture from "../../fixtures/responses/slippage.json" with { type: "json" };
import ammFixture from "../../fixtures/responses/amm.json" with { type: "json" };
import summaryFixture from "../../fixtures/responses/account-summary.json" with { type: "json" };
import linesFixture from "../../fixtures/responses/account-lines.json" with { type: "json" };
import txFixture from "../../fixtures/responses/account-transactions.json" with { type: "json" };
import tokenFixture from "../../fixtures/responses/token.json" with { type: "json" };
import readinessFixture from "../../fixtures/responses/payment-readiness.json" with { type: "json" };
import pathsFixture from "../../fixtures/responses/paths.json" with { type: "json" };

const ADDRESS = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const OTHER = "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH";
const ISSUED = `USD.${ADDRESS}`;
const BASE = "https://api.criptonlabs.com";

function setup(body: object, tier?: "free" | "pro") {
  const fake = new FakeTransport().respond({ body });
  const api = new ApiClient(
    { network: "xrpl", productToken: "xrpl-agent-kit/0.0.0" },
    { transport: fake.transport, ...(tier ? { tier } : {}) },
  );
  return { fake, client: createXrplDataClient(api) };
}

function sent(fake: FakeTransport): URL {
  expect(fake.requests).toHaveLength(1);
  return new URL(fake.requests[0]?.url as string);
}

async function field(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (error) {
    if (error instanceof CriptonValidationError && error.code === "invalid-input") {
      return error.field;
    }
    return "<unexpected error>";
  }
  return undefined;
}

function delayedTransport(delayMs: number) {
  return (url: string, init: RequestInit): Promise<Response> =>
    new Promise((resolve, reject) => {
      const signal = init.signal;
      const timer = setTimeout(() => {
        const body = url.includes("/paths") ? pathsFixture : feeFixture;
        resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }, delayMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    });
}

describe("XRPL data client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Fee on the free tier", async () => {
    const { fake, client } = setup(feeFixture);
    const result = await client.fee();
    expect(fake.requests[0]?.url).toBe(`${BASE}/v1/xrpl/fee`);
    expect(fake.requests[0]?.method).toBe("GET");
    expect(result.data).toEqual(feeFixture);
    expect(result.data.meta.ledger_index).toBe(feeFixture.meta.ledger_index);
  });

  it("Account summary on the paid tier", async () => {
    const { fake, client } = setup(summaryFixture, "pro");
    await client.accountSummary(ADDRESS);
    expect(fake.requests[0]?.url).toBe(`${BASE}/v1/pro/xrpl/account/${ADDRESS}/summary`);
  });

  it("Paths with optional parameters", async () => {
    const { fake, client } = setup(pathsFixture);
    await client.paths({
      source: ADDRESS,
      destination: OTHER,
      asset: "XRP",
      amount: "1",
      sourceAssets: [ISSUED],
    });
    const url = sent(fake);
    expect(url.pathname).toBe("/v1/xrpl/paths");
    expect([...url.searchParams.keys()].sort()).toEqual(
      ["amount", "asset", "destination", "source", "source_assets"].sort(),
    );
    expect(url.searchParams.get("source_assets")).toBe(ISSUED);
  });

  it("Paths has a longer timeout", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    const paths = setup(pathsFixture);
    await paths.client.paths({ source: ADDRESS, destination: OTHER, asset: "XRP", amount: "1" });
    const fee = setup(feeFixture);
    await fee.client.fee();
    expect(spy.mock.calls.map((c) => c[0])).toEqual([30000, 10000]);
  });

  it("Paths has a longer timeout (scaled timing)", async () => {
    const transport = delayedTransport(150);
    const kit = createXrplAgentKit({ transport, timeoutMs: 50, pathsTimeoutMs: 300 });
    const paths = await kit.data.paths({
      source: ADDRESS,
      destination: OTHER,
      asset: "XRP",
      amount: "1",
    });
    expect(paths.data).toEqual(pathsFixture);
    const error = await kit.data.fee().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonNetworkError);
    expect(error).toMatchObject({ code: "timeout" });
  });

  it("pathsTimeoutMs configuration is honoured", async () => {
    const kit = createXrplAgentKit({
      transport: delayedTransport(150),
      timeoutMs: 50,
      pathsTimeoutMs: 100,
    });
    const error = await kit.data
      .paths({ source: ADDRESS, destination: OTHER, asset: "XRP", amount: "1" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonNetworkError);
    expect(error).toMatchObject({ code: "timeout" });
  });

  it("Invalid address rejected locally", async () => {
    const { fake, client } = setup(summaryFixture);
    expect(await field(() => client.accountSummary("not-an-address"))).toBe("address");
    expect(fake.requests).toHaveLength(0);
  });

  it("Invalid asset rejected locally", async () => {
    const { fake, client } = setup(tokenFixture);
    expect(await field(() => client.token("USD"))).toBe("asset");
    expect(fake.requests).toHaveLength(0);
  });

  it("Destination tag out of range", async () => {
    const { fake, client } = setup(readinessFixture);
    expect(
      await field(() =>
        client.paymentReadiness({
          source: ADDRESS,
          destination: OTHER,
          destinationTag: 4294967296,
        }),
      ),
    ).toBe("destinationTag");
    expect(fake.requests).toHaveLength(0);
  });

  it("sends the health routes", async () => {
    const a = setup(healthFixture);
    await a.client.health();
    expect(a.fake.requests[0]?.url).toBe(`${BASE}/v1/xrpl/health`);
    const b = setup(networkHealthFixture);
    await b.client.networkHealth();
    expect(b.fake.requests[0]?.url).toBe(`${BASE}/v1/xrpl/network/health`);
    const c = setup(historyFixture);
    await c.client.healthHistory({ window: "7d" });
    const url = sent(c.fake);
    expect(url.pathname).toBe("/v1/xrpl/health/history");
    expect(url.searchParams.get("window")).toBe("7d");
  });

  it("sends the latest ledger route", async () => {
    const { fake, client } = setup(ledgerFixture);
    await client.latestLedger();
    expect(fake.requests[0]?.url).toBe(`${BASE}/v1/xrpl/ledger/latest`);
  });

  it("sends orderbook base, quote and depth", async () => {
    const { fake, client } = setup(orderbookFixture);
    await client.orderbook({ base: "XRP", quote: ISSUED, depth: 50 });
    const url = sent(fake);
    expect(url.pathname).toBe("/v1/xrpl/orderbook");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      base: "XRP",
      quote: ISSUED,
      depth: "50",
    });
  });

  it("rejects an orderbook depth outside the allowed set locally", async () => {
    const { fake, client } = setup(orderbookFixture);
    expect(
      await field(() => client.orderbook({ base: "XRP", quote: ISSUED, depth: 7 as 10 })),
    ).toBe("depth");
    expect(fake.requests).toHaveLength(0);
  });

  it("sends slippage amount", async () => {
    const { fake, client } = setup(slippageFixture);
    await client.slippage({ base: "XRP", quote: ISSUED, amount: "100" });
    const url = sent(fake);
    expect(url.pathname).toBe("/v1/xrpl/slippage");
    expect(url.searchParams.get("amount")).toBe("100");
    expect(url.searchParams.get("base")).toBe("XRP");
    expect(url.searchParams.get("quote")).toBe(ISSUED);
  });

  it("sends amm path segments encoded", async () => {
    const { fake, client } = setup(ammFixture);
    await client.amm("XRP", ISSUED);
    expect(sent(fake).pathname).toBe(`/v1/xrpl/amm/XRP/${encodeURIComponent(ISSUED)}`);
  });

  it("sends account lines limit, peer and marker", async () => {
    const { fake, client } = setup(linesFixture);
    await client.accountLines(ADDRESS, { limit: 5, peer: OTHER, marker: "abc" });
    const url = sent(fake);
    expect(url.pathname).toBe(`/v1/xrpl/account/${ADDRESS}/lines`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "5",
      peer: OTHER,
      marker: "abc",
    });
  });

  it("sends account transactions limit and marker", async () => {
    const { fake, client } = setup(txFixture);
    await client.accountTransactions(ADDRESS, { limit: 3, marker: "m" });
    const url = sent(fake);
    expect(url.pathname).toBe(`/v1/xrpl/account/${ADDRESS}/transactions`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: "3", marker: "m" });
  });

  it("sends token asset in the path", async () => {
    const { fake, client } = setup(tokenFixture);
    await client.token(ISSUED);
    expect(sent(fake).pathname).toBe(`/v1/xrpl/token/${encodeURIComponent(ISSUED)}`);
  });

  it("sends payment readiness parameters", async () => {
    const { fake, client } = setup(readinessFixture);
    await client.paymentReadiness({
      source: ADDRESS,
      destination: OTHER,
      asset: "XRP",
      amount: "1",
      destinationTag: 12,
    });
    const url = sent(fake);
    expect(url.pathname).toBe("/v1/xrpl/payment-readiness");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      source: ADDRESS,
      destination: OTHER,
      asset: "XRP",
      amount: "1",
      destination_tag: "12",
    });
  });
});
