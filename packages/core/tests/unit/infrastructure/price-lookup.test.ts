import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { FakeTransport } from "../../support/fake-transport.js";

const fixture = JSON.parse(
  readFileSync(new URL("../../fixtures/requirements-fee-off.json", import.meta.url), "utf8"),
) as object;

describe("price lookup", () => {
  it("Prices while payments are off", async () => {
    const fake = new FakeTransport().respond({ body: fixture });
    const client = new ApiClient(
      { network: "xrpl", productToken: "xrpl-agent-kit/0.1.0" },
      { tier: "pro", transport: fake.transport },
    );
    const result = await client.priceOf("/v1/pro/xrpl/fee");
    expect(fake.requests).toHaveLength(1);
    const request = fake.requests[0];
    expect(request?.method).toBe("GET");
    const url = new URL(request?.url ?? "");
    expect(url.origin + url.pathname).toBe("https://api.criptonlabs.com/v1/pro/requirements");
    expect(url.searchParams.get("resource")).toBe("/v1/pro/xrpl/fee");
    expect(result).toEqual({ paymentsMode: "off", options: [] });
  });
});
