import { describe, expect, it } from "vite-plus/test";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { createCriptonSolanaTools } from "../../../src/interfaces/ai-sdk/tools.js";
import { TOOL_NAMES, kitOver, slotFixture, solanaFake } from "../../support/interface-kit.js";

describe("Solana AI SDK tools", () => {
  it("exposes exactly the 6 Solana tool names", () => {
    const map = createCriptonSolanaTools(kitOver(new FakeTransport()));
    expect(Object.keys(map).sort()).toEqual(TOOL_NAMES);
    for (const tool of Object.values(map)) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("solana_latest_slot executes over the kit and returns the slot data", async () => {
    const fake = solanaFake();
    const map = createCriptonSolanaTools(kitOver(fake));
    const result = (await map["solana_latest_slot"]?.execute({})) as { slot: number };
    expect(result.slot).toBe(slotFixture.slot);
    expect(new URL(fake.requests[0]?.url ?? "").pathname).toBe("/v1/solana/slot/latest");
  });

  it("builds its own kit from a config (transport used as given)", async () => {
    const fake = solanaFake();
    const map = createCriptonSolanaTools({ transport: fake.transport });
    const result = (await map["solana_latest_slot"]?.execute({})) as { slot: number };
    expect(result.slot).toBe(slotFixture.slot);
    expect(fake.requests).toHaveLength(1);
  });
});
