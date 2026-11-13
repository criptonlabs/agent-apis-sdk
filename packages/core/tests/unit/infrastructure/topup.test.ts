import { inspect } from "node:util";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import type { KitConfig } from "../../../src/application/ports.js";
import {
  CriptonPaymentError,
  CriptonProblemError,
  CriptonValidationError,
} from "../../../src/domain/errors.js";
import type { PaymentOption } from "../../../src/domain/payment-option.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { cmp, divPow10 } from "../../../src/index.js";
import {
  EURC_MINT,
  SOLANA_MAINNET,
  creditToken,
  decodePaymentRequired,
  eurOneTopupChallenge,
  expectTokenAbsent,
  loadFixture,
  settlementHeader,
  topupCreated,
  withBodyMembers,
  type ResponseFixture,
} from "../../support/credit-fixtures.js";
import { FakePayer } from "../../support/fake-payer.js";
import {
  FakeTransport,
  type RecordedRequest,
  type ScriptedResponse,
} from "../../support/fake-transport.js";
import { TX_HASH, feeBody } from "../../support/x402-fixtures.js";

const xrpl = { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" };
const USD_STARTER_URL = "https://api.criptonlabs.com/v1/pro/credits/usd-starter";
const EUR_ONE_URL = "https://api.criptonlabs.com/v1/pro/credits/eur-1";
/** The XRPL address of the spec-derived 201's `wallet` (CAIP-10 `xrpl:0:<address>`). */
const XRPL_BUYER = "rMkDf1zjiP8jEPvoNP51t9eU4qDmrBfriD";
/** A Solana wallet address of the kit's recorded readiness fixtures. */
const SOLANA_BUYER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const SOLANA_SIGNATURE = "1".repeat(88);
const feeSchema = z.object({ fee: z.object({ standard: z.string() }) });

/** Pays the RLUSD `xrpl:0` entry, whose amount already is decimal (`1` for `usd-starter`). */
const rlusdWallet = () =>
  new FakePayer({ selectOption: (accepts) => accepts.find(isXrpl) ?? null });

/** Pays the EURC entry, reporting its atomic amount in decimal units (6 decimals). */
const eurcWallet = () =>
  new FakePayer({
    selectOption: (accepts) => accepts.find((option) => option.asset === EURC_MINT) ?? null,
    decimalAmount: (option) => divPow10(option.amount, 6),
  });

const isXrpl = (option: PaymentOption) => option.network === "xrpl:0";

const usdStarterChallenge = () => loadFixture("topup-challenge-usd-starter");

const usdStarterCreated = (token: string) =>
  topupCreated(
    token,
    settlementHeader({ transaction: TX_HASH, network: "xrpl:0", payer: XRPL_BUYER }),
  );

const eurOneCreated = (token: string) =>
  topupCreated(
    token,
    settlementHeader({
      transaction: SOLANA_SIGNATURE,
      network: SOLANA_MAINNET,
      payer: SOLANA_BUYER,
    }),
    { wallet: `${SOLANA_MAINNET}:${SOLANA_BUYER}`, denomination: "EUR", balance: "1" },
  );

/** The 201 of a paid retry without a `PAYMENT-RESPONSE` header (no settled receipt). */
function usdStarterCreatedUnsettled(token: string): ResponseFixture {
  const created = loadFixture("topup-201-usd-starter", { "<credit-token>": token });
  const { "payment-response": _settlement, ...headers } = created.headers;
  return { ...created, headers };
}

/** The settled 201 without its `wallet` member and with a non-decimal `balance`. */
function usdStarterCreatedMalformed(token: string): ResponseFixture {
  const created = usdStarterCreated(token);
  const { wallet: _wallet, ...body } = created.body;
  return { ...created, body: { ...body, balance: "abc" } };
}

/** A gateway's 502 with an HTML body (no RFC 9457 problem). */
const badGatewayHtml: ScriptedResponse = {
  status: 502,
  headers: { "content-type": "text/html" },
  body: "<html><body><h1>502 Bad Gateway</h1></body></html>",
};

/** The recorded settlement failure without `pending_token`: a definitive refusal (design D7). */
function definitiveSettlementFailure(): ResponseFixture {
  const recorded = loadFixture("topup-ambiguous-402");
  const { pending_token: _pending, ...body } = recorded.body;
  return { ...recorded, body };
}

/** The recorded challenge's RLUSD `xrpl:0` entry as an error's option summary. */
function paidRlusdSummary() {
  const challenge = usdStarterChallenge();
  const offered = decodePaymentRequired(challenge.headers["payment-required"] ?? "")
    .accepts as PaymentOption[];
  return offered
    .filter(isXrpl)
    .map(({ network, asset, amount, payTo }) => ({ network, asset, amount, payTo }));
}

const ambiguousSettlement = (token: string) =>
  withBodyMembers(loadFixture("topup-ambiguous-402", { "<credit-token>": token }), {
    event_id: "evt-7",
  });

const client = (fake: FakeTransport, config: KitConfig = {}) =>
  new ApiClient(xrpl, { transport: fake.transport, ...config });

const scripted = (...responses: ScriptedResponse[]) => {
  const fake = new FakeTransport();
  for (const response of responses) fake.respond(response);
  return fake;
};

/** The error a synchronous step throws, or `undefined` when it returns. */
function thrown(run: () => unknown): unknown {
  try {
    run();
    return undefined;
  } catch (error) {
    return error;
  }
}

async function outcome(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (error) {
    return error;
  }
}

/** The provisional token and event id of the ambiguous top-up error (design Contracts). */
type SettlementError = CriptonProblemError & { pendingToken?: string; eventId?: string };

function expectTopupRequest(request: RecordedRequest | undefined, url: string): void {
  expect(request?.method).toBe("POST");
  expect(request?.url).toBe(url);
  expect(request?.headers.authorization).toBeUndefined();
}

/** Compares as decimals, so `1` equals `1.00` and `1.21` equals `1.210`. */
function expectDecimal(actual: string | null | undefined, expected: string): void {
  expect(actual, `decimal ${String(actual)} equals ${expected}`).not.toBeNull();
  expect(cmp(actual ?? "0", expected), `decimal ${String(actual)} equals ${expected}`).toBe(0);
}

async function boughtUsdStarter(token: string) {
  const fake = scripted(usdStarterChallenge(), usdStarterCreated(token));
  const wallet = rlusdWallet();
  const kit = client(fake, { wallet });
  const result = await kit.topup({ bundle: "usd-starter", maxAmount: "1.00" });
  return { fake, wallet, kit, result };
}

async function ambiguousTopup(token: string) {
  const fake = scripted(usdStarterChallenge(), ambiguousSettlement(token));
  const kit = client(fake, { wallet: rlusdWallet() });
  const error = await outcome(() => kit.topup({ bundle: "usd-starter", maxAmount: "1.00" }));
  return { fake, kit, error };
}

describe("top-up", () => {
  it("Top-up within its cap", async () => {
    const token = creditToken();
    const { fake, result } = await boughtUsdStarter(token);
    expect(result.token === token, "result.token holds the bought token").toBe(true);
    expect(result.wallet).toBe(`xrpl:0:${XRPL_BUYER}`);
    expect(result.denomination).toBe("USD");
    expectDecimal(result.balance, "0.82");
    expect(result.lotExpiresAt).toBe("2027-11-12T18:20:05Z");
    expect(result.pending).toBe(false);
    expect(result.receipt).toMatchObject({ transaction: TX_HASH, network: "xrpl:0" });
    expect(fake.requests).toHaveLength(2);
    expectTopupRequest(fake.requests[0], USD_STARTER_URL);
    expectTopupRequest(fake.requests[1], USD_STARTER_URL);
    expect(fake.requests[1]?.headers["payment-signature"]).toBe("fake-signature");
  });

  it("Top-up above its cap", async () => {
    const fake = scripted(eurOneTopupChallenge());
    const wallet = eurcWallet();
    const kit = client(fake, { wallet });
    const error = await outcome(() => kit.topup({ bundle: "eur-1", maxAmount: "1.00" }));
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect((error as CriptonPaymentError).code).toBe("payment-over-cap");
    expect(wallet.signed).toHaveLength(0);
    expect(fake.requests).toHaveLength(1);
    expectTopupRequest(fake.requests[0], EUR_ONE_URL);
  });

  it("Top-up ignores the per-call limits", async () => {
    const token = creditToken();
    const fake = scripted(usdStarterChallenge(), usdStarterCreated(token));
    const kit = client(fake, {
      tier: "pro",
      wallet: rlusdWallet(),
      payment: { maxPerCall: "0.05", sessionBudget: "0.1" },
    });
    const result = await kit.topup({ bundle: "usd-starter", maxAmount: "1.00" });
    expect(result.token === token, "result.token holds the bought token").toBe(true);
    expectDecimal(kit.spent(), "0");
    expect(fake.requests).toHaveLength(2);
    expectTopupRequest(fake.requests[1], USD_STARTER_URL);
  });

  it("Top-up without a wallet", async () => {
    const challenge = usdStarterChallenge();
    const fake = scripted(challenge);
    const kit = client(fake, { tier: "pro" });
    const error = await outcome(() => kit.topup({ bundle: "usd-starter", maxAmount: "1.00" }));
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect((error as CriptonPaymentError).code).toBe("payment-disabled");
    const offered = decodePaymentRequired(challenge.headers["payment-required"] ?? "")
      .accepts as PaymentOption[];
    expect((error as CriptonPaymentError).options).toEqual(
      offered.map(({ network, asset, amount, payTo }) => ({ network, asset, amount, payTo })),
    );
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.headers["payment-signature"]).toBeUndefined();
  });

  it("Invalid bundle id", async () => {
    const fake = new FakeTransport();
    const kit = client(fake, { wallet: rlusdWallet() });
    const error = await outcome(() => kit.topup({ bundle: "USD Starter", maxAmount: "1.00" }));
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect((error as CriptonValidationError).code).toBe("invalid-input");
    expect((error as CriptonValidationError).field).toBe("bundle");
    expect(fake.requests).toHaveLength(0);
  });

  it("Credits are never bought automatically", async () => {
    const fake = scripted(loadFixture("challenge-fee-credits-only"));
    const kit = client(fake, {
      tier: "pro",
      wallet: rlusdWallet(),
      payment: { maxPerCall: "0.05" },
    });
    const error = await outcome(() => kit.request({ route: "fee", schema: feeSchema }));
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect((error as CriptonPaymentError).code).toBe("credits-required");
    const purchases = fake.requests.filter((request) =>
      new URL(request.url).pathname.startsWith("/v1/pro/credits/"),
    );
    expect(purchases).toHaveLength(0);
    expect(fake.requests).toHaveLength(1);
  });

  it("Top-up budget exhausted", async () => {
    const fake = scripted(
      eurOneTopupChallenge(),
      eurOneCreated(creditToken()),
      eurOneTopupChallenge(),
    );
    const wallet = eurcWallet();
    const kit = client(fake, { wallet, credits: { topupBudget: "2.00" } });
    await kit.topup({ bundle: "eur-1", maxAmount: "1.21" });
    expectDecimal(kit.topupSpent(), "1.21");
    const error = await outcome(() => kit.topup({ bundle: "eur-1", maxAmount: "1.21" }));
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect((error as CriptonPaymentError).code).toBe("payment-budget-exhausted");
    expect(wallet.signed).toHaveLength(1);
    expect(fake.requests).toHaveLength(3);
    expect(fake.requests[2]?.headers["payment-signature"]).toBeUndefined();
  });

  it("Top-up spend reported apart", async () => {
    const fake = scripted(usdStarterChallenge(), usdStarterCreated(creditToken()));
    const kit = client(fake, { wallet: rlusdWallet(), credits: { topupBudget: "2.00" } });
    await kit.topup({ bundle: "usd-starter", maxAmount: "1.00" });
    expectDecimal(kit.topupSpent(), "1.00");
    expectDecimal(kit.spent(), "0");
  });

  it("Ambiguous top-up settlement", async () => {
    const token = creditToken();
    const { fake, kit, error } = await ambiguousTopup(token);
    expect(error).toBeInstanceOf(CriptonProblemError);
    const problem = error as SettlementError;
    expect(problem.code).toBe("payment-settlement-failed");
    expect(problem.status).toBe(402);
    expect(problem.pendingToken === token, "pendingToken holds the provisional token").toBe(true);
    expect(problem.eventId).toBe("evt-7");
    expectDecimal(kit.topupSpent(), "1.00");
    expect(fake.requests).toHaveLength(2);
  });

  it("Top-up result serialized", async () => {
    const token = creditToken();
    const { result } = await boughtUsdStarter(token);
    const json = JSON.stringify(result);
    expect(json).toContain('"token":"[redacted]"');
    expectTokenAbsent([result], token);
    expect(result.token === token, "result.token still holds the token").toBe(true);
  });

  it("Provisional token serialized", async () => {
    const token = creditToken();
    const { error } = await ambiguousTopup(token);
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(JSON.stringify(error)).toContain("evt-7");
    expectTokenAbsent([error], token);
    expect(Object.keys(error as object)).not.toContain("pendingToken");
  });

  it("Top-up sends no credentials", async () => {
    const token = creditToken();
    const fake = scripted(usdStarterChallenge(), usdStarterCreated(creditToken()));
    const kit = client(fake, { tier: "pro", wallet: rlusdWallet(), credits: { token } });
    await kit.topup({ bundle: "usd-starter", maxAmount: "1.00" });
    expect(fake.requests).toHaveLength(2);
    for (const request of fake.requests) {
      expect(
        request.headers.authorization === undefined,
        "top-up request carries no Authorization header",
      ).toBe(true);
    }
  });

  it("Top-up answered without a settled receipt", async () => {
    const token = creditToken();
    const fake = scripted(usdStarterChallenge(), usdStarterCreatedUnsettled(token));
    const kit = client(fake, { wallet: rlusdWallet() });
    const result = await kit.topup({ bundle: "usd-starter", maxAmount: "1.00" });
    expect(result.token === token, "result.token holds the bought token").toBe(true);
    expect(result.receipt).toBeNull();
    expectDecimal(kit.topupSpent(), "1.00");
  });

  it("Top-up answer with a malformed member", async () => {
    const token = creditToken();
    const fake = scripted(usdStarterChallenge(), usdStarterCreatedMalformed(token));
    const kit = client(fake, { wallet: rlusdWallet() });
    const result = await kit.topup({ bundle: "usd-starter", maxAmount: "1.00" });
    expect(result.token === token, "result.token holds the bought token").toBe(true);
    expect(result.receipt).toMatchObject({ transaction: TX_HASH, network: "xrpl:0" });
    expect(result.wallet).toBeNull();
    expect(result.balance).toBeNull();
  });

  it("Top-up answered with a server error after signing", async () => {
    const fake = scripted(usdStarterChallenge(), badGatewayHtml);
    const kit = client(fake, { wallet: rlusdWallet(), credits: { topupBudget: "2.00" } });
    const error = await outcome(() => kit.topup({ bundle: "usd-starter", maxAmount: "1.00" }));
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect((error as CriptonProblemError).code).toBe("unexpected-status");
    expect((error as CriptonProblemError).status).toBe(502);
    expectDecimal(kit.topupSpent(), "1.00");
    expect(fake.requests).toHaveLength(2);
  });

  it("Top-up retry without an answer", async () => {
    const fake = scripted(usdStarterChallenge()).reject(new TypeError("fetch failed"));
    const kit = client(fake, { wallet: rlusdWallet() });
    const error = await outcome(() => kit.topup({ bundle: "usd-starter", maxAmount: "1.00" }));
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect((error as CriptonPaymentError).code).toBe("payment-outcome-unknown");
    expect((error as CriptonPaymentError).options).toEqual(paidRlusdSummary());
    expectDecimal(kit.topupSpent(), "1.00");
    expect(fake.requests).toHaveLength(2);
  });

  it("Top-up refused definitively after signing", async () => {
    const fake = scripted(usdStarterChallenge(), definitiveSettlementFailure());
    const kit = client(fake, { wallet: rlusdWallet() });
    const error = await outcome(() => kit.topup({ bundle: "usd-starter", maxAmount: "1.00" }));
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect((error as CriptonProblemError).code).toBe("payment-settlement-failed");
    expectDecimal(kit.topupSpent(), "0");
  });

  it("Invalid top-up budget", () => {
    const fake = new FakeTransport();
    const error = thrown(() => client(fake, { credits: { topupBudget: "abc" } }));
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect((error as CriptonValidationError).code).toBe("invalid-input");
    expect((error as CriptonValidationError).field).toBe("credits.topupBudget");
    expect(fake.requests).toHaveLength(0);
  });

  it("Adopted token needs the pro tier", async () => {
    const token = creditToken();
    const fake = scripted({ status: 200, body: feeBody });
    const kit = client(fake, { tier: "free" });
    const error = thrown(() => kit.adoptToken(token));
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect((error as CriptonValidationError).code).toBe("invalid-input");
    expect((error as CriptonValidationError).field).toBe("tier");
    const message = (error as CriptonValidationError).message;
    expect(message.includes(token), "the error message contains the token").toBe(false);
    expectTokenAbsent([error], token);

    await kit.request({ route: "fee", schema: feeSchema });
    expect(fake.requests).toHaveLength(1);
    expect(new URL(fake.requests[0]?.url ?? "http://none/").pathname).toBe("/v1/xrpl/fee");
    expect(
      fake.requests[0]?.headers.authorization === undefined,
      "the free-tier data request carries no Authorization header",
    ).toBe(true);
  });

  it("Top-up result inspected", async () => {
    const token = creditToken();
    const { result } = await boughtUsdStarter(token);
    expect(inspect(result).includes(token), "inspected result contains the token").toBe(false);
  });
});
