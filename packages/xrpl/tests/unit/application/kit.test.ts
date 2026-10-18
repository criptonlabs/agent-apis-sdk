import { Wallet } from "xrpl";
import { describe, expect, it } from "vite-plus/test";
import { createXrplAgentKit } from "../../../src/index.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import feeFixture from "../../fixtures/responses/fee.json" with { type: "json" };

describe("createXrplAgentKit", () => {
  it("exposes data, spent, preparePayment and dexQuote over the given transport", async () => {
    const fake = new FakeTransport().respond({ body: feeFixture });

    const kit = createXrplAgentKit({ transport: fake.transport });
    const fee = await kit.data.fee();

    expect(fee.data.fee.standard).toBe(feeFixture.fee.standard);
    expect(fake.requests[0]?.url).toBe("https://api.criptonlabs.com/v1/xrpl/fee");
    expect(kit.spent()).toBe("0");
    expect(typeof kit.preparePayment).toBe("function");
    expect(typeof kit.dexQuote).toBe("function");
  });

  it("builds with a payment config and never exposes the seed", () => {
    const seed = Wallet.generate().seed as string;
    const fake = new FakeTransport();

    const kit = createXrplAgentKit({
      transport: fake.transport,
      payment: { seed, maxPerCall: "0.05" },
    });

    expect(JSON.stringify(kit)).not.toContain(seed);
    expect(
      Object.values(kit).some((value) => typeof value === "string" && value.includes(seed)),
    ).toBe(false);
  });
});
