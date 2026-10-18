import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { CriptonProblemError } from "../../../src/domain/errors.js";
import { toAiSdkTools } from "../../../src/interfaces/ai-sdk/tools.js";
import { resetRuns, testTools } from "../../support/test-tools.js";

describe("AI SDK adapter", () => {
  it("Same tools everywhere (AI SDK side)", () => {
    const map = toAiSdkTools(testTools);
    expect(Object.keys(map).sort()).toEqual(testTools.map((t) => t.name).sort());
    for (const tool of testTools) {
      expect(z.toJSONSchema(map[tool.name]?.inputSchema as z.ZodType)).toEqual(
        z.toJSONSchema(tool.inputSchema as z.ZodType),
      );
      expect(map[tool.name]?.description).toBe(tool.description);
    }
  });

  it("Kit error through AI SDK throws the kit error", async () => {
    resetRuns();
    const map = toAiSdkTools(testTools);
    const error = await map.fails_problem?.execute({}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CriptonProblemError);
  });
});
