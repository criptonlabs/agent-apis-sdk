import { runCli } from "@criptonlabs/agent-apis-core/cli";
import { describe, expect, it } from "vite-plus/test";
import { createSolanaAgentKit } from "../../../src/index.js";
import { readSolanaEnv } from "../../../src/infrastructure/config/solana-env.js";
import { solanaCommands } from "../../../src/interfaces/cli/commands.js";
import token from "../../fixtures/responses/token.json" with { type: "json" };
import { DESTINATION, SOURCE, healthFixture, solanaFake } from "../../support/interface-kit.js";

const TRANSFER_FLAGS = ["--from", SOURCE, "--to", DESTINATION, "--mint", "SOL", "--amount", "0.01"];

function run(argv: string[]) {
  const fake = solanaFake();
  const out: string[] = [];
  const err: string[] = [];
  const done = runCli(
    solanaCommands((env) =>
      createSolanaAgentKit({ ...readSolanaEnv(env), transport: fake.transport }),
    ),
    argv,
    {},
    { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) },
  );
  const urls = () => fake.requests.map((r) => new URL(r.url));
  const json = () => JSON.parse(out.join("")) as Record<string, unknown>;
  return { done, out, err, urls, json };
}

describe("Solana CLI commands map flags to requests", () => {
  it("health reads the health route", async () => {
    const r = run(["health", "--json"]);
    expect(await r.done).toBe(0);
    expect(r.urls()[0]?.pathname).toBe("/v1/solana/health");
    expect(r.json()).toMatchObject({ status: healthFixture.status, slot: healthFixture.slot });
  });

  it("token <mint> reads that mint", async () => {
    const r = run(["token", token.mint, "--json"]);
    expect(await r.done).toBe(0);
    expect(r.urls()[0]?.pathname).toBe(`/v1/solana/token/${token.mint}`);
    expect(r.json()).toMatchObject({ mint: token.mint, decimals: token.decimals });
  });

  it("token without a mint exits 2 and sends nothing", async () => {
    const r = run(["token", "--json"]);
    expect(await r.done).toBe(2);
    expect(r.err.join("") + r.out.join("")).toContain("mint");
    expect(r.urls()).toHaveLength(0);
  });

  it("readiness maps --from, --to, --mint and --amount", async () => {
    const r = run(["readiness", ...TRANSFER_FLAGS, "--json"]);
    expect(await r.done).toBe(0);
    const url = r.urls()[0];
    expect(url?.pathname).toBe("/v1/solana/transfer-readiness");
    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
      source: SOURCE,
      destination: DESTINATION,
      mint: "SOL",
      amount: "0.01",
    });
    expect(r.json()).toMatchObject({ ready: true });
  });

  it("prepare-transfer prints the unsigned transfer for a ready SOL readiness", async () => {
    const r = run(["prepare-transfer", ...TRANSFER_FLAGS, "--json"]);
    expect(await r.done).toBe(0);
    const result = r.json() as { transaction: { feePayer: string; recentBlockhash: unknown } };
    expect(result.transaction.feePayer).toBe(SOURCE);
    expect(result.transaction.recentBlockhash).toBeNull();
  });

  it("readiness without --mint exits 2 naming the flag and sends nothing", async () => {
    const r = run(["readiness", "--from", SOURCE, "--to", DESTINATION, "--amount", "1", "--json"]);
    expect(await r.done).toBe(2);
    expect(r.err.join("") + r.out.join("")).toContain("mint");
    expect(r.urls()).toHaveLength(0);
  });

  it("prepare-transfer without --amount exits 2 naming the flag", async () => {
    const r = run(["prepare-transfer", "--from", SOURCE, "--to", DESTINATION, "--mint", "SOL"]);
    expect(await r.done).toBe(2);
    expect(r.err.join("") + r.out.join("")).toContain("amount");
    expect(r.urls()).toHaveLength(0);
  });
});
