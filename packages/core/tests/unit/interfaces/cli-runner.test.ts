import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { readCommonEnv } from "../../../src/infrastructure/config/common-env.js";
import { runCli, type CliCommand, type CliIo } from "../../../src/interfaces/cli/runner.js";
import { FakeTransport } from "../../support/fake-transport.js";
import { problem } from "../../support/x402-fixtures.js";

const descriptor = { network: "xrpl", productToken: "xrpl-agent-kit/0.1.0" };
const anySchema = z.object({}).passthrough();

function capture(): { io: CliIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t) => out.push(t), stderr: (t) => err.push(t) }, out, err };
}

const echo: CliCommand = {
  name: "echo",
  description: "Echo",
  options: { json: { type: "boolean" } },
  async run(_args, env) {
    readCommonEnv(env);
    return { ok: true };
  },
};

function apiCommand(fake: FakeTransport, timeoutMs?: number): CliCommand {
  return {
    name: "fee",
    description: "Fee",
    options: { json: { type: "boolean" } },
    async run() {
      const client = new ApiClient(descriptor, {
        transport: fake.transport,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
      return (await client.request({ route: "fee", schema: anySchema })).data;
    },
  };
}

describe("CLI runner", () => {
  it("Invalid tier", async () => {
    const { io, out, err } = capture();
    const code = await runCli([echo], ["echo"], { CRIPTON_TIER: "gold" }, io);
    expect(code).toBe(2);
    const all = [...out, ...err].join("");
    expect(err.join("")).toContain("CRIPTON_TIER");
    expect(all).not.toContain("gold");
  });

  it.each(["--seed", "--secret", "--private-key"])("Secret flag refused (%s)", async (flag) => {
    const { io, out, err } = capture();
    const code = await runCli([echo], ["echo", flag, "sXXXX"], {}, io);
    expect(code).toBe(2);
    expect([...out, ...err].join("")).not.toContain("sXXXX");
  });

  it("Timeout exit code", async () => {
    const { io } = capture();
    const code = await runCli([apiCommand(new FakeTransport().hang(), 50)], ["fee"], {}, io);
    expect(code).toBe(5);
  });

  it("API problem exit code", async () => {
    const { io, out } = capture();
    const fake = new FakeTransport().respond(problem("not-found", 404));
    const code = await runCli([apiCommand(fake)], ["fee", "--json"], {}, io);
    expect(code).toBe(4);
    expect(JSON.parse(out.join(""))).toMatchObject({ code: "not-found" });
  });
});
