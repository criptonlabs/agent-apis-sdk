import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const read = (name: string): string =>
  readFileSync(new URL(`../../../${name}`, import.meta.url), "utf8");

const TOOLS = [
  "solana_latest_slot",
  "solana_network_health",
  "solana_health_history",
  "solana_token",
  "solana_transfer_readiness",
  "solana_prepare_transfer",
];

const PRICE = /(?:\d+|\d+\.\d+)\s*(?:EURC|EUR|USDC|USD|€|\$)|(?:€|\$)\s*\d/;
const RETIRED_PRO_PATH = /\/v1\/pro\/(?!solana\/)/;

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
});
