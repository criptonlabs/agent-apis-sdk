// Generated from the API OpenAPI document 0.27.0 (tests/fixtures/openapi.json): one type per 200 body
// of /v1/xrpl/*, with the API's names, JSON types and nullability (kit-api-sync-0-27 design D1).
// Code-list fields are open: a known code or any other string (kit-api-sync design D3, D2 of 0-27).
// Refresh together with tests/fixtures/openapi.json.

export type FeeResponse = {
  fee: {
    economy_drops: string;
    standard_drops: string;
    priority_drops: string;
  };
  congestion: {
    score: number;
    band: "low" | "medium" | "high" | (string & {});
    load_factor_assumed: boolean;
    load_factor_multiplier: string | null;
  };
  queue_full: boolean;
  escalation_multiplier: string;
  base_fee_drops: string;
  median_fee_drops: string;
  minimum_fee_drops: string;
  open_ledger_fee_drops: string;
  current_queue_size: number;
  max_queue_size: number | null;
  current_ledger_size: number;
  expected_ledger_size: number;
  ledger_fill_ratio: string | null;
  meta: {
    ledger_index: number;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
    stale: boolean;
  };
};

export type HealthResponse = {
  status: "ok" | "degraded" | "down" | "unknown" | (string & {});
  nodes: Array<{
    member: string;
    state: "up" | "down" | (string & {});
    latency_ms: number | null;
    ledger_index: number | null;
    ledger_age_seconds: number | null;
    load_factor_multiplier: string | null;
    server_state:
      | "disconnected"
      | "connected"
      | "syncing"
      | "tracking"
      | "full"
      | (string & {})
      | null;
    complete_ledgers: Array<{
      first_ledger_index: number;
      last_ledger_index: number;
    }> | null;
    amendment_blocked: boolean | null;
    error: string | null;
    sampled_at: string;
  }>;
  median_latency_ms: number | null;
  ledger_index: number | null;
  last_probe_at: string | null;
  meta: {
    ledger_index: number | null;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
    stale: boolean;
  };
};

export type NetworkHealthResponse = {
  status: "ok" | "degraded" | "down" | "unknown" | (string & {});
  nodes: Array<{
    member: string;
    state: "up" | "down" | (string & {});
    latency_ms: number | null;
    ledger_index: number | null;
    ledger_age_seconds: number | null;
    load_factor_multiplier: string | null;
    server_state:
      | "disconnected"
      | "connected"
      | "syncing"
      | "tracking"
      | "full"
      | (string & {})
      | null;
    complete_ledgers: Array<{
      first_ledger_index: number;
      last_ledger_index: number;
    }> | null;
    amendment_blocked: boolean | null;
    error: string | null;
    sampled_at: string;
  }>;
  median_latency_ms: number | null;
  ledger_index: number | null;
  last_probe_at: string | null;
  meta: {
    ledger_index: number | null;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
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
      uptime_pct: string;
      avg_latency_ms: number | null;
    }>;
  }>;
  nodes: Array<{
    member: string;
    uptime_pct: string;
    median_latency_ms: number | null;
  }>;
  meta: {
    ledger_index: number | null;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
    stale: boolean;
  };
};

export type LedgerLatestResponse = {
  ledger_index: number;
  close_time: string | null;
  ledger_hash: string | null;
  close_age_seconds: number | null;
  meta: {
    ledger_index: number;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
    stale: boolean;
  };
};

export type OrderbookResponse = {
  base: string;
  base_currency_ascii?: string | null;
  quote: string;
  quote_currency_ascii?: string | null;
  domain: string | null;
  depth: number;
  depth_effective: number;
  asks_truncated: boolean;
  bids_truncated: boolean;
  best_bid: string | null;
  best_ask: string | null;
  mid: string | null;
  spread_price: string | null;
  spread_bps: string | null;
  crossed: boolean | null;
  funded_total: {
    ask_depth: string;
    bid_depth: string;
  };
  depth_bands: Array<{
    half_width_bps: string;
    ask_depth: string;
    bid_depth: string;
  }> | null;
  asks: Array<{
    gets: string;
    pays: string;
    price: string;
    owner: string;
    expires_at: string | null;
  }>;
  bids: Array<{
    gets: string;
    pays: string;
    price: string;
    owner: string;
    expires_at: string | null;
  }>;
  meta: {
    ledger_index: number;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
    stale: boolean;
  };
};

