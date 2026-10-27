import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import {
  CriptonPaymentError,
  CriptonProblemError,
  CriptonResponseError,
} from "../../../src/domain/errors.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { FakePayer } from "../../support/fake-payer.js";
import { FakeTransport } from "../../support/fake-transport.js";
import {
  FEE_URL,
  PAY_TO,
  PAYER,
  RLUSD_HEX,
  TX_HASH,
  challenge,
  feeBody,
  paid,
  problem,
  xrplOption,
} from "../../support/x402-fixtures.js";

const descriptor = { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" };
const schema = z.object({
  fee: z.object({ standard: z.string() }),
  meta: z.object({ stale: z.boolean() }),
});

function setup(
  fake: FakeTransport,
  payer: FakePayer,
  limits: { maxPerCall: string; sessionBudget?: string },
) {
  return new ApiClient(descriptor, {
    tier: "pro",
    transport: fake.transport,
    payment: { payer, ...limits },
  });
}
const call = (client: ApiClient) => client.request({ route: "fee", schema });
const signatureRequests = (fake: FakeTransport) =>
  fake.requests.filter((r) => "payment-signature" in r.headers);

describe("x402 flow", () => {
  it("Paid tier without payment configuration", async () => {
    const fake = new FakeTransport().respond(challenge(xrplOption()));
    const client = new ApiClient(descriptor, { tier: "pro", transport: fake.transport });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "payment-disabled" });
    expect((error as CriptonPaymentError).options).toEqual([
      { network: "xrpl:0", asset: RLUSD_HEX, amount: "0.012", payTo: PAY_TO },
    ]);
    expect(fake.requests).toHaveLength(1);
    expect(signatureRequests(fake)).toHaveLength(0);
  });

  it("Paid route served free while payments are off", async () => {
    const fake = new FakeTransport().respond({ body: feeBody });
    const payer = new FakePayer();
    const client = setup(fake, payer, { maxPerCall: "0.05" });
    const result = await call(client);
    expect(result.data.fee.standard).toBe("10");
    expect(result.receipt).toBeNull();
    expect(payer.signed).toHaveLength(0);
    expect(client.spent()).toBe("0");
  });

  it("No acceptable option", async () => {
    const fake = new FakeTransport().respond(challenge(xrplOption()));
    const payer = new FakePayer({ selectOption: () => null });
    const client = setup(fake, payer, { maxPerCall: "0.05" });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "no-supported-payment-option" });
    expect(payer.signed).toHaveLength(0);
  });

  it("Price above the per-call cap", async () => {
    const fake = new FakeTransport().respond(challenge(xrplOption("0.012")));
    const payer = new FakePayer();
    const client = setup(fake, payer, { maxPerCall: "0.01" });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "payment-over-cap" });
    expect(payer.signed).toHaveLength(0);
    expect(signatureRequests(fake)).toHaveLength(0);
  });

  it("Session budget exhausted", async () => {
    const fake = new FakeTransport()
      .respond(challenge(xrplOption()))
      .respond(paid())
      .respond(challenge(xrplOption()))
      .respond(paid())
      .respond(challenge(xrplOption()));
    const payer = new FakePayer();
    const client = setup(fake, payer, { maxPerCall: "0.05", sessionBudget: "0.03" });
    await call(client);
    await call(client);
    expect(client.spent()).toBe("0.024");
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "payment-budget-exhausted" });
    expect(payer.signed).toHaveLength(2);
  });

  it("Concurrent calls cannot overspend the budget", async () => {
    const fake = new FakeTransport().respondWith((request) =>
      "payment-signature" in request.headers ? paid() : challenge(xrplOption()),
    );
    const payer = new FakePayer({ delayMs: 20 });
    const client = setup(fake, payer, { maxPerCall: "0.05", sessionBudget: "0.02" });
    const results = await Promise.allSettled([call(client), call(client)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(CriptonPaymentError);
    expect(rejected[0]?.reason).toMatchObject({ code: "payment-budget-exhausted" });
    expect(payer.signed).toHaveLength(1);
  });

  it("Price exactly at the cap", async () => {
    const fake = new FakeTransport().respond(challenge(xrplOption("0.012"))).respond(paid());
    const payer = new FakePayer();
    const client = setup(fake, payer, { maxPerCall: "0.012" });
    await call(client);
    expect(payer.signed).toHaveLength(1);
    expect(client.spent()).toBe("0.012");
  });

  it("Successful paid call", async () => {
    const fake = new FakeTransport().respond(challenge(xrplOption())).respond(paid());
    const payer = new FakePayer();
    const client = setup(fake, payer, { maxPerCall: "0.05" });
    const result = await call(client);
    expect(result.data.fee.standard).toBe("10");
    expect(result.receipt).toEqual({
      transaction: TX_HASH,
      network: "xrpl:0",
      asset: RLUSD_HEX,
      amount: "0.012",
      payer: PAYER,
    });
    expect(client.spent()).toBe("0.012");
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[0]?.headers["payment-signature"]).toBeUndefined();
    expect(fake.requests[1]?.url).toBe(FEE_URL);
    expect(fake.requests[1]?.headers["payment-signature"]).toBe("fake-signature");
  });

  it("Settled payment with an invalid response body", async () => {
    const fake = new FakeTransport()
      .respond(challenge(xrplOption("0.012")))
      .respond({ ...paid(), body: { unexpected: true } });
    const client = setup(fake, new FakePayer(), { maxPerCall: "0.05" });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonResponseError);
    expect(error).toMatchObject({ code: "invalid-response" });
    expect(client.spent()).toBe("0.012");
  });

  it("Settlement failed", async () => {
    const fake = new FakeTransport()
      .respond(challenge(xrplOption()))
      .respond(problem("payment-settlement-failed", 402));
    const client = setup(fake, new FakePayer(), { maxPerCall: "0.05" });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({ code: "payment-settlement-failed", status: 402 });
    expect(fake.requests).toHaveLength(2);
    expect(client.spent()).toBe("0");
  });

  it("Payer limit reached", async () => {
    const fake = new FakeTransport()
      .respond(challenge(xrplOption()))
      .respond(problem("payer-limit-reached", 429, { "Retry-After": "3600" }));
    const client = setup(fake, new FakePayer(), { maxPerCall: "0.05" });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({ code: "payer-limit-reached", retryAfterSeconds: 3600 });
  });

  it("Payer blocked", async () => {
    const fake = new FakeTransport()
      .respond(challenge(xrplOption()))
      .respond(problem("payer-blocked", 403));
    const client = setup(fake, new FakePayer(), { maxPerCall: "0.05" });
    const error = await call(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({ code: "payer-blocked", status: 403 });
  });

  it("Secret absent from errors", async () => {
    const secret = crypto.randomUUID();
    const errors: unknown[] = [];
    const scenarios: Array<{
      script: (fake: FakeTransport) => void;
      payer: FakePayer;
      limits: { maxPerCall: string };
    }> = [
      {
        script: (f) => void f.respond(challenge(xrplOption())),
        payer: new FakePayer({ secret, selectOption: () => null }),
        limits: { maxPerCall: "0.05" },
      },
      {
        script: (f) => void f.respond(challenge(xrplOption())),
        payer: new FakePayer({ secret }),
        limits: { maxPerCall: "0.01" },
      },
      {
        script: (f) =>
          void f
            .respond(challenge(xrplOption()))
            .respond(problem("payment-settlement-failed", 402)),
        payer: new FakePayer({ secret }),
        limits: { maxPerCall: "0.05" },
      },
      {
        script: (f) =>
          void f.respond(challenge(xrplOption())).respond(problem("payer-blocked", 403)),
        payer: new FakePayer({ secret }),
        limits: { maxPerCall: "0.05" },
      },
    ];
    for (const scenario of scenarios) {
      const fake = new FakeTransport();
      scenario.script(fake);
      errors.push(
        await call(setup(fake, scenario.payer, scenario.limits)).catch((e: unknown) => e),
      );
    }
    expect(errors).toHaveLength(4);
    expect(errors[0]).toBeInstanceOf(CriptonPaymentError);
    expect(errors[1]).toBeInstanceOf(CriptonPaymentError);
    expect(errors[2]).toBeInstanceOf(CriptonProblemError);
    expect(errors[3]).toBeInstanceOf(CriptonProblemError);
    for (const error of errors) {
      expect(error).toBeInstanceOf(Error);
      expect(JSON.stringify(error)).not.toContain(secret);
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
