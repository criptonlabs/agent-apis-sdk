import {
  ApiClient,
  CriptonPaymentError,
  CriptonValidationError,
  type PaymentOption,
} from "@criptonlabs/agent-apis-core";
import { describe, expect, it, vi } from "vite-plus/test";
import { Wallet } from "xrpl";
import { z } from "zod";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { challenge, paid, problem } from "../../../../core/tests/support/x402-fixtures.js";
import { createXrplAgentKit } from "../../../src/index.js";
import { XRPL_DESCRIPTOR } from "../../../src/infrastructure/descriptor.js";
import { createXrplPayer } from "../../../src/infrastructure/x402/xrpl-payer.js";
import { createFakeXrplClientFactory } from "../../support/fake-xrpl-client-factory.js";

const RLUSD_HEX = "524C555344000000000000000000000000000000";
const TESTNET_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";

function testnetOption(extra: Record<string, unknown> = {}): PaymentOption {
  return {
    scheme: "exact",
    network: "xrpl:1",
    asset: RLUSD_HEX,
    amount: "0.012",
    payTo: Wallet.generate().classicAddress,
    maxTimeoutSeconds: 60,
    extra: { issuer: TESTNET_ISSUER, areFeesSponsored: false, ...extra },
  };
}

function required(option: PaymentOption): unknown {
  return {
    x402Version: 2,
    resource: { url: "https://api.criptonlabs.com/v1/pro/xrpl/fee" },
    accepts: [option],
  };
}

