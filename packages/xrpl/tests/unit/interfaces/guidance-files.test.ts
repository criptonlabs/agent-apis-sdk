import { readFileSync } from "node:fs";
import { runCli } from "@criptonlabs/agent-apis-core/cli";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { isValidClassicAddress } from "xrpl";
import { describe, expect, it } from "vite-plus/test";
import { createXrplAgentKit } from "../../../src/index.js";
import { xrplCommands } from "../../../src/interfaces/cli/commands.js";
import { createXrplMcpServer } from "../../../src/interfaces/mcp/server.js";

const read = (name: string): string =>
  readFileSync(new URL(`../../../${name}`, import.meta.url), "utf8");

const TOOLS = [
  "xrpl_fee",
  "xrpl_network_health",
  "xrpl_latest_ledger",
  "xrpl_orderbook",
  "xrpl_slippage",
  "xrpl_amm",
  "xrpl_account_summary",
  "xrpl_account_lines",
  "xrpl_account_transactions",
  "xrpl_token",
  "xrpl_payment_readiness",
  "xrpl_paths",
  "xrpl_prepare_payment",
  "xrpl_dex_quote",
  "xrpl_credits_status",
];

const PRICE = /(?:\d+|\d+\.\d+)\s*(?:EURC|EUR|USDC|USD|RLUSD|€|\$)|(?:€|\$)\s*\d/;
const RETIRED_PRO_PATH = /\/v1\/pro\/(?!xrpl\/|credits\/|requirements)/;

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

const RLUSD_40_HEX_FORM =
  "524C555344000000000000000000000000000000.rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";

/** The tool inputs that take an asset (or a list of assets), as `tool.input`. */
const ASSET_INPUTS = [
  "xrpl_orderbook.base",
  "xrpl_orderbook.quote",
  "xrpl_slippage.base",
  "xrpl_slippage.quote",
  "xrpl_amm.a",
  "xrpl_amm.b",
  "xrpl_token.asset",
  "xrpl_payment_readiness.asset",
  "xrpl_paths.asset",
  "xrpl_paths.sendMaxAsset",
  "xrpl_paths.sourceAssets",
  "xrpl_prepare_payment.asset",
  "xrpl_prepare_payment.sourceAsset",
  "xrpl_dex_quote.base",
  "xrpl_dex_quote.quote",
];

const DEPTH_INPUTS = ["xrpl_orderbook.depth", "xrpl_slippage.depth", "xrpl_dex_quote.depth"];

const FORMER_FIELD_NAME = /\b(?:transfer_rate|ledger_age_s|peer_limit|trading_fee|load_factor)\b/;

const DEPTH_RANGE = /\b1 (?:to|\.\.) 9007199254740991\b/;
const DEPTH_BUCKETS = /\b10, 50,? or 100\b/;
const DEPTH_FORMER_SET = /\b10,\s*50,\s*100,?\s*or\s*200\b/;

interface ListedTool {
  name: string;
  description: string;
  inputs: Record<string, string>;
}

/** The tools as an MCP client lists them: name, description and each input's description. */
async function listedTools(): Promise<ListedTool[]> {
  const server = await createXrplMcpServer(createXrplAgentKit({}));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await server.connect(serverSide);
  await client.connect(clientSide);
  try {
    const { tools } = await client.listTools();
    return tools.map((tool) => {
      const properties = (tool.inputSchema.properties ?? {}) as Record<
        string,
        { description?: string }
      >;
      const inputs = Object.fromEntries(
        Object.entries(properties).map(([name, schema]) => [name, schema.description ?? ""]),
      );
      return { name: tool.name, description: tool.description ?? "", inputs };
    });
  } finally {
    await client.close();
    await server.close();
  }
}

function inputDescription(tools: ListedTool[], id: string): string {
  const [toolName = "", input = ""] = id.split(".");
  return tools.find((t) => t.name === toolName)?.inputs[input] ?? "";
}

