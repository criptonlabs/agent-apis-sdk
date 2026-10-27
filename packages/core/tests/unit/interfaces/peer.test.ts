import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { MissingPeerDependencyError } from "../../../src/domain/errors.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { createMcpServer } from "../../../src/interfaces/mcp/server.js";
import { loadPeer, type PeerImporter } from "../../../src/interfaces/peer.js";
import { FakeTransport } from "../../support/fake-transport.js";
import { feeBody } from "../../support/x402-fixtures.js";
import { testTools } from "../../support/test-tools.js";

function notFound(): Error & { code: string } {
  return Object.assign(new Error("Cannot find package"), { code: "ERR_MODULE_NOT_FOUND" });
}

describe("Optional framework dependencies", () => {
  it("MCP server without the MCP package", async () => {
    const importer: PeerImporter = () => Promise.reject(notFound());
    const error = await createMcpServer(
      testTools,
      { name: "t", version: "0.0.0" },
      { importer },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MissingPeerDependencyError);
    expect(error).toMatchObject({
      code: "missing-peer-dependency",
      packageName: "@modelcontextprotocol/server",
    });
  });

  it("loadPeer rethrows errors that are not module-not-found unchanged", async () => {
    const original = new Error("syntax error in package");
    const importer: PeerImporter = () => Promise.reject(original);
    await expect(loadPeer("x", importer)).rejects.toBe(original);
  });

  it("Data client without frameworks", async () => {
    let importerCalls = 0;
    const importer: PeerImporter = () => {
      importerCalls += 1;
      return Promise.reject(notFound());
    };
    const fake = new FakeTransport().respond({ body: feeBody });
    const client = new ApiClient(
      { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" },
      { transport: fake.transport },
    );
    const result = await client.request({ route: "fee", schema: z.object({}).passthrough() });
    expect(result.data).toBeDefined();
    expect(importerCalls).toBe(0);
    // the framework adapters, given the same missing packages, are the ones that fail
    await expect(
      createMcpServer(testTools, { name: "t", version: "0.0.0" }, { importer }),
    ).rejects.toBeInstanceOf(MissingPeerDependencyError);
  });
});
