import {
  ApiClient,
  CriptonResponseError,
  CriptonValidationError,
} from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { SOLANA_DESCRIPTOR } from "../../../src/infrastructure/descriptor.js";
import { createSolanaDataClient } from "../../../src/infrastructure/http/solana-client.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import slotFixture from "../../fixtures/responses/slot-latest.json" with { type: "json" };
import healthFixture from "../../fixtures/responses/health.json" with { type: "json" };
import historyFixture from "../../fixtures/responses/health-history.json" with { type: "json" };
import tokenFixture from "../../fixtures/responses/token.json" with { type: "json" };
import readinessFixture from "../../fixtures/responses/transfer-readiness-spl.json" with { type: "json" };
import solReadinessFixture from "../../fixtures/responses/transfer-readiness-sol.json" with { type: "json" };
import formerReadinessFixture from "../../fixtures/derived/transfer-readiness-spl-0.21.0.json" with { type: "json" };

const SOURCE = readinessFixture.source;
const DESTINATION = readinessFixture.destination;
const USDC = tokenFixture.mint;
const BASE = "https://api.criptonlabs.com";

function setup(body: object, tier?: "free" | "pro") {
  const fake = new FakeTransport().respond({ body });
  const api = new ApiClient(SOLANA_DESCRIPTOR, {
    transport: fake.transport,
    ...(tier ? { tier } : {}),
  });
  return { fake, client: createSolanaDataClient(api) };
}

function sent(fake: FakeTransport): URL {
  expect(fake.requests).toHaveLength(1);
  return new URL(fake.requests[0]?.url as string);
}

async function field(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (error) {
    if (error instanceof CriptonValidationError && error.code === "invalid-input") {
      return error.field;
    }
    return "<unexpected error>";
  }
  return undefined;
}

describe("Solana data client", () => {
  it("Latest slot", async () => {
    const { fake, client } = setup(slotFixture);
    const result = await client.latestSlot();
    expect(fake.requests[0]?.url).toBe(`${BASE}/v1/solana/slot/latest`);
    expect(fake.requests[0]?.method).toBe("GET");
    expect(result.data.slot).toBe(slotFixture.slot);
    expect(result.data.meta.commitment).toBe("finalized");
  });

  it("Token verdict", async () => {
    const { fake, client } = setup(tokenFixture);
    const result = await client.token(USDC);
    expect(sent(fake).pathname).toBe(`/v1/solana/token/${USDC}`);
    expect(result.data.decimals).toBe(6);
    expect(result.data.token_program).toBe(tokenFixture.token_program);
    expect(result.data.verdict).toBe("warn");
    expect(result.data.reasons).toEqual(["mint_authority_set", "freeze_authority_set"]);
  });

  it("Transfer readiness on the paid tier", async () => {
    const { fake, client } = setup(readinessFixture, "pro");
    await client.transferReadiness({
      source: SOURCE,
      destination: DESTINATION,
      mint: USDC,
      amount: "1",
    });
    const url = sent(fake);
    expect(url.pathname).toBe("/v1/pro/solana/transfer-readiness");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      source: SOURCE,
      destination: DESTINATION,
      mint: USDC,
      amount: "1",
    });
  });

  it("Unexpected Solana response shape", async () => {
    const { slot: _slot, ...withoutSlot } = slotFixture;
    const { client } = setup(withoutSlot);
    const error = await client.latestSlot().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonResponseError);
    expect(error).toMatchObject({ code: "invalid-response" });
  });

  it("Invalid Solana address", async () => {
    const { fake, client } = setup(readinessFixture);
    expect(
      await field(() =>
        client.transferReadiness({
          source: "not-an-address",
          destination: DESTINATION,
          mint: USDC,
          amount: "1",
        }),
      ),
    ).toBe("source");
    expect(fake.requests).toHaveLength(0);
  });

  it("Address not decoding to 32 bytes", async () => {
    const { fake, client } = setup(readinessFixture);
    expect(
      await field(() =>
        client.transferReadiness({
          source: SOURCE,
          destination: "z".repeat(44),
          mint: USDC,
          amount: "1",
        }),
      ),
    ).toBe("destination");
    expect(fake.requests).toHaveLength(0);
  });

  it("SOL amount with too many decimals", async () => {
    const { fake, client } = setup(solReadinessFixture);
    expect(
      await field(() =>
        client.transferReadiness({
          source: SOURCE,
          destination: DESTINATION,
          mint: "SOL",
          amount: "0.0000000001",
        }),
      ),
    ).toBe("amount");
    expect(fake.requests).toHaveLength(0);
  });

  it("SOL is not a token mint", async () => {
    const { fake, client } = setup(tokenFixture);
    expect(await field(() => client.token("SOL"))).toBe("mint");
    expect(fake.requests).toHaveLength(0);
  });

  it("sends the health route", async () => {
    const { fake, client } = setup(healthFixture);
    const result = await client.health();
    expect(fake.requests[0]?.url).toBe(`${BASE}/v1/solana/health`);
    expect(result.data).toEqual(healthFixture);
  });

  it("sends the health history window", async () => {
    const { fake, client } = setup(historyFixture);
    await client.healthHistory({ window: "24h" });
    const url = sent(fake);
    expect(url.pathname).toBe("/v1/solana/health/history");
    expect(url.searchParams.get("window")).toBe("24h");
  });

  it("Invalid history window", async () => {
    const { fake, client } = setup(historyFixture);
    expect(await field(() => client.healthHistory({ window: "30d" as "7d" }))).toBe("window");
    expect(fake.requests).toHaveLength(0);
  });
});

