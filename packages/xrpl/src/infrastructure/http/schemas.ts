// Zod response schemas per OpenAPI path (snapshot 0.27.0), typed against the generated api-types
// (kit-api-sync-0-27 design D1, D2).
import { codeList } from "@criptonlabs/agent-apis-core";
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
const intNull = int.nullable();
const numNull = z.number().nullable();
const bool = z.boolean();
const boolNull = z.boolean().nullable();
const currencyAscii = z.exactOptional(strNull);

const metaFields = {
  ledger_state: codeList(["validated", "open"]),
  as_of: str,
  age_seconds: int,
  cache: codeList(["hit", "miss", "stale"]),
  stale: bool,
};
const meta = z.object({ ledger_index: int, ...metaFields });
const metaNullableLedger = z.object({ ledger_index: intNull, ...metaFields });

const assetAmount = z.object({
  asset: str,
  value: strNull,
  value_atomic: z.exactOptional(str),
  currency_ascii: currencyAscii,
});

const accountFlags = z.object({
  require_dest_tag: bool,
  deposit_auth: bool,
  disallow_xrp: bool,
  disallow_incoming: z.object({
    check: bool,
    nftoken_offer: bool,
    paychan: bool,
    trustline: bool,
  }),
  require_auth: bool,
  default_ripple: bool,
  global_freeze: bool,
  no_freeze: bool,
  allow_clawback: bool,
  disable_master: bool,
  allow_trustline_locking: bool,
});

const lineRole = codeList(["issuer", "holder"]);

const feeSchema = z.object({
  fee: z.object({ economy_drops: str, standard_drops: str, priority_drops: str }),
  congestion: z.object({
    score: int,
    band: codeList(["low", "medium", "high"]),
    load_factor_assumed: bool,
    load_factor_multiplier: strNull,
  }),
  queue_full: bool,
  escalation_multiplier: str,
  base_fee_drops: str,
  median_fee_drops: str,
  minimum_fee_drops: str,
  open_ledger_fee_drops: str,
  current_queue_size: int,
  max_queue_size: intNull,
  current_ledger_size: int,
  expected_ledger_size: int,
  ledger_fill_ratio: strNull,
  meta,
}) satisfies z.ZodType<FeeResponse>;

const node = z.object({
  member: str,
  state: codeList(["up", "down"]),
  latency_ms: numNull,
  ledger_index: intNull,
  ledger_age_seconds: numNull,
  load_factor_multiplier: strNull,
  server_state: codeList(["disconnected", "connected", "syncing", "tracking", "full"]).nullable(),
  complete_ledgers: z
    .array(z.object({ first_ledger_index: int, last_ledger_index: int }))
    .nullable(),
  amendment_blocked: boolNull,
  error: strNull,
  sampled_at: str,
});
const healthFields = {
  status: codeList(["ok", "degraded", "down", "unknown"]),
  nodes: z.array(node),
  median_latency_ms: numNull,
  ledger_index: intNull,
  last_probe_at: strNull,
  meta: metaNullableLedger,
};

const healthSchema = z.object(healthFields) satisfies z.ZodType<HealthResponse>;

const networkHealthSchema = z.object(healthFields) satisfies z.ZodType<NetworkHealthResponse>;

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
          uptime_pct: str,
          avg_latency_ms: numNull,
        }),
      ),
    }),
  ),
  nodes: z.array(z.object({ member: str, uptime_pct: str, median_latency_ms: numNull })),
  meta: metaNullableLedger,
}) satisfies z.ZodType<HealthHistoryResponse>;

const ledgerLatestSchema = z.object({
  ledger_index: int,
  close_time: strNull,
  ledger_hash: strNull,
  close_age_seconds: intNull,
  meta,
}) satisfies z.ZodType<LedgerLatestResponse>;

const bookLevel = z.object({ gets: str, pays: str, price: str, owner: str, expires_at: strNull });
const orderbookSchema = z.object({
  base: str,
  base_currency_ascii: currencyAscii,
  quote: str,
  quote_currency_ascii: currencyAscii,
  domain: strNull,
  depth: int,
  depth_effective: int,
  asks_truncated: bool,
  bids_truncated: bool,
  best_bid: strNull,
  best_ask: strNull,
  mid: strNull,
  spread_price: strNull,
  spread_bps: strNull,
  crossed: boolNull,
  funded_total: z.object({ ask_depth: str, bid_depth: str }),
  depth_bands: z
    .array(z.object({ half_width_bps: str, ask_depth: str, bid_depth: str }))
    .nullable(),
  asks: z.array(bookLevel),
  bids: z.array(bookLevel),
  meta,
}) satisfies z.ZodType<OrderbookResponse>;