describe("createXrplPayer", () => {
  it("Testnet payer", async () => {
    const seed = Wallet.generate().seed as string;
    const fake = createFakeXrplClientFactory();
    const payer = createXrplPayer({ seed, network: "testnet", clientFactory: fake.factory });
    const option = testnetOption();

    const headers = await payer.createPaymentHeaders(required(option), option);

    const signature = headers["PAYMENT-SIGNATURE"];
    expect(signature).toBeTypeOf("string");
    const payload = JSON.parse(Buffer.from(signature as string, "base64").toString("utf8"));
    expect(payload.accepted.network).toBe("xrpl:1");
  });

  it("Invalid seed", () => {
    let thrown: unknown;
    try {
      createXrplPayer({ seed: "not-a-seed" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CriptonValidationError);
    const error = thrown as CriptonValidationError;
    expect(error.code).toBe("invalid-input");
    expect(error.field).toBe("seed");
    expect(error.message).not.toContain("not-a-seed");
  });

  it("No ticket creation", async () => {
    const seed = Wallet.generate().seed as string;
    const fake = createFakeXrplClientFactory({ ticketSequences: [] });
    const payer = createXrplPayer({ seed, network: "testnet", clientFactory: fake.factory });
    const option = testnetOption({ assetTransferMethod: "ticketSequence" });

    await payer.createPaymentHeaders(required(option), option).catch(() => undefined);

    expect(fake.requests).toContain("account_objects");
    expect(fake.submissions).toEqual([]);
  });

  it("delegates option selection to the RLUSD policy", () => {
    const payer = createXrplPayer({
      seed: Wallet.generate().seed as string,
      network: "testnet",
      clientFactory: createFakeXrplClientFactory().factory,
    });
    const wanted = testnetOption();
    const solana: PaymentOption = { ...wanted, network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" };

    expect(payer.selectOption([solana, wanted])).toBe(wanted);
  });
});

describe("XRPL kit wallet", () => {
  it("Wallet without per-call payment", async () => {
    const option = testnetOption();
    const challenge = {
      x402Version: 2,
      resource: { url: "https://api.criptonlabs.com/v1/pro/xrpl/payment-readiness" },
      accepts: [option],
    };
    const header = Buffer.from(JSON.stringify(challenge)).toString("base64");
    const fake = new FakeTransport().respond(
      problem("payment-required", 402, { "PAYMENT-REQUIRED": header }),
    );
    const kit = createXrplAgentKit({
      transport: fake.transport,
      tier: "pro",
      // Unreachable local WebSocket: a kit that tried to sign could never reach a ledger.
      wallet: {
        seed: Wallet.generate().seed as string,
        network: "testnet",
        wsUrl: "ws://127.0.0.1:9",
      },
    });

    const error = await kit.data
      .paymentReadiness({
        source: Wallet.generate().classicAddress,
        destination: Wallet.generate().classicAddress,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "payment-disabled" });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.url).toContain("/v1/pro/xrpl/payment-readiness");
    expect(fake.requests.some((r) => "payment-signature" in r.headers)).toBe(false);
    expect(kit.spent()).toBe("0");
  });
});

const feeSchema = z.object({
  fee: z.object({ standard: z.string() }),
  meta: z.object({ stale: z.boolean() }),
});

/** An XRPL testnet payer for `seed` signing on the shared fake factory (it records every signing). */
function testnetClient(seed: string, fake: FakeTransport, events: string[]): ApiClient {
  const wallet = createXrplPayer({
    seed,
    network: "testnet",
    clientFactory: createFakeXrplClientFactory({ events }).factory,
  });
  return new ApiClient(XRPL_DESCRIPTOR, {
    tier: "pro",
    transport: fake.transport,
    wallet,
    payment: { maxPerCall: "0.05" },
  });
}

const payFee = (client: ApiClient) => client.request({ route: "fee", schema: feeSchema });

/** One macrotask turn: every continuation that can run without the pending paid retry has run. */
const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Two 402 challenges, then a first paid retry that stays pending, then an answer for the second. */
function twoChallengesFirstRetryPending(fake: FakeTransport) {
  fake.respond(challenge(testnetOption())).respond(challenge(testnetOption()));
  const firstRetry = fake.defer();
  fake.respond(paid());
  return firstRetry;
}

describe("XRPL payments of one account", () => {
  it("Two kits of one account pay one at a time", async () => {
    const seed = Wallet.generate().seed as string;
    const events: string[] = [];
    const fake = new FakeTransport();
    const firstRetry = twoChallengesFirstRetryPending(fake);
    const kitA = testnetClient(seed, fake, events);
    const kitB = testnetClient(seed, fake, events);

    const calls = Promise.allSettled([payFee(kitA), payFee(kitB)]);
    await firstRetry.reached;
    await nextTurn();
    expect(events, "only the first payment is signed while its paid retry is pending").toEqual([
      "sign",
    ]);
    events.push("release");
    firstRetry.release(paid());
    const results = await calls;

    expect(events).toEqual(["sign", "release", "sign"]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
  });

  it("A kit created after another kit's payments finished still pays one at a time", async () => {
    const seed = Wallet.generate().seed as string;
    const events: string[] = [];
    const fake = new FakeTransport().respond(challenge(testnetOption())).respond(paid());
    const kitA = testnetClient(seed, fake, events);
    await payFee(kitA);
    const kitB = testnetClient(seed, fake, events);
    events.length = 0;
    const firstRetry = twoChallengesFirstRetryPending(fake);

    const calls = Promise.allSettled([payFee(kitA), payFee(kitB)]);
    await firstRetry.reached;
    await nextTurn();
    expect(events, "only the first payment is signed while its paid retry is pending").toEqual([
      "sign",
    ]);
    events.push("release");
    firstRetry.release(paid());
    const results = await calls;

    expect(events).toEqual(["sign", "release", "sign"]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
  });

  it("Different accounts pay independently", async () => {
    const events: string[] = [];
    const fake = new FakeTransport();
    const firstRetry = twoChallengesFirstRetryPending(fake);
    const kitA = testnetClient(Wallet.generate().seed as string, fake, events);
    const kitB = testnetClient(Wallet.generate().seed as string, fake, events);

    const calls = Promise.allSettled([payFee(kitA), payFee(kitB)]);
    await firstRetry.reached;
    await nextTurn();
    expect(events, "the second payment is signed without waiting").toEqual(["sign", "sign"]);
    firstRetry.release(paid());
    const results = await calls;

    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
  });

  it("Payment busy after the wait limit", async () => {
    vi.useFakeTimers();
    try {
      const events: string[] = [];
      const fake = new FakeTransport();
      const firstRetry = twoChallengesFirstRetryPending(fake);
      const kit = testnetClient(Wallet.generate().seed as string, fake, events);

      const calls = Promise.allSettled([payFee(kit), payFee(kit)]);
      await firstRetry.reached;
      await vi.advanceTimersByTimeAsync(20_000);

      firstRetry.release(paid());
      const results = await calls;
      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected, "the waiting call fails once the wait limit passed").toHaveLength(1);
      const error = (rejected[0] as PromiseRejectedResult).reason;
      expect(error).toBeInstanceOf(CriptonPaymentError);
      expect(error).toMatchObject({ code: "payment-busy" });
      expect(events, "the second payment is never signed").toEqual(["sign"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
