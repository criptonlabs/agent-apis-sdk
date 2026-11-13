import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { Wallet } from "xrpl";
import { describe, expect, it } from "vite-plus/test";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { challenge, xrplOption } from "../../../../core/tests/support/x402-fixtures.js";
import { readXrplEnv } from "../../../src/infrastructure/config/xrpl-env.js";
import { createXrplAgentKit } from "../../../src/index.js";
import { createXrplMcpServer } from "../../../src/interfaces/mcp/server.js";

describe("readXrplEnv", () => {
  it("Seed without a cap", async () => {
    const seed = Wallet.generate().seed as string;
    const config = readXrplEnv({ CRIPTON_TIER: "pro", CRIPTON_XRPL_PAYER_SEED: seed });
    expect(config.payment).toBeUndefined();
    expect(config.wallet).toEqual({ seed });

    const fake = new FakeTransport().respondWith(() => challenge(xrplOption()));
    const kit = createXrplAgentKit({ ...config, transport: fake.transport });
    const server = await createXrplMcpServer(kit);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await server.connect(serverSide);
    await client.connect(clientSide);
    try {
      const result = await client.callTool({ name: "xrpl_fee", arguments: {} });
      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect((JSON.parse(content[0]?.text ?? "") as { code: string }).code).toBe(
        "payment-disabled",
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("Invalid XRPL network error never echoes the value", () => {
    let message = "";
    try {
      readXrplEnv({ CRIPTON_XRPL_NETWORK: "devnet" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("CRIPTON_XRPL_NETWORK");
    expect(message).not.toContain("devnet");
  });

  it("an invalid seed error never echoes the seed", () => {
    const bad = "sNotARealSeedXXXXXXXXXXXXXXXXX";
    let message = "";
    try {
      readXrplEnv({ CRIPTON_XRPL_PAYER_SEED: bad, CRIPTON_MAX_PER_CALL: "0.05" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("CRIPTON_XRPL_PAYER_SEED");
    expect(message).not.toContain(bad);
  });

  it("Purchase tool variables ignored by the XRPL kit", () => {
    const seed = Wallet.generate().seed as string;
    const config = readXrplEnv({
      CRIPTON_XRPL_PAYER_SEED: seed,
      CRIPTON_TOPUP_MAX: "1.21",
      CRIPTON_TOPUP_BUDGET: "5",
    });
    expect(config.credits?.topupBudget).toBeUndefined();
  });
});