export type SlippageResponse = {
  base: string;
  base_currency_ascii?: string | null;
  quote: string;
  quote_currency_ascii?: string | null;
  domain: string | null;
  side: "buy" | "sell" | (string & {});
  depth: number;
  depth_effective: number;
  amount: string;
  filled: string;
  partial: boolean;
  insufficient_liquidity: boolean;
  book_truncated: boolean;
  best_price: string | null;
  worst_price: string | null;
  avg_price: string | null;
  slippage_pct: string | null;
  transfer_fee_applied: boolean;
  transfer_fee_pct: string | null;
  transfer_fee_issuer: string | null;
  avg_price_after_fees: string | null;
  venues: {
    best: "clob" | "amm" | (string & {}) | null;
    amm_status: "ok" | "stale" | "no_pool" | "frozen" | "unavailable" | (string & {});
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
      spot_price_with_fee: string;
      trading_fee_pct: string;
    } | null;
    amm_ledger_index: number | null;
    amm_age_seconds: number | null;
  };
  meta: {
    ledger_index: number;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
    stale: boolean;
  };
};

export type AmmResponse = {
  asset_a: string;
  asset_a_currency_ascii?: string | null;
  asset_b: string;
  asset_b_currency_ascii?: string | null;
  reserve_a: string;
  reserve_b: string;
  trading_fee_pct: string;
  spot_a_per_b: string | null;
  spot_a_per_b_with_fee: string | null;
  spot_b_per_a: string | null;
  spot_b_per_a_with_fee: string | null;
  lp_token: {
    currency: string;
    currency_ascii: string | null;
    issuer: string;
    supply: string;
  };
  a_per_lp_token: string | null;
  b_per_lp_token: string | null;
  auction_slot: {
    account: string;
    auth_accounts: Array<string>;
    active: boolean;
    discounted_fee_pct: string;
    price: string;
    outbid_price: string | null;
    expires_at: string;
    time_interval: number | null;
  } | null;
  auction_slot_minimum_price: string;
  a_frozen: boolean;
  b_frozen: boolean;
  vote_dispersion: {
    votes: number;
    min_fee_pct: string;
    max_fee_pct: string;
    weighted_sd_pct: string | null;
  } | null;
  vote_slots: Array<{
    account: string;
    trading_fee_pct: string;
    vote_weight_ratio: string;
  }>;
  meta: {
    ledger_index: number;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
    stale: boolean;
  };
};

export type AccountSummaryResponse = {
  address: string;
  balance_xrp: string;
  sequence: number;
  owner_count: number;
  ticket_count: number;
  sponsored_owner_count: number | null;
  sponsoring_owner_count: number | null;
  sponsoring_account_count: number | null;
  transfer_fee_pct: string;
  flags: {
    require_dest_tag: boolean;
    deposit_auth: boolean;
    disallow_xrp: boolean;
    disallow_incoming: {
      check: boolean;
      nftoken_offer: boolean;
      paychan: boolean;
      trustline: boolean;
    };
    require_auth: boolean;
    default_ripple: boolean;
    global_freeze: boolean;
    no_freeze: boolean;
    allow_clawback: boolean;
    disable_master: boolean;
    allow_trustline_locking: boolean;
  };
  regular_key: string | null;
  signer_list_set: boolean;
  domain: string | null;
  tick_size: number | null;
  amm_id: string | null;
  vault_id: string | null;
  loan_broker_id: string | null;
  trust_lines: Array<{
    peer: string;
    currency: string;
    currency_ascii?: string | null;
    role: "issuer" | "holder" | (string & {});
    balance: string;
    line_limit: string;
  }>;
  lines_truncated: boolean;
  is_issuer: boolean | null;
  meta: {
    ledger_index: number;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
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
    line_limit: string;
    peer_line_limit: string;
    no_ripple: boolean;
    no_ripple_peer: boolean;
    freeze: boolean;
    freeze_peer: boolean;
    authorized: boolean;
    peer_authorized: boolean;
    role: "issuer" | "holder" | (string & {});
    headroom: string | null;
    deep_freeze: boolean;
    deep_freeze_peer: boolean;
    quality_in_multiplier: string;
    quality_out_multiplier: string;
  }>;
  marker: string | null;
  meta: {
    ledger_index: number;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
    stale: boolean;
  };
};

export type AccountTransactionsResponse = {
  address: string;
  limit: number;
  transactions: Array<{
    hash: string | null;
    ledger_index: number | null;
    close_time: string | null;
    type: string | null;
    result: string | null;
    counterparty: string | null;
    delivered: {
      asset: string;
      value: string | null;
      value_atomic?: string;
      currency_ascii?: string | null;
    } | null;
    delivered_unavailable: boolean;
    direction: "out" | "in" | "other" | (string & {});
    fee_xrp: string | null;
    partial_payment: boolean;
    destination_tag: number | null;
    source_tag: number | null;
    invoice_id: string | null;
    balance_changes: Array<{
      asset: string;
      value: string | null;
      value_atomic?: string;
      currency_ascii?: string | null;
    }>;
  }>;
  marker: string | null;
  meta: {
    ledger_index: number;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
    stale: boolean;
  };
};

