import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { CriptonValidationError } from "../../../src/domain/errors.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import {
  buildPaymentConfig,
  readCommonEnv,
} from "../../../src/infrastructure/config/common-env.js";
import { runCli, type CliCommand, type CliIo } from "../../../src/interfaces/cli/runner.js";
import { creditToken, expectTokenAbsent, loadFixture } from "../../support/credit-fixtures.js";
import { FakePayer } from "../../support/fake-payer.js";
import { FakeTransport } from "../../support/fake-transport.js";
import { challenge, xrplOption } from "../../support/x402-fixtures.js";

const xrpl = { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" };
const anySchema = z.object({}).passthrough();

function capture(): { io: CliIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t) => out.push(t), stderr: (t) => err.push(t) }, out, err };
}

/** A kit command that reads the common environment at start, as the kits' commands do. */
const envCommand: CliCommand = {
  name: "env",
  description: "Reads the common environment",
  async run(_args, env) {
    readCommonEnv(env);
    return { ok: true };
  },
};

/** The error a synchronous step throws, or `undefined` when it returns. */
function thrown(run: () => unknown): unknown {
  try {
    run();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("common environment", () => {
  it("Invalid tier names the variable, never the value", () => {
    const error = (() => {
      try {
        readCommonEnv({ CRIPTON_TIER: "gold" });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect(error).toMatchObject({ field: "CRIPTON_TIER" });
    expect((error as Error).message).not.toContain("gold");
  });

  it("Payer without a cap", async () => {
    const payer = new FakePayer();
    const common = readCommonEnv({ CRIPTON_TIER: "pro" });
    const payment = buildPaymentConfig(common, payer);
    expect(payment).toBeUndefined();

    const fake = new FakeTransport().respond(challenge(xrplOption()));
    const client = new ApiClient(
      { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" },
      {
        tier: common.tier,
        transport: fake.transport,
        wallet: payer,
        ...(payment ? { payment } : {}),
      },
    );
    const error = await client
      .request({ route: "fee", schema: z.object({}).passthrough() })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "payment-disabled" });
  });

  it("Credit token read from the environment", async () => {
    const token = creditToken();
    const common = readCommonEnv({ CRIPTON_TIER: "pro", CRIPTON_CREDITS_TOKEN: token });
    expect(common.creditsToken === token, "common.creditsToken holds the configured token").toBe(
      true,
    );

    const fake = new FakeTransport().respond(loadFixture("credit-paid-fee"));
    const client = new ApiClient(xrpl, {
      tier: common.tier,
      transport: fake.transport,
      ...(common.creditsToken === undefined ? {} : { credits: { token: common.creditsToken } }),
    });
    await client.request({ route: "fee", schema: anySchema });
    expect(fake.requests[0]?.url).toBe("https://api.criptonlabs.com/v1/pro/xrpl/fee");
    expect(
      fake.requests[0]?.headers.authorization === `Bearer ${token}`,
      "the paid request carries Authorization: Bearer <configured token>",
    ).toBe(true);
  });

  it("Credit token variable with the free tier", async () => {
    const token = creditToken();
    const env = { CRIPTON_TIER: "free", CRIPTON_CREDITS_TOKEN: token };
    const error = thrown(() => readCommonEnv(env));
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect(error).toMatchObject({ field: "CRIPTON_TIER" });
    expectTokenAbsent([error], token);

    const { io, out, err } = capture();
    const code = await runCli([envCommand], ["env"], env, io);
    expect(code).toBe(2);
    expect(err.join("")).toContain("CRIPTON_TIER");
    expectTokenAbsent([out.join(""), err.join("")], token);
  });

  it("Malformed credit token", async () => {
    const { io, out, err } = capture();
    const env = { CRIPTON_TIER: "pro", CRIPTON_CREDITS_TOKEN: "notatoken123" };
    const code = await runCli([envCommand], ["env"], env, io);
    expect(code).toBe(2);
    expect(err.join("")).toContain("CRIPTON_CREDITS_TOKEN");
    expect([...out, ...err].join("")).not.toContain("notatoken123");
  });

  it("Purchase cap without a budget", async () => {
    const { io, err } = capture();
    const code = await runCli([envCommand], ["env"], { CRIPTON_TOPUP_MAX: "1.21" }, io);
    expect(code).toBe(2);
    expect(err.join("")).toContain("CRIPTON_TOPUP_BUDGET");
  });
});
