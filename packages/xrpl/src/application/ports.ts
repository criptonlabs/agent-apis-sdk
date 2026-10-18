import type { KitResponse } from "@criptonlabs/agent-apis-core";
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

export type Depth = 10 | 50 | 100 | 200;

export interface XrplDataPort {
  fee(): Promise<KitResponse<FeeResponse>>;
  health(): Promise<KitResponse<HealthResponse>>;
  networkHealth(): Promise<KitResponse<NetworkHealthResponse>>;
  healthHistory(q?: { window?: "1h" | "24h" | "7d" }): Promise<KitResponse<HealthHistoryResponse>>;
  latestLedger(): Promise<KitResponse<LedgerLatestResponse>>;
  orderbook(q: {
    base: string;
    quote: string;
    depth?: Depth;
  }): Promise<KitResponse<OrderbookResponse>>;
  slippage(q: {
    base: string;
    quote: string;
    amount: string;
    depth?: Depth;
  }): Promise<KitResponse<SlippageResponse>>;
  amm(a: string, b: string): Promise<KitResponse<AmmResponse>>;
  accountSummary(address: string): Promise<KitResponse<AccountSummaryResponse>>;
  accountLines(
    address: string,
    q?: { limit?: number; peer?: string; marker?: string },
  ): Promise<KitResponse<AccountLinesResponse>>;
  accountTransactions(
    address: string,
    q?: { limit?: number; marker?: string },
  ): Promise<KitResponse<AccountTransactionsResponse>>;
  token(asset: string): Promise<KitResponse<TokenResponse>>;
  paymentReadiness(q: {
    source: string;
    destination: string;
    asset?: string;
    amount?: string;
    destinationTag?: number;
  }): Promise<KitResponse<ReadinessResponse>>;
  paths(q: {
    source: string;
    destination: string;
    asset: string;
    amount: string;
    sendMaxAsset?: string;
    sendMax?: string;
    sourceAssets?: string[];
  }): Promise<KitResponse<PathsResponse>>;
}
