// Generated from the API OpenAPI document 0.27.0 (tests/fixtures/openapi.json): one type per 200 body
// of /v1/solana/*, with the API's names, JSON types and nullability (kit-api-sync-0-27 design D1).
// Code-list fields are open: a known code or any other string (kit-api-sync design D3, D2 of 0-27).
// Refresh together with tests/fixtures/openapi.json.

export type SolanaMeta = {
  slot: number | null;
  commitment: "finalized";
  as_of: string;
  age_seconds: number;
  cache: "hit" | "miss" | "stale" | (string & {});
  stale: boolean;
};

export type SlotLatestResponse = {
  slot: number;
  block_time: string | null;
  meta: SolanaMeta & { slot: number };
};

export type SolanaHealthResponse = {
  status: "up" | "down" | "unknown" | "unavailable" | (string & {});
  slot: number | null;
  latency_ms: number | null;
  last_probe_at: string | null;
  meta: SolanaMeta;
};

export type SolanaHealthHistoryResponse = {
  window: "1h" | "24h" | "7d";
  bucket_seconds: number;
  buckets: Array<{
    start: string;
    samples: number;
    up: number;
    uptime_pct: string;
    avg_latency_ms: number | null;
  }>;
  meta: SolanaMeta;
};

export type TokenReason =
  | "permanent_delegate"
  | "transfer_hook"
  | "pausable"
  | "default_account_frozen"
  | "mint_authority_set"
  | "freeze_authority_set"
  | "transfer_fee"
  | "mint_close_authority"
  | "unknown_extension"
  | "scaled_ui_amount"
  | "interest_bearing"
  | "confidential_transfer"
  | "transfer_hook_authority"
  | "permissioned_burn"
  | "non_transferable"
  | (string & {});

export type SolanaTokenResponse = {
  mint: string;
  token_program: string;
  decimals: number;
  supply_atomic: string;
  supply: string;
  mint_authority: string | null;
  freeze_authority: string | null;
  extensions: string[];
  transfer_fee_pct: string | null;
  transfer_fee_max: string | null;
  transfer_fee_next: {
    transfer_fee_pct: string;
    transfer_fee_max: string;
    epoch: number;
  } | null;
  transfer_fee_authority: string | null;
  paused: boolean | null;
  default_account_state: "initialized" | "frozen" | (string & {}) | null;
  interest_rate_pct: string | null;
  ui_multiplier: string | null;
  ui_multiplier_next: string | null;
  ui_multiplier_next_at: string | null;
  permanent_delegate: string | null;
  transfer_hook_program_id: string | null;
  mint_close_authority: string | null;
  metadata_address: string | null;
  verdict: "safe" | "warn" | "danger" | (string & {});
  reasons: TokenReason[];
  meta: SolanaMeta;
};

export type TransferBlocker =
  | "insufficient_balance"
  | "insufficient_sol_for_fees"
  | "source_below_rent_exempt"
  | "destination_below_rent_exempt"
  | "source_frozen"
  | "destination_frozen"
  | "non_transferable"
  | "mint_paused"
  | "destination_ata_occupied"
  | "destination_frozen_on_creation"
  | "destination_not_wallet"
  | "destination_ata_owner_mismatch"
  | "source_not_system_account"
  | "destination_confidential_only"
  | (string & {});

export type TransferWarning =
  | "destination_off_curve"
  | "memo_required"
  | "destination_program_owned"
  | "ui_amount_scaled"
  | "transfer_fee_changing"
  | (string & {});

export type TransferReadinessResponse = {
  source: string;
  destination: string;
  mint: string;
  amount: string;
  amount_atomic: string;
  source_balance: {
    asset: string;
    value: string;
    value_atomic: string;
  } | null;
  decimals: number;
  token_program: string | null;
  source_token_account: string | null;
  destination_token_account: string | null;
  verdict: "ready" | "not_ready" | "unknown" | (string & {});
  reasons: TransferBlocker[];
  warnings: TransferWarning[];
  checks_failed: Array<"source_token_account" | "destination_token_account" | (string & {})>;
  requires_ata_creation: boolean;
  ata_creation_lamports: string | null;
  transfer_fee_atomic: string | null;
  net_amount_atomic: string;
  destination_kind:
    | "not_found"
    | "wallet"
    | "nonce"
    | "token_account"
    | "mint"
    | "token_multisig"
    | "program"
    | "stake"
    | "vote"
    | "other"
    | (string & {});
  ui_multiplier: string | null;
  interest_rate_pct: string | null;
  transfer_fee_next: {
    transfer_fee_pct: string;
    transfer_fee_max: string;
    epoch: number;
  } | null;
  meta: SolanaMeta;
};
