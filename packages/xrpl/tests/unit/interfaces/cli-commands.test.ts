import { runCli } from "@criptonlabs/agent-apis-core/cli";
import { describe, expect, it } from "vite-plus/test";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { createXrplAgentKit } from "../../../src/index.js";
import { readXrplEnv } from "../../../src/infrastructure/config/xrpl-env.js";
import { xrplCommands } from "../../../src/interfaces/cli/commands.js";
import accountSummary from "../../fixtures/responses/account-summary.json" with { type: "json" };
import fee from "../../fixtures/responses/fee.json" with { type: "json" };
import slippage from "../../fixtures/responses/slippage.json" with { type: "json" };
import token from "../../fixtures/responses/token.json" with { type: "json" };
import { DESTINATION, SOURCE, readiness } from "../../support/interface-kit.js";

const USD = `USD.${DESTINATION}`;
const READY = readiness({ verdict: "ready", reasons: [], warnings: [], checks_failed: [] });

function run(argv: string[]) {
  const fake = new FakeTransport().respondWith((request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/fee")) return { body: fee };
    if (path.endsWith("/summary")) return { body: accountSummary };
    if (path.includes("/token/")) return { body: token };
    if (path.endsWith("/payment-readiness")) return { body: READY };
    if (path.endsWith("/slippage")) return { body: slippage };
    return { status: 404, body: {} };
  });
  const out: string[] = [];
  const err: string[] = [];
  const done = runCli(
    xrplCommands((env) => createXrplAgentKit({ ...readXrplEnv(env), transport: fake.transport })),
    argv,
    {},
    { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) },
  );
  const urls = () => fake.requests.map((r) => new URL(r.url));
  return { done, out, err, urls };
}

describe("XRPL CLI commands map flags to requests", () => {
  it("account <address> reads that account's summary", async () => {
    const r = run(["account", SOURCE, "--json"]);
    expect(await r.done).toBe(0);
    expect(r.urls()[0]?.pathname).toBe(`/v1/xrpl/account/${SOURCE}/summary`);
    expect(JSON.parse(r.out.join(""))).toHaveProperty("meta");
  });

  it("account without an address exits 2", async () => {
    const r = run(["account", "--json"]);
    expect(await r.done).toBe(2);
    expect(r.urls()).toHaveLength(0);
  });

  it("token <asset> reads that token", async () => {
    const r = run(["token", USD, "--json"]);
    expect(await r.done).toBe(0);
    expect(decodeURIComponent(r.urls()[0]?.pathname ?? "")).toBe(`/v1/xrpl/token/${USD}`);
  });

  it("readiness maps --from, --to, --asset, --amount and --destination-tag", async () => {
    const r = run([
      "readiness",
      "--from",
      SOURCE,
      "--to",
      DESTINATION,
      "--asset",
      "XRP",
      "--amount",
      "10",
      "--destination-tag",
      "42",
      "--json",
    ]);
    expect(await r.done).toBe(0);
    const url = r.urls()[0];
    expect(url?.pathname).toBe("/v1/xrpl/payment-readiness");
    expect(Object.values(Object.fromEntries(url?.searchParams ?? []))).toEqual(
      expect.arrayContaining([SOURCE, DESTINATION, "XRP", "10", "42"]),
    );
  });

  it("readiness without --to exits 2 and sends nothing", async () => {
    const r = run(["readiness", "--from", SOURCE, "--json"]);
    expect(await r.done).toBe(2);
    expect(r.err.join("") + r.out.join("")).toContain("to");
    expect(r.urls()).toHaveLength(0);
  });

  it("prepare-payment prints the unsigned transaction", async () => {
    const r = run([
      "prepare-payment",
      "--from",
      SOURCE,
      "--to",
      DESTINATION,
      "--asset",
      "XRP",
      "--amount",
      "10",
      "--destination-tag",
      "9",
      "--fee-tier",
      "priority",
      "--json",
    ]);
    expect(await r.done).toBe(0);
    const result = JSON.parse(r.out.join("")) as {
      transaction: { Account: string; Destination: string };
      fee: { tier: string };
    };
    expect(result.transaction).toMatchObject({ Account: SOURCE, Destination: DESTINATION });
    expect(result.fee.tier).toBe("priority");
  });

  it("prepare-payment without --amount exits 2", async () => {
    const r = run(["prepare-payment", "--from", SOURCE, "--to", DESTINATION, "--asset", "XRP"]);
    expect(await r.done).toBe(2);
    expect(r.urls()).toHaveLength(0);
  });

  it("quote-dex maps --base, --quote, --amount and --depth", async () => {
    const r = run([
      "quote-dex",
      "--base",
      "XRP",
      "--quote",
      USD,
      "--amount",
      "1000",
      "--depth",
      "50",
      "--json",
    ]);
    expect(await r.done).toBe(0);
    const url = r.urls()[0];
    expect(url?.pathname).toBe("/v1/xrpl/slippage");
    expect(url?.searchParams.get("depth")).toBe("50");
    expect(url?.searchParams.get("amount")).toBe("1000");
    expect(JSON.parse(r.out.join(""))).toMatchObject({ filled: "1000" });
  });

  it("quote-dex above --max-slippage is a refusal (non-zero exit with the refusal code)", async () => {
    const r = run([
      "quote-dex",
      "--base",
      "XRP",
      "--quote",
      USD,
      "--amount",
      "1000",
      "--max-slippage",
      "0.0001",
      "--json",
    ]);
    expect(await r.done).not.toBe(0);
    expect(r.out.join("") + r.err.join("")).toContain("slippage-over-limit");
  });

  it("quote-dex without --quote exits 2", async () => {
    const r = run(["quote-dex", "--base", "XRP", "--amount", "1"]);
    expect(await r.done).toBe(2);
  });
});
