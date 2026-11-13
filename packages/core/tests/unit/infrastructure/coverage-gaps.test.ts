import { describe, expect, it } from "vite-plus/test";
import { CriptonValidationError } from "../../../src/domain/errors.js";
import { CriptonProblemError, CriptonResponseError } from "../../../src/domain/errors.js";
import { readCommonEnv } from "../../../src/infrastructure/config/common-env.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { toPriceLookup } from "../../../src/infrastructure/x402/price-lookup.js";
import { FakeTransport } from "../../support/fake-transport.js";

function failure(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe("common environment validation", () => {
  it("an invalid CRIPTON_API_URL names the variable", () => {
    const error = failure(() => readCommonEnv({ CRIPTON_API_URL: "not a url" }));
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect(error).toMatchObject({ field: "CRIPTON_API_URL" });
  });

  it("an invalid CRIPTON_MAX_PER_CALL names the variable", () => {
    const error = failure(() => readCommonEnv({ CRIPTON_MAX_PER_CALL: "0.1x" }));
    expect(error).toMatchObject({ field: "CRIPTON_MAX_PER_CALL" });
  });

  it("an invalid CRIPTON_SESSION_BUDGET names the variable", () => {
    const error = failure(() => readCommonEnv({ CRIPTON_SESSION_BUDGET: "-1" }));
    expect(error).toMatchObject({ field: "CRIPTON_SESSION_BUDGET" });
  });

  it("empty strings are treated as unset", () => {
    expect(
      readCommonEnv({
        CRIPTON_API_URL: "",
        CRIPTON_TIER: "",
        CRIPTON_MAX_PER_CALL: "",
        CRIPTON_SESSION_BUDGET: "",
      }),
    ).toEqual({ tier: "free" });
  });

  it("valid values are read", () => {
    expect(
      readCommonEnv({
        CRIPTON_API_URL: "https://example.test",
        CRIPTON_TIER: "pro",
        CRIPTON_MAX_PER_CALL: "0.05",
        CRIPTON_SESSION_BUDGET: "1",
      }),
    ).toEqual({
      baseUrl: "https://example.test",
      tier: "pro",
      maxPerCall: "0.05",
      sessionBudget: "1",
    });
  });
});

describe("price lookup mapping", () => {
  it("a body without payments_mode or accepts maps to null and an empty list", () => {
    expect(toPriceLookup({})).toEqual({ paymentsMode: null, options: [], prepaidOffer: null });
  });

  it("a non-object body maps to null and an empty list", () => {
    expect(toPriceLookup(null)).toEqual({ paymentsMode: null, options: [], prepaidOffer: null });
    expect(toPriceLookup("x")).toEqual({ paymentsMode: null, options: [], prepaidOffer: null });
  });

  it("a non-string mode and a non-array accepts are ignored", () => {
    expect(toPriceLookup({ payments_mode: 1, accepts: {} })).toEqual({
      paymentsMode: null,
      options: [],
      prepaidOffer: null,
    });
  });
});

describe("ApiClient price lookup failures", () => {
  const client = (fake: FakeTransport) =>
    new ApiClient({ network: "xrpl", productToken: "t/0" }, { transport: fake.transport });

  it("an error response becomes a problem error", async () => {
    const fake = new FakeTransport().respond({
      status: 503,
      headers: { "content-type": "application/problem+json" },
      body: { type: "https://api.criptonlabs.com/errors/upstream-unavailable.md", status: 503 },
    });
    await expect(client(fake).priceOf("/v1/pro/xrpl/fee")).rejects.toBeInstanceOf(
      CriptonProblemError,
    );
  });

  it("a non-JSON body is an invalid-response error", async () => {
    const fake = new FakeTransport().respond({ body: "not json" });
    await expect(client(fake).priceOf("/v1/pro/xrpl/fee")).rejects.toBeInstanceOf(
      CriptonResponseError,
    );
  });

  it("a connection failure is a network error", async () => {
    const fake = new FakeTransport().reject(new TypeError("boom"));
    await expect(client(fake).priceOf("/v1/pro/xrpl/fee")).rejects.toMatchObject({
      code: "network-error",
    });
  });
});

describe("ApiClient response parsing", () => {
  it("a non-JSON success body is an invalid-response error", async () => {
    const fake = new FakeTransport().respond({ body: "not json" });
    const api = new ApiClient(
      { network: "xrpl", productToken: "t/0" },
      { transport: fake.transport },
    );
    const { z } = await import("zod");
    await expect(api.request({ route: "fee", schema: z.object({}) })).rejects.toBeInstanceOf(
      CriptonResponseError,
    );
  });
});