const venueQuote = {
  avg_price: strNull,
  cost: strNull,
  slippage_pct: strNull,
  insufficient_liquidity: bool,
  avg_price_after_fees: strNull,
};
const slippageSchema = z.object({
  base: str,
  base_currency_ascii: currencyAscii,
  quote: str,
  quote_currency_ascii: currencyAscii,
  domain: strNull,
  side: codeList(["buy", "sell"]),
  depth: int,
  depth_effective: int,
  amount: str,
  filled: str,
  partial: bool,
  insufficient_liquidity: bool,
  book_truncated: bool,
  best_price: strNull,
  worst_price: strNull,
  avg_price: strNull,
  slippage_pct: strNull,
  transfer_fee_applied: bool,
  transfer_fee_pct: strNull,
  transfer_fee_issuer: strNull,
  avg_price_after_fees: strNull,
  venues: z.object({
    best: codeList(["clob", "amm"]).nullable(),
    amm_status: codeList(["ok", "stale", "no_pool", "frozen", "unavailable"]),
    clob: z.object(venueQuote),
    amm: z
      .object({ ...venueQuote, spot_price: str, spot_price_with_fee: str, trading_fee_pct: str })
      .nullable(),
    amm_ledger_index: intNull,
    amm_age_seconds: intNull,
  }),
  meta,
}) satisfies z.ZodType<SlippageResponse>;

const ammSchema = z.object({
  asset_a: str,
  asset_a_currency_ascii: currencyAscii,
  asset_b: str,
  asset_b_currency_ascii: currencyAscii,
  reserve_a: str,
  reserve_b: str,
  trading_fee_pct: str,
  spot_a_per_b: strNull,
  spot_a_per_b_with_fee: strNull,
  spot_b_per_a: strNull,
  spot_b_per_a_with_fee: strNull,
  lp_token: z.object({ currency: str, currency_ascii: strNull, issuer: str, supply: str }),
  a_per_lp_token: strNull,
  b_per_lp_token: strNull,
  auction_slot: z
    .object({
      account: str,
      auth_accounts: z.array(str),
      active: bool,
      discounted_fee_pct: str,
      price: str,
      outbid_price: strNull,
      expires_at: str,
      time_interval: intNull,
    })
    .nullable(),
  auction_slot_minimum_price: str,
  a_frozen: bool,
  b_frozen: bool,
  vote_dispersion: z
    .object({ votes: int, min_fee_pct: str, max_fee_pct: str, weighted_sd_pct: strNull })
    .nullable(),
  vote_slots: z.array(z.object({ account: str, trading_fee_pct: str, vote_weight_ratio: str })),
  meta,
}) satisfies z.ZodType<AmmResponse>;

const accountSummarySchema = z.object({
  address: str,
  balance_xrp: str,
  sequence: int,
  owner_count: int,
  ticket_count: int,
  sponsored_owner_count: intNull,
  sponsoring_owner_count: intNull,
  sponsoring_account_count: intNull,
  transfer_fee_pct: str,
  flags: accountFlags,
  regular_key: strNull,
  signer_list_set: bool,
  domain: strNull,
  tick_size: intNull,
  amm_id: strNull,
  vault_id: strNull,
  loan_broker_id: strNull,
  trust_lines: z.array(
    z.object({
      peer: str,
      currency: str,
      currency_ascii: currencyAscii,
      role: lineRole,
      balance: str,
      line_limit: str,
    }),
  ),
  lines_truncated: bool,
  is_issuer: boolNull,
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
      currency_ascii: currencyAscii,
      balance: str,
      line_limit: str,
      peer_line_limit: str,
      no_ripple: bool,
      no_ripple_peer: bool,
      freeze: bool,
      freeze_peer: bool,
      authorized: bool,
      peer_authorized: bool,
      role: lineRole,
      headroom: strNull,
      deep_freeze: bool,
      deep_freeze_peer: bool,
      quality_in_multiplier: str,
      quality_out_multiplier: str,
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
      hash: strNull,
      ledger_index: intNull,
      close_time: strNull,
      type: strNull,
      result: strNull,
      counterparty: strNull,
      delivered: assetAmount.nullable(),
      delivered_unavailable: bool,
      direction: codeList(["out", "in", "other"]),
      fee_xrp: strNull,
      partial_payment: bool,
      destination_tag: intNull,
      source_tag: intNull,
      invoice_id: strNull,
      balance_changes: z.array(assetAmount),
    }),
  ),
  marker: strNull,
  meta,
}) satisfies z.ZodType<AccountTransactionsResponse>;

