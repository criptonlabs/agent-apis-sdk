import { readFileSync } from "node:fs";
import { runCli } from "@criptonlabs/agent-apis-core/cli";
import { describe, expect, it } from "vite-plus/test";
import { createXrplAgentKit } from "../../../src/index.js";
import { xrplCommands } from "../../../src/interfaces/cli/commands.js";

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
});
