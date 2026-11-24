import { describe, expect, it } from "vite-plus/test";
import type { PriceIndex } from "../../../src/application/ports.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import {
  creditToken,
  expectTokenAbsent,
  loadFixture,
  type ResponseFixture,
} from "../../support/credit-fixtures.js";
import { FakeTransport } from "../../support/fake-transport.js";

const descriptor = { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" };
const REQUIREMENTS_URL = "https://api.criptonlabs.com/v1/pro/requirements";

/**
 * Reads the recorded price index with a credit token configured and checks the single request:
 * `GET /v1/pro/requirements` without `resource` and without credentials (token-safe checks).
 */
async function readIndex(
  response: ResponseFixture = loadFixture("price-index"),
): Promise<PriceIndex> {
  const token = creditToken();
  const fake = new FakeTransport().respond(response);
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

/** A denomination of an index entry, as design D8 types it (`approxCalls` only when sent). */
interface IndexDenomination {
  denomination: string;
  debit: string;
  approxCalls?: number;
}

/** The recorded price index with its routes replaced by one inline route (derived from the 0.27.0 route shape). */
function indexWithRoute(route: Record<string, unknown>): ResponseFixture {
  const recorded = loadFixture("price-index");
  return { ...recorded, body: { ...recorded.body, routes: [route] } };
}

/** The `denominations` of an entry; read at run time because the port type does not carry them yet. */
function denominationsOf(entry: object | undefined): readonly IndexDenomination[] | undefined {
  return (entry as { denominations?: readonly IndexDenomination[] } | undefined)?.denominations;
}

const FEE = "/v1/pro/xrpl/fee";
const feeRoute = (members: Record<string, unknown>) => ({
  resource: FEE,
  description: "Current XRPL fee tiers in drops with a congestion score.",
  mode: "credits",
  ...members,
});

describe("price index", () => {
  it("Index entry of a credits-only route", async () => {
    const index = await readIndex(
      indexWithRoute(
        feeRoute({
          denominations: [
            { denomination: "EUR", debit: "0.0005", approx_calls: 2000 },
            { denomination: "USD", debit: "0.0006", approx_calls: 1366 },
          ],
        }),
      ),
    );
    const entry = entryOf(index, FEE);
    expect(entry).toMatchObject({ resource: FEE, mode: "credits" });
    expect(denominationsOf(entry)).toEqual([
      { denomination: "EUR", debit: "0.0005", approxCalls: 2000 },
      { denomination: "USD", debit: "0.0006", approxCalls: 1366 },
    ]);
    expect(entry?.prices).toEqual([]);
  });

  it("Index entry with an RLUSD price", async () => {
    const readiness = "/v1/pro/xrpl/payment-readiness";
    const index = await readIndex(
      indexWithRoute({
        resource: readiness,
        mode: "both",
        denominations: [{ denomination: "EUR", debit: "0.03", approx_calls: 33 }],
        prices: [
          {
            amount: "0.01452",
            asset: "RLUSD",
            network: "xrpl:0",
            issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
            currency: "524C555344000000000000000000000000000000",
          },
        ],
      }),
    );
    const entry = entryOf(index, readiness);
    expect(entry).toMatchObject({ resource: readiness, mode: "both" });
    expect(entry?.prices).toContainEqual(
      expect.objectContaining({
        amount: "0.01452",
        asset: "RLUSD",
        network: "xrpl:0",
        issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
        currency: "524C555344000000000000000000000000000000",
      }),
    );
  });

  it("Denomination without approximate calls", async () => {
    const index = await readIndex(
      indexWithRoute(feeRoute({ denominations: [{ denomination: "EUR", debit: "0.0005" }] })),
    );
    const denominations = denominationsOf(entryOf(index, FEE));
    expect(denominations).toStrictEqual([{ denomination: "EUR", debit: "0.0005" }]);
    expect(denominations?.[0]).not.toHaveProperty("approxCalls");
  });

  it("Malformed denomination left out", async () => {
    const index = await readIndex(
      indexWithRoute(
        feeRoute({
          denominations: [
            { denomination: "EUR", debit: "abc" },
            { denomination: "USD", debit: "0.0006" },
          ],
        }),
      ),
    );
    expect(denominationsOf(entryOf(index, FEE))).toStrictEqual([
      { denomination: "USD", debit: "0.0006" },
    ]);
  });

  it("Former debit map ignored", async () => {
    const index = await readIndex(indexWithRoute(feeRoute({ debit: { EUR: "0.0005" } })));
    expect(denominationsOf(entryOf(index, FEE))).toEqual([]);
  });
});