describe("Solana responses follow API contract 0.27.0", () => {
  const intent = { source: SOURCE, destination: DESTINATION, mint: USDC, amount: "1" };

  it("Transfer readiness in the readiness vocabulary", async () => {
    const body = structuredClone(readinessFixture) as Record<string, any>;
    body.verdict = "not_ready";
    body.reasons = ["insufficient_balance"];
    body.checks_failed = [];
    body.amount = "1";
    body.amount_atomic = "1000000";
    body.net_amount_atomic = "1000000";
    const { client } = setup(body);
    const result = await client.transferReadiness(intent);
    const data = result.data as Record<string, any>;
    expect(data.verdict).toBe("not_ready");
    expect(data.reasons).toEqual(["insufficient_balance"]);
    expect(data.checks_failed).toEqual([]);
    expect(data.amount).toBe("1");
    expect(data.amount_atomic).toBe("1000000");
    expect(data.net_amount_atomic).toBe("1000000");
    expect(data).not.toHaveProperty("ready");
    expect(data).not.toHaveProperty("blockers");
    expect(data).not.toHaveProperty("amount_raw");
    expect(data).not.toHaveProperty("net_amount");
  });

  it("Former transfer readiness body rejected", async () => {
    const { client } = setup(formerReadinessFixture);
    const error = await client.transferReadiness(intent).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonResponseError);
    expect(error).toMatchObject({ code: "invalid-response" });
  });

  it("Token supply in both units", async () => {
    const body = structuredClone(tokenFixture) as Record<string, any>;
    body.decimals = 6;
    body.supply = "7276486003.588914";
    body.supply_atomic = "7276486003588914";
    body.transfer_fee_pct = null;
    body.transfer_fee_max = null;
    const { client } = setup(body);
    const result = await client.token(USDC);
    const data = result.data as Record<string, any>;
    expect(data.supply).toBe("7276486003.588914");
    expect(data.supply_atomic).toBe("7276486003588914");
    expect(data.transfer_fee_pct).toBeNull();
    expect(data.transfer_fee_max).toBeNull();
  });

  it("Unknown slot passed through", async () => {
    const body = structuredClone(readinessFixture) as Record<string, any>;
    body.meta.slot = null;
    const { client } = setup(body);
    const result = await client.transferReadiness(intent);
    expect(result.data.meta.slot).toBeNull();
  });

  it("Solana health history uptime as a decimal string", async () => {
    const body = structuredClone(historyFixture) as Record<string, any>;
    body.buckets[0].uptime_pct = "100";
    const { client } = setup(body);
    const result = await client.healthHistory({ window: "1h" });
    expect(result.data.buckets[0]?.uptime_pct).toBe("100");
  });
});
