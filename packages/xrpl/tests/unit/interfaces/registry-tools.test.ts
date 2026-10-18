import { describe, expect, it } from "vite-plus/test";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { createCriptonXrplTools } from "../../../src/interfaces/ai-sdk/tools.js";
import { createXrplAgentKit } from "../../../src/index.js";
import accountLines from "../../fixtures/responses/account-lines.json" with { type: "json" };
import accountSummary from "../../fixtures/responses/account-summary.json" with { type: "json" };
import accountTx from "../../fixtures/responses/account-transactions.json" with { type: "json" };
import amm from "../../fixtures/responses/amm.json" with { type: "json" };
import fee from "../../fixtures/responses/fee.json" with { type: "json" };
import ledger from "../../fixtures/responses/ledger-latest.json" with { type: "json" };
import networkHealth from "../../fixtures/responses/network-health.json" with { type: "json" };
import orderbook from "../../fixtures/responses/orderbook.json" with { type: "json" };
import paths from "../../fixtures/responses/paths.json" with { type: "json" };
import slippage from "../../fixtures/responses/slippage.json" with { type: "json" };
import token from "../../fixtures/responses/token.json" with { type: "json" };
import { DESTINATION, SOURCE, readiness } from "../../support/interface-kit.js";

const USD = `USD.${DESTINATION}`;
const READY = readiness({ verdict: "ready", reasons: [], warnings: [], checks_failed: [] });

const BODIES: Record<string, object> = {
  "/v1/xrpl/fee": fee,
  "/v1/xrpl/network/health": networkHealth,
  "/v1/xrpl/ledger/latest": ledger,
  "/v1/xrpl/orderbook": orderbook,
  "/v1/xrpl/slippage": slippage,
  [`/v1/xrpl/amm/XRP/${USD}`]: amm,
  [`/v1/xrpl/account/${SOURCE}/summary`]: accountSummary,
  [`/v1/xrpl/account/${SOURCE}/lines`]: accountLines,
  [`/v1/xrpl/account/${SOURCE}/transactions`]: accountTx,
  [`/v1/xrpl/token/${USD}`]: token,
  "/v1/xrpl/payment-readiness": READY,
  "/v1/xrpl/paths": paths,
};

function setup() {
  const fake = new FakeTransport().respondWith((request) => {
    const body = BODIES[new URL(request.url).pathname];
    return body === undefined ? { status: 404, body: {} } : { body };
  });
  const tools = createCriptonXrplTools(createXrplAgentKit({ transport: fake.transport }));
  const call = async (name: string, input: unknown) => {
    const tool = tools[name];
    if (tool === undefined) throw new Error(`no tool ${name}`);
    return tool.execute(input);
  };
  const last = () => {
    const request = fake.requests.at(-1);
    if (request === undefined) throw new Error("no request sent");
    const url = new URL(request.url);
    return {
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
    };
  };
  return { fake, call, last };
}

