import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { creditToken, expectTokenAbsent, loadFixture } from "../../support/credit-fixtures.js";
import { FakeTransport } from "../../support/fake-transport.js";

const fixture = JSON.parse(
  readFileSync(new URL("../../fixtures/requirements-fee-off.json", import.meta.url), "utf8"),
) as object;

const descriptor = { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" };
const REQUIREMENTS_URL = "https://api.criptonlabs.com/v1/pro/requirements";

describe("price lookup", () => {
  it("Prices while payments are off", async () => {
    const fake = new FakeTransport().respond({ body: fixture });
    const client = new ApiClient(descriptor, { tier: "pro", transport: fake.transport });
    const result = await client.priceOf("/v1/pro/xrpl/fee");
    expect(fake.requests).toHaveLength(1);
    const request = fake.requests[0];
    expect(request?.method).toBe("GET");
    const url = new URL(request?.url ?? "");
    expect(url.origin + url.pathname).toBe(REQUIREMENTS_URL);
    expect(url.searchParams.get("resource")).toBe("/v1/pro/xrpl/fee");
    expect(result).toEqual({ paymentsMode: "off", options: [], prepaidOffer: null });
  });

  it("Price of a credits-only route", async () => {
    const fake = new FakeTransport().respond(loadFixture("requirements-fee-credits"));
    const client = new ApiClient(descriptor, { tier: "pro", transport: fake.transport });
    const result = await client.priceOf("/v1/pro/xrpl/fee");
    expect(fake.requests).toHaveLength(1);
    const url = new URL(fake.requests[0]?.url ?? "");
    expect(url.origin + url.pathname).toBe(REQUIREMENTS_URL);
    expect(url.searchParams.get("resource")).toBe("/v1/pro/xrpl/fee");
    expect(result).toMatchObject({
      paymentsMode: "x402",
      options: [],
      prepaidOffer: {
        bundleVersion: "2026-10-26",
        bundles: expect.arrayContaining([
          expect.objectContaining({ id: "usd-starter", amount: "1.00", creditedUnits: "0.82" }),
        ]),
      },
    });
  });

  it("Price lookup sends no credentials", async () => {
    const token = creditToken();
    const fake = new FakeTransport().respond(loadFixture("requirements-fee-credits"));
    const client = new ApiClient(descriptor, {
      tier: "pro",
      transport: fake.transport,
      credits: { token },
    });
    await client.priceOf("/v1/pro/xrpl/fee");
    expect(fake.requests).toHaveLength(1);
    const headers = fake.requests[0]?.headers ?? {};
    expect("authorization" in headers, "the requirements request has an Authorization").toBe(false);
    expectTokenAbsent([headers], token);
  });
});
