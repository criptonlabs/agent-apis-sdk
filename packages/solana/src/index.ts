import {
  ApiClient,
  CriptonValidationError,
  type CreditsConfig,
  type KitConfig,
  type PriceIndex,
  type PriceLookupResult,
  type RotationResult,
  type CreditsApi,
} from "@criptonlabs/agent-apis-core";
import type { SolanaDataPort } from "./application/ports.js";
import { prepareTransfer } from "./application/prepare-transfer.js";
import type { PreparedTransfer, TransferIntent } from "./domain/prepared-transfer.js";
import type { SolanaNetworkName, SolanaPayAsset } from "./domain/solana-assets.js";
import { SOLANA_DESCRIPTOR } from "./infrastructure/descriptor.js";
import { createSolanaDataClient } from "./infrastructure/http/solana-client.js";
import { createSolanaSiwxSigner } from "./infrastructure/siwx/solana-siwx-signer.js";
import { createInstructionBuilder } from "./infrastructure/solana/instruction-builder.js";
import { createSolanaPayer } from "./infrastructure/x402/solana-payer.js";

export interface SolanaKitConfig extends Omit<KitConfig, "wallet" | "payment" | "credits"> {
  wallet?: {
    key: string;
    network?: SolanaNetworkName;
    asset?: SolanaPayAsset;
    rpcUrl?: string;
  };
  payment?: { maxPerCall: string; sessionBudget?: string };
  credits?: { token?: string; siwx?: boolean; topupBudget?: string };
}

export interface SolanaCreditsApi extends CreditsApi {
  rotateToken(): Promise<RotationResult>;
  siwxEnabled(): boolean;
  /**
   * Keeps a bought token in the kit's memory when the tier is pro and none is configured (the
   * opt-in purchase tool).
   */
  adoptToken(token: string): void;
  /** Whether the kit has tier pro, a wallet and `credits.topupBudget` (the purchase tool's preconditions). */
  topupReady(): boolean;
}

export interface SolanaAgentKit {
  data: SolanaDataPort;
  priceOf(resource: string): Promise<PriceLookupResult>;
  prepareTransfer(intent: TransferIntent): Promise<PreparedTransfer>;
  spent(): string;
  credits: SolanaCreditsApi;
  prices(): Promise<PriceIndex>;
}

/**
 * The wallet's SIWX signer, passed whenever a wallet exists (rotation), and SIWX spending only with
 * `credits.siwx` (design D4, D9); `credits.siwx` without a wallet is refused at creation.
 */
function siwxCredits(
  wallet: SolanaKitConfig["wallet"],
  credits: SolanaKitConfig["credits"],
): Pick<CreditsConfig, "siwxSigner" | "siwxSpend"> {
  const siwxSpend = credits?.siwx === true;
  if (wallet === undefined && siwxSpend) {
    throw new CriptonValidationError("wallet", "SIWX spending needs a wallet");
  }
  if (wallet === undefined) return {};
  const siwxSigner = createSolanaSiwxSigner({
    key: wallet.key,
    ...(wallet.network !== undefined ? { network: wallet.network } : {}),
  });
  return { siwxSigner, siwxSpend };
}

/**
 * The kit's credit settings and the wallet's SIWX signer as the core's `credits` configuration;
 * nothing when neither is set.
 */
function coreCredits(
  credits: SolanaKitConfig["credits"],
  wallet: SolanaKitConfig["wallet"],
): Pick<KitConfig, "credits"> {
  const siwx = siwxCredits(wallet, credits);
  if (credits === undefined && wallet === undefined) return {};
  return {
    credits: {
      ...(credits?.token !== undefined ? { token: credits.token } : {}),
      ...(credits?.topupBudget !== undefined ? { topupBudget: credits.topupBudget } : {}),
      ...siwx,
    },
  };
}

export function createSolanaAgentKit(config: SolanaKitConfig = {}): SolanaAgentKit {
  const { payment, wallet, credits, ...rest } = config;
  const kitConfig: KitConfig = { ...rest, ...coreCredits(credits, wallet) };
  if (wallet !== undefined) {
    kitConfig.wallet = createSolanaPayer({
      key: wallet.key,
      ...(wallet.network !== undefined ? { network: wallet.network } : {}),
      ...(wallet.asset !== undefined ? { asset: wallet.asset } : {}),
      ...(wallet.rpcUrl !== undefined ? { rpcUrl: wallet.rpcUrl } : {}),
    });
  }
  if (payment !== undefined) {
    kitConfig.payment = {
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
    credits: {
      topup: (request) => api.topup(request),
      lastKnownBalance: () => api.lastKnownBalance(),
      topupSpent: () => api.topupSpent(),
      hasToken: () => api.hasCreditToken(),
      rotateToken: () => api.rotateToken(),
      siwxEnabled: () => api.siwxEnabled(),
      adoptToken: (token) => api.adoptToken(token),
      topupReady: () =>
        config.tier === "pro" && wallet !== undefined && credits?.topupBudget !== undefined,
    },
    prices: () => api.priceIndex(),
  };
}

export type { CreditsApi } from "@criptonlabs/agent-apis-core";
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
