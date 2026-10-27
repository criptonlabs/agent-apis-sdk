import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { CriptonPaymentError, CriptonProblemError } from "../../../src/domain/errors.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { FakePayer } from "../../support/fake-payer.js";
import { FakeTransport, type ScriptedResponse } from "../../support/fake-transport.js";
import { FEE_URL, problem, xrplOption } from "../../support/x402-fixtures.js";
import type { PaymentOption } from "../../../src/domain/payment-option.js";

const descriptor = { network: "xrpl", productToken: "xrpl-agent-kit/0.1.0" };
const schema = z.object({ fee: z.object({ standard: z.string() }) });
const PREPAID = "com.criptonlabs/prepaid-credits";

const offerInfo = {
  bundle_version: "v1",
  topup_url: "https://api.criptonlabs.com/v1/pro/credits/{id}",
  assets: { USD: [{ asset: "USDC", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" }] },
  bundles: [
    {
      id: "usd-starter",
      amount: "1.00",
      credited_units: "1",
      approx_calls: 1000,
      activation: "confirmed",
    },
  ],
  client_setup: { note: "note", guide: "https://api.criptonlabs.com/docs/guides/payments.md" },
};
const expectedOffer = {
  bundleVersion: "v1",
  topupUrl: "https://api.criptonlabs.com/v1/pro/credits/{id}",
  bundles: [{ id: "usd-starter", amount: "1.00", creditedUnits: "1", approxCalls: 1000 }],
};

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

function prepaidChallenge(accepts: PaymentOption[], error?: string): ScriptedResponse {
  const required = {
    x402Version: 2,
    resource: { url: FEE_URL },
    accepts,
    extensions: { [PREPAID]: { info: offerInfo, schema: { type: "object" } } },
  };
  const base = problem("payment-required", 402, { "PAYMENT-REQUIRED": b64(required) });
  return {
    ...base,
    body: { ...(base.body as object), ...required, ...(error ? { error } : {}) },
  };
}

const call = (client: ApiClient) => client.request({ route: "fee", schema });

describe("prepaid signals", () => {
  it("Credits-only route", async () => {
    const fake = new FakeTransport().respond(prepaidChallenge([], "credits_only"));
    const payer = new FakePayer();
    const client = new ApiClient(descriptor, {
      tier: "pro",
      transport: fake.transport,
      payment: { payer, maxPerCall: "1" },
    });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({
      code: "credits-required",
      reason: "credits_only",
      prepaidOffer: expectedOffer,
    });
    expect((error as CriptonPaymentError).toJSON().details).toMatchObject({
      prepaidOffer: expectedOffer,
      reason: "credits_only",
    });
    expect(payer.signed).toHaveLength(0);
    expect(fake.requests).toHaveLength(1);
  });

  it("Credits-only route without payment configuration", async () => {
    const fake = new FakeTransport().respond(prepaidChallenge([]));
    const client = new ApiClient(descriptor, { tier: "pro", transport: fake.transport });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "credits-required", prepaidOffer: expectedOffer });
  });

  it("Per-call challenge with a prepaid offer and no payer", async () => {
    const fake = new FakeTransport().respond(prepaidChallenge([xrplOption()]));
    const client = new ApiClient(descriptor, { tier: "pro", transport: fake.transport });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "payment-disabled", prepaidOffer: expectedOffer });
    expect((error as CriptonPaymentError).options).toHaveLength(1);
  });

  it("Unsupported option with a prepaid offer", async () => {
    const fake = new FakeTransport().respond(prepaidChallenge([xrplOption()]));
    const payer = new FakePayer({ selectOption: () => null });
    const client = new ApiClient(descriptor, {
      tier: "pro",
      transport: fake.transport,
      payment: { payer, maxPerCall: "1" },
    });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: "no-supported-payment-option",
      prepaidOffer: expectedOffer,
    });
  });

  it("Daily free quota exhausted", async () => {
    const base = problem("rate-limited", 429, { "Retry-After": "3600" });
    const fake = new FakeTransport().respond({
      ...base,
      body: {
        ...(base.body as object),
        retry_after_seconds: 3600,
        extensions: { [PREPAID]: { info: offerInfo, schema: { type: "object" } } },
      },
    });
    const client = new ApiClient(descriptor, { tier: "free", transport: fake.transport });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({
      code: "rate-limited",
      status: 429,
      retryAfterSeconds: 3600,
      prepaidOffer: expectedOffer,
    });
    expect((error as CriptonProblemError).toJSON().details).toMatchObject({
      prepaidOffer: expectedOffer,
    });
  });

  it("Credit refusal reason", async () => {
    const base = problem("payment-required", 402);
    const fake = new FakeTransport().respond({
      ...base,
      body: { ...(base.body as object), error: "credits_insufficient" },
    });
    const client = new ApiClient(descriptor, { tier: "pro", transport: fake.transport });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({ code: "payment-required", reason: "credits_insufficient" });
    expect((error as CriptonProblemError).toJSON().details).toMatchObject({
      reason: "credits_insufficient",
    });
  });

  it("Malformed prepaid offer ignored", async () => {
    const base = problem("rate-limited", 429);
    const fake = new FakeTransport().respond({
      ...base,
      body: {
        ...(base.body as object),
        extensions: { [PREPAID]: { info: { bundle_version: "v1" }, schema: {} } },
      },
    });
    const client = new ApiClient(descriptor, { tier: "free", transport: fake.transport });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect((error as CriptonProblemError).prepaidOffer).toBeUndefined();
  });
});
