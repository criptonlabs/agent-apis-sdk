import { ApiClient, type KitConfig, type PaymentOption } from "@criptonlabs/agent-apis-core";
import type { SolanaDataPort } from "./application/ports.js";
import { prepareTransfer } from "./application/prepare-transfer.js";
import type { PreparedTransfer, TransferIntent } from "./domain/prepared-transfer.js";
import type { SolanaNetworkName, SolanaPayAsset } from "./domain/solana-assets.js";
import { SOLANA_DESCRIPTOR } from "./infrastructure/descriptor.js";
import { createSolanaDataClient } from "./infrastructure/http/solana-client.js";
import { createInstructionBuilder } from "./infrastructure/solana/instruction-builder.js";
import { createSolanaPayer } from "./infrastructure/x402/solana-payer.js";

export interface SolanaKitConfig extends Omit<KitConfig, "payment"> {
  payment?: {
    key: string;
    network?: SolanaNetworkName;
    asset?: SolanaPayAsset;
    rpcUrl?: string;
    maxPerCall: string;
    sessionBudget?: string;
  };
}

export interface SolanaAgentKit {
  data: SolanaDataPort;
  priceOf(resource: string): Promise<{ paymentsMode: string | null; options: PaymentOption[] }>;
  prepareTransfer(intent: TransferIntent): Promise<PreparedTransfer>;
  spent(): string;
}

export function createSolanaAgentKit(config: SolanaKitConfig = {}): SolanaAgentKit {
  const { payment, ...rest } = config;
  const kitConfig: KitConfig = { ...rest };
  if (payment !== undefined) {
    const payer = createSolanaPayer({
      key: payment.key,
      ...(payment.network !== undefined ? { network: payment.network } : {}),
      ...(payment.asset !== undefined ? { asset: payment.asset } : {}),
      ...(payment.rpcUrl !== undefined ? { rpcUrl: payment.rpcUrl } : {}),
    });
    kitConfig.payment = {
      payer,
      maxPerCall: payment.maxPerCall,
      ...(payment.sessionBudget !== undefined ? { sessionBudget: payment.sessionBudget } : {}),
    };
  }
  const api = new ApiClient(SOLANA_DESCRIPTOR, kitConfig);
  const data = createSolanaDataClient(api);
  return {
    data,
    priceOf: (resource) => api.priceOf(resource),
    prepareTransfer: (intent) => prepareTransfer(data, createInstructionBuilder(), intent),
    spent: () => api.spent(),
  };
}

export type { SolanaDataPort, TransferInstructionBuilder } from "./application/ports.js";
export type * from "./domain/api-types.js";
export type {
  PreparedAccount,
  PreparedInstruction,
  PreparedTransfer,
  TransferIntent,
  TransferPlan,
} from "./domain/prepared-transfer.js";
export { TransferNotReadyError } from "./domain/prepared-transfer.js";
export type { SolanaNetworkName, SolanaPayAsset } from "./domain/solana-assets.js";
export { PAY_ASSET_MINTS, SOLANA_CAIP2 } from "./domain/solana-assets.js";
export { selectSolanaOption } from "./domain/solana-option.js";
export { createSolanaPayer } from "./infrastructure/x402/solana-payer.js";
export type { SolanaPayerConfig } from "./infrastructure/x402/solana-payer.js";
