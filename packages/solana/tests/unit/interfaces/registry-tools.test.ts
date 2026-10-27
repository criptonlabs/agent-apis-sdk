import { describe, expect, it } from "vite-plus/test";
import { createSolanaTools } from "../../../src/interfaces/tools/registry.js";
import healthHistory from "../../fixtures/responses/health-history.json" with { type: "json" };
import token from "../../fixtures/responses/token.json" with { type: "json" };
import {
  DESTINATION,
  SOURCE,
  kitOver,
  readiness,
  solanaFake,
} from "../../support/interface-kit.js";

const READY = readiness();
const TRANSFER = { source: SOURCE, destination: DESTINATION, mint: "SOL", amount: "0.01" };

function setup() {
  const fake = solanaFake(READY);
  const tools = createSolanaTools(kitOver(fake));
  const call = async (name: string, input: unknown) => {
    const tool = tools.find((t) => t.name === name);
    if (tool === undefined) throw new Error(`no tool ${name}`);
    return tool.run(input);
  };
  const last = () => {
    const url = new URL(fake.requests.at(-1)?.url ?? "http://none/");
    return { path: url.pathname, query: Object.fromEntries(url.searchParams) };
  };
  return { fake, call, last };
}

describe("Solana tools send the right request and return the API data", () => {
  it("solana_health_history sends the window and omits an absent one", async () => {
    const { call, last } = setup();
    expect(await call("solana_health_history", { window: "24h" })).toEqual(healthHistory);
    expect(last()).toEqual({ path: "/v1/solana/health/history", query: { window: "24h" } });
    await call("solana_health_history", {});
    expect(last().query).toEqual({});
  });

  it("solana_token puts the mint in the path", async () => {
    const { call, last } = setup();
    expect(await call("solana_token", { mint: token.mint })).toEqual(token);
    expect(last().path).toBe(`/v1/solana/token/${token.mint}`);
  });

  it("solana_transfer_readiness sends source, destination, mint and amount", async () => {
    const { call, last } = setup();
    expect(await call("solana_transfer_readiness", TRANSFER)).toEqual(READY);
    expect(last()).toEqual({ path: "/v1/solana/transfer-readiness", query: TRANSFER });
  });

  it("solana_prepare_transfer returns the unsigned transfer (no receipt wrapper)", async () => {
    const { call } = setup();
    const result = (await call("solana_prepare_transfer", TRANSFER)) as {
      transaction: { feePayer: string; recentBlockhash: null; instructions: unknown[] };
      readiness: unknown;
      ataCreation: { required: boolean; lamports: string | null };
    };
    expect(result.transaction.feePayer).toBe(SOURCE);
    expect(result.transaction.recentBlockhash).toBeNull();
    expect(result.transaction.instructions).toHaveLength(1);
    expect(result.readiness).toEqual(READY);
    expect(result.ataCreation).toEqual({ required: false, lamports: null });
    expect(result).not.toHaveProperty("receipt");
  });

  it("rejects an input that does not match the tool schema before any request", async () => {
    const { call, fake } = setup();
    await expect(call("solana_token", {})).rejects.toThrow(/mint/);
    expect(fake.requests).toHaveLength(0);
  });

  it("rejects a mint that is not a Solana address with invalid-input before any request", async () => {
    const { call, fake } = setup();
    await expect(call("solana_token", { mint: "SOL" })).rejects.toMatchObject({
      code: "invalid-input",
      field: "mint",
    });
    await expect(call("solana_health_history", { window: "2d" })).rejects.toThrow(/window/);
    expect(fake.requests).toHaveLength(0);
  });
});
