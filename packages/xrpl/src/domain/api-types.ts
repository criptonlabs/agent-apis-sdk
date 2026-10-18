// Generated from the API OpenAPI document 0.19.1 (fetched 2026-10-18): one type per 200 body of /v1/xrpl/*.
// Refresh together with tests/fixtures/openapi.json (design D16).

export type FeeResponse = {
  fee: {
    economy: string;
    standard: string;
    priority: string;
  };
  congestion: {
    score: number;
    band: "low" | "medium" | "high";
    load_factor_assumed: boolean;
  };
  base_fee: string;
  median_fee: string;
  minimum_fee: string;
  open_ledger_fee: string;
  current_queue_size: string;
  max_queue_size: string;
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type HealthResponse = {
  status: "ok" | "degraded" | "down" | "unknown";
  nodes: Array<{
    member: string;
    state: "up" | "down";
    latency_ms: number | null;
    ledger_index: number | null;
    ledger_age_s: number | null;
    load_factor: number | null;
    error: string | null;
    sampled_at: string;
  }>;
  ledger_index: number;
  last_probe_at: string | null;
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type NetworkHealthResponse = {
  status: "ok" | "degraded" | "down" | "unknown";
  nodes: Array<{
    member: string;
    state: "up" | "down";
    latency_ms: number | null;
    ledger_index: number | null;
    ledger_age_s: number | null;
    load_factor: number | null;
    error: string | null;
    sampled_at: string;
  }>;
  ledger_index: number;
  last_probe_at: string | null;
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type HealthHistoryResponse = {
  window: "1h" | "24h" | "7d";
  bucket_seconds: number;
  buckets: Array<{
    start: string;
    members: Array<{
      member: string;
      samples: number;
      up: number;
      uptime_pct: number;
      avg_latency_ms: number | null;
    }>;
  }>;
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type LedgerLatestResponse = {
  ledger_index: number;
  close_time: string | null;
  ledger_hash: string | null;
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type OrderbookResponse = {
  base: string;
  quote: string;
  depth: number;
  asks: Array<{
    gets: string;
    pays: string;
    price: string;
  }>;
  bids: Array<{
    gets: string;
    pays: string;
    price: string;
  }>;
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type SlippageResponse = {
  base: string;
  quote: string;
  side: "buy";
  depth: number;
  amount: string;
  filled: string;
  partial: boolean;
  insufficient_liquidity: boolean;
  best_price: string | null;
  avg_price: string | null;
  slippage_pct: string | null;
  transfer_fee_applied: boolean;
  transfer_fee: string | null;
  avg_price_after_fees: string | null;
  venues: {
    best: "clob" | "amm" | null;
    amm_status: "ok" | "stale" | "no_pool" | "unavailable";
    clob: {
      avg_price: string | null;
      cost: string | null;
      slippage_pct: string | null;
      insufficient_liquidity: boolean;
      avg_price_after_fees: string | null;
    };
    amm: {
      avg_price: string | null;
      cost: string | null;
      slippage_pct: string | null;
      insufficient_liquidity: boolean;
      avg_price_after_fees: string | null;
      spot_price: string;
      trading_fee: string;
    } | null;
  };
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type AmmResponse = {
  asset_a: string;
  asset_b: string;
  reserve_a: string;
  reserve_b: string;
  trading_fee: string;
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type AccountSummaryResponse = {
  address: string;
  balance_xrp: string;
  sequence: number;
  owner_count: number;
  transfer_rate: number;
  trust_lines: Array<{
    currency: string;
    issuer: string;
    balance: string;
    limit: string;
  }>;
  lines_truncated: boolean;
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type AccountLinesResponse = {
  address: string;
  limit: number;
  peer: string | null;
  lines: Array<{
    peer: string;
    currency: string;
    currency_ascii?: string | null;
    balance: string;
    limit: string;
    peer_limit: string;
    no_ripple: boolean;
    no_ripple_peer: boolean;
    freeze: boolean;
    freeze_peer: boolean;
    authorized: boolean;
    peer_authorized: boolean;
  }>;
  marker: string | null;
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type AccountTransactionsResponse = {
  address: string;
  limit: number;
  transactions: Array<{
    hash: string;
    ledger_index: number;
    close_time: string;
    type: string;
    result: string;
    counterparty: string | null;
    delivered: {
      asset: string;
      value: string;
      currency_ascii?: string | null;
    } | null;
  }>;
  marker: string | null;
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type TokenResponse = {
  issuer: string;
  currency: string;
  currency_ascii?: string | null;
  global_freeze: boolean;
  no_freeze: boolean;
  require_auth: boolean;
  default_ripple: boolean;
  domain: string | null;
  transfer_rate: number;
  transfer_fee_pct: string;
  obligations: string | null;
  obligations_status: "ok" | "unavailable";
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type ReadinessResponse = {
  verdict: "ready" | "not_ready" | "unknown";
  reasons: Array<
    | "source_not_found"
    | "insufficient_xrp_balance"
    | "source_line_missing"
    | "insufficient_token_balance"
    | "source_line_frozen"
    | "destination_not_found"
    | "amount_below_destination_reserve"
    | "destination_tag_required"
    | "deposit_not_authorized"
    | "destination_line_missing"
    | "destination_line_limit_exceeded"
    | "destination_line_frozen"
    | "issuer_not_found"
    | "issuer_global_freeze"
  >;
  warnings: Array<"destination_will_be_created" | "transfer_fee" | "high_fee" | "network_degraded">;
  checks_failed: Array<
    | "source_account"
    | "destination_account"
    | "deposit_authorized"
    | "source_line"
    | "destination_line"
    | "issuer"
    | "fee"
    | "network_health"
  >;
  spendable_xrp: string | null;
  transfer_fee_pct: string | null;
  source: string;
  destination: string;
  asset: string;
  amount: string | null;
  destination_tag: number | null;
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};

export type PathsResponse = {
  alternatives: Array<{
    source_amount: {
      asset: string;
      value: string;
      currency_ascii?: string | null;
    };
    paths_count: number;
    paths: Array<
      Array<{
        account?: string;
        currency?: string;
        currency_ascii?: string | null;
        issuer?: string;
      }>
    >;
  }>;
  paths_may_be_non_optimal: true;
  warnings: Array<"destination_not_found">;
  meta: {
    ledger_index: number;
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale";
    stale: boolean;
  };
};
