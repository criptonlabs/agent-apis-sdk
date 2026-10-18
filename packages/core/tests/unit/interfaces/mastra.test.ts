import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { toMastraTools } from "../../../src/interfaces/mastra/tools.js";
import { testTools } from "../../support/test-tools.js";

describe("Mastra adapter", () => {
  it("Same tools everywhere (Mastra side)", async () => {
    const map = (await toMastraTools(testTools)) as Record<string, { inputSchema: z.ZodType }>;
    expect(Object.keys(map).sort()).toEqual(testTools.map((t) => t.name).sort());
    for (const tool of testTools) {
      expect(z.toJSONSchema(map[tool.name]?.inputSchema as z.ZodType)).toEqual(
        z.toJSONSchema(tool.inputSchema as z.ZodType),
      );
    }
  });
});
