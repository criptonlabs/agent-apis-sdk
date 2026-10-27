import {
  assertDecimal,
  CriptonRefusalError,
  CriptonResponseError,
  CriptonValidationError,
  maxDecimals,
  mulPow10,
} from "@criptonlabs/agent-apis-core";
import type { SolanaMeta, TransferReadinessResponse } from "./api-types.js";
import { assertMint, assertSolanaAddress } from "./validation.js";

export interface TransferIntent {
  source: string;
  destination: string;
  /** A base58 mint address or `SOL`. */
  mint: string;
  /** Decimal string in the asset's units. */
  amount: string;
}

export interface PreparedAccount {
  address: string;
  signer: boolean;
  writable: boolean;
}

export interface PreparedInstruction {
  programAddress: string;
  accounts: PreparedAccount[];
  /** Instruction data, base64. */
  data: string;
}

export type TransferPlan =
  | { kind: "sol"; source: string; destination: string; lamports: string }
  | {
      kind: "spl";
      source: string;
      destination: string;
      mint: string;
      tokenProgram: string;
      amountRaw: string;
      decimals: number;
      createDestinationAccount: boolean;
    };

export interface PreparedTransfer {
  transaction: { feePayer: string; recentBlockhash: null; instructions: PreparedInstruction[] };
  readiness: TransferReadinessResponse;
  ataCreation: { required: boolean; lamports: string | null };
  meta: SolanaMeta;
}

export class TransferNotReadyError extends CriptonRefusalError {
  readonly code = "transfer-not-ready";
  constructor(
    readonly reasons: readonly string[],
    readonly warnings: readonly string[],
  ) {
    super("Transfer not ready");
  }
}

const SOL_DECIMALS = 9;
const ALLOWED_TOKEN_PROGRAMS: readonly string[] = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];

export function validateIntent(intent: TransferIntent): void {
  assertSolanaAddress("source", intent.source);
  assertSolanaAddress("destination", intent.destination);
  assertMint("mint", intent.mint);
  assertDecimal("amount", intent.amount);
  if (intent.mint === "SOL" && maxDecimals(intent.amount) > SOL_DECIMALS) {
    throw new CriptonValidationError(
      "amount",
      `amount for SOL has at most ${SOL_DECIMALS} decimals`,
    );
  }
}

function echoesIntent(intent: TransferIntent, readiness: TransferReadinessResponse): boolean {
  return (
    readiness.source === intent.source &&
    readiness.destination === intent.destination &&
    readiness.mint === intent.mint
  );
}

function assetMatches(intent: TransferIntent, readiness: TransferReadinessResponse): boolean {
  if (intent.mint === "SOL") {
    return readiness.decimals === SOL_DECIMALS;
  }
  const program = readiness.token_program;
  return program === null || ALLOWED_TOKEN_PROGRAMS.includes(program);
}

function amountMatches(intent: TransferIntent, readiness: TransferReadinessResponse): boolean {
  try {
    return mulPow10(intent.amount, readiness.decimals) === readiness.amount_raw;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

export function verifyReadiness(
  intent: TransferIntent,
  readiness: TransferReadinessResponse,
): void {
  const matches =
    echoesIntent(intent, readiness) &&
    assetMatches(intent, readiness) &&
    amountMatches(intent, readiness);
  if (!matches) {
    throw new CriptonResponseError("Transfer readiness does not match the intent");
  }
}

export function planTransfer(
  intent: TransferIntent,
  readiness: TransferReadinessResponse,
): TransferPlan {
  verifyReadiness(intent, readiness);
  if (!readiness.ready) {
    throw new TransferNotReadyError(readiness.blockers, readiness.warnings);
  }
  const { source, destination, mint } = intent;
  if (mint === "SOL") {
    return { kind: "sol", source, destination, lamports: readiness.amount_raw };
  }
  if (readiness.token_program === null) {
    throw new CriptonValidationError("mint", "mint has no token program in the readiness report");
  }
  return {
    kind: "spl",
    source,
    destination,
    mint,
    tokenProgram: readiness.token_program,
    amountRaw: readiness.amount_raw,
    decimals: readiness.decimals,
    createDestinationAccount: readiness.requires_ata_creation,
  };
}
