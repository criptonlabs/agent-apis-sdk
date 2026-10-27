import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { CriptonPaymentError } from "../../../src/domain/errors.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { FakePayer } from "../../support/fake-payer.js";
import { FakeTransport } from "../../support/fake-transport.js";
import { challenge, paid, xrplOption } from "../../support/x402-fixtures.js";

const descriptor = { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" };
const schema = z.object({ fee: z.object({ standard: z.string() }) });

const reports = (decimal: string) => new FakePayer({ decimalAmount: () => decimal });

describe("decimal amount", () => {
  it("Payer reports a decimal amount", async () => {
    const fake = new FakeTransport().respond(challenge(xrplOption("14520"))).respond(paid());
    const client = new ApiClient(descriptor, {
      tier: "pro",
      transport: fake.transport,
      payment: { payer: reports("0.01452"), maxPerCall: "0.05" },
    });
    const result = await client.request({ route: "fee", schema });
    expect(result.receipt?.amount).toBe("0.01452");
    expect(client.spent()).toBe("0.01452");
  });

  it("Decimal amount above the cap", async () => {
    // Offered amount under the cap, so only the payer's decimal amount can trip it.
    const fake = new FakeTransport().respond(challenge(xrplOption("0.005"))).respond(paid());
    const payer = reports("0.01452");
    const client = new ApiClient(descriptor, {
      tier: "pro",
      transport: fake.transport,
      payment: { payer, maxPerCall: "0.01" },
    });
    const error = await client.request({ route: "fee", schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "payment-over-cap" });
    expect(payer.signed).toHaveLength(0);
    expect(fake.requests.some((r) => "payment-signature" in r.headers)).toBe(false);
  });

  it("Payer without decimal amounts", async () => {
    const fake = new FakeTransport().respond(challenge(xrplOption("0.012"))).respond(paid());
    const payer = new FakePayer();
    const client = new ApiClient(descriptor, {
      tier: "pro",
      transport: fake.transport,
      payment: { payer, maxPerCall: "0.05" },
    });
    await client.request({ route: "fee", schema });
    expect("decimalAmount" in payer).toBe(false);
    expect(client.spent()).toBe("0.012");
  });
});
