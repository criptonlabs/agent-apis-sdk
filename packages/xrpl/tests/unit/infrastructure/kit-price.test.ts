import { describe, expect, it } from "vite-plus/test";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { createXrplAgentKit } from "../../../src/index.js";

describe("XRPL kit price lookup and spend", () => {
  it("priceOf asks GET /v1/pro/requirements?resource= and maps the answer", async () => {
    const fake = new FakeTransport().respond({ body: { payments_mode: "off", accepts: [] } });
    const kit = createXrplAgentKit({ transport: fake.transport, tier: "pro" });
    const result = await kit.priceOf("/v1/pro/xrpl/fee");
    const request = fake.requests[0];
    const url = new URL(request?.url ?? "");
    expect(request?.method).toBe("GET");
    expect(url.pathname).toBe("/v1/pro/requirements");
    expect(url.searchParams.get("resource")).toBe("/v1/pro/xrpl/fee");
    expect(result).toEqual({ paymentsMode: "off", options: [] });
  });

  it("spent is zero before any paid call", () => {
    expect(createXrplAgentKit({ transport: new FakeTransport().transport }).spent()).toBe("0");
  });
});
