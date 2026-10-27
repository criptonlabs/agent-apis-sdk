// Zod response schemas per OpenAPI path (snapshot 0.19.2), typed against the generated api-types.
import { z } from "zod";
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
} from "../../domain/api-types.js";

export const XRPL_ROUTE_PATHS = [
  "/v1/xrpl/fee",
  "/v1/xrpl/health",
  "/v1/xrpl/network/health",
  "/v1/xrpl/health/history",
  "/v1/xrpl/ledger/latest",
  "/v1/xrpl/orderbook",
  "/v1/xrpl/slippage",
  "/v1/xrpl/amm/{a}/{b}",
  "/v1/xrpl/account/{address}/summary",
  "/v1/xrpl/account/{address}/lines",
  "/v1/xrpl/account/{address}/transactions",
  "/v1/xrpl/token/{asset}",
  "/v1/xrpl/payment-readiness",
  "/v1/xrpl/paths",
] as const;

export type XrplRoutePath = (typeof XRPL_ROUTE_PATHS)[number];

const str = z.string();
const strNull = z.string().nullable();
const int = z.number().int();

const meta = z.object({
  ledger_index: int,
  as_of: str,
  age_seconds: z.number(),
  cache: z.enum(["hit", "miss", "stale"]),
  stale: z.boolean(),
});

const nodeStatus = z.enum(["ok", "degraded", "down", "unknown"]);
const node = z.object({
  member: str,
  state: z.enum(["up", "down"]),
  latency_ms: z.number().nullable(),
  ledger_index: int.nullable(),
  ledger_age_s: z.number().nullable(),
  load_factor: z.number().nullable(),
  error: strNull,
  sampled_at: str,
});

const feeSchema = z.object({
  fee: z.object({ economy: str, standard: str, priority: str }),
  congestion: z.object({
    score: z.number(),
    band: z.enum(["low", "medium", "high"]),
    load_factor_assumed: z.boolean(),
  }),
  base_fee: str,
  median_fee: str,
  minimum_fee: str,
  open_ledger_fee: str,
  current_queue_size: str,
  max_queue_size: str,
  meta,
}) satisfies z.ZodType<FeeResponse>;

const healthSchema = z.object({
  status: nodeStatus,
  nodes: z.array(node),
  ledger_index: int,
  last_probe_at: strNull,
  meta,
}) satisfies z.ZodType<HealthResponse>;

const networkHealthSchema = z.object({
  status: nodeStatus,
  nodes: z.array(node),
  ledger_index: int,
  last_probe_at: strNull,
  meta,
}) satisfies z.ZodType<NetworkHealthResponse>;

const healthHistorySchema = z.object({
  window: z.enum(["1h", "24h", "7d"]),
  bucket_seconds: int,
  buckets: z.array(
    z.object({
      start: str,
      members: z.array(
        z.object({
          member: str,
          samples: int,
          up: int,
          uptime_pct: z.number(),
          avg_latency_ms: z.number().nullable(),
        }),
      ),
    }),
  ),
  meta,
}) satisfies z.ZodType<HealthHistoryResponse>;

const ledgerLatestSchema = z.object({
  ledger_index: int,
  close_time: strNull,
  ledger_hash: strNull,
  meta,
}) satisfies z.ZodType<LedgerLatestResponse>;

const offer = z.object({ gets: str, pays: str, price: str });
const orderbookSchema = z.object({
  base: str,
  quote: str,
  depth: int,
  asks: z.array(offer),
  bids: z.array(offer),
  meta,
}) satisfies z.ZodType<OrderbookResponse>;

const venueQuote = {
  avg_price: strNull,
  cost: strNull,
  slippage_pct: strNull,
  insufficient_liquidity: z.boolean(),
  avg_price_after_fees: strNull,
};
const slippageSchema = z.object({
  base: str,
  quote: str,
  side: z.enum(["buy"]),
  depth: int,
  amount: str,
  filled: str,
  partial: z.boolean(),
  insufficient_liquidity: z.boolean(),
  best_price: strNull,
  avg_price: strNull,
  slippage_pct: strNull,
  transfer_fee_applied: z.boolean(),
  transfer_fee: strNull,
  avg_price_after_fees: strNull,
  venues: z.object({
    best: z.enum(["clob", "amm"]).nullable(),
    amm_status: z.enum(["ok", "stale", "no_pool", "unavailable"]),
    clob: z.object(venueQuote),
    amm: z.object({ ...venueQuote, spot_price: str, trading_fee: str }).nullable(),
  }),
  meta,
}) satisfies z.ZodType<SlippageResponse>;

const ammSchema = z.object({
  asset_a: str,
  asset_b: str,
  reserve_a: str,
  reserve_b: str,
  trading_fee: str,
  meta,
}) satisfies z.ZodType<AmmResponse>;

