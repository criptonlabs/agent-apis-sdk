import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import {
  CriptonKitError,
  CriptonPaymentError,
  CriptonProblemError,
  CriptonValidationError,
} from "../../../src/domain/errors.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import {
  creditToken,
  decodePaymentRequired,
  encodePaymentRequired,
  expectTokenAbsent,
  loadFixture,
  readinessBody,
  withBodyMembers,
  withHeaders,
  type ResponseFixture,
} from "../../support/credit-fixtures.js";
import { FakePayer } from "../../support/fake-payer.js";
import { FakeSiwxSigner } from "../../support/fake-siwx-signer.js";
import { FakeTransport } from "../../support/fake-transport.js";
import { paid, problem } from "../../support/x402-fixtures.js";

const xrpl = { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" };
const solana = { network: "solana", productToken: "agent-apis-solana/0.1.0" };
const feeSchema = z.object({ fee: z.object({ standard: z.string() }) });
const readinessSchema = z.object({ verdict: z.string() });
const tokenSchema = z.object({ mint: z.string() });
const FEE_URL = "https://api.criptonlabs.com/v1/pro/xrpl/fee";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const READINESS_QUERY = {
  source: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
  destination: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  asset: "XRP",
  amount: "10",
};
const BALANCE = { EUR: "1.9995", USD: "0" };

const creditPaidFee = () => loadFixture("credit-paid-fee");

/** The recorded credits-only challenge of `/v1/pro/xrpl/fee` with a credit refusal in `error`. */
const creditsOnlyRefusal = (error: string) =>
  withBodyMembers(loadFixture("challenge-fee-credits-only"), { error });

/** The credits-only challenge rebound to `/v1/pro/solana/token/{mint}`, refused with `credits_invalid`. */
function revokedTokenChallenge(): ResponseFixture {
  const recorded = loadFixture("challenge-fee-credits-only");
  const path = `/v1/pro/solana/token/${USDC_MINT}`;
  const url = `https://api.criptonlabs.com${path}`;
  const required = decodePaymentRequired(recorded.headers["payment-required"] ?? "");
  const extensions = required.extensions as Record<string, { info: Record<string, unknown> }>;
  const siwx = extensions["sign-in-with-x"];
  const rebound = {
    ...required,
    resource: { ...(required.resource as object), url },
    extensions: {
      ...extensions,
      ...(siwx ? { "sign-in-with-x": { ...siwx, info: { ...siwx.info, uri: url } } } : {}),
    },
  };
  return {
    ...recorded,
    headers: { ...recorded.headers, "payment-required": encodePaymentRequired(rebound) },
    body: { ...recorded.body, ...rebound, instance: path, error: "credits_invalid" },
  };
}

function idempotencyConflict(): ResponseFixture {
  const base = problem("idempotency-key-conflict", 409) as ResponseFixture;
  return withBodyMembers(base, { error: "idempotency_key_mismatch" });
}

const xrplCreditClient = (fake: FakeTransport, token: string) =>
  new ApiClient(xrpl, { tier: "pro", transport: fake.transport, credits: { token } });

const feeCall = (client: ApiClient, idempotencyKey?: string) =>
  client.request({
    route: "fee",
    schema: feeSchema,
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  });

const caught = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);

function constructionError(token: string, fake: FakeTransport): unknown {
  try {
    new ApiClient(xrpl, { tier: "free", transport: fake.transport, credits: { token } });
  } catch (error) {
    return error;
  }
  return undefined;
}

function siwxConstructionError(signer: FakeSiwxSigner, fake: FakeTransport): unknown {
  try {
    new ApiClient(solana, {
      tier: "free",
      transport: fake.transport,
      credits: { siwxSigner: signer, siwxSpend: true },
    });
  } catch (error) {
    return error;
  }
  return undefined;
}

/** Compares without printing the token in a failure message. */
function expectBearer(fake: FakeTransport, index: number, token: string): void {
  const authorization = fake.requests[index]?.headers.authorization;
  expect(
    authorization === `Bearer ${token}`,
    `request ${index} carries Authorization: Bearer <configured token> (received ${authorization === undefined ? "no Authorization header" : "another value"})`,
  ).toBe(true);
}

