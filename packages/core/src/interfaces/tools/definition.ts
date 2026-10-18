import type { z } from "zod";

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolDefinition<I, O> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  annotations: ToolAnnotations;
  run(input: I): Promise<O>;
}