const accountSummarySchema = z.object({
  address: str,
  balance_xrp: str,
  sequence: int,
  owner_count: int,
  transfer_rate: z.number(),
  trust_lines: z.array(z.object({ currency: str, issuer: str, balance: str, limit: str })),
  lines_truncated: z.boolean(),
  meta,
}) satisfies z.ZodType<AccountSummaryResponse>;

const accountLinesSchema = z.object({
  address: str,
  limit: int,
  peer: strNull,
  lines: z.array(
    z.object({
      peer: str,
      currency: str,
      currency_ascii: z.exactOptional(strNull),
      balance: str,
      limit: str,
      peer_limit: str,
      no_ripple: z.boolean(),
      no_ripple_peer: z.boolean(),
      freeze: z.boolean(),
      freeze_peer: z.boolean(),
      authorized: z.boolean(),
      peer_authorized: z.boolean(),
    }),
  ),
  marker: strNull,
  meta,
}) satisfies z.ZodType<AccountLinesResponse>;

const accountTransactionsSchema = z.object({
  address: str,
  limit: int,
  transactions: z.array(
    z.object({
      hash: str,
      ledger_index: int,
      close_time: str,
      type: str,
      result: str,
      counterparty: strNull,
      delivered: z
        .object({ asset: str, value: str, currency_ascii: z.exactOptional(strNull) })
        .nullable(),
    }),
  ),
  marker: strNull,
  meta,
}) satisfies z.ZodType<AccountTransactionsResponse>;

const tokenSchema = z.object({
  issuer: str,
  currency: str,
  currency_ascii: z.exactOptional(strNull),
  global_freeze: z.boolean(),
  no_freeze: z.boolean(),
  require_auth: z.boolean(),
  default_ripple: z.boolean(),
  domain: strNull,
  transfer_rate: z.number(),
  transfer_fee_pct: str,
  obligations: strNull,
  obligations_status: z.enum(["ok", "unavailable"]),
  meta,
}) satisfies z.ZodType<TokenResponse>;

const readinessSchema = z.object({
  verdict: z.enum(["ready", "not_ready", "unknown"]),
  reasons: z.array(
    z.enum([
      "source_not_found",
      "insufficient_xrp_balance",
      "source_line_missing",
      "insufficient_token_balance",
      "source_line_frozen",
      "destination_not_found",
      "amount_below_destination_reserve",
      "destination_tag_required",
      "deposit_not_authorized",
      "destination_line_missing",
      "destination_line_limit_exceeded",
      "destination_line_frozen",
      "issuer_not_found",
      "issuer_global_freeze",
    ]),
  ),
  warnings: z.array(
    z.enum(["destination_will_be_created", "transfer_fee", "high_fee", "network_degraded"]),
  ),
  checks_failed: z.array(
    z.enum([
      "source_account",
      "destination_account",
      "deposit_authorized",
      "source_line",
      "destination_line",
      "issuer",
      "fee",
      "network_health",
    ]),
  ),
  spendable_xrp: strNull,
  transfer_fee_pct: strNull,
  source: str,
  destination: str,
  asset: str,
  amount: strNull,
  destination_tag: int.nullable(),
  meta,
}) satisfies z.ZodType<ReadinessResponse>;

const pathsSchema = z.object({
  alternatives: z.array(
    z.object({
      source_amount: z.object({ asset: str, value: str, currency_ascii: z.exactOptional(strNull) }),
      paths_count: int,
      paths: z.array(
        z.array(
          z.object({
            account: z.exactOptional(str),
            currency: z.exactOptional(str),
            currency_ascii: z.exactOptional(strNull),
            issuer: z.exactOptional(str),
          }),
        ),
      ),
    }),
  ),
  paths_may_be_non_optimal: z.literal(true).meta({ enum: [true] }),
  warnings: z.array(z.enum(["destination_not_found"])),
  meta,
}) satisfies z.ZodType<PathsResponse>;

/** Response schema of each XRPL route, keyed by its OpenAPI path. */
export const RESPONSE_SCHEMAS = {
  "/v1/xrpl/fee": feeSchema,
  "/v1/xrpl/health": healthSchema,
  "/v1/xrpl/network/health": networkHealthSchema,
  "/v1/xrpl/health/history": healthHistorySchema,
  "/v1/xrpl/ledger/latest": ledgerLatestSchema,
  "/v1/xrpl/orderbook": orderbookSchema,
  "/v1/xrpl/slippage": slippageSchema,
  "/v1/xrpl/amm/{a}/{b}": ammSchema,
  "/v1/xrpl/account/{address}/summary": accountSummarySchema,
  "/v1/xrpl/account/{address}/lines": accountLinesSchema,
  "/v1/xrpl/account/{address}/transactions": accountTransactionsSchema,
  "/v1/xrpl/token/{asset}": tokenSchema,
  "/v1/xrpl/payment-readiness": readinessSchema,
  "/v1/xrpl/paths": pathsSchema,
} satisfies Record<XrplRoutePath, z.ZodType>;
