import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { challenge } from "../../../../core/tests/support/x402-fixtures.js";
import pkg from "../../../package.json" with { type: "json" };
import { createSolanaAgentKit, type SolanaAgentKit } from "../../../src/index.js";
import { readSolanaEnv } from "../../../src/infrastructure/config/solana-env.js";
import { createSolanaMcpServer } from "../../../src/interfaces/mcp/server.js";
import { throwawayAddress, throwawayKey } from "../../support/keys.js";
import {
  DESTINATION,
  SOURCE,
  TOOL_NAMES,
  kitOver,
  readiness,
  slotFixture,
  solanaFake,
} from "../../support/interface-kit.js";

const closers: Array<() => Promise<void>> = [];

async function connect(kit: SolanaAgentKit): Promise<Client> {
  const server = await createSolanaMcpServer(kit);
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

function firstJson(result: { content?: unknown }): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0]?.text ?? "") as Record<string, unknown>;
}

afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

describe("Solana MCP server", () => {
  it("Solana MCP tool list", async () => {
    const client = await connect(kitOver(solanaFake()));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOL_NAMES);
    for (const tool of tools) {
      expect((tool.description ?? "").length).toBeGreaterThan(0);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("Prepare transfer tool annotations", async () => {
    const client = await connect(kitOver(solanaFake()));
    const { tools } = await client.listTools();
    const prepare = tools.find((t) => t.name === "solana_prepare_transfer");
    const readOnly = { readOnlyHint: true, destructiveHint: false };
    expect(prepare?.annotations).toMatchObject(readOnly);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ ...readOnly, openWorldHint: true });
    }
  });

  it("Transfer not ready through MCP", async () => {
    const ready = readiness({ ready: false, blockers: ["insufficient_balance"] });
    const client = await connect(kitOver(solanaFake(ready)));
    const result = await client.callTool({
      name: "solana_prepare_transfer",
      arguments: { source: SOURCE, destination: DESTINATION, mint: "SOL", amount: "0.01" },
    });
    expect(result.isError).toBe(true);
    const json = firstJson(result) as { code: string; details?: { reasons?: string[] } };
    expect(json.code).toBe("transfer-not-ready");
    expect(json.details?.reasons).toEqual(["insufficient_balance"]);
  });

  it("Latest slot through MCP", async () => {
    const client = await connect(kitOver(solanaFake()));
    const result = await client.callTool({ name: "solana_latest_slot", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(firstJson(result)).toMatchObject({ slot: slotFixture.slot });
  });

  it("Solana key without a cap", async () => {
    const config = readSolanaEnv({
      CRIPTON_TIER: "pro",
      CRIPTON_SOLANA_PAYER_KEY: throwawayKey().base58,
    });
    expect(config.payment).toBeUndefined();
    const option = {
      scheme: "exact",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amount: "14520",
      payTo: throwawayAddress(),
      maxTimeoutSeconds: 60,
      extra: { feePayer: throwawayAddress() },
    };
    const fake = new FakeTransport().respondWith(() => challenge(option));
    const client = await connect(createSolanaAgentKit({ ...config, transport: fake.transport }));
    const result = await client.callTool({ name: "solana_latest_slot", arguments: {} });
    expect(result.isError).toBe(true);
    expect(firstJson(result).code).toBe("payment-disabled");
  });

  it("Solana MCP server name", async () => {
    const client = await connect(kitOver(solanaFake()));
    expect(client.getServerVersion()).toMatchObject({
      name: "criptonlabs-agent-apis-solana",
      version: pkg.version,
    });
  });
});
