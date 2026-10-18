import { describe, expect, it } from "vite-plus/test";
import { createXrplTools } from "../../../src/interfaces/tools/registry.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { TOOL_NAMES, kitOver } from "../../support/interface-kit.js";

describe("XRPL tool registry", () => {
  it("MCP tool list (registry names, descriptions and schemas)", () => {
    const tools = createXrplTools(kitOver(new FakeTransport()));
    expect(tools.map((t) => t.name).sort()).toEqual(TOOL_NAMES);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.inputSchema.safeParse).toBe("function");
    }
  });

  it("Prepare tool annotations (every tool read-only, non-destructive, open-world)", () => {
    const tools = createXrplTools(kitOver(new FakeTransport()));
    for (const tool of tools) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(tool.annotations.openWorldHint).toBe(true);
    }
  });
});