describe("Guidance files", () => {
  it("Guidance files stay truthful", () => {
    const skill = read("SKILL.md");
    const rules = read(".cursorrules");

    for (const tool of TOOLS) expect(skill.includes(tool) ? tool : `missing ${tool}`).toBe(tool);

    expect(skill).toMatch(/^---\r?\n[\s\S]*?\bname:\s*\S[\s\S]*?\r?\n---/);
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skill)?.[1] ?? "";
    expect(front).toMatch(/^name:\s*\S/m);
    expect(front).toMatch(/^description:\s*\S/m);

    for (const text of [skill, rules]) {
      expect(text).toContain("/v1/xrpl/");
      expect(text).toContain("/v1/pro/xrpl/");
      expect(text).toContain("CRIPTON_XRPL_PAYER_SEED");
      expect(text).toContain("CRIPTON_MAX_PER_CALL");
      expect(text).not.toMatch(PRICE);
      expect(text).not.toContain("X-API-Key");
      expect(text).not.toContain("X-PAYMENT");
      expect(text).not.toMatch(RETIRED_PRO_PATH);
    }
  });

  it("Purchase limits marked in every guidance file", async () => {
    const out: string[] = [];
    await runCli(
      xrplCommands(() => createXrplAgentKit({})),
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
      expect(section, `${name} names maxAmount or --max`).toMatch(/maxAmount|--max/);
      expect(section, `${name} names maxPerCall`).toContain("maxPerCall");
      expect(section, `${name} names sessionBudget`).toContain("sessionBudget");
    }
  });

  it("Asset forms stated in every guidance file", () => {
    const files = { "README.md": read("README.md"), "SKILL.md": read("SKILL.md") };
    const texts = { ...files, ".cursorrules": read(".cursorrules") };

    for (const [name, text] of Object.entries(texts)) {
      expect(text, `${name} states that standard codes are case-sensitive`).toMatch(
        /case-sensitive/i,
      );
      expect(text, `${name} gives RLUSD in its 40-hex form`).toContain(RLUSD_40_HEX_FORM);
      expect(text, `${name} has no RLUSD.r form`).not.toContain("RLUSD.r");
      expect(text, `${name} does not say codes are upper-cased`).not.toMatch(/upper-?cas/i);
      expect(text, `${name} does not say codes are case-insensitive`).not.toMatch(
        /case-insensitive/i,
      );
    }
  });

  it("Tool asset descriptions state the forms", async () => {
    const tools = await listedTools();
    const found = tools.flatMap((t) => Object.keys(t.inputs).map((i) => `${t.name}.${i}`));
    expect(ASSET_INPUTS.filter((id) => !found.includes(id))).toEqual([]);

    for (const id of ASSET_INPUTS) {
      const text = inputDescription(tools, id);
      expect(text, `${id} states the case-sensitive form`).toMatch(/case-sensitive/i);
      expect(text, `${id} states the 3-character form`).toMatch(/3-character/i);
      expect(text, `${id} states the 40-hex form`).toMatch(/40-hex/i);
      expect(text, `${id} has no placeholder issuer`).not.toMatch(/rIssuer|\br\.\.\./);
      const addresses = text.match(/\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/g) ?? [];
      expect(
        addresses.some((address) => isValidClassicAddress(address)),
        `${id} has an example issuer that is a real classic address`,
      ).toBe(true);
    }
  });

  it("One payment at a time stated in every guidance file", () => {
    const texts = {
      "README.md": read("README.md"),
      "SKILL.md": read("SKILL.md"),
      ".cursorrules": read(".cursorrules"),
    };

    for (const [name, text] of Object.entries(texts)) {
      for (const phrase of ["one at a time", "payment-busy", "two processes"]) {
        expect(text, `${name} contains "${phrase}"`).toContain(phrase);
      }
    }
  });

  it("Depth range stated", async () => {
    const tools = await listedTools();
    const out: string[] = [];
    await runCli(
      xrplCommands(() => createXrplAgentKit({})),
      ["quote-dex", "--help"],
      {},
      { stdout: (t: string) => out.push(t), stderr: () => {} },
    );
    const texts: Record<string, string> = {
      "README.md": read("README.md"),
      "quote-dex --help": out.join(""),
    };
    for (const id of DEPTH_INPUTS) texts[id] = inputDescription(tools, id);

    for (const [name, text] of Object.entries(texts)) {
      expect(text, `${name} states depth is an integer`).toMatch(/integer/i);
      expect(text, `${name} states the range 1 to 9007199254740991`).toMatch(DEPTH_RANGE);
      expect(text, `${name} states the buckets 10, 50 or 100`).toMatch(DEPTH_BUCKETS);
      expect(text, `${name} names depth_effective`).toContain("depth_effective");
      expect(text, `${name} does not state 10, 50, 100 or 200`).not.toMatch(DEPTH_FORMER_SET);
    }
  });

  it("Former field names absent from guidance", async () => {
    // The 0.27.0 names that contain a former name stay allowed: whole words only.
    for (const current of ["ledger_age_seconds", "load_factor_multiplier", "trading_fee_pct"]) {
      expect(current).not.toMatch(FORMER_FIELD_NAME);
    }
    const tools = await listedTools();
    const texts: Record<string, string> = {
      "SKILL.md": read("SKILL.md"),
      ".cursorrules": read(".cursorrules"),
      "README.md": read("README.md"),
    };
    for (const tool of tools) {
      texts[`${tool.name} description`] = tool.description;
      for (const [input, text] of Object.entries(tool.inputs))
        texts[`${tool.name}.${input}`] = text;
    }

    for (const [name, text] of Object.entries(texts)) {
      expect(text, `${name} names no former field`).not.toMatch(FORMER_FIELD_NAME);
    }
  });
});
