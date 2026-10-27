import { CriptonResponseError, CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import type { TransferReadinessResponse } from "../../../src/domain/api-types.js";
import {
  planTransfer,
  validateIntent,
  type TransferIntent,
  TransferNotReadyError,
} from "../../../src/domain/prepared-transfer.js";
import solFixture from "../../fixtures/responses/transfer-readiness-sol.json" with { type: "json" };
import splFixture from "../../fixtures/responses/transfer-readiness-spl.json" with { type: "json" };

const SOURCE = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const DESTINATION = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const OTHER_ADDRESS = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

const solIntent: TransferIntent = {
  source: SOURCE,
  destination: DESTINATION,
  mint: "SOL",
  amount: "0.01",
};
const splIntent: TransferIntent = {
  source: SOURCE,
  destination: DESTINATION,
  mint: USDC_MINT,
  amount: "1",
};

function solReadiness(
  overrides: Partial<TransferReadinessResponse> = {},
): TransferReadinessResponse {
  return { ...(solFixture as TransferReadinessResponse), ...overrides };
}

function splReadiness(
  overrides: Partial<TransferReadinessResponse> = {},
): TransferReadinessResponse {
  return { ...(splFixture as TransferReadinessResponse), ...overrides };
}

function catchError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("readiness gate", () => {
  const notReady = splReadiness({
    ready: false,
    blockers: ["insufficient_balance"],
    warnings: ["memo_required"],
  });

  it("Transfer not ready", () => {
    const error = catchError(() => planTransfer(splIntent, notReady));
    expect(error).toBeInstanceOf(TransferNotReadyError);
    const refusal = error as TransferNotReadyError;
    expect(refusal.code).toBe("transfer-not-ready");
    expect(refusal.reasons).toEqual(["insufficient_balance"]);
    expect(refusal.warnings).toEqual(["memo_required"]);
  });

  it("serializes reasons and warnings under details", () => {
    const error = catchError(() => planTransfer(splIntent, notReady)) as TransferNotReadyError;
    expect(error).toBeInstanceOf(TransferNotReadyError);
    expect(error.toJSON().details).toMatchObject({
      reasons: ["insufficient_balance"],
      warnings: ["memo_required"],
    });
  });
});

describe("transfer planning", () => {
  it("Raw amount taken from readiness", () => {
    const plan = planTransfer(splIntent, splReadiness({ amount: "1", amount_raw: "1000000" }));
    expect(plan.kind).toBe("spl");
    expect(plan.kind === "spl" && plan.amountRaw).toBe("1000000");
  });

  it("plans a native SOL transfer in lamports", () => {
    const plan = planTransfer(solIntent, solReadiness());
    expect(plan).toEqual({
      kind: "sol",
      source: SOURCE,
      destination: DESTINATION,
      lamports: "10000000",
    });
  });

  it("plans an SPL transfer on the Token program", () => {
    const plan = planTransfer(splIntent, splReadiness());
    expect(plan).toEqual({
      kind: "spl",
      source: SOURCE,
      destination: DESTINATION,
      mint: USDC_MINT,
      tokenProgram: TOKEN_PROGRAM,
      amountRaw: "1000000",
      decimals: 6,
      createDestinationAccount: false,
    });
  });

  it("plans an SPL transfer on the Token-2022 program", () => {
    const plan = planTransfer(splIntent, splReadiness({ token_program: TOKEN_2022_PROGRAM }));
    expect(plan).toMatchObject({ kind: "spl", tokenProgram: TOKEN_2022_PROGRAM });
  });

  it("asks to create the destination account when readiness requires it", () => {
    const readiness = splReadiness({
      requires_ata_creation: true,
      ata_creation_lamports: "2039280",
    });
    expect(planTransfer(splIntent, readiness)).toMatchObject({
      kind: "spl",
      createDestinationAccount: true,
    });
  });

  it("rejects an SPL readiness without a token program", () => {
    const error = catchError(() => planTransfer(splIntent, splReadiness({ token_program: null })));
    expect(error).toBeInstanceOf(CriptonValidationError);
    expect((error as CriptonValidationError).code).toBe("invalid-input");
    expect((error as CriptonValidationError).field).toBe("mint");
  });
});

function catchValidation(run: () => unknown): CriptonValidationError {
  const error = catchError(run);
  expect(error).toBeInstanceOf(CriptonValidationError);
  return error as CriptonValidationError;
}

describe("intent amount decimals", () => {
  it("SOL amount with too many decimals", () => {
    const error = catchValidation(() => validateIntent({ ...solIntent, amount: "0.0000000001" }));
    expect(error.code).toBe("invalid-input");
    expect(error.field).toBe("amount");
  });

  it("accepts a SOL amount with 9 decimals", () => {
    expect(() => validateIntent({ ...solIntent, amount: "0.000000001" })).not.toThrow();
  });

  it("leaves SPL decimals to the API", () => {
    expect(() => validateIntent({ ...splIntent, amount: "1.0000001" })).not.toThrow();
  });
});

function expectInvalidResponse(run: () => unknown): void {
  const error = catchError(run);
  expect(error).toBeInstanceOf(CriptonResponseError);
  expect((error as CriptonResponseError).code).toBe("invalid-response");
}

describe("readiness verification", () => {
  it("Readiness amount does not match the intent", () => {
    const readiness = splReadiness({ decimals: 6, amount_raw: "2000000" });
    expectInvalidResponse(() => planTransfer({ ...splIntent, amount: "1" }, readiness));
  });

  it("Unknown token program refused", () => {
    const readiness = splReadiness({ token_program: SYSTEM_PROGRAM });
    expectInvalidResponse(() => planTransfer(splIntent, readiness));
  });

  it("Readiness for another destination refused", () => {
    const readiness = splReadiness({ destination: OTHER_ADDRESS });
    expectInvalidResponse(() => planTransfer(splIntent, readiness));
  });

  it("refuses a readiness for another source", () => {
    const readiness = splReadiness({ source: OTHER_ADDRESS });
    expectInvalidResponse(() => planTransfer(splIntent, readiness));
  });

  it("refuses a readiness for another mint", () => {
    const readiness = splReadiness({ mint: OTHER_ADDRESS });
    expectInvalidResponse(() => planTransfer(splIntent, readiness));
  });

  it("SOL readiness with wrong decimals refused", () => {
    const readiness = solReadiness({ decimals: 6, amount_raw: "10000" });
    expectInvalidResponse(() => planTransfer(solIntent, readiness));
  });

  it("verifies the readiness before trusting its ready verdict", () => {
    const readiness = splReadiness({
      amount_raw: "2000000",
      ready: false,
      blockers: ["insufficient_balance"],
    });
    expectInvalidResponse(() => planTransfer(splIntent, readiness));
  });
});
