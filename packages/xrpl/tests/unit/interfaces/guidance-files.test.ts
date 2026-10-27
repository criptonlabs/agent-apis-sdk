import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

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
];

const PRICE = /(?:\d+|\d+\.\d+)\s*(?:EURC|EUR|USDC|USD|RLUSD|€|\$)|(?:€|\$)\s*\d/;
const RETIRED_PRO_PATH = /\/v1\/pro\/(?!xrpl\/|requirements)/;

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
});
