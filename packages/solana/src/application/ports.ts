import type { KitResponse } from "@criptonlabs/agent-apis-core";
import type {
  SlotLatestResponse,
  SolanaHealthHistoryResponse,
  SolanaHealthResponse,
  SolanaTokenResponse,
  TransferReadinessResponse,
} from "../domain/api-types.js";
import type { PreparedInstruction, TransferPlan } from "../domain/prepared-transfer.js";

export interface SolanaDataPort {
  latestSlot(): Promise<KitResponse<SlotLatestResponse>>;
  health(): Promise<KitResponse<SolanaHealthResponse>>;
  healthHistory(q?: {
    window?: "1h" | "24h" | "7d";
  }): Promise<KitResponse<SolanaHealthHistoryResponse>>;
  token(mint: string): Promise<KitResponse<SolanaTokenResponse>>;
  transferReadiness(q: {
    source: string;
    destination: string;
    mint: string;
    amount: string;
  }): Promise<KitResponse<TransferReadinessResponse>>;
}

/** Turns a transfer plan into instruction descriptions (encoding lives in infrastructure). */
export interface TransferInstructionBuilder {
  build(plan: TransferPlan): Promise<PreparedInstruction[]>;
}
