import type { McpServerLike } from "@criptonlabs/agent-apis-core/mcp";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test";
import {
  expectTokenAbsent,
  creditToken,
  loadFixture,
  type ResponseFixture,
} from "../../../../core/tests/support/credit-fixtures.js";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { challenge } from "../../../../core/tests/support/x402-fixtures.js";
import pkg from "../../../package.json" with { type: "json" };
import { createSolanaAgentKit, type SolanaAgentKit } from "../../../src/index.js";
import { readSolanaEnv } from "../../../src/infrastructure/config/solana-env.js";
import { createSolanaMcpServer, solanaMcpOptions } from "../../../src/interfaces/mcp/server.js";
import { eurOneCreated, eurOneDevnetChallenge } from "../../support/eur-one-topup.js";
import { startFakeSolanaRpc, type FakeSolanaRpc } from "../../support/fake-solana-rpc.js";
import { throwawayAddress, throwawayKey, type ThrowawayKey } from "../../support/keys.js";
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
  return connectServer(await createSolanaMcpServer(kit));
}

async function connectServer(server: McpServerLike): Promise<Client> {
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

let rpc: FakeSolanaRpc;

beforeAll(async () => {
  rpc = await startFakeSolanaRpc();
});

afterAll(async () => {
  await rpc.stop();
});

const SLOT_PRO_PATH = "/v1/pro/solana/slot/latest";

/** The spec-derived credit-debited answer of the slot route (`X-Credits-Remaining: EUR=0.9995;USD=0`). */
function creditPaidSlot(): ResponseFixture {
  const recorded = loadFixture("siwx-next-challenge");
  const { "x-siwx-next-challenge": _next, ...headers } = recorded.headers;
  return { ...recorded, headers };
}

/** A pro-tier devnet EURC wallet kit with the given credits configuration. */
function walletKitWith(
  fake: FakeTransport,
  key: ThrowawayKey,
  credits: { token?: string; topupBudget?: string },
): SolanaAgentKit {
  return createSolanaAgentKit({
    tier: "pro",
    transport: fake.transport,
    wallet: { key: key.base58, network: "devnet", asset: "EURC", rpcUrl: rpc.url },
    credits,
  });
}

/** A pro-tier devnet EURC wallet kit without a credit token, with `topupBudget` as its budget. */
function walletKit(fake: FakeTransport, key: ThrowawayKey, topupBudget: string): SolanaAgentKit {
  return walletKitWith(fake, key, { topupBudget });
}

/** A 201 token string outside the API token grammar, built at run time. */
function malformedToken(): string {
  return `not-a-credit-token-${crypto.randomUUID()}`;
}

/** An MCP client of the Solana server with the purchase tool's per-purchase cap. */
async function connectWithTopup(kit: SolanaAgentKit, maxAmount: string): Promise<Client> {
  return connectServer(await createSolanaMcpServer(kit, { topup: { maxAmount } }));
}

/** Lists the tools and asserts the purchase tool is there (so a missing tool fails as such). */
async function expectTopupListed(client: Client): Promise<void> {
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name)).toContain("solana_credits_topup");
}

function textOf(result: { content?: unknown }): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0]?.text ?? "";
}

