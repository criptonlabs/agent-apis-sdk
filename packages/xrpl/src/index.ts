import {
  ApiClient,
  type CreditsApi,
  type KitConfig,
  type PriceIndex,
  type PriceLookupResult,
} from "@criptonlabs/agent-apis-core";
import { dexQuote } from "./application/dex-quote.js";
import { preparePayment } from "./application/prepare-payment.js";
import type { XrplDataPort } from "./application/ports.js";
import type { DexQuote, DexQuoteInput } from "./domain/dex-quote.js";
import type { PaymentIntent, PreparedPayment } from "./domain/prepared-payment.js";
import type { XrplNetworkName } from "./domain/rlusd-option.js";
import { XRPL_DESCRIPTOR } from "./infrastructure/descriptor.js";
import { createXrplDataClient } from "./infrastructure/http/xrpl-client.js";
import { createXrplPayer } from "./infrastructure/x402/xrpl-payer.js";

export interface XrplKitConfig extends Omit<KitConfig, "wallet" | "payment" | "credits"> {
  pathsTimeoutMs?: number;
  wallet?: { seed: string; network?: XrplNetworkName; wsUrl?: string };
  payment?: { maxPerCall: string; sessionBudget?: string };
  credits?: { token?: string; topupBudget?: string };
}

export interface XrplAgentKit {
  data: XrplDataPort;
  priceOf(resource: string): Promise<PriceLookupResult>;
  preparePayment(intent: PaymentIntent): Promise<PreparedPayment>;
  dexQuote(input: DexQuoteInput): Promise<DexQuote>;
  spent(): string;
  credits: CreditsApi;
  prices(): Promise<PriceIndex>;
}

/** The kit's credit settings as the core's `credits` configuration; nothing when none is set. */
function coreCredits(credits: XrplKitConfig["credits"]): Pick<KitConfig, "credits"> {
  if (credits === undefined) return {};
  return {
    credits: {
      ...(credits.token !== undefined ? { token: credits.token } : {}),
      ...(credits.topupBudget !== undefined ? { topupBudget: credits.topupBudget } : {}),
    },
  };
}

export function createXrplAgentKit(config: XrplKitConfig = {}): XrplAgentKit {
  const { payment, pathsTimeoutMs, wallet, credits, ...rest } = config;
  const kitConfig: KitConfig = { ...rest, ...coreCredits(credits) };
  if (wallet !== undefined) {
    kitConfig.wallet = createXrplPayer({
      seed: wallet.seed,
      ...(wallet.network !== undefined ? { network: wallet.network } : {}),
      ...(wallet.wsUrl !== undefined ? { wsUrl: wallet.wsUrl } : {}),
    });
  }
  if (payment !== undefined) {
    kitConfig.payment = {
      maxPerCall: payment.maxPerCall,
      ...(payment.sessionBudget !== undefined ? { sessionBudget: payment.sessionBudget } : {}),
    };
  }
  const api = new ApiClient(XRPL_DESCRIPTOR, kitConfig);
  const data = createXrplDataClient(api, { pathsTimeoutMs: pathsTimeoutMs ?? 30000 });
  return {
    data,
    priceOf: (resource) => api.priceOf(resource),
    preparePayment: (intent) => preparePayment(data, intent),
    dexQuote: (input) => dexQuote(data, input),
    spent: () => api.spent(),
    credits: {
      topup: (request) => api.topup(request),
      lastKnownBalance: () => api.lastKnownBalance(),
      topupSpent: () => api.topupSpent(),
      hasToken: () => api.hasCreditToken(),
    },
    prices: () => api.priceIndex(),
  };
}

export type { CreditsApi } from "@criptonlabs/agent-apis-core";
export type { XrplDataPort, Depth } from "./application/ports.js";
export type * from "./domain/api-types.js";
export type { DexQuote, DexQuoteInput } from "./domain/dex-quote.js";
export { SlippageLimitError } from "./domain/dex-quote.js";
export type {
  FeeTier,
  PaymentIntent,
  PreparedPayment,
  TxAmount,
  UnsignedPayment,
} from "./domain/prepared-payment.js";
export { PaymentNotReadyError } from "./domain/prepared-payment.js";
export type { XrplNetworkName } from "./domain/rlusd-option.js";
export { selectRlusdOption } from "./domain/rlusd-option.js";
export { RLUSD_CURRENCY_HEX, RLUSD_ISSUER, XRPL_CAIP2 } from "./domain/rlusd.js";
export { createXrplPayer } from "./infrastructure/x402/xrpl-payer.js";
export type { XrplPayerConfig } from "./infrastructure/x402/xrpl-payer.js";
