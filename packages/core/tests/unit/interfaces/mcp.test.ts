import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { createMcpServer } from "../../../src/interfaces/mcp/server.js";
import type { ToolDefinition } from "../../../src/interfaces/tools/definition.js";
import {
  creditToken,
  expectTokenAbsent,
  loadFixture,
  withBodyMembers,
} from "../../support/credit-fixtures.js";
import { FakeTransport } from "../../support/fake-transport.js";
import { resetRuns, runs, testTools } from "../../support/test-tools.js";

const closers: Array<() => Promise<void>> = [];

/** A read tool over an `ApiClient` configured with `token`, on a paid route refused with `credits_invalid`. */
function creditRefusedTool(token: string, fake: FakeTransport): ToolDefinition<unknown, unknown> {
  const client = new ApiClient(
    { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" },
    { tier: "pro", transport: fake.transport, credits: { token } },
  );
  return {
    name: "credit_fee",
    description: "Reads the fee on the paid tier with a credit token.",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async run() {
      return (await client.request({ route: "fee", schema: z.object({}).passthrough() })).data;
    },
  };
}

async function connect(
  tools: readonly ToolDefinition<unknown, unknown>[] = testTools,
): Promise<Client> {
  const server = await createMcpServer(tools, { name: "test", version: "0.0.0" });
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

  it("Tool error with a configured token", async () => {
    const token = creditToken();
    const refusal = withBodyMembers(loadFixture("challenge-fee-credits-only"), {
      error: "credits_invalid",
    });
    const fake = new FakeTransport().respond(refusal);
    const client = await connect([creditRefusedTool(token, fake)]);
    const result = await client.callTool({ name: "credit_fee", arguments: {} });
    expect(
      fake.requests[0]?.headers.authorization === `Bearer ${token}`,
      "the tool's request carries the configured token",
    ).toBe(true);
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expectTokenAbsent([content[0]?.text ?? ""], token);
  });
});