const buyEurOne = (client: Client) =>
  client.callTool({ name: "solana_credits_topup", arguments: { bundle: "eur-1" } });

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

  it("Solana MCP tool list with purchase caps", async () => {
    const env = {
      CRIPTON_TIER: "pro",
      CRIPTON_SOLANA_PAYER_KEY: throwawayKey().base58,
      CRIPTON_TOPUP_MAX: "1.21",
      CRIPTON_TOPUP_BUDGET: "2.42",
    };
    const kit = createSolanaAgentKit({
      ...readSolanaEnv(env),
      transport: new FakeTransport().transport,
    });
    const client = await connectServer(await createSolanaMcpServer(kit, solanaMcpOptions(env)));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES, "solana_credits_topup"].sort());
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

  it("Solana credit status with SIWX", async () => {
    const fake = new FakeTransport().respond(creditPaidSlot());
    const kit = createSolanaAgentKit({
      tier: "pro",
      transport: fake.transport,
      wallet: { key: throwawayKey().base58, network: "devnet", rpcUrl: rpc.url },
      credits: { siwx: true },
    });
    await kit.data.latestSlot();
    expect(fake.requests).toHaveLength(1);

    const client = await connect(kit);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("solana_credits_status");
    const result = await client.callTool({ name: "solana_credits_status", arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(JSON.parse(textOf(result))).toEqual({
      hasToken: false,
      siwxEnabled: true,
      balance: { EUR: "0.9995", USD: "0" },
      topupSpent: "0",
    });
    expect(fake.requests, "the status call sends no HTTP request").toHaveLength(1);
  });

  it("Purchase tool annotations", async () => {
    const kit = walletKit(new FakeTransport(), throwawayKey(), "2.42");
    const client = await connectWithTopup(kit, "1.21");
    const { tools } = await client.listTools();
    const topup = tools.find((t) => t.name === "solana_credits_topup");
    expect(topup, "solana_credits_topup is listed").toBeDefined();
    expect(topup?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it("Purchase tool keeps the token out of the model", async () => {
    const key = throwawayKey();
    const token = creditToken();
    const fake = new FakeTransport()
      .respond(eurOneDevnetChallenge())
      .respond(eurOneCreated(key, token))
      .respond(creditPaidSlot());
    const kit = walletKit(fake, key, "2.42");
    const client = await connectWithTopup(kit, "1.21");
    await expectTopupListed(client);

    const result = await buyEurOne(client);

    expect(result.isError).not.toBe(true);
    const text = textOf(result);
    const purchase = JSON.parse(text) as Record<string, unknown>;
    expect(purchase).toMatchObject({
      bundle: "eur-1",
      denomination: "EUR",
      balance: "1",
      lotExpiresAt: "2027-11-12T18:20:05Z",
      pending: false,
      tokenKept: true,
    });
    expect(purchase).not.toHaveProperty("token");
    expectTokenAbsent([result, text], token);

    await client.callTool({ name: "solana_latest_slot", arguments: {} });
    const next = fake.requests.at(-1);
    expect(new URL(next?.url ?? "http://none/").pathname).toBe(SLOT_PRO_PATH);
    const bearer = next?.headers.authorization === `Bearer ${token}`;
    expect(bearer, "the next credits-only call carries the bought token as Bearer").toBe(true);
  });

  it("Purchase tool over its cap", async () => {
    const fake = new FakeTransport().respond(eurOneDevnetChallenge());
    const kit = walletKit(fake, throwawayKey(), "2.00");
    const client = await connectWithTopup(kit, "1.00");
    await expectTopupListed(client);

    const result = await buyEurOne(client);

    expect(result.isError).toBe(true);
    expect(firstJson(result).code).toBe("payment-over-cap");
    expect(fake.requests).toHaveLength(1);
    expect(
      fake.requests.some((r) => "payment-signature" in r.headers),
      "nothing signed",
    ).toBe(false);
  });

  it("Purchase tool budget exhausted", async () => {
    const key = throwawayKey();
    const fake = new FakeTransport()
      .respond(eurOneDevnetChallenge())
      .respond(eurOneCreated(key, creditToken()))
      .respond(eurOneDevnetChallenge());
    const kit = walletKit(fake, key, "2.00");
    const client = await connectWithTopup(kit, "1.21");
    await expectTopupListed(client);
    const first = await buyEurOne(client);
    expect(first.isError, "the first eur-1 is bought").not.toBe(true);

    const result = await buyEurOne(client);

    expect(result.isError).toBe(true);
    expect(firstJson(result).code).toBe("payment-budget-exhausted");
  });

  it("Purchase tool needs the pro tier", async () => {
    const env = {
      CRIPTON_TIER: "free",
      CRIPTON_SOLANA_PAYER_KEY: throwawayKey().base58,
      CRIPTON_TOPUP_MAX: "1.21",
      CRIPTON_TOPUP_BUDGET: "2.42",
    };
    const kit = createSolanaAgentKit({
      ...readSolanaEnv(env),
      transport: new FakeTransport().transport,
    });
    const client = await connectServer(await createSolanaMcpServer(kit, solanaMcpOptions(env)));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOL_NAMES);
  });

  it("Purchase tool without a budget", async () => {
    const kit = walletKitWith(new FakeTransport(), throwawayKey(), {});
    const client = await connectServer(
      await createSolanaMcpServer(kit, { topup: { maxAmount: "1.21" } }),
    );
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOL_NAMES);
  });

  it("Purchase tool with a configured token", async () => {
    const key = throwawayKey();
    const configured = creditToken();
    const bought = creditToken();
    const fake = new FakeTransport()
      .respond(eurOneDevnetChallenge())
      .respond(eurOneCreated(key, bought))
      .respond(creditPaidSlot());
    const kit = walletKitWith(fake, key, { token: configured, topupBudget: "2.42" });
    const client = await connectWithTopup(kit, "1.21");
    await expectTopupListed(client);

    const result = await buyEurOne(client);

    expect(result.isError).not.toBe(true);
    const text = textOf(result);
    expect(JSON.parse(text)).toMatchObject({ tokenKept: false });
    expectTokenAbsent([result, text], configured);
    expectTokenAbsent([result, text], bought);

    await client.callTool({ name: "solana_latest_slot", arguments: {} });
    const next = fake.requests.at(-1);
    expect(new URL(next?.url ?? "http://none/").pathname).toBe(SLOT_PRO_PATH);
    const bearer = next?.headers.authorization === `Bearer ${configured}`;
    expect(bearer, "the next credits-only call carries the configured token as Bearer").toBe(true);
  });

  it("Purchase reported when the bought token cannot be kept", async () => {
    const key = throwawayKey();
    const malformed = malformedToken();
    const fake = new FakeTransport()
      .respond(eurOneDevnetChallenge())
      .respond(eurOneCreated(key, malformed));
    const kit = walletKit(fake, key, "2.42");
    const client = await connectWithTopup(kit, "1.21");
    await expectTopupListed(client);

    const result = await buyEurOne(client);

    expect(result.isError).not.toBe(true);
    const text = textOf(result);
    expect(JSON.parse(text)).toMatchObject({ bundle: "eur-1", tokenKept: false });
    expectTokenAbsent([result, text], malformed);
  });

  it("Solana MCP server name", async () => {
    const client = await connect(kitOver(solanaFake()));
    expect(client.getServerVersion()).toMatchObject({
      name: "criptonlabs-agent-apis-solana",
      version: pkg.version,
    });
  });
});
