import { existsSync } from "node:fs";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vite-plus/test";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import pkg from "../../../package.json" with { type: "json" };
import { createXrplAgentKit } from "../../../src/index.js";
import { createXrplMcpServer } from "../../../src/interfaces/mcp/server.js";
import { feeBody } from "../../../../core/tests/support/x402-fixtures.js";

describe("Kit identification", () => {
  it("Package and binary names", () => {
    expect(pkg.name).toBe("@criptonlabs/agent-apis-xrpl");
    const bin = (pkg.bin as Record<string, string>)["agent-apis-xrpl"];
    expect(bin).toBe("bin/agent-apis-xrpl.js");
    expect(existsSync(new URL(`../../../${bin}`, import.meta.url))).toBe(true);
  });

  it("Product token in requests", async () => {
    const fake = new FakeTransport().respond({
      body: {
        ...feeBody,
        congestion: { band: "low", score: 0 },
        fee: { ...feeBody.fee, base_fee: "10" },
      },
    });
    const kit = createXrplAgentKit({ transport: fake.transport });
    await kit.data.fee().catch(() => undefined);
    expect(fake.requests[0]?.headers["user-agent"]).toMatch(
      new RegExp(`^agent-apis-xrpl/${pkg.version.replaceAll(".", "\\.")} `),
    );
  });

  it("MCP server name", async () => {
    const server = await createXrplMcpServer(createXrplAgentKit());
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await server.connect(serverSide);
    await client.connect(clientSide);
    try {
      expect(client.getServerVersion()).toMatchObject({
        name: "criptonlabs-agent-apis-xrpl",
        version: pkg.version,
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
