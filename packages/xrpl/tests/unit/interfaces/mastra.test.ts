import { describe, expect, it } from "vite-plus/test";
import { createMastraXrplTools } from "../../../src/interfaces/mastra/tools.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { TOOL_NAMES, kitOver } from "../../support/interface-kit.js";

describe("XRPL Mastra tools", () => {
  it("exposes exactly the 15 XRPL tool names", async () => {
    const map = await createMastraXrplTools(kitOver(new FakeTransport()));
    expect(Object.keys(map).sort()).toEqual(TOOL_NAMES);
  });
});
