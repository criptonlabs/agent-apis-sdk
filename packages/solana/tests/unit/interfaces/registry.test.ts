import { describe, expect, it } from "vite-plus/test";
import { createSolanaTools } from "../../../src/interfaces/tools/registry.js";
import { TOOL_NAMES, kitOver, solanaFake } from "../../support/interface-kit.js";

describe("Solana tool registry", () => {
  it("Solana MCP tool list (registry names, descriptions and schemas)", () => {
    const tools = createSolanaTools(kitOver(solanaFake()));
    expect(tools.map((t) => t.name).sort()).toEqual(TOOL_NAMES);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.inputSchema.safeParse).toBe("function");
    }
  });

  it("Prepare transfer tool annotations (every tool read-only, non-destructive, open-world)", () => {
    const tools = createSolanaTools(kitOver(solanaFake()));
    for (const tool of tools) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(tool.annotations.openWorldHint).toBe(true);
    }
  });
});
