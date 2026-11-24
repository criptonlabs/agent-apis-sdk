import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import type { TransferInstructionBuilder } from "../../../src/application/ports.js";
import { prepareTransfer } from "../../../src/application/prepare-transfer.js";
import type { TransferReadinessResponse } from "../../../src/domain/api-types.js";
import {
  type PreparedInstruction,
  type TransferIntent,
  TransferNotReadyError,
  type TransferPlan,
} from "../../../src/domain/prepared-transfer.js";
import solFixture from "../../fixtures/responses/transfer-readiness-sol.json" with { type: "json" };
import splFixture from "../../fixtures/responses/transfer-readiness-spl.json" with { type: "json" };
import unknownFixture from "../../fixtures/derived/transfer-readiness-unknown.json" with { type: "json" };
import { FakeDataPort } from "../../support/fake-data-port.js";

const SOURCE = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const DESTINATION = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const SOL_INSTRUCTION: PreparedInstruction = {
  programAddress: "11111111111111111111111111111111",
  accounts: [{ address: SOURCE, signer: true, writable: true }],
  data: "c29s",
};
const SPL_INSTRUCTION: PreparedInstruction = {
  programAddress: TOKEN_PROGRAM,
  accounts: [{ address: SOURCE, signer: true, writable: false }],
  data: "c3Bs",
};

/** Records the plans it receives and answers a fixed instruction per plan kind. */
class RecordingBuilder implements TransferInstructionBuilder {
  readonly plans: TransferPlan[] = [];

  build(plan: TransferPlan): Promise<PreparedInstruction[]> {
    this.plans.push(plan);
    return Promise.resolve(plan.kind === "sol" ? [SOL_INSTRUCTION] : [SPL_INSTRUCTION]);
  }
}

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

describe("prepareTransfer", () => {
  it("SOL transfer prepared", async () => {
    const readiness = solReadiness({ verdict: "ready", amount_atomic: "10000000" });
    const fake = new FakeDataPort(readiness);
    const builder = new RecordingBuilder();

    const prepared = await prepareTransfer(fake.port, builder, solIntent);

    expect(builder.plans).toEqual([
      { kind: "sol", source: SOURCE, destination: DESTINATION, lamports: "10000000" },
    ]);
    expect(prepared.transaction).toEqual({
      feePayer: SOURCE,
      recentBlockhash: null,
      instructions: [SOL_INSTRUCTION],
    });
    expect(prepared.readiness).toEqual(readiness);
    expect(prepared.meta).toEqual(readiness.meta);
    expect(prepared.ataCreation).toEqual({ required: false, lamports: null });
  });

  it("SPL transfer prepared", async () => {
    const readiness = splReadiness({
      verdict: "ready",
      decimals: 6,
      amount_atomic: "1000000",
      token_program: TOKEN_PROGRAM,
      requires_ata_creation: false,
    });
    const fake = new FakeDataPort(readiness);
    const builder = new RecordingBuilder();

    const prepared = await prepareTransfer(fake.port, builder, splIntent);

    expect(builder.plans).toEqual([
      {
        kind: "spl",
        source: SOURCE,
        destination: DESTINATION,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM,
        amountRaw: "1000000",
        decimals: 6,
        createDestinationAccount: false,
      },
    ]);
    expect(prepared.transaction.instructions).toEqual([SPL_INSTRUCTION]);
    expect(prepared.ataCreation).toEqual({ required: false, lamports: null });
  });

  it("Token-2022 transfer prepared", async () => {
    const fake = new FakeDataPort(
      splReadiness({ verdict: "ready", token_program: TOKEN_2022_PROGRAM }),
    );
    const builder = new RecordingBuilder();

    await prepareTransfer(fake.port, builder, splIntent);

    expect(builder.plans).toHaveLength(1);
    expect(builder.plans[0]).toMatchObject({ kind: "spl", tokenProgram: TOKEN_2022_PROGRAM });
  });

  it("Destination account created first", async () => {
    const readiness = splReadiness({
      verdict: "ready",
      requires_ata_creation: true,
      ata_creation_lamports: "2039280",
    });
    const fake = new FakeDataPort(readiness);
    const builder = new RecordingBuilder();

    const prepared = await prepareTransfer(fake.port, builder, splIntent);

    expect(builder.plans[0]).toMatchObject({ kind: "spl", createDestinationAccount: true });
    expect(prepared.ataCreation).toEqual({ required: true, lamports: "2039280" });
  });

  it("Transfer not ready", async () => {
    const fake = new FakeDataPort(
      solReadiness({ verdict: "not_ready", reasons: ["insufficient_balance"] }),
    );
    const builder = new RecordingBuilder();

    const error = await prepareTransfer(fake.port, builder, solIntent).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransferNotReadyError);
    expect((error as TransferNotReadyError).code).toBe("transfer-not-ready");
    expect((error as TransferNotReadyError).reasons).toEqual(["insufficient_balance"]);
    expect(builder.plans).toEqual([]);
  });

  it("Transfer readiness unknown", async () => {
    const fake = new FakeDataPort(unknownFixture as TransferReadinessResponse);
    const builder = new RecordingBuilder();

    const error = await prepareTransfer(fake.port, builder, splIntent).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransferNotReadyError);
    expect((error as TransferNotReadyError).code).toBe("transfer-readiness-unknown");
    expect((error as TransferNotReadyError).checksFailed).toEqual(["destination_token_account"]);
    expect(builder.plans).toEqual([]);
  });

  it("Unlisted verdict refused", async () => {
    const fake = new FakeDataPort(splReadiness({ verdict: "deferred" }));
    const builder = new RecordingBuilder();

    const error = await prepareTransfer(fake.port, builder, splIntent).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransferNotReadyError);
    expect((error as TransferNotReadyError).code).toBe("transfer-readiness-unknown");
    expect(builder.plans).toEqual([]);
  });

  it("rejects an invalid intent before querying readiness", async () => {
    const fake = new FakeDataPort(solReadiness());
    const builder = new RecordingBuilder();

    const error = await prepareTransfer(fake.port, builder, { ...solIntent, source: "bad" }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(CriptonValidationError);
    expect((error as CriptonValidationError).code).toBe("invalid-input");
    expect((error as CriptonValidationError).field).toBe("source");
    expect(fake.readinessQueries).toEqual([]);
    expect(builder.plans).toEqual([]);
  });

  it("queries readiness with source, destination, mint and amount from the intent", async () => {
    const fake = new FakeDataPort(splReadiness());

    await prepareTransfer(fake.port, new RecordingBuilder(), splIntent);

    expect(fake.readinessQueries).toEqual([
      { source: SOURCE, destination: DESTINATION, mint: USDC_MINT, amount: "1" },
    ]);
  });
});
