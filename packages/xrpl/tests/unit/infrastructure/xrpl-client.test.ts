import {
  ApiClient,
  CriptonNetworkError,
  CriptonResponseError,
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
import formerFeeFixture from "../../fixtures/derived/fee-0.21.0.json" with { type: "json" };
import mptPathsFixture from "../../fixtures/derived/paths-mpt-alternative.json" with { type: "json" };
import mptReadinessFixture from "../../fixtures/derived/payment-readiness-mpt.json" with { type: "json" };

const GATEHUB = "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq";
const ADDRESS = GATEHUB;
const OTHER = "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH";
const BITSTAMP = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const ISSUED = `USD.${BITSTAMP}`;
const RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const MPT_ISSUANCE_ID = "0000012FFD9EE5DA93AC614B4DB94D7E0FCE415CA51BED47";
const BASE = "https://api.criptonlabs.com";
const DOMAIN_ID = "DBABFD44A80DB623522628550B270FA5E2A845341E137530728E2E3699181A4E";
const CREDENTIAL_ID = "006E72B33796BEC170F5732535B6D44E688631B83A0E2E2BBD26E82118EA8290";
// Upper-cased sha256 of "credential-1" to "credential-9": nine distinct 64-hex ids.
const CREDENTIAL_IDS = [
  "25C4CF0EA3186C73F8CFB9EF48EBEA06EFC504EAF8519FCC07BB7264EBB7C491",
  "2E4CAAB8D5B9E8F2A4F9DF7F6A4E3B26CDEBB7C88B8E03481A307C6D09D4BEED",
  "C306700DC2BE4F994E4830A8C65A49A36F21B7D9348C597C4672B2F6FF13A5D0",
  "1BAC20761E8397016DEE1B1DDDD633443AF5C8D6B14015AA5359A0E0C697845F",
  "C56820D39DD6F2CFABEC318BBCA64E230C8360665DF66DCFD8605D48EC90692A",
  "11B93B885FE28D96B771437164AAC010A657CD8E0D645751D95AA8B9EC1C9D32",
  "84EAF761248630E859C190C813742BD93E0CEBDC1FDD340B43600D8B6E637E2B",
  "8509656C3A262E0D9457B6E997E406A8CC2A43BD588D97C4628699BC61B8E3C4",
  "2340129E71F6C289AC5E976CB951ABBE3F56D0D62764E91AD858227E2D34C631",
];

function setup(body: object, tier?: "free" | "pro") {
  const fake = new FakeTransport().respond({ body });
  const api = new ApiClient(
    { network: "xrpl", productToken: "agent-apis-xrpl/0.0.0" },
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
    await client.accountLines(ADDRESS, { limit: 20, peer: OTHER, marker: "abc" });
    const url = sent(fake);
    expect(url.pathname).toBe(`/v1/xrpl/account/${ADDRESS}/lines`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "20",
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

  it("Account lines limit out of range", async () => {
    const { fake, client } = setup(linesFixture);
    expect(await field(() => client.accountLines(ADDRESS, { limit: 5 }))).toBe("limit");
    expect(fake.requests).toHaveLength(0);
  });

  it("Account transactions limit out of range", async () => {
    const { fake, client } = setup(txFixture);
    expect(await field(() => client.accountTransactions(ADDRESS, { limit: 51 }))).toBe("limit");
    expect(fake.requests).toHaveLength(0);
  });

  it.each([10, 400])("accepts account lines limit %i", async (limit) => {
    const { fake, client } = setup(linesFixture);
    await client.accountLines(ADDRESS, { limit });
    expect(sent(fake).searchParams.get("limit")).toBe(String(limit));
  });

  it.each([9, 401, 10.5])("rejects account lines limit %j locally", async (limit) => {
    const { fake, client } = setup(linesFixture);
    expect(await field(() => client.accountLines(ADDRESS, { limit }))).toBe("limit");
    expect(fake.requests).toHaveLength(0);
  });

  it.each([1, 50])("accepts account transactions limit %i", async (limit) => {
    const { fake, client } = setup(txFixture);
    await client.accountTransactions(ADDRESS, { limit });
    expect(sent(fake).searchParams.get("limit")).toBe(String(limit));
  });

  it.each([0, 51, 10.5])("rejects account transactions limit %j locally", async (limit) => {
    const { fake, client } = setup(txFixture);
    expect(await field(() => client.accountTransactions(ADDRESS, { limit }))).toBe("limit");
    expect(fake.requests).toHaveLength(0);
  });

  it("omits the limit param when no limit is given", async () => {
    const lines = setup(linesFixture);
    await lines.client.accountLines(ADDRESS);
    expect(sent(lines.fake).searchParams.has("limit")).toBe(false);
    const txs = setup(txFixture);
    await txs.client.accountTransactions(ADDRESS);
    expect(sent(txs.fake).searchParams.has("limit")).toBe(false);
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

  it("Unknown reason code passes through", async () => {
    const body = { ...structuredClone(readinessFixture), verdict: "not_ready" };
    body.reasons = ["future_reason"];
    const { client } = setup(body);
    const result = await client.paymentReadiness({ source: ADDRESS, destination: OTHER });
    expect(result.data.verdict).toBe("not_ready");
    expect(result.data.reasons).toEqual(["future_reason"]);
  });

  it("Unknown status code passes through", async () => {
    const body = structuredClone(slippageFixture);
    body.venues.amm_status = "future_status";
    const { client } = setup(body);
    const result = await client.slippage({ base: "XRP", quote: ISSUED, amount: "100" });
    expect(result.data.venues.amm_status).toBe("future_status");
  });

  it("Wrong type in a code field", async () => {
    const body = structuredClone(readinessFixture) as Record<string, unknown>;
    body.reasons = [42];
    const { client } = setup(body);
    const error = await client
      .paymentReadiness({ source: ADDRESS, destination: OTHER })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonResponseError);
    expect(error).toMatchObject({ code: "invalid-response" });
  });
  it("Unknown ledger index in meta", async () => {
    const body = structuredClone(healthFixture) as Record<string, any>;
    body.meta.ledger_index = null;
    body.meta.ledger_state = "validated";
    const { client } = setup(body);
    const result = await client.health();
    expect(result.data.meta.ledger_index).toBeNull();
    expect(result.data.meta.ledger_state).toBe("validated");
  });

  it("Open ledger state in meta", async () => {
    const body = structuredClone(feeFixture);
    body.meta.ledger_state = "open";
    const { client } = setup(body);
    const result = await client.fee();
    expect(result.data.meta.ledger_state).toBe("open");
  });
});

describe("XRPL responses follow API contract 0.27.0", () => {
  it("Fee tiers in drops", async () => {
    const body = structuredClone(feeFixture) as Record<string, any>;
    body.fee.standard_drops = "12";
    body.base_fee_drops = "10";
    body.current_queue_size = 0;
    body.max_queue_size = null;
    const { client } = setup(body);
    const result = await client.fee();
    const data = result.data as Record<string, any>;
    expect(data.fee.standard_drops).toBe("12");
    expect(data.base_fee_drops).toBe("10");
    expect(data.current_queue_size).toBe(0);
    expect(data.max_queue_size).toBeNull();
    expect(data.fee).not.toHaveProperty("standard");
    expect(data).not.toHaveProperty("base_fee");
  });

  it("Former fee body rejected", async () => {
    const { client } = setup(formerFeeFixture);
    const error = await client.fee().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonResponseError);
    expect(error).toMatchObject({ code: "invalid-response" });
  });

  it("Unknown ledger index passed through", async () => {
    const body = structuredClone(networkHealthFixture) as Record<string, any>;
    body.ledger_index = null;
    body.meta.ledger_index = null;
    body.nodes[0].ledger_age_seconds = null;
    body.nodes[0].load_factor_multiplier = "1";
    const { client } = setup(body);
    const result = await client.networkHealth();
    const data = result.data as Record<string, any>;
    expect(data.ledger_index).toBeNull();
    expect(data.meta.ledger_index).toBeNull();
    expect(data.nodes[0].ledger_age_seconds).toBeNull();
    expect(data.nodes[0].load_factor_multiplier).toBe("1");
  });

  it("Transaction with unknown members passed through", async () => {
    const body = structuredClone(txFixture) as Record<string, any>;
    const unknown = { hash: null, type: null, result: null, ledger_index: null, close_time: null };
    body.transactions[0] = { ...body.transactions[0], ...unknown };
    const { client } = setup(body);
    const result = await client.accountTransactions(BITSTAMP);
    expect(result.data.transactions[0]).toEqual(body.transactions[0]);
    expect(result.data.transactions[0]).toMatchObject(unknown);
  });

  it("MPT path source amount passed through", async () => {
    const { client } = setup(mptPathsFixture);
    const result = await client.paths({
      source: BITSTAMP,
      destination: GATEHUB,
      asset: `USD.${BITSTAMP}`,
      amount: "10",
    });
    expect(result.data.alternatives[0]?.source_amount).toEqual({
      asset: "0000012FFD9EE5DA93AC614B4DB94D7E0FCE415CA51BED47",
      value: null,
      value_atomic: "131",
    });
  });

  it("Summary trust line counterparty", async () => {
    // A holder account of the recorded fixtures with one Bitstamp USD line; a negative-free,
    // untruncated line set gives `is_issuer` false (API AccountSummaryResponse description).
    const body = {
      ...structuredClone(summaryFixture),
      address: GATEHUB,
      transfer_fee_pct: "0",
      trust_lines: [
        { peer: BITSTAMP, currency: "USD", role: "holder", balance: "0", line_limit: "1000" },
      ],
      lines_truncated: false,
      is_issuer: false,
    };
    const { client } = setup(body);
    const result = await client.accountSummary(GATEHUB);
    const data = result.data as Record<string, any>;
    const line = data.trust_lines[0];
    expect(line).toMatchObject({ peer: BITSTAMP, role: "holder", line_limit: "1000" });
    expect(data.transfer_fee_pct).toBe("0");
    expect(line).not.toHaveProperty("issuer");
    expect(line).not.toHaveProperty("limit");
    expect(data).not.toHaveProperty("transfer_rate");
  });

  it("Health history uptime as a decimal string", async () => {
    const body = structuredClone(historyFixture) as Record<string, any>;
    body.buckets[0].members[0] = { ...body.buckets[0].members[0], samples: 200, up: 199 };
    body.buckets[0].members[0].uptime_pct = "99.5";
    const { client } = setup(body);
    const result = await client.healthHistory({ window: "24h" });
    expect(result.data.buckets[0]?.members[0]?.uptime_pct).toBe("99.5");
  });
});

describe("XRPL asset grammar", () => {
  it("Standard codes are case-sensitive", async () => {
    const { fake, client } = setup(tokenFixture);
    await client.token(`usd.${BITSTAMP}`);
    expect(sent(fake).pathname).toBe(`/v1/xrpl/token/usd.${BITSTAMP}`);
  });

  it("Symbol code accepted", async () => {
    const { fake, client } = setup(tokenFixture);
    await client.token(`?!@.${BITSTAMP}`);
    expect(sent(fake).pathname).toBe(`/v1/xrpl/token/%3F!%40.${BITSTAMP}`);
  });

  it("Text code longer than three characters rejected", async () => {
    const { fake, client } = setup(tokenFixture);
    expect(await field(() => client.token(`RLUSD.${RLUSD_ISSUER}`))).toBe("asset");
    expect(fake.requests).toHaveLength(0);
  });

  it("Hex code accepted", async () => {
    const { fake, client } = setup(tokenFixture);
    await client.token(`524C555344000000000000000000000000000000.${RLUSD_ISSUER}`);
    expect(sent(fake).pathname).toBe(
      `/v1/xrpl/token/524C555344000000000000000000000000000000.${RLUSD_ISSUER}`,
    );
  });

  it("Hex form of XRP rejected", async () => {
    const { fake, client } = setup(tokenFixture);
    expect(
      await field(() => client.token(`0000000000000000000000005852500000000000.${BITSTAMP}`)),
    ).toBe("asset");
    expect(fake.requests).toHaveLength(0);
  });

  it("MPT id on payment readiness", async () => {
    const { fake, client } = setup(mptReadinessFixture);
    await client.paymentReadiness({
      source: BITSTAMP,
      destination: GATEHUB,
      asset: MPT_ISSUANCE_ID,
      amount: "150",
    });
    const url = sent(fake);
    expect(url.pathname).toBe("/v1/xrpl/payment-readiness");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      source: BITSTAMP,
      destination: GATEHUB,
      asset: MPT_ISSUANCE_ID,
      amount: "150",
    });
  });

  it("MPT id on the orderbook rejected", async () => {
    const { fake, client } = setup(orderbookFixture);
    expect(
      await field(() => client.orderbook({ base: MPT_ISSUANCE_ID, quote: `USD.${BITSTAMP}` })),
    ).toBe("base");
    expect(fake.requests).toHaveLength(0);
  });
});

