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
    expect(result.data.verdict).toBe("WARN");
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
