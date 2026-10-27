import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { describe, expect, it } from "vite-plus/test";
import type { TransferPlan } from "../../../src/domain/prepared-transfer.js";
import { createInstructionBuilder } from "../../../src/infrastructure/solana/instruction-builder.js";
import { throwawayAddress } from "../../support/keys.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

type SplPlan = Extract<TransferPlan, { kind: "spl" }>;

const bytes = (base64: string) => Array.from(Buffer.from(base64, "base64"));

function u64le(value: bigint): number[] {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(value);
  return Array.from(out);
}

async function ata(mint: string, owner: string, tokenProgram: string): Promise<string> {
  const [pda] = await findAssociatedTokenPda({
    mint: address(mint),
    owner: address(owner),
    tokenProgram: address(tokenProgram),
  });
  return pda;
}

function splPlan(overrides: Partial<SplPlan> = {}): SplPlan {
  return {
    kind: "spl",
    source: throwawayAddress(),
    destination: throwawayAddress(),
    mint: DEVNET_USDC,
    tokenProgram: TOKEN_PROGRAM,
    amountRaw: "1000000",
    decimals: 6,
    createDestinationAccount: false,
    ...overrides,
  };
}

async function expectedTransferChecked(plan: SplPlan) {
  return {
    programAddress: plan.tokenProgram,
    accounts: [
      {
        address: await ata(plan.mint, plan.source, plan.tokenProgram),
        signer: false,
        writable: true,
      },
      { address: plan.mint, signer: false, writable: false },
      {
        address: await ata(plan.mint, plan.destination, plan.tokenProgram),
        signer: false,
        writable: true,
      },
      { address: plan.source, signer: true, writable: false },
    ],
  };
}

function expectTransferCheckedData(data: string, amount: bigint, decimals: number): void {
  const decoded = bytes(data);
  expect(decoded[0]).toBe(12);
  expect(decoded).toEqual([12, ...u64le(amount), decimals]);
}

describe("createInstructionBuilder", () => {
  it("SOL transfer prepared", async () => {
    const plan: TransferPlan = {
      kind: "sol",
      source: throwawayAddress(),
      destination: throwawayAddress(),
      lamports: "10000000",
    };

    const instructions = await createInstructionBuilder().build(plan);

    expect(instructions).toHaveLength(1);
    const [transfer] = instructions;
    expect(transfer?.programAddress).toBe(SYSTEM_PROGRAM);
    expect(transfer?.accounts).toEqual([
      { address: plan.source, signer: true, writable: true },
      { address: plan.destination, signer: false, writable: true },
    ]);
    expect(bytes(transfer?.data ?? "")).toEqual([2, 0, 0, 0, ...u64le(10_000_000n)]);
  });

  it("SPL transfer prepared", async () => {
    const plan = splPlan();

    const instructions = await createInstructionBuilder().build(plan);

    expect(instructions).toHaveLength(1);
    const [transfer] = instructions;
    expect(transfer).toMatchObject(await expectedTransferChecked(plan));
    expect(transfer?.programAddress).toBe(TOKEN_PROGRAM);
    expectTransferCheckedData(transfer?.data ?? "", 1_000_000n, 6);
  });

  it("Token-2022 transfer prepared", async () => {
    const plan = splPlan({
      mint: throwawayAddress(),
      tokenProgram: TOKEN_2022_PROGRAM,
      amountRaw: "250000000",
      decimals: 9,
    });

    const instructions = await createInstructionBuilder().build(plan);

    expect(instructions).toHaveLength(1);
    const [transfer] = instructions;
    expect(transfer?.programAddress).toBe(TOKEN_2022_PROGRAM);
    expect(transfer).toMatchObject(await expectedTransferChecked(plan));
    // ATAs derived for Token-2022 differ from the classic Token program ones.
    const classic = await ata(plan.mint, plan.destination, TOKEN_PROGRAM);
    expect(transfer?.accounts[2]?.address).not.toBe(classic);
    expectTransferCheckedData(transfer?.data ?? "", 250_000_000n, 9);
  });

  it("Destination account created first", async () => {
    const plan = splPlan({ createDestinationAccount: true });

    const instructions = await createInstructionBuilder().build(plan);

    expect(instructions).toHaveLength(2);
    const [create, transfer] = instructions;
    expect(create?.programAddress).toBe(ATA_PROGRAM);
    expect(bytes(create?.data ?? "")).toEqual([1]);
    expect(create?.accounts).toEqual([
      { address: plan.source, signer: true, writable: true },
      {
        address: await ata(plan.mint, plan.destination, TOKEN_PROGRAM),
        signer: false,
        writable: true,
      },
      { address: plan.destination, signer: false, writable: false },
      { address: plan.mint, signer: false, writable: false },
      { address: SYSTEM_PROGRAM, signer: false, writable: false },
      { address: TOKEN_PROGRAM, signer: false, writable: false },
    ]);
    expect(transfer).toMatchObject(await expectedTransferChecked(plan));
    expectTransferCheckedData(transfer?.data ?? "", 1_000_000n, 6);
  });

  it("Raw amount taken from readiness", async () => {
    const plan = splPlan({ amountRaw: "1000000", decimals: 6 });

    const [transfer] = await createInstructionBuilder().build(plan);

    expectTransferCheckedData(transfer?.data ?? "", 1_000_000n, 6);
  });
});