const tokenSchema = z.object({
  asset: str,
  issuer: str,
  amm_id: strNull,
  vault_id: strNull,
  loan_broker_id: strNull,
  currency: str,
  currency_ascii: currencyAscii,
  flags: accountFlags,
  tick_size: intNull,
  blackholed: bool,
  domain: strNull,
  transfer_fee_pct: str,
  obligations: strNull,
  frozen_obligations: strNull,
  locked_obligations: strNull,
  obligations_status: codeList(["ok", "unavailable"]),
  meta,
}) satisfies z.ZodType<TokenResponse>;

const readinessSchema = z.object({
  verdict: codeList(["ready", "not_ready", "unknown"]),
  reasons: z.array(
    codeList([
      "source_not_found",
      "insufficient_xrp_balance",
      "source_line_missing",
      "insufficient_token_balance",
      "source_line_frozen",
      "destination_not_found",
      "amount_below_destination_reserve",
      "destination_tag_required",
      "deposit_not_authorized",
      "credentials_invalid",
      "destination_line_missing",
      "destination_line_limit_exceeded",
      "destination_line_frozen",
      "destination_line_unauthorized",
      "issuer_not_found",
      "issuer_global_freeze",
      "issuer_rippling_disabled",
      "destination_is_pseudo_account",
      "mpt_issuance_not_found",
      "source_mpt_missing",
      "destination_mpt_missing",
      "source_mpt_unauthorized",
      "destination_mpt_unauthorized",
      "mpt_locked",
      "mpt_transfer_disabled",
      "mpt_max_amount_exceeded",
    ]),
  ),
  warnings: z.array(
    codeList([
      "destination_will_be_created",
      "transfer_fee",
      "high_fee",
      "network_degraded",
      "credentials_unchecked",
    ]),
  ),
  checks_failed: z.array(
    codeList([
      "source_account",
      "destination_account",
      "deposit_authorized",
      "source_line",
      "destination_line",
      "issuer",
      "mpt_issuance",
      "source_mpt",
      "destination_mpt",
      "fee",
      "network_health",
    ]),
  ),
  spendable_xrp: strNull,
  reserve_base_xrp: strNull,
  reserve_inc_xrp: strNull,
  source_owner_count: intNull,
  fee_drops: strNull,
  transfer_fee_pct: strNull,
  source_balance: assetAmount.nullable(),
  required_source_balance: assetAmount.nullable(),
  max_sendable: assetAmount.nullable(),
  source: str,
  destination: str,
  asset: str,
  asset_currency_ascii: currencyAscii,
  amount: strNull,
  destination_tag: intNull,
  credentials: z.array(str).nullable(),
  meta: metaNullableLedger,
}) satisfies z.ZodType<ReadinessResponse>;

const pathsSchema = z.object({
  alternatives: z.array(
    z.object({
      source_amount: assetAmount,
      source_any_issuer: bool,
      paths_count: int,
      paths: z.array(
        z.array(
          z.object({
            account: z.exactOptional(str),
            currency: z.exactOptional(str),
            currency_ascii: currencyAscii,
            issuer: z.exactOptional(str),
          }),
        ),
      ),
      effective_price: str,
      cheapest: bool,
      suggested_send_max: str,
    }),
  ),
  paths_may_be_non_optimal: z.literal(true).meta({ enum: [true] }),
  warnings: z.array(codeList(["destination_not_found"])),
  source: str,
  destination: str,
  asset: str,
  asset_currency_ascii: currencyAscii,
  amount: str,
  send_max_asset: strNull,
  send_max_asset_currency_ascii: currencyAscii,
  send_max: strNull,
  source_assets: z.array(str).nullable(),
  meta: metaNullableLedger,
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
