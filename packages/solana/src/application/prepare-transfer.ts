import {
  type PreparedTransfer,
  planTransfer,
  type TransferIntent,
  validateIntent,
} from "../domain/prepared-transfer.js";
import type { SolanaDataPort, TransferInstructionBuilder } from "./ports.js";

/**
 * Validates the intent, asks the API whether the transfer is ready, plans it and
 * delegates instruction encoding to the builder. Nothing is signed or broadcast.
 */
export async function prepareTransfer(
  data: SolanaDataPort,
  builder: TransferInstructionBuilder,
  intent: TransferIntent,
): Promise<PreparedTransfer> {
  validateIntent(intent);
  const { source, destination, mint, amount } = intent;
  const readiness = (await data.transferReadiness({ source, destination, mint, amount })).data;
  const plan = planTransfer(intent, readiness);
  const instructions = await builder.build(plan);
  return {
    transaction: { feePayer: intent.source, recentBlockhash: null, instructions },
    readiness,
    ataCreation: {
      required: readiness.requires_ata_creation,
      lamports: readiness.ata_creation_lamports,
    },
    meta: readiness.meta,
  };
}
