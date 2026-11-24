import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  creditToken,
  expectTokenAbsent,
  loadFixture,
  withHeaders,
} from "../../../../core/tests/support/credit-fixtures.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { createXrplMcpServer } from "../../../src/interfaces/mcp/server.js";
import { createXrplAgentKit, type XrplAgentKit } from "../../../src/index.js";
import { readXrplEnv } from "../../../src/infrastructure/config/xrpl-env.js";
import slippage from "../../fixtures/responses/slippage.json" with { type: "json" };
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

  it("Purchase caps set for the XRPL kit", async () => {
    const env = { CRIPTON_TOPUP_MAX: "1.21", CRIPTON_TOPUP_BUDGET: "5" };
    const kit = createXrplAgentKit({
      ...readXrplEnv(env),
      transport: new FakeTransport().transport,
    });
    const client = await connect(kit);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(TOOL_NAMES);
    expect(names.filter((name) => /topup|purchase|buy/i.test(name))).toEqual([]);
  });

  it("Credit status after a debit", async () => {
    const token = creditToken();
    const fake = new FakeTransport().respond(
      withHeaders(loadFixture("credit-paid-fee"), {
        "x-credits-remaining": "EUR=0;USD=0.8194",
      }),
    );
    const kit = createXrplAgentKit({ transport: fake.transport, tier: "pro", credits: { token } });
    await kit.data.fee();
    expect(fake.requests).toHaveLength(1);

    const client = await connect(kit);
    const result = await client.callTool({ name: "xrpl_credits_status", arguments: {} });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content[0]?.text ?? "";
    expect(JSON.parse(text)).toEqual({
      hasToken: true,
      balance: { EUR: "0", USD: "0.8194" },
      topupSpent: "0",
    });
    expectTokenAbsent([result, text], token);
    expect(fake.requests, "the status call sends no HTTP request").toHaveLength(1);
  });

  it("Prepare tool annotations", async () => {
    const client = await connect(kitOver(readinessFake(readiness())));
    const { tools } = await client.listTools();
    const prepare = tools.find((t) => t.name === "xrpl_prepare_payment");
    const readOnly = { readOnlyHint: true, destructiveHint: false };
    expect(prepare?.annotations).toMatchObject(readOnly);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ ...readOnly, openWorldHint: true });
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

  it("Invalid side through MCP", async () => {
    const fake = new FakeTransport().respond({ body: slippage });
    const client = await connect(kitOver(fake));

    // The SDK reports an input validation failure as an error result or as a rejected call.
    const outcome = await client
      .callTool({
        name: "xrpl_slippage",
        arguments: { base: "XRP", quote: `USD.${DESTINATION}`, amount: "100", side: "short" },
      })
      .then(
        (result) => ({ failed: result.isError === true, text: JSON.stringify(result.content) }),
        (error: unknown) => ({ failed: true, text: String(error) }),
      );

    expect(outcome.failed, "the call fails").toBe(true);
    expect(outcome.text, "the failure names side").toContain("side");
    expect(fake.requests, "the handler does not run, so no request is sent").toHaveLength(0);
  });
});
