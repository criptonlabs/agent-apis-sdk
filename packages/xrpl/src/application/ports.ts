import type { CallOptions, KitResponse } from "@criptonlabs/agent-apis-core";
import type {
  AccountLinesResponse,
  AccountSummaryResponse,
  AccountTransactionsResponse,
  AmmResponse,
  FeeResponse,
  HealthHistoryResponse,
  HealthResponse,
  LedgerLatestResponse,
  NetworkHealthResponse,
  OrderbookResponse,
  PathsResponse,
  ReadinessResponse,
  SlippageResponse,
  TokenResponse,
} from "../domain/api-types.js";

export type Depth = number;

/** Every data method takes the call options last (design D11). */
export interface XrplDataPort {
  fee(options?: CallOptions): Promise<KitResponse<FeeResponse>>;
  health(options?: CallOptions): Promise<KitResponse<HealthResponse>>;
  networkHealth(options?: CallOptions): Promise<KitResponse<NetworkHealthResponse>>;
  healthHistory(
    q?: { window?: "1h" | "24h" | "7d" },
    options?: CallOptions,
  ): Promise<KitResponse<HealthHistoryResponse>>;
  latestLedger(options?: CallOptions): Promise<KitResponse<LedgerLatestResponse>>;
  orderbook(
    q: {
      base: string;
      quote: string;
      depth?: Depth;
      domain?: string;
    },
    options?: CallOptions,
  ): Promise<KitResponse<OrderbookResponse>>;
  slippage(
    q: {
      base: string;
      quote: string;
      amount: string;
      depth?: Depth;
      side?: "buy" | "sell";
      domain?: string;
    },
    options?: CallOptions,
  ): Promise<KitResponse<SlippageResponse>>;
  amm(a: string, b: string, options?: CallOptions): Promise<KitResponse<AmmResponse>>;
  accountSummary(
    address: string,
    options?: CallOptions,
  ): Promise<KitResponse<AccountSummaryResponse>>;
  accountLines(
    address: string,
    q?: { limit?: number; peer?: string; marker?: string },
    options?: CallOptions,
  ): Promise<KitResponse<AccountLinesResponse>>;
  accountTransactions(
    address: string,
    q?: { limit?: number; marker?: string },
    options?: CallOptions,
  ): Promise<KitResponse<AccountTransactionsResponse>>;
  token(asset: string, options?: CallOptions): Promise<KitResponse<TokenResponse>>;
  paymentReadiness(
    q: {
      source: string;
      destination: string;
      asset?: string;
      amount?: string;
      destinationTag?: number;
      credentials?: string[];
    },
    options?: CallOptions,
  ): Promise<KitResponse<ReadinessResponse>>;
  paths(
    q: {
      source: string;
      destination: string;
      asset: string;
      amount: string;
      sendMaxAsset?: string;
      sendMax?: string;
      sourceAssets?: string[];
    },
    options?: CallOptions,
  ): Promise<KitResponse<PathsResponse>>;
}