async function insufficientOnCreditsOnly(token: string) {
  const fake = new FakeTransport().respond(creditsOnlyRefusal("credits_insufficient"));
  const error = await caught(feeCall(xrplCreditClient(fake, token)));
  return { fake, error };
}

async function revokedToken(token: string) {
  const fake = new FakeTransport().respond(revokedTokenChallenge());
  const client = new ApiClient(solana, {
    tier: "pro",
    transport: fake.transport,
    credits: { token },
  });
  const error = await caught(client.request({ route: `token/${USDC_MINT}`, schema: tokenSchema }));
  return { fake, error };
}

async function invalidIdempotencyKey(token: string) {
  const fake = new FakeTransport().respond(creditPaidFee());
  const error = await caught(feeCall(xrplCreditClient(fake, token), "bad key!"));
  return { fake, error };
}

async function idempotencyKeyConflict(token: string) {
  const fake = new FakeTransport().respond(idempotencyConflict());
  const error = await caught(feeCall(xrplCreditClient(fake, token), "order-42"));
  return { fake, error };
}

describe("credit spending", () => {
  it("No credentials without configuration", async () => {
    const fake = new FakeTransport().respond(loadFixture("challenge-fee-credits-only"));
    const client = new ApiClient(xrpl, { tier: "pro", transport: fake.transport });
    await caught(feeCall(client));
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.headers.authorization).toBeUndefined();
  });

  it("Credit token with the free tier", () => {
    const fake = new FakeTransport().respond(creditPaidFee());
    const error = constructionError(creditToken(), fake);
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect(error).toMatchObject({ code: "invalid-input", field: "tier" });
    expect(fake.requests).toHaveLength(0);
  });

  it("SIWX spending with the free tier", () => {
    const fake = new FakeTransport().respond(creditPaidFee());
    const signer = new FakeSiwxSigner();
    const error = siwxConstructionError(signer, fake);
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect(error).toMatchObject({ code: "invalid-input", field: "tier" });
    expect(fake.requests).toHaveLength(0);
    expect(signer.calls).toHaveLength(0);
  });

  it("Credits-only route paid with the token", async () => {
    const token = creditToken();
    const fake = new FakeTransport().respond(creditPaidFee());
    const client = xrplCreditClient(fake, token);
    const result = await feeCall(client);
    expect(result.data.fee.standard).toBe("5000");
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.url).toBe(FEE_URL);
    expectBearer(fake, 0, token);
    expect(fake.requests[0]?.headers["payment-signature"]).toBeUndefined();
    expect(client.spent()).toBe("0");
  });

  it("Insufficient credits on a per-call route with a payer", async () => {
    const token = creditToken();
    const fake = new FakeTransport()
      .respond(loadFixture("credit-refusal-insufficient"))
      .respond({ ...paid(), body: readinessBody() });
    const payer = new FakePayer({
      selectOption: (accepts) => accepts.find((option) => option.network === "xrpl:0") ?? null,
    });
    const client = new ApiClient(xrpl, {
      tier: "pro",
      transport: fake.transport,
      wallet: payer,
      payment: { maxPerCall: "0.05" },
      credits: { token },
    });
    const result = await client.request({
      route: "payment-readiness",
      query: READINESS_QUERY,
      schema: readinessSchema,
    });
    expect(result.data.verdict).toBe("not_ready");
    expect(result.receipt).toMatchObject({ network: "xrpl:0", amount: "0.01452" });
    expect(payer.signed).toHaveLength(1);
    expect(payer.signed[0]).toMatchObject({ network: "xrpl:0", amount: "0.01452" });
    expect(fake.requests).toHaveLength(2);
    expectBearer(fake, 0, token);
    expect(fake.requests[1]?.headers["payment-signature"]).toBe("fake-signature");
    expect(
      fake.requests[1]?.headers.authorization === undefined,
      "paid retry carries no Authorization header",
    ).toBe(true);
  });

  it("Insufficient credits on a per-call route without a payer", async () => {
    const token = creditToken();
    const fake = new FakeTransport().respond(loadFixture("credit-refusal-insufficient"));
    const client = new ApiClient(xrpl, {
      tier: "pro",
      transport: fake.transport,
      credits: { token },
    });
    const error = await caught(
      client.request({
        route: "payment-readiness",
        query: READINESS_QUERY,
        schema: readinessSchema,
      }),
    );
    expectBearer(fake, 0, token);
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "payment-disabled", reason: "credits_insufficient" });
    expect((error as CriptonPaymentError).options).toEqual(
      expect.arrayContaining([expect.objectContaining({ network: "xrpl:0", amount: "0.01452" })]),
    );
    expect(fake.requests).toHaveLength(1);
  });

  it("Insufficient credits on a credits-only route", async () => {
    const token = creditToken();
    const { fake, error } = await insufficientOnCreditsOnly(token);
    expectBearer(fake, 0, token);
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({
      code: "credits-required",
      reason: "credits_insufficient",
      prepaidOffer: { bundleVersion: "2026-10-26" },
    });
    expect(fake.requests).toHaveLength(1);
  });

  it("Revoked credit token", async () => {
    const token = creditToken();
    const { fake, error } = await revokedToken(token);
    expect(fake.requests[0]?.url).toBe(
      `https://api.criptonlabs.com/v1/pro/solana/token/${USDC_MINT}`,
    );
    expectBearer(fake, 0, token);
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "credits-required", reason: "credits_invalid" });
  });

  it("Balance after a credit debit", async () => {
    const fake = new FakeTransport().respond(creditPaidFee());
    const client = xrplCreditClient(fake, creditToken());
    const result = await feeCall(client);
    expect(result.credits).toEqual(BALANCE);
    expect(client.lastKnownBalance()).toEqual(BALANCE);
  });

  it("No balance before any credit call", () => {
    const fake = new FakeTransport();
    const client = xrplCreditClient(fake, creditToken());
    expect(client.lastKnownBalance()).toBeNull();
    expect(fake.requests).toHaveLength(0);
  });

  it("Malformed balance header ignored", async () => {
    const fake = new FakeTransport()
      .respond(creditPaidFee())
      .respond(withHeaders(creditPaidFee(), { "x-credits-remaining": "EUR=abc" }));
    const client = xrplCreditClient(fake, creditToken());
    await feeCall(client);
    const result = await feeCall(client);
    expect(result.data.fee.standard).toBe("5000");
    expect(client.lastKnownBalance()).toEqual(BALANCE);
  });

  it("Replayed credit call", async () => {
    const fake = new FakeTransport().respond(
      withHeaders(creditPaidFee(), { "idempotency-replayed": "true" }),
    );
    const result = await feeCall(xrplCreditClient(fake, creditToken()), "order-42");
    expect(fake.requests[0]?.headers["idempotency-key"]).toBe("order-42");
    expect(result.replayed).toBe(true);
  });

  it("Invalid idempotency key", async () => {
    const { fake, error } = await invalidIdempotencyKey(creditToken());
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect(error).toMatchObject({ code: "invalid-input", field: "idempotencyKey" });
    expect(fake.requests).toHaveLength(0);
    const longFake = new FakeTransport().respond(creditPaidFee());
    const longError = await caught(
      feeCall(xrplCreditClient(longFake, creditToken()), "a".repeat(129)),
    );
    expect(longError).toBeInstanceOf(CriptonValidationError);
    expect(longError).toMatchObject({ code: "invalid-input", field: "idempotencyKey" });
    expect(longFake.requests).toHaveLength(0);
  });

  it("Idempotency key conflict", async () => {
    const { error } = await idempotencyKeyConflict(creditToken());
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({
      code: "idempotency-key-conflict",
      status: 409,
      reason: "idempotency_key_mismatch",
    });
  });

  it("Configured token absent from errors", async () => {
    const token = creditToken();
    const errors = [
      constructionError(token, new FakeTransport()),
      (await insufficientOnCreditsOnly(token)).error,
      (await revokedToken(token)).error,
      (await invalidIdempotencyKey(token)).error,
      (await idempotencyKeyConflict(token)).error,
    ];
    for (const error of errors) expect(error).toBeInstanceOf(CriptonKitError);
    expectTokenAbsent(errors, token);
  });
});
