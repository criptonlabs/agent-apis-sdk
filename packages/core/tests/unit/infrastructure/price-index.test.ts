import { describe, expect, it } from "vite-plus/test";
import type { PriceIndex } from "../../../src/application/ports.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { creditToken, expectTokenAbsent, loadFixture } from "../../support/credit-fixtures.js";
import { FakeTransport } from "../../support/fake-transport.js";

const descriptor = { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" };
const REQUIREMENTS_URL = "https://api.criptonlabs.com/v1/pro/requirements";

/**
 * Reads the recorded price index with a credit token configured and checks the single request:
 * `GET /v1/pro/requirements` without `resource` and without credentials (token-safe checks).
 */
async function readIndex(): Promise<PriceIndex> {
  const token = creditToken();
  const fake = new FakeTransport().respond(loadFixture("price-index"));
  const client = new ApiClient(descriptor, {
    tier: "pro",
    transport: fake.transport,
    credits: { token },
  });
  const index = await client.priceIndex();
  expect(fake.requests).toHaveLength(1);
  const request = fake.requests[0];
  expect(request?.method).toBe("GET");
  const url = new URL(request?.url ?? "");
  expect(url.origin + url.pathname).toBe(REQUIREMENTS_URL);
  expect(url.searchParams.has("resource")).toBe(false);
  const headers = request?.headers ?? {};
  expect("authorization" in headers, "the index request has an Authorization").toBe(false);
  expectTokenAbsent([headers], token);
  expect(index.paymentsMode).toBe("x402");
  return index;
}

function entryOf(index: PriceIndex, resource: string) {
  return index.routes.find((entry) => entry.resource === resource);
}

describe("price index", () => {
  it("Index entry of a credits-only route", async () => {
    const entry = entryOf(await readIndex(), "/v1/pro/xrpl/fee");
    expect(entry).toMatchObject({
      resource: "/v1/pro/xrpl/fee",
      mode: "credits",
      debit: { EUR: "0.0005", USD: "0.0006" },
    });
    expect(entry?.prices).toEqual([]);
  });

  it("Index entry with an RLUSD price", async () => {
    const entry = entryOf(await readIndex(), "/v1/pro/xrpl/payment-readiness");
    expect(entry).toMatchObject({ resource: "/v1/pro/xrpl/payment-readiness", mode: "both" });
    expect(entry?.prices).toContainEqual(
      expect.objectContaining({
        amount: "0.01452",
        asset: "RLUSD",
        network: "xrpl:0",
        issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
      }),
    );
  });
});
