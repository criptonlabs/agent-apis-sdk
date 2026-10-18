import type { ToolDefinition } from "../tools/definition.js";
import { toErrorJson } from "../tools/error-json.js";
import { loadPeer, type PeerImporter } from "../peer.js";

export interface McpServerLike {
  connect(transport: unknown): Promise<void>;
  close(): Promise<void>;
}

interface McpToolResult {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
}

interface McpServerInstance extends McpServerLike {
  registerTool(
    name: string,
    config: { description: string; inputSchema: unknown; annotations: unknown },
    handler: (input: unknown) => Promise<McpToolResult>,
  ): unknown;
}

interface McpServerModule {
  McpServer: new (info: { name: string; version: string }) => McpServerInstance;
}

interface StdioModule {
  StdioServerTransport: new () => unknown;
}

type Tools = readonly ToolDefinition<unknown, unknown>[];
type Info = { name: string; version: string };
type Opts = { importer?: PeerImporter };

export async function createMcpServer(
  tools: Tools,
  info: Info,
  opts?: Opts,
): Promise<McpServerLike> {
  const { McpServer } = await loadPeer<McpServerModule>(
    "@modelcontextprotocol/server",
    opts?.importer,
  );
  const server = new McpServer({ name: info.name, version: info.version });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (input) => {
        try {
          const result = await tool.run(input);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify(toErrorJson(error)) }],
          };
        }
      },
    );
  }
  return server;
}

export async function startMcpServer(tools: Tools, info: Info, opts?: Opts): Promise<void> {
  const server = await createMcpServer(tools, info, opts);
  const { StdioServerTransport } = await loadPeer<StdioModule>(
    "@modelcontextprotocol/server/stdio",
    opts?.importer,
  );
  await server.connect(new StdioServerTransport());
}