describe("XRPL query parameters", () => {
  const BITSTAMP_USD = `USD.${BITSTAMP}`;

  it("Orderbook of a permissioned domain", async () => {
    const { fake, client } = setup(orderbookFixture);
    await client.orderbook({ base: "XRP", quote: BITSTAMP_USD, domain: DOMAIN_ID });
    const url = sent(fake);
    expect(url.pathname).toBe("/v1/xrpl/orderbook");
    expect([...url.searchParams.keys()].sort()).toEqual(["base", "domain", "quote"]);
    expect(url.searchParams.get("domain")).toBe(DOMAIN_ID);
  });

  it("Sell-side slippage", async () => {
    const { fake, client } = setup(slippageFixture);
    await client.slippage({ base: "XRP", quote: BITSTAMP_USD, amount: "100", side: "sell" });
    const url = sent(fake);
    expect(url.pathname).toBe("/v1/xrpl/slippage");
    expect([...url.searchParams.keys()].sort()).toEqual(["amount", "base", "quote", "side"]);
    expect(url.searchParams.get("side")).toBe("sell");
  });

  it("Slippage without a side", async () => {
    const { fake, client } = setup(slippageFixture);
    await client.slippage({ base: "XRP", quote: BITSTAMP_USD, amount: "100" });
    const url = sent(fake);
    expect(url.searchParams.has("side")).toBe(false);
    expect([...url.searchParams.keys()].sort()).toEqual(["amount", "base", "quote"]);
  });

  it("Readiness with credentials", async () => {
    const one = setup(readinessFixture);
    await one.client.paymentReadiness({
      source: GATEHUB,
      destination: BITSTAMP,
      credentials: [CREDENTIAL_ID],
    });
    const url = sent(one.fake);
    expect(url.pathname).toBe("/v1/xrpl/payment-readiness");
    expect([...url.searchParams.keys()].sort()).toEqual(["credentials", "destination", "source"]);
    expect(url.searchParams.get("credentials")).toBe(CREDENTIAL_ID);
    const several = setup(readinessFixture);
    const ids = [CREDENTIAL_IDS[2] as string, CREDENTIAL_ID, CREDENTIAL_IDS[0] as string];
    await several.client.paymentReadiness({
      source: GATEHUB,
      destination: BITSTAMP,
      credentials: ids,
    });
    expect(sent(several.fake).searchParams.get("credentials")).toBe(ids.join(","));
  });

  it("Depth between buckets accepted", async () => {
    const { fake, client } = setup(orderbookFixture);
    await client.orderbook({ base: "XRP", quote: BITSTAMP_USD, depth: 20 });
    const url = sent(fake);
    expect(url.pathname).toBe("/v1/xrpl/orderbook");
    expect(url.searchParams.get("depth")).toBe("20");
  });

  it("Depth above the server cap accepted", async () => {
    const { fake, client } = setup(slippageFixture);
    await client.slippage({ base: "XRP", quote: BITSTAMP_USD, amount: "100", depth: 200 });
    const url = sent(fake);
    expect(url.pathname).toBe("/v1/xrpl/slippage");
    expect(url.searchParams.get("depth")).toBe("200");
  });

  it("Depth above the safe integer bound rejected locally", async () => {
    const { fake, client } = setup(orderbookFixture);
    expect(
      await field(() =>
        client.orderbook({ base: "XRP", quote: BITSTAMP_USD, depth: 9007199254740992 }),
      ),
    ).toBe("depth");
    expect(fake.requests).toHaveLength(0);
  });

  it("Zero depth rejected locally", async () => {
    const { fake, client } = setup(orderbookFixture);
    expect(
      await field(() => client.orderbook({ base: "XRP", quote: BITSTAMP_USD, depth: 0 })),
    ).toBe("depth");
    expect(fake.requests).toHaveLength(0);
  });

  it("Invalid domain rejected locally", async () => {
    const { fake, client } = setup(orderbookFixture);
    expect(
      await field(() => client.orderbook({ base: "XRP", quote: BITSTAMP_USD, domain: "DBABFD44" })),
    ).toBe("domain");
    expect(fake.requests).toHaveLength(0);
  });

  it("Invalid side rejected locally", async () => {
    const { fake, client } = setup(slippageFixture);
    expect(
      await field(() =>
        client.slippage({
          base: "XRP",
          quote: BITSTAMP_USD,
          amount: "100",
          side: "short" as "buy",
        }),
      ),
    ).toBe("side");
    expect(fake.requests).toHaveLength(0);
  });

  it("Too many credentials rejected locally", async () => {
    const { fake, client } = setup(readinessFixture);
    expect(
      await field(() =>
        client.paymentReadiness({
          source: GATEHUB,
          destination: BITSTAMP,
          credentials: CREDENTIAL_IDS,
        }),
      ),
    ).toBe("credentials");
    expect(fake.requests).toHaveLength(0);
  });

  it("Repeated credential rejected locally", async () => {
    const { fake, client } = setup(readinessFixture);
    expect(
      await field(() =>
        client.paymentReadiness({
          source: GATEHUB,
          destination: BITSTAMP,
          credentials: [CREDENTIAL_ID.toLowerCase(), CREDENTIAL_ID],
        }),
      ),
    ).toBe("credentials");
    expect(fake.requests).toHaveLength(0);
  });
});