describe("XRPL tools send the right request and return the API data", () => {
  it("xrpl_fee reads the fee route", async () => {
    const { call, last } = setup();
    expect(await call("xrpl_fee", {})).toEqual(fee);
    expect(last()).toEqual({ method: "GET", path: "/v1/xrpl/fee", query: {} });
  });

  it("xrpl_network_health reads the network health route", async () => {
    const { call, last } = setup();
    expect(await call("xrpl_network_health", {})).toEqual(networkHealth);
    expect(last().path).toBe("/v1/xrpl/network/health");
  });

  it("xrpl_latest_ledger reads the latest ledger route", async () => {
    const { call, last } = setup();
    expect(await call("xrpl_latest_ledger", {})).toEqual(ledger);
    expect(last().path).toBe("/v1/xrpl/ledger/latest");
  });

  it("xrpl_orderbook sends base, quote and depth and omits an absent depth", async () => {
    const { call, last } = setup();
    expect(await call("xrpl_orderbook", { base: "XRP", quote: USD, depth: 50 })).toEqual(orderbook);
    expect(last()).toMatchObject({
      path: "/v1/xrpl/orderbook",
      query: { base: "XRP", quote: USD, depth: "50" },
    });
    await call("xrpl_orderbook", { base: "XRP", quote: USD });
    expect(last().query).toEqual({ base: "XRP", quote: USD });
  });

  it("xrpl_slippage sends base, quote and amount", async () => {
    const { call, last } = setup();
    expect(await call("xrpl_slippage", { base: "XRP", quote: USD, amount: "1000" })).toEqual(
      slippage,
    );
    expect(last()).toMatchObject({
      path: "/v1/xrpl/slippage",
      query: { base: "XRP", quote: USD, amount: "1000" },
    });
  });

  it("xrpl_amm puts both assets in the path", async () => {
    const { call, last } = setup();
    expect(await call("xrpl_amm", { a: "XRP", b: USD })).toEqual(amm);
    expect(decodeURIComponent(last().path)).toBe(`/v1/xrpl/amm/XRP/${USD}`);
  });

  it("xrpl_account_summary puts the address in the path", async () => {
    const { call, last } = setup();
    expect(await call("xrpl_account_summary", { address: SOURCE })).toEqual(accountSummary);
    expect(last().path).toBe(`/v1/xrpl/account/${SOURCE}/summary`);
  });

  it("xrpl_account_lines sends the address in the path and limit, peer and marker as query", async () => {
    const { call, last } = setup();
    const result = await call("xrpl_account_lines", {
      address: SOURCE,
      limit: 5,
      peer: DESTINATION,
      marker: "m1",
    });
    expect(result).toEqual(accountLines);
    expect(last()).toMatchObject({
      path: `/v1/xrpl/account/${SOURCE}/lines`,
      query: { limit: "5", peer: DESTINATION, marker: "m1" },
    });
    await call("xrpl_account_lines", { address: SOURCE });
    expect(last().query).toEqual({});
  });

  it("xrpl_account_transactions sends limit and marker as query", async () => {
    const { call, last } = setup();
    expect(
      await call("xrpl_account_transactions", { address: SOURCE, limit: 3, marker: "m2" }),
    ).toEqual(accountTx);
    expect(last()).toMatchObject({
      path: `/v1/xrpl/account/${SOURCE}/transactions`,
      query: { limit: "3", marker: "m2" },
    });
  });

  it("xrpl_token puts the asset in the path", async () => {
    const { call, last } = setup();
    expect(await call("xrpl_token", { asset: USD })).toEqual(token);
    expect(decodeURIComponent(last().path)).toBe(`/v1/xrpl/token/${USD}`);
  });

  it("xrpl_payment_readiness maps source and destination and the optional fields", async () => {
    const { call, last } = setup();
    const result = await call("xrpl_payment_readiness", {
      source: SOURCE,
      destination: DESTINATION,
      asset: "XRP",
      amount: "10",
      destinationTag: 7,
    });
    expect(result).toEqual(READY);
    expect(last().path).toBe("/v1/xrpl/payment-readiness");
    expect(Object.keys(last().query).sort()).toHaveLength(5);
    expect(Object.values(last().query)).toEqual(
      expect.arrayContaining([SOURCE, DESTINATION, "XRP", "10", "7"]),
    );
    await call("xrpl_payment_readiness", { source: SOURCE, destination: DESTINATION });
    expect(Object.keys(last().query)).toHaveLength(2);
  });

  it("xrpl_paths sends the payment parameters", async () => {
    const { call, last } = setup();
    expect(
      await call("xrpl_paths", {
        source: SOURCE,
        destination: DESTINATION,
        asset: USD,
        amount: "5",
      }),
    ).toEqual(paths);
    expect(last().path).toBe("/v1/xrpl/paths");
    expect(Object.values(last().query)).toEqual(
      expect.arrayContaining([SOURCE, DESTINATION, USD, "5"]),
    );
  });

  it("xrpl_prepare_payment returns the use-case result (unsigned transaction, no receipt wrapper)", async () => {
    const { call, last } = setup();
    const result = (await call("xrpl_prepare_payment", {
      source: SOURCE,
      destination: DESTINATION,
      asset: "XRP",
      amount: "10",
    })) as { transaction: { TransactionType: string; Account: string; Destination: string } };
    expect(result.transaction).toMatchObject({
      TransactionType: "Payment",
      Account: SOURCE,
      Destination: DESTINATION,
    });
    expect(result).not.toHaveProperty("receipt");
    expect(last().method).toBe("GET");
  });

  it("xrpl_dex_quote returns the quote and refuses above the slippage limit", async () => {
    const { call } = setup();
    const quote = (await call("xrpl_dex_quote", {
      base: "XRP",
      quote: USD,
      amount: "1000",
    })) as { filled: string; bestVenue: string };
    expect(quote).toMatchObject({ filled: "1000", bestVenue: "clob" });
    await expect(
      call("xrpl_dex_quote", { base: "XRP", quote: USD, amount: "1000", maxSlippagePct: "0.0001" }),
    ).rejects.toMatchObject({ code: "slippage-over-limit" });
  });

  it("rejects an input that does not match the tool schema before any request", async () => {
    const { call, fake } = setup();
    await expect(call("xrpl_account_summary", {})).rejects.toThrow(/address/);
    expect(fake.requests).toHaveLength(0);
  });
});
