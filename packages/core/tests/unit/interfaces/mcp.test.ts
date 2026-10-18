import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { createMcpServer } from "../../../src/interfaces/mcp/server.js";
import { resetRuns, runs, testTools } from "../../support/test-tools.js";

const closers: Array<() => Promise<void>> = [];

async function connect(): Promise<Client> {
  const server = await createMcpServer(testTools, { name: "test", version: "0.0.0" });
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
  resetRuns();
  while (closers.length > 0) await closers.pop()?.();
});

describe("MCP adapter", () => {
  it("Same tools everywhere (MCP side)", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(testTools.map((t) => t.name).sort());
    for (const tool of tools) {
      const source = testTools.find((t) => t.name === tool.name);
      const expected = z.toJSONSchema(source?.inputSchema as z.ZodType) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      const actual = tool.inputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      expect(Object.keys(actual.properties ?? {}).sort()).toEqual(
        Object.keys(expected.properties ?? {}).sort(),
      );
      expect([...(actual.required ?? [])].sort()).toEqual([...(expected.required ?? [])].sort());
    }
  });

  it("Invalid tool input", async () => {
    const client = await connect();
    const outcome = await client
      .callTool({ name: "echo", arguments: {} })
      .then((result) => ({ rejected: false, isError: result.isError === true }))
      .catch(() => ({ rejected: true, isError: false }));
    expect(outcome.rejected || outcome.isError).toBe(true);
    expect(runs).not.toContain("echo");
  });

  it("Kit error through MCP", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "fails_problem", arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]?.text ?? "")).toEqual({
      code: "upstream-unavailable",
      message: "Service Unavailable",
      status: 503,
      retryAfterSeconds: 5,
    });
  });

  it("Unknown error hidden", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "fails_plain", arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const json = JSON.parse(content[0]?.text ?? "") as Record<string, unknown>;
    expect(json.code).toBe("internal-error");
    expect(json).not.toHaveProperty("stack");
    const text = content[0]?.text ?? "";
    expect(text).not.toContain("boom");
    expect(text).not.toContain("Error: boom");
    expect(text).not.toMatch(/\n\s+at /);
    expect(text).not.toMatch(/\bat\s+\S+\s+\(/);
  });
});
