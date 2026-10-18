import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { CriptonValidationError } from "../../../src/domain/errors.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import {
  buildPaymentConfig,
  readCommonEnv,
} from "../../../src/infrastructure/config/common-env.js";
import { FakePayer } from "../../support/fake-payer.js";
import { FakeTransport } from "../../support/fake-transport.js";
import { challenge, xrplOption } from "../../support/x402-fixtures.js";

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
      { network: "xrpl", productToken: "xrpl-agent-kit/0.1.0" },
      { tier: common.tier, transport: fake.transport, ...(payment ? { payment } : {}) },
    );
    const error = await client
      .request({ route: "fee", schema: z.object({}).passthrough() })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "payment-disabled" });
  });
});
