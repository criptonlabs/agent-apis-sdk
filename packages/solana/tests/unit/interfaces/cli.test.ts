import { describe, expect, it } from "vite-plus/test";
import { runCli } from "@criptonlabs/agent-apis-core/cli";
import type { FakeTransport } from "../../../../core/tests/support/fake-transport.js";
import { createSolanaAgentKit } from "../../../src/index.js";
import { readSolanaEnv } from "../../../src/infrastructure/config/solana-env.js";
import { solanaCommands } from "../../../src/interfaces/cli/commands.js";
import { main } from "../../../src/interfaces/cli/main.js";
import { DESTINATION, SOURCE, readiness, solanaFake } from "../../support/interface-kit.js";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) },
  };
}

function commandsOver(fake: FakeTransport) {
  return solanaCommands((env) =>
    createSolanaAgentKit({ ...readSolanaEnv(env), transport: fake.transport }),
  );
}

describe("Solana CLI", () => {
  it("commands list", () => {
    const commands = solanaCommands(() => createSolanaAgentKit({}));
    expect(commands.map((c) => c.name).sort()).toEqual(
      [
        "mcp",
        "slot",
        "health",
        "token",
        "readiness",
        "prepare-transfer",
        "topup",
        "rotate-token",
        "credits",
      ].sort(),
    );
  });

  it("Solana slot command", async () => {
    const { io, out } = capture();
    const code = await runCli(commandsOver(solanaFake()), ["slot", "--json"], {}, io);
    expect(code).toBe(0);
    const json = JSON.parse(out.join("")) as Record<string, unknown>;
    expect(json).toHaveProperty("slot");
    expect(json).toHaveProperty("meta");
  });

  it("Transfer not ready in the CLI", async () => {
    const fake = solanaFake(readiness({ verdict: "not_ready", reasons: ["insufficient_balance"] }));
    const { io, out } = capture();
    const argv = [
      "prepare-transfer",
      "--from",
      SOURCE,
      "--to",
      DESTINATION,
      "--mint",
      "SOL",
      "--amount",
      "0.01",
      "--json",
    ];
    const code = await runCli(commandsOver(fake), argv, {}, io);
    expect(code).toBe(3);
    expect((JSON.parse(out.join("")) as { code: string }).code).toBe("transfer-not-ready");
  });

  it("Invalid Solana network", async () => {
    const { io, err } = capture();
    const code = await main(["slot"], { CRIPTON_SOLANA_NETWORK: "testnet" }, io);
    expect(code).toBe(2);
    const text = err.join("");
    expect(text).toContain("CRIPTON_SOLANA_NETWORK");
    expect(text).not.toContain("testnet");
  });
});
