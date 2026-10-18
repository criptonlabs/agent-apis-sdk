import { ApiClient, type KitConfig, type PaymentOption } from "@criptonlabs/agent-apis-core";
import { dexQuote } from "./application/dex-quote.js";
import { preparePayment } from "./application/prepare-payment.js";
import type { XrplDataPort } from "./application/ports.js";
import type { DexQuote, DexQuoteInput } from "./domain/dex-quote.js";
import type { PaymentIntent, PreparedPayment } from "./domain/prepared-payment.js";
import type { XrplNetworkName } from "./domain/rlusd-option.js";
import { XRPL_DESCRIPTOR } from "./infrastructure/descriptor.js";
import { createXrplDataClient } from "./infrastructure/http/xrpl-client.js";
import { createXrplPayer } from "./infrastructure/x402/xrpl-payer.js";

export interface XrplKitConfig extends Omit<KitConfig, "payment"> {
  pathsTimeoutMs?: number;
  payment?: {
    seed: string;
    network?: XrplNetworkName;
    wsUrl?: string;
    maxPerCall: string;
    sessionBudget?: string;
  };
}

export interface XrplAgentKit {
  data: XrplDataPort;
  priceOf(resource: string): Promise<{ paymentsMode: string | null; options: PaymentOption[] }>;
  preparePayment(intent: PaymentIntent): Promise<PreparedPayment>;
  dexQuote(input: DexQuoteInput): Promise<DexQuote>;
  spent(): string;
}

export function createXrplAgentKit(config: XrplKitConfig = {}): XrplAgentKit {
  const { payment, pathsTimeoutMs, ...rest } = config;
  const kitConfig: KitConfig = { ...rest };
  if (payment !== undefined) {
    const payer = createXrplPayer({
      seed: payment.seed,
      ...(payment.network !== undefined ? { network: payment.network } : {}),
      ...(payment.wsUrl !== undefined ? { wsUrl: payment.wsUrl } : {}),
    });
    kitConfig.payment = {
      payer,
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
  };
}

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
