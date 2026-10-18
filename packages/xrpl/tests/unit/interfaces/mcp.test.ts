import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createXrplMcpServer } from "../../../src/interfaces/mcp/server.js";
import type { XrplAgentKit } from "../../../src/index.js";
import {
  DESTINATION,
  SOURCE,
  TOOL_NAMES,
  kitOver,
  readiness,
  readinessFake,
} from "../../support/interface-kit.js";

const closers: Array<() => Promise<void>> = [];

async function connect(kit: XrplAgentKit): Promise<Client> {
  const server = await createXrplMcpServer(kit);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await server.connect(serverSide);
  await client.connect(clientSide);
  closers.push(
    () => client.close(),
    () => server.close(),
  );
  return client;
}

afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

describe("XRPL MCP server", () => {
  it("MCP tool list", async () => {
    const client = await connect(kitOver(readinessFake(readiness())));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOL_NAMES);
    for (const tool of tools) {
      expect((tool.description ?? "").length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("Prepare tool annotations", async () => {
    const client = await connect(kitOver(readinessFake(readiness())));
    const { tools } = await client.listTools();
    const prepare = tools.find((t) => t.name === "xrpl_prepare_payment");
    expect(prepare?.annotations?.readOnlyHint).toBe(true);
    expect(prepare?.annotations?.destructiveHint).toBe(false);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.annotations?.openWorldHint).toBe(true);
    }
  });

  it("Readiness failure through MCP", async () => {
    const ready = readiness({ verdict: "not_ready", reasons: ["source_line_missing"] });
    const client = await connect(kitOver(readinessFake(ready)));
    const result = await client.callTool({
      name: "xrpl_prepare_payment",
      arguments: { source: SOURCE, destination: DESTINATION, asset: "XRP", amount: "10" },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const json = JSON.parse(content[0]?.text ?? "") as {
      code: string;
      details?: { reasons?: string[] };
    };
    expect(json.code).toBe("payment-not-ready");
    expect(json.details?.reasons).toEqual(["source_line_missing"]);
  });
});
