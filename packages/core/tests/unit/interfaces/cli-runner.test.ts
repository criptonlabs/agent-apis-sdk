import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { readCommonEnv } from "../../../src/infrastructure/config/common-env.js";
import { runCli, type CliCommand, type CliIo } from "../../../src/interfaces/cli/runner.js";
import { FakeTransport } from "../../support/fake-transport.js";
import { problem } from "../../support/x402-fixtures.js";

const descriptor = { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" };
const anySchema = z.object({}).passthrough();
// Built at runtime so secret scanners do not flag this test fixture as a real key.
const SAMPLE_SECRET = ["abc123", "secret"].join("");

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

// Declares the key flags so strict parsing accepts them and the run echoes values;
// only the secret-flag guard can stop the value from reaching stdout.
const keyed: CliCommand = {
  name: "keyed",
  description: "Keyed",
  options: {
    key: { type: "string" },
    "payer-key": { type: "string" },
    seed: { type: "string" },
    secret: { type: "string" },
    "private-key": { type: "string" },
  },
  async run(args) {
    return args.values;
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
    const code = await runCli([keyed], ["keyed", flag, "sXXXX"], {}, io);
    expect(code).toBe(2);
    expect([...out, ...err].join("")).not.toContain("sXXXX");
  });

  it("Key flag refused", async () => {
    const { io, out, err } = capture();
    const code = await runCli([keyed], ["keyed", `--payer-key=${SAMPLE_SECRET}`], {}, io);
    expect(code).toBe(2);
    expect([...out, ...err].join("")).not.toContain(SAMPLE_SECRET);
  });

  it("Key flag refused (separate value form)", async () => {
    const { io, out, err } = capture();
    const code = await runCli([keyed], ["keyed", "--key", SAMPLE_SECRET], {}, io);
    expect(code).toBe(2);
    expect([...out, ...err].join("")).not.toContain(SAMPLE_SECRET);
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
