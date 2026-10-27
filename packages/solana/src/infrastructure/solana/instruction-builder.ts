import {
  address,
  createNoopSigner,
  getBase64Decoder,
  isSignerRole,
  isWritableRole,
  type AccountMeta,
  type Address,
  type Instruction,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
} from "@solana-program/token";
import type { TransferInstructionBuilder } from "../../application/ports.js";
import type { PreparedInstruction, TransferPlan } from "../../domain/prepared-transfer.js";

type SplPlan = Extract<TransferPlan, { kind: "spl" }>;

const base64 = getBase64Decoder();

function toPrepared(instruction: Instruction): PreparedInstruction {
  const accounts = (instruction.accounts ?? []) as readonly AccountMeta[];
  return {
    programAddress: instruction.programAddress,
    accounts: accounts.map((account) => ({
      address: account.address,
      signer: isSignerRole(account.role),
      writable: isWritableRole(account.role),
    })),
    data: base64.decode(instruction.data ?? new Uint8Array()),
  };
}

function solInstructions(plan: Extract<TransferPlan, { kind: "sol" }>): Instruction[] {
  return [
    getTransferSolInstruction({
      source: createNoopSigner(address(plan.source)),
      destination: address(plan.destination),
      amount: BigInt(plan.lamports),
    }),
  ];
}

async function ataOf(mint: Address, owner: Address, tokenProgram: Address): Promise<Address> {
  const [pda] = await findAssociatedTokenPda({ mint, owner, tokenProgram });
  return pda;
}

async function splInstructions(plan: SplPlan): Promise<Instruction[]> {
  const mint = address(plan.mint);
  const owner = createNoopSigner(address(plan.source));
  const destination = address(plan.destination);
  const tokenProgram = address(plan.tokenProgram);
  const sourceAta = await ataOf(mint, owner.address, tokenProgram);
  const destinationAta = await ataOf(mint, destination, tokenProgram);
  const create = plan.createDestinationAccount
    ? [
        getCreateAssociatedTokenIdempotentInstruction({
          payer: owner,
          ata: destinationAta,
          owner: destination,
          mint,
          tokenProgram,
        }),
      ]
    : [];
  const transfer = getTransferCheckedInstruction(
    {
      source: sourceAta,
      mint,
      destination: destinationAta,
      authority: owner,
      amount: BigInt(plan.amountRaw),
      decimals: plan.decimals,
    },
    { programAddress: tokenProgram },
  );
  return [...create, transfer];
}

/** Encodes transfer plans into instruction descriptions; no network access. */
export function createInstructionBuilder(): TransferInstructionBuilder {
  return {
    async build(plan) {
      const instructions =
        plan.kind === "sol" ? solInstructions(plan) : await splInstructions(plan);
      return instructions.map(toPrepared);
    },
  };
}
