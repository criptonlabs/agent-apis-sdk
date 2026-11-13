import type { CallOptions, KitResponse } from "@criptonlabs/agent-apis-core";
import type {
  SlotLatestResponse,
  SolanaHealthHistoryResponse,
  SolanaHealthResponse,
  SolanaTokenResponse,
  TransferReadinessResponse,
} from "../domain/api-types.js";
import type { PreparedInstruction, TransferPlan } from "../domain/prepared-transfer.js";

/** Every data method takes the call options last (design D11). */
export interface SolanaDataPort {
  latestSlot(options?: CallOptions): Promise<KitResponse<SlotLatestResponse>>;
  health(options?: CallOptions): Promise<KitResponse<SolanaHealthResponse>>;
  healthHistory(
    q?: {
      window?: "1h" | "24h" | "7d";
    },
    options?: CallOptions,
  ): Promise<KitResponse<SolanaHealthHistoryResponse>>;
  token(mint: string, options?: CallOptions): Promise<KitResponse<SolanaTokenResponse>>;
  transferReadiness(
    q: {
      source: string;
      destination: string;
      mint: string;
      amount: string;
    },
    options?: CallOptions,
  ): Promise<KitResponse<TransferReadinessResponse>>;
}

/** Turns a transfer plan into instruction descriptions (encoding lives in infrastructure). */
export interface TransferInstructionBuilder {
  build(plan: TransferPlan): Promise<PreparedInstruction[]>;
}
