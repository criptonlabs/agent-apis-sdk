import { z } from "zod";
import { CriptonProblemError } from "../../src/domain/errors.js";
import type { ToolAnnotations, ToolDefinition } from "../../src/interfaces/tools/definition.js";

const annotations: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/** Names of the handlers that ran, in order; call `resetRuns()` between tests. */
export const runs: string[] = [];

export function resetRuns(): void {
  runs.length = 0;
}

export const testTools: ToolDefinition<unknown, unknown>[] = [
  {
    name: "echo",
    description: "Echoes the given text.",
    inputSchema: z.object({ text: z.string() }),
    annotations,
    async run(input) {
      runs.push("echo");
      return { text: (input as { text: string }).text };
    },
  },
  {
    name: "fails_problem",
    description: "Always fails with an API problem.",
    inputSchema: z.object({}),
    annotations,
    async run() {
      runs.push("fails_problem");
      throw new CriptonProblemError(
        "upstream-unavailable",
        503,
        "Service Unavailable",
        undefined,
        undefined,
        5,
      );
    },
  },
  {
    name: "fails_plain",
    description: "Always fails with a plain error.",
    inputSchema: z.object({}),
    annotations,
    async run() {
      runs.push("fails_plain");
      throw new Error("boom");
    },
  },
];
