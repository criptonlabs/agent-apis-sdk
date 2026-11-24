import { readFileSync } from "node:fs";
import { runCli } from "@criptonlabs/agent-apis-core/cli";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vite-plus/test";
import { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { createSolanaAgentKit } from "../../../src/index.js";
import { solanaCommands } from "../../../src/interfaces/cli/commands.js";
import { createSolanaMcpServer } from "../../../src/interfaces/mcp/server.js";
import { startFakeSolanaRpc } from "../../support/fake-solana-rpc.js";
import { kitOver, solanaFake } from "../../support/interface-kit.js";
import { throwawayKey } from "../../support/keys.js";

const read = (name: string): string =>
  readFileSync(new URL(`../../../${name}`, import.meta.url), "utf8");

const TOOLS = [
  "solana_latest_slot",
  "solana_network_health",
  "solana_health_history",
  "solana_token",
  "solana_transfer_readiness",
  "solana_prepare_transfer",
  "solana_credits_status",
  "solana_credits_topup",
];

const PRICE = /(?:\d+|\d+\.\d+)\s*(?:EURC|EUR|USDC|USD|€|\$)|(?:€|\$)\s*\d/;
const RETIRED_PRO_PATH = /\/v1\/pro\/(?!solana\/|credits\/|requirements)/;

const HEADING = /^(?:#{1,6} |)Purchase limits:?$/m;
const NEXT_HEADING = /^#{1,6} /m;

/** The text from the `Purchase limits` heading line to the next markdown heading (or the end). */
function purchaseLimitsSection(text: string): string | null {
  const heading = HEADING.exec(text);
  if (heading === null) return null;
  const rest = text.slice(heading.index + heading[0].length);
  const next = NEXT_HEADING.exec(rest);
  return next === null ? rest : rest.slice(0, next.index);
}

/** What every Solana guidance source says about an unconfirmed purchase. */
const UNCONFIRMED_PURCHASE = [
  "payment-settlement-failed",
  "eventId",
  "rotate-token",
  "do not buy it again",
];

/**
 * The `solana_credits_topup` description from the tool list of the Solana MCP server, built as the
 * purchase-tool MCP scenarios build it: a pro-tier devnet EURC wallet kit on the fake Solana RPC,
 * a top-up budget and a per-purchase cap.
 */
async function topupDescription(): Promise<string> {
  const rpc = await startFakeSolanaRpc();
  const kit = createSolanaAgentKit({
    tier: "pro",
    transport: new FakeTransport().transport,
    wallet: { key: throwawayKey().base58, network: "devnet", asset: "EURC", rpcUrl: rpc.url },
    credits: { topupBudget: "2.42" },
  });
  const server = await createSolanaMcpServer(kit, { topup: { maxAmount: "1.21" } });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  try {
    await server.connect(serverSide);
    await client.connect(clientSide);
    const { tools } = await client.listTools();
    const topup = tools.find((t) => t.name === "solana_credits_topup");
    expect(topup, "solana_credits_topup is listed").toBeDefined();
    return topup?.description ?? "";
  } finally {
    await client.close();
    await server.close();
    await rpc.stop();
  }
}

/** The 0.21.0 names API 0.27.0 removed (whole words, case-sensitive), and the uppercase token verdicts. */
const REMOVED_NAMES = ["blockers", "amount_raw", "net_amount", "SAFE", "WARN", "DANGER"];

/** `safe`, `warn` and `danger` named in that order within one sentence. */
const TOKEN_VERDICT = /\bsafe\b[^.]*\bwarn\b[^.]*\bdanger\b/;

/** The descriptions of every tool of the Solana MCP server, joined (the purchase tool is off). */
async function toolDescriptions(): Promise<string> {
  const server = await createSolanaMcpServer(kitOver(solanaFake()));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  try {
    await server.connect(serverSide);
    await client.connect(clientSide);
    const { tools } = await client.listTools();
    return tools.map((t) => t.description ?? "").join("\n");
  } finally {
    await client.close();
    await server.close();
  }
}

/** The members of `phrases` that `text` lacks. */
const lacking = (text: string, phrases: readonly string[]): string[] =>
  phrases.filter((phrase) => !text.includes(phrase));

describe("Solana guidance files", () => {
  it("Solana guidance files stay truthful", () => {
    const skill = read("SKILL.md");
    const rules = read(".cursorrules");

    for (const tool of TOOLS) expect(skill.includes(tool) ? tool : `missing ${tool}`).toBe(tool);

    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skill)?.[1] ?? "";
    expect(front).toMatch(/^name:\s*\S/m);
    expect(front).toMatch(/^description:\s*\S/m);

    for (const text of [skill, rules]) {
      expect(text).toContain("/v1/solana/");
      expect(text).toContain("/v1/pro/solana/");
      expect(text).toContain("CRIPTON_SOLANA_PAYER_KEY");
      expect(text).toContain("CRIPTON_MAX_PER_CALL");
      expect(text).not.toMatch(PRICE);
      expect(text).not.toContain("X-API-Key");
      expect(text).not.toContain("X-PAYMENT");
      expect(text).not.toMatch(RETIRED_PRO_PATH);
    }
  });

  it("Solana purchase limits marked in every guidance file", async () => {
    const out: string[] = [];
    await runCli(
      solanaCommands(() => createSolanaAgentKit({})),
      ["topup", "--help"],
      {},
      { stdout: (t: string) => out.push(t), stderr: () => {} },
    );
    const texts: Record<string, string> = {
      "README.md": read("README.md"),
      "SKILL.md": read("SKILL.md"),
      ".cursorrules": read(".cursorrules"),
      "topup --help": out.join(""),
    };

    for (const [name, text] of Object.entries(texts)) {
      const section = purchaseLimitsSection(text);
      expect(section, `${name} has a Purchase limits heading`).not.toBeNull();
      // `--max` as a whole flag name, not a prefix of another flag.
      expect(section, `${name} names maxAmount or --max`).toMatch(/maxAmount|--max(?![-\w])/);
      expect(section, `${name} names maxPerCall`).toContain("maxPerCall");
      expect(section, `${name} names sessionBudget`).toContain("sessionBudget");
      expect(section, `${name} names CRIPTON_TOPUP_MAX`).toContain("CRIPTON_TOPUP_MAX");
      expect(section, `${name} names CRIPTON_TOPUP_BUDGET`).toContain("CRIPTON_TOPUP_BUDGET");
    }
  });

  it("Unconfirmed purchase explained in every guidance file", async () => {
    const texts: Record<string, string> = {
      "solana_credits_topup description": await topupDescription(),
      "README.md": read("README.md"),
      "SKILL.md": read("SKILL.md"),
      ".cursorrules": read(".cursorrules"),
    };

    // Soft per source, so the failure lists every source and the phrases it lacks.
    for (const [name, text] of Object.entries(texts)) {
      const missing = UNCONFIRMED_PURCHASE.filter((phrase) => !text.includes(phrase));
      expect.soft(missing, `${name} lacks these phrases`).toEqual([]);
    }
  });

  it("Readiness vocabulary in every guidance file", async () => {
    const docs: Record<string, string> = {
      "README.md": read("README.md"),
      "SKILL.md": read("SKILL.md"),
      ".cursorrules": read(".cursorrules"),
    };
    const sources = { ...docs, "tool descriptions": await toolDescriptions() };

    // Soft per source, so the failure lists every source and what it lacks or still says.
    for (const [name, text] of Object.entries(sources)) {
      const readinessWords = ["verdict", "reasons", "checks_failed", "transfer-readiness-unknown"];
      expect.soft(lacking(text, readinessWords), `${name} lacks these readiness names`).toEqual([]);
      expect.soft(TOKEN_VERDICT.test(text), `${name} states the token verdict`).toBe(true);
      const removed = REMOVED_NAMES.filter((word) => new RegExp(`\\b${word}\\b`).test(text));
      expect.soft(removed, `${name} still says these removed names`).toEqual([]);
    }
    for (const name of ["SKILL.md", "README.md"]) {
      expect.soft(docs[name], `${name} names amount_atomic`).toContain("amount_atomic");
    }
    for (const [name, text] of Object.entries(docs)) {
      const supply = lacking(text, ["supply_atomic", "display units"]);
      expect.soft(supply, `${name} lacks these supply names`).toEqual([]);
    }
  });
});
