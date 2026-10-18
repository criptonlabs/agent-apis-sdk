import type { ToolDefinition } from "../tools/definition.js";
import { loadPeer, type PeerImporter } from "../peer.js";

interface MastraToolsModule {
  createTool(options: {
    id: string;
    description: string;
    inputSchema: unknown;
    execute: (inputData: unknown) => Promise<unknown>;
  }): unknown;
}

export async function toMastraTools(
  tools: readonly ToolDefinition<unknown, unknown>[],
  opts?: { importer?: PeerImporter },
): Promise<Record<string, unknown>> {
  const mastra = await loadPeer<MastraToolsModule>("@mastra/core/tools", opts?.importer);
  const map: Record<string, unknown> = {};
  for (const tool of tools) {
    map[tool.name] = mastra.createTool({
      id: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (inputData) => tool.run(inputData),
    });
  }
  return map;
}
