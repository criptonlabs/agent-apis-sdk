import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import type { Transport } from "../../../src/application/ports.js";
import { CriptonPaymentError } from "../../../src/domain/errors.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { FakePayer } from "../../support/fake-payer.js";
import { FakeTransport, type ScriptedResponse } from "../../support/fake-transport.js";
import { challenge, paid, xrplOption } from "../../support/x402-fixtures.js";

const descriptor = { network: "xrpl", productToken: "xrpl-agent-kit/0.1.0" };
const schema = z.object({ fee: z.object({ standard: z.string() }) });

function toResponse(scripted: ScriptedResponse): Response {
  return new Response(JSON.stringify(scripted.body), {
    status: scripted.status ?? 200,
    headers: { "content-type": "application/json", ...scripted.headers },
  });
}

describe("paid retry", () => {
  it("Slow settlement within the paid timeout", async () => {
    let calls = 0;
    const transport: Transport = (_url, init) => {
      calls += 1;
      if (calls === 1) return Promise.resolve(toResponse(challenge(xrplOption())));
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(toResponse(paid())), 150);
        init.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(init.signal?.reason);
        });
      });
    };
    const client = new ApiClient(descriptor, {
      tier: "pro",
      transport,
      timeoutMs: 50,
      payment: { payer: new FakePayer(), maxPerCall: "0.05" },
    });
    const result = await client.request({ route: "fee", schema });
    expect(result.receipt).not.toBeNull();
    expect(client.spent()).toBe("0.012");
  });

  it("Paid retry without an answer", async () => {
    const fake = new FakeTransport()
      .respond(challenge(xrplOption("0.012")))
      .reject(new TypeError("fetch failed"));
    const client = new ApiClient(descriptor, {
      tier: "pro",
      transport: fake.transport,
      payment: { payer: new FakePayer(), maxPerCall: "0.05", sessionBudget: "1" },
    });
    const error = await client.request({ route: "fee", schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonPaymentError);
    expect(error).toMatchObject({ code: "payment-outcome-unknown" });
    expect((error as CriptonPaymentError).options).toEqual([
      expect.objectContaining({ network: "xrpl:0", amount: "0.012" }),
    ]);
    expect(client.spent()).toBe("0.012");
    expect(fake.requests).toHaveLength(2);
  });
});
