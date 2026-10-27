import { describe, expect, it } from "vite-plus/test";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { createMastraSolanaTools } from "../../../src/interfaces/mastra/tools.js";
import { TOOL_NAMES, kitOver } from "../../support/interface-kit.js";

describe("Solana Mastra tools", () => {
  it("exposes exactly the 6 Solana tool names", async () => {
    const map = await createMastraSolanaTools(kitOver(new FakeTransport()));
    expect(Object.keys(map).sort()).toEqual(TOOL_NAMES);
  });
});
