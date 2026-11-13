import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { readCommonEnv } from "../../../src/infrastructure/config/common-env.js";
import { runCli, type CliCommand, type CliIo } from "../../../src/interfaces/cli/runner.js";
import {
  creditToken,
  expectTokenAbsent,
  loadFixture,
  settlementHeader,
  topupCreated,
  withBodyMembers,
} from "../../support/credit-fixtures.js";
import { FakePayer } from "../../support/fake-payer.js";
import { FakeTransport } from "../../support/fake-transport.js";
import { problem, TX_HASH } from "../../support/x402-fixtures.js";

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

/** Declares the token flags and a positional so parsing accepts them and the run echoes them. */
const tokenEcho: CliCommand = {
  name: "token-echo",
  description: "Token echo",
  options: { token: { type: "string" }, "credits-token": { type: "string" } },
  positionals: 1,
  async run(args) {
    return { values: args.values, positionals: args.positionals };
  },
};

const HELP_TEXT = "Usage: fee [--json]\nReads the recommended XRPL fee levels.\n";

/** A command with its own help text that reads the environment and sends a request when it runs. */
function helpedCommand(fake: FakeTransport, ran: string[]): CliCommand & { help: string } {
  return {
    name: "fee",
    description: "Fee",
    help: HELP_TEXT,
    async run(_args, env) {
      ran.push("fee");
      readCommonEnv(env);
      const client = new ApiClient(descriptor, { transport: fake.transport });
      return (await client.request({ route: "fee", schema: anySchema })).data;
    },
  };
}

/** The XRPL address of the spec-derived 201's `wallet` (CAIP-10 `xrpl:0:<address>`). */
const XRPL_BUYER = "rMkDf1zjiP8jEPvoNP51t9eU4qDmrBfriD";
const TOKEN_NOTICE = "Store this token in CRIPTON_CREDITS_TOKEN; it is not shown again.";

/** Pays the RLUSD `xrpl:0` entry of the recorded `usd-starter` top-up challenge. */
const rlusdWallet = () =>
  new FakePayer({ selectOption: (accepts) => accepts.find((o) => o.network === "xrpl:0") ?? null });

/** A top-up command: buys `usd-starter` and returns the bought token as a reveal (design D13). */
function topupCommand(fake: FakeTransport): CliCommand {
  return {
    name: "topup",
    description: "Top-up",
    async run() {
      const client = new ApiClient(descriptor, {
        transport: fake.transport,
        wallet: rlusdWallet(),
      });
      const result = await client.topup({ bundle: "usd-starter", maxAmount: "1.00" });
      return { reveal: { bundle: result.bundle, token: result.token }, notice: TOKEN_NOTICE };
    },
  };
}

/** A kit data command on a paid route, configured from the environment like the kits' commands. */
function creditDataCommand(fake: FakeTransport): CliCommand {
  return {
    name: "fee",
    description: "Fee",
    async run(_args, env) {
      const common = readCommonEnv(env);
      const client = new ApiClient(descriptor, {
        tier: common.tier,
        transport: fake.transport,
        ...(common.creditsToken === undefined ? {} : { credits: { token: common.creditsToken } }),
      });
      return (await client.request({ route: "fee", schema: anySchema })).data;
    },
  };
}

const occurrences = (text: string, token: string) => text.split(token).length - 1;

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

  it("Token flag refused", async () => {
    const token = creditToken();
    const { io, out, err } = capture();
    const code = await runCli([tokenEcho], ["token-echo", `--token=${token}`], {}, io);
    expect(code).toBe(2);
    expectTokenAbsent([out.join(""), err.join("")], token);
  });

  it("Token as a positional argument refused", async () => {
    const token = creditToken();
    const { io, out, err } = capture();
    const code = await runCli([tokenEcho], ["token-echo", token], {}, io);
    expect(code).toBe(2);
    expectTokenAbsent([out.join(""), err.join("")], token);
  });

  it("Help of a command", async () => {
    const fake = new FakeTransport().respond({ body: { fee: {} } });
    const ran: string[] = [];
    const { io, out } = capture();
    const code = await runCli([helpedCommand(fake, ran)], ["fee", "--help"], {}, io);
    expect(code).toBe(0);
    expect(out.join("")).toContain(HELP_TEXT);
    expect(ran).toEqual([]);
    expect(fake.requests).toHaveLength(0);
  });

  it("Help with an invalid environment", async () => {
    const fake = new FakeTransport().respond({ body: { fee: {} } });
    const { io, out } = capture();
    const code = await runCli(
      [helpedCommand(fake, [])],
      ["fee", "--help"],
      { CRIPTON_TIER: "gold" },
      io,
    );
    expect(code).toBe(0);
    expect(out.join("")).toContain(HELP_TEXT);
  });

  it("Top-up prints the token once", async () => {
    const token = creditToken();
    const settlement = settlementHeader({
      transaction: TX_HASH,
      network: "xrpl:0",
      payer: XRPL_BUYER,
    });
    const fake = new FakeTransport()
      .respond(loadFixture("topup-challenge-usd-starter"))
      .respond(topupCreated(token, settlement));
    const { io, out, err } = capture();
    const code = await runCli([topupCommand(fake)], ["topup", "--json"], {}, io);
    expect(code).toBe(0);
    const stdout = out.join("");
    expect(occurrences(stdout, token), "stdout holds the token exactly once").toBe(1);
    const printed = JSON.parse(stdout) as Record<string, unknown>;
    expect(printed.token === token, "the --json output is the reveal with the token").toBe(true);
    expect(err.join("")).toContain("CRIPTON_CREDITS_TOKEN");
    expectTokenAbsent([err.join("")], token);
  });

  it("Ambiguous top-up prints the provisional token", async () => {
    const token = creditToken();
    const ambiguous = loadFixture("topup-ambiguous-402", { "<credit-token>": token });
    const eventId = String(ambiguous.body.event_id);
    const fake = new FakeTransport()
      .respond(loadFixture("topup-challenge-usd-starter"))
      .respond(ambiguous);
    const { io, out, err } = capture();
    const code = await runCli([topupCommand(fake)], ["topup"], {}, io);
    expect(code).toBe(4);
    const stdout = out.join("");
    expect(occurrences(stdout, token), "stdout holds the provisional token exactly once").toBe(1);
    expect(stdout).toContain(eventId);
    expect(err.join("")).toContain("becomes valid only if the payment is reconciled");
    expectTokenAbsent([err.join("")], token);
  });

  it("Data command never prints the configured token", async () => {
    const token = creditToken();
    const refusal = withBodyMembers(loadFixture("challenge-fee-credits-only"), {
      error: "credits_invalid",
    });
    const fake = new FakeTransport().respond(refusal);
    const { io, out, err } = capture();
    const env = { CRIPTON_TIER: "pro", CRIPTON_CREDITS_TOKEN: token };
    await runCli([creditDataCommand(fake)], ["fee", "--json"], env, io);
    expect(
      fake.requests[0]?.headers.authorization === `Bearer ${token}`,
      "the paid request carries the configured token, so the refusal is about it",
    ).toBe(true);
    expectTokenAbsent([out.join(""), err.join("")], token);
  });
});
