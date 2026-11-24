import { describe, expect, it } from "vite-plus/test";
import { runCli } from "@criptonlabs/agent-apis-core/cli";
import { createXrplAgentKit } from "../../../src/index.js";
import { readXrplEnv } from "../../../src/infrastructure/config/xrpl-env.js";
import { main } from "../../../src/interfaces/cli/main.js";
import { xrplCommands } from "../../../src/interfaces/cli/commands.js";
import { DESTINATION, SOURCE, readiness, readinessFake } from "../../support/interface-kit.js";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) },
  };
}

describe("XRPL CLI", () => {
  it("commands list", () => {
    const commands = xrplCommands(() => createXrplAgentKit({}));
    expect(commands.map((c) => c.name).sort()).toEqual(
      [
        "mcp",
        "fee",
        "account",
        "token",
        "readiness",
        "prepare-payment",
        "quote-dex",
        "topup",
        "credits",
      ].sort(),
    );
  });

  it("Invalid XRPL network", async () => {
    const { io, err } = capture();
    const code = await main(["fee"], { CRIPTON_XRPL_NETWORK: "devnet" }, io);
    expect(code).toBe(2);
    const text = err.join("");
    expect(text).toContain("CRIPTON_XRPL_NETWORK");
    expect(text).not.toContain("devnet");
  });

  it("Readiness blocked in the CLI", async () => {
    const fake = readinessFake(
      readiness({ verdict: "not_ready", reasons: ["source_line_missing"] }),
    );
    const { io, out } = capture();
    const code = await runCli(
      xrplCommands((env) => createXrplAgentKit({ ...readXrplEnv(env), transport: fake.transport })),
      [
        "prepare-payment",
        "--from",
        SOURCE,
        "--to",
        DESTINATION,
        "--destination-tag",
        "12345",
        "--asset",
        "XRP",
        "--amount",
        "10",
        "--json",
      ],
      {},
      io,
    );
    expect(code).toBe(3);
    expect((JSON.parse(out.join("")) as { code: string }).code).toBe("payment-not-ready");
  });

  it("Fee command", async () => {
    const fake = readinessFake(readiness());
    const { io, out } = capture();
    const code = await runCli(
      xrplCommands((env) => createXrplAgentKit({ ...readXrplEnv(env), transport: fake.transport })),
      ["fee", "--json"],
      {},
      io,
    );
    expect(code).toBe(0);
    expect(JSON.parse(out.join(""))).toHaveProperty("meta");
  });
});
