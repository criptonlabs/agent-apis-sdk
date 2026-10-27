import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import {
  CriptonNetworkError,
  CriptonProblemError,
  CriptonResponseError,
} from "../../../src/domain/errors.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { FakeTransport } from "../../support/fake-transport.js";

const coreVersion = (
  JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;
const descriptor = { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" };
const meta = {
  ledger_index: 100,
  as_of: "2026-10-18T10:00:00Z",
  age_seconds: 1,
  cache: "miss",
  stale: false,
};
const body = { fee: { economy: "10", standard: "10", priority: "11" }, meta };
const schema = z.object({
  fee: z.object({ economy: z.string(), standard: z.string(), priority: z.string() }),
  meta: z.object({
    ledger_index: z.number(),
    as_of: z.string(),
    age_seconds: z.number(),
    cache: z.string(),
    stale: z.boolean(),
  }),
});

describe("api client", () => {
  it("Paid tier route", async () => {
    const fake = new FakeTransport().respond({ body });
    const client = new ApiClient(descriptor, { tier: "pro", transport: fake.transport });
    await client.request({ route: "fee", schema });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.method).toBe("GET");
    expect(fake.requests[0]?.url).toBe("https://api.criptonlabs.com/v1/pro/xrpl/fee");
  });

  it("Free tier rate limit does not switch tier", async () => {
    const fake = new FakeTransport().respond({
      status: 429,
      headers: { "content-type": "application/problem+json", "Retry-After": "30" },
      body: {
        type: "https://api.criptonlabs.com/errors/rate-limited.md",
        title: "Rate limited",
        status: 429,
        detail: "Too many requests",
        instance: "/v1/xrpl/fee",
      },
    });
    const client = new ApiClient(descriptor, { tier: "free", transport: fake.transport });
    const error = await client.request({ route: "fee", schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({ code: "rate-limited", status: 429, retryAfterSeconds: 30 });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests.some((r) => r.url.includes("/v1/pro/"))).toBe(false);
  });

  it("Custom base URL", async () => {
    const fake = new FakeTransport().respond({ body });
    const client = new ApiClient(descriptor, {
      baseUrl: "http://localhost:8787",
      transport: fake.transport,
    });
    await client.request({ route: "ledger/latest", schema });
    expect(fake.requests[0]?.method).toBe("GET");
    expect(fake.requests[0]?.url).toBe("http://localhost:8787/v1/xrpl/ledger/latest");
    const userAgent = fake.requests[0]?.headers["user-agent"] ?? "";
    expect(userAgent).toContain(`agent-apis-xrpl/0.1.0 agent-apis-core/${coreVersion}`);
  });

  it("Stale data surfaced", async () => {
    const stale = { ...body, meta: { ...meta, stale: true, cache: "stale" } };
    const fake = new FakeTransport().respond({ body: stale });
    const client = new ApiClient(descriptor, { transport: fake.transport });
    const result = await client.request({ route: "fee", schema });
    expect(result.data.meta.stale).toBe(true);
    expect(result.data.meta.cache).toBe("stale");
  });

  it("Unexpected response shape", async () => {
    const fake = new FakeTransport().respond({ body: { unexpected: true } });
    const client = new ApiClient(descriptor, { transport: fake.transport });
    const error = await client.request({ route: "fee", schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonResponseError);
    expect(error).toMatchObject({ code: "invalid-response" });
  });

  it("Request timeout", async () => {
    const fake = new FakeTransport().hang();
    const client = new ApiClient(descriptor, { transport: fake.transport, timeoutMs: 50 });
    const error = await client.request({ route: "fee", schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonNetworkError);
    expect(error).toMatchObject({ code: "timeout" });
    expect(fake.requests).toHaveLength(1);
  });

  it("Connection failure", async () => {
    const fake = new FakeTransport().reject(new TypeError("fetch failed"));
    const client = new ApiClient(descriptor, { transport: fake.transport });
    const error = await client.request({ route: "fee", schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonNetworkError);
    expect(error).toMatchObject({ code: "network-error" });
  });
});