export type TokenResponse = {
  asset: string;
  issuer: string;
  amm_id: string | null;
  vault_id: string | null;
  loan_broker_id: string | null;
  currency: string;
  currency_ascii?: string | null;
  flags: {
    require_dest_tag: boolean;
    deposit_auth: boolean;
    disallow_xrp: boolean;
    disallow_incoming: {
      check: boolean;
      nftoken_offer: boolean;
      paychan: boolean;
      trustline: boolean;
    };
    require_auth: boolean;
    default_ripple: boolean;
    global_freeze: boolean;
    no_freeze: boolean;
    allow_clawback: boolean;
    disable_master: boolean;
    allow_trustline_locking: boolean;
  };
  tick_size: number | null;
  blackholed: boolean;
  domain: string | null;
  transfer_fee_pct: string;
  obligations: string | null;
  frozen_obligations: string | null;
  locked_obligations: string | null;
  obligations_status: "ok" | "unavailable" | (string & {});
  meta: {
    ledger_index: number;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
    stale: boolean;
  };
};

export type ReadinessResponse = {
  verdict: "ready" | "not_ready" | "unknown" | (string & {});
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
    | "credentials_invalid"
    | "destination_line_missing"
    | "destination_line_limit_exceeded"
    | "destination_line_frozen"
    | "destination_line_unauthorized"
    | "issuer_not_found"
    | "issuer_global_freeze"
    | "issuer_rippling_disabled"
    | "destination_is_pseudo_account"
    | "mpt_issuance_not_found"
    | "source_mpt_missing"
    | "destination_mpt_missing"
    | "source_mpt_unauthorized"
    | "destination_mpt_unauthorized"
    | "mpt_locked"
    | "mpt_transfer_disabled"
    | "mpt_max_amount_exceeded"
    | (string & {})
  >;
  warnings: Array<
    | "destination_will_be_created"
    | "transfer_fee"
    | "high_fee"
    | "network_degraded"
    | "credentials_unchecked"
    | (string & {})
  >;
  checks_failed: Array<
    | "source_account"
    | "destination_account"
    | "deposit_authorized"
    | "source_line"
    | "destination_line"
    | "issuer"
    | "mpt_issuance"
    | "source_mpt"
    | "destination_mpt"
    | "fee"
    | "network_health"
    | (string & {})
  >;
  spendable_xrp: string | null;
  reserve_base_xrp: string | null;
  reserve_inc_xrp: string | null;
  source_owner_count: number | null;
  fee_drops: string | null;
  transfer_fee_pct: string | null;
  source_balance: {
    asset: string;
    value: string | null;
    value_atomic?: string;
    currency_ascii?: string | null;
  } | null;
  required_source_balance: {
    asset: string;
    value: string | null;
    value_atomic?: string;
    currency_ascii?: string | null;
  } | null;
  max_sendable: {
    asset: string;
    value: string | null;
    value_atomic?: string;
    currency_ascii?: string | null;
  } | null;
  source: string;
  destination: string;
  asset: string;
  asset_currency_ascii?: string | null;
  amount: string | null;
  destination_tag: number | null;
  credentials: Array<string> | null;
  meta: {
    ledger_index: number | null;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
    stale: boolean;
  };
};

export type PathsResponse = {
  alternatives: Array<{
    source_amount: {
      asset: string;
      value: string | null;
      value_atomic?: string;
      currency_ascii?: string | null;
    };
    source_any_issuer: boolean;
    paths_count: number;
    paths: Array<
      Array<{
        account?: string;
        currency?: string;
        currency_ascii?: string | null;
        issuer?: string;
      }>
    >;
    effective_price: string;
    cheapest: boolean;
    suggested_send_max: string;
  }>;
  paths_may_be_non_optimal: true;
  warnings: Array<"destination_not_found" | (string & {})>;
  source: string;
  destination: string;
  asset: string;
  asset_currency_ascii?: string | null;
  amount: string;
  send_max_asset: string | null;
  send_max_asset_currency_ascii?: string | null;
  send_max: string | null;
  source_assets: Array<string> | null;
  meta: {
    ledger_index: number | null;
    ledger_state: "validated" | "open" | (string & {});
    as_of: string;
    age_seconds: number;
    cache: "hit" | "miss" | "stale" | (string & {});
    stale: boolean;
  };
};
