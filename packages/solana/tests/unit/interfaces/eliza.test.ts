import { describe, expect, it, vi } from "vite-plus/test";
import { createCriptonSolanaPlugin } from "../../../src/interfaces/eliza/plugin.js";
import {
  DESTINATION,
  SOURCE,
  healthFixture,
  kitOver,
  readiness,
  slotFixture,
  solanaFake,
} from "../../support/interface-kit.js";

function fakeRuntime(scripted: unknown = {}) {
  return {
    useModel: vi.fn<() => Promise<unknown>>(async () => scripted),
    composeState: async () => ({ values: {}, data: {}, text: "" }),
    getSetting: () => undefined,
  };
}

function plugin() {
  return createCriptonSolanaPlugin(kitOver(solanaFake(readiness())));
}

function action(name: string) {
  const found = plugin().actions.find((a) => a.name === name);
  if (!found) throw new Error(`missing action ${name}`);
  return found;
}

describe("Solana ElizaOS plugin", () => {
  it("Solana plugin shape", () => {
    const shape = plugin();
    expect(shape.name.length).toBeGreaterThan(0);
    expect(shape.description.length).toBeGreaterThan(0);
    expect(shape.actions.map((a) => a.name).sort()).toEqual(
      ["CHECK_SOLANA_TRANSFER_READINESS", "PREPARE_SOLANA_TRANSFER"].sort(),
    );
    expect(shape.providers.map((p) => p.name)).toEqual(["SOLANA_NETWORK_STATUS"]);
  });

  it("Solana action reads structured content", async () => {
    const runtime = fakeRuntime();
    const result = await action("PREPARE_SOLANA_TRANSFER").handler(runtime, {
      content: { source: SOURCE, destination: DESTINATION, mint: "SOL", amount: "0.01" },
    });
    expect(runtime.useModel).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect((result.data as { transaction: { feePayer: string } }).transaction.feePayer).toBe(
      SOURCE,
    );
  });

  it("Solana action with missing input", async () => {
    const runtime = fakeRuntime({ source: SOURCE, mint: "SOL", amount: "0.01" });
    const result = await action("PREPARE_SOLANA_TRANSFER").handler(runtime, {
      content: { text: "send 0.01 SOL somewhere" },
    });
    expect(result.success).toBe(false);
    const json = JSON.parse(result.text ?? "") as { code: string; details?: { field?: string } };
    expect(json.code).toBe("invalid-input");
    expect(json.details?.field).toBe("destination");
  });

  it("Solana network status provider supplies the slot and health status", async () => {
    const provider = plugin().providers.find((p) => p.name === "SOLANA_NETWORK_STATUS");
    const result = await provider?.get(fakeRuntime(), { content: {} });
    const text = JSON.stringify(result);
    expect(text).toContain(String(slotFixture.slot));
    expect(text).toContain(healthFixture.status);
  });
});
