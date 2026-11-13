import { describe, expect, it } from "vite-plus/test";
import { createCriptonXrplTools } from "../../../src/interfaces/ai-sdk/tools.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { TOOL_NAMES, kitOver } from "../../support/interface-kit.js";

describe("XRPL AI SDK tools", () => {
  it("exposes exactly the 15 XRPL tool names", () => {
    const map = createCriptonXrplTools(kitOver(new FakeTransport()));
    expect(Object.keys(map).sort()).toEqual(TOOL_NAMES);
    for (const tool of Object.values(map)) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.execute).toBe("function");
    }
  });
});
