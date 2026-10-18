import type { z } from "zod";
import type { ToolDefinition } from "../tools/definition.js";

export interface AiSdkTool {
  description: string;
  inputSchema: z.ZodType;
  execute(input: unknown): Promise<unknown>;
}

export function toAiSdkTools(
  tools: readonly ToolDefinition<unknown, unknown>[],
): Record<string, AiSdkTool> {
  const map: Record<string, AiSdkTool> = {};
  for (const tool of tools) {
    map[tool.name] = {
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: (input) => tool.run(input),
    };
  }
  return map;
}
