import { ApiClient, type CreditsApi } from "@criptonlabs/agent-apis-core";
import { runCli } from "@criptonlabs/agent-apis-core/cli";
import { describe, expect, it } from "vite-plus/test";
import {
  creditToken,
  decodePaymentRequired,
  encodePaymentRequired,
  expectTokenAbsent,
  loadFixture,
  settlementHeader,
  topupCreated,
  type ResponseFixture,
} from "../../../../core/tests/support/credit-fixtures.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { TX_HASH } from "../../../../core/tests/support/x402-fixtures.js";
import { Wallet } from "xrpl";
import { createXrplAgentKit, type XrplAgentKit } from "../../../src/index.js";
import { readXrplEnv } from "../../../src/infrastructure/config/xrpl-env.js";
import { XRPL_DESCRIPTOR } from "../../../src/infrastructure/descriptor.js";
import { createXrplPayer } from "../../../src/infrastructure/x402/xrpl-payer.js";
import { xrplCommands } from "../../../src/interfaces/cli/commands.js";
import { createFakeXrplClientFactory } from "../../support/fake-xrpl-client-factory.js";
import accountSummary from "../../fixtures/responses/account-summary.json" with { type: "json" };
import fee from "../../fixtures/responses/fee.json" with { type: "json" };
import slippage from "../../fixtures/responses/slippage.json" with { type: "json" };
import token from "../../fixtures/responses/token.json" with { type: "json" };
import { DESTINATION, SOURCE, readiness } from "../../support/interface-kit.js";

const USD = `USD.${DESTINATION}`;
const READY = readiness({ verdict: "ready", reasons: [], warnings: [], checks_failed: [] });

/** The recorded `usd-starter` top-up challenge with its RLUSD `xrpl:0` entry priced at `amount`. */
function topupChallengeRlusd(amount: string): ResponseFixture {
  const recorded = loadFixture("topup-challenge-usd-starter");
  const required = decodePaymentRequired(recorded.headers["payment-required"] ?? "");
  const accepts = (required.accepts as Array<Record<string, unknown>>).map((option) =>
    option.network === "xrpl:0" ? { ...option, amount } : option,
  );
  const rebound = { ...required, accepts };
  return {
    ...recorded,
    headers: { ...recorded.headers, "payment-required": encodePaymentRequired(rebound) },
    body: { ...recorded.body, ...rebound },
  };
}

function run(argv: string[], env: NodeJS.ProcessEnv = {}, scripted?: ResponseFixture) {
  const fake = new FakeTransport().respondWith((request) => {
    if (scripted !== undefined) return scripted;
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
    xrplCommands((cliEnv) =>
      createXrplAgentKit({ ...readXrplEnv(cliEnv), transport: fake.transport }),
    ),
    argv,
    env,
    { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) },
  );
  const urls = () => fake.requests.map((r) => new URL(r.url));
  return { done, out, err, urls };
}

/** The kit's credits as an `ApiClient` with `XRPL_DESCRIPTOR`, the transport and that wallet. */
function apiCredits(client: ApiClient): CreditsApi {
  return {
    topup: (request) => client.topup(request),
    lastKnownBalance: () => client.lastKnownBalance(),
    topupSpent: () => client.topupSpent(),
    hasToken: () => client.hasCreditToken(),
  };
}

/**
 * The CLI kit of the signed top-up (design "Test Double Boundary"): `createXrplAgentKit` has no
 * XRPL client seam, so its `credits` come from an `ApiClient` whose `createXrplPayer` wallet (the
 * seed of the environment) signs on the fake XRPL client factory; the rest is the kit's own.
 */
function signingKit(cliEnv: NodeJS.ProcessEnv, fake: FakeTransport): XrplAgentKit {
  const config = readXrplEnv(cliEnv);
  if (config.wallet === undefined) throw new Error("the scenario sets CRIPTON_XRPL_PAYER_SEED");
  const wallet = createXrplPayer({
    ...config.wallet,
    clientFactory: createFakeXrplClientFactory().factory,
  });
  const client = new ApiClient(XRPL_DESCRIPTOR, { transport: fake.transport, wallet });
  const kit = createXrplAgentKit({ ...config, transport: fake.transport });
  return { ...kit, credits: apiCredits(client) };
}

/** How many times `needle` occurs in `text` (the count only, so a token is never printed). */
function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
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

  it("Top-up command without a maximum", async () => {
    const r = run(["topup", "usd-starter"]);
    expect(await r.done).toBe(2);
    // `--max` as a whole flag name: the usage text of an unknown command lists `--max-slippage`.
    expect(r.err.join("") + r.out.join("")).toMatch(/--max(?![-\w])/);
    expect(r.urls()).toHaveLength(0);
  });

  it("Top-up command over its cap", async () => {
    const env = {
      CRIPTON_XRPL_PAYER_SEED: Wallet.generate().seed as string,
      // Unreachable local WebSocket: a CLI that tried to sign could never reach a ledger.
      CRIPTON_XRPL_WS_URL: "ws://127.0.0.1:9",
    };
    const r = run(
      ["topup", "usd-starter", "--max", "0.5", "--json"],
      env,
      topupChallengeRlusd("1.00"),
    );
    expect(await r.done).toBe(3);
    expect(JSON.parse(r.out.join(""))).toMatchObject({ code: "payment-over-cap" });
  });

  it("Top-up command prints the token once", async () => {
    const seed = Wallet.generate().seed as string;
    const buyer = Wallet.fromSeed(seed).classicAddress;
    const token = creditToken();
    const created = topupCreated(
      token,
      settlementHeader({ transaction: TX_HASH, network: "xrpl:0", payer: buyer }),
      { wallet: `xrpl:0:${buyer}` },
    );
    const fake = new FakeTransport().respond(topupChallengeRlusd("1.00")).respond(created);
    const out: string[] = [];
    const err: string[] = [];

    const code = await runCli(
      xrplCommands((cliEnv) => signingKit(cliEnv, fake)),
      ["topup", "usd-starter", "--max", "1.00", "--json"],
      { CRIPTON_XRPL_PAYER_SEED: seed },
      { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) },
    );

    expect(code).toBe(0);
    expect(occurrences(out.join(""), token), "the token on stdout").toBe(1);
    // A boolean, so a failure never prints stderr (it could hold the token).
    const notice = err.join("").includes("CRIPTON_CREDITS_TOKEN");
    expect(notice, "the notice naming CRIPTON_CREDITS_TOKEN on stderr").toBe(true);
  });

  it("Credits command", async () => {
    const token = creditToken();
    const env = { CRIPTON_TIER: "pro", CRIPTON_CREDITS_TOKEN: token };
    const r = run(["credits", "--json"], env);
    expect(await r.done).toBe(0);
    expect(JSON.parse(r.out.join(""))).toEqual({
      hasToken: true,
      balance: null,
      topupSpent: "0",
    });
    expectTokenAbsent([r.out.join(""), r.err.join("")], token);
  });
});
