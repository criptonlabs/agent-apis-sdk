// Written from the API OpenAPI document 0.19.2 (fetched 2026-10-27): one type per 200 body of /v1/solana/*.

export type SolanaMeta = {
  slot: number;
  commitment: "finalized";
  as_of: string;
  age_seconds: number;
  cache: "hit" | "miss" | "stale";
  stale: boolean;
};

export type SlotLatestResponse = {
  slot: number;
  block_time: string | null;
  meta: SolanaMeta;
};

export type SolanaHealthResponse = {
  status: "up" | "down" | "unknown" | "unavailable";
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
    uptime_pct: number;
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
  | "unknown_extension";

export type SolanaTokenResponse = {
  mint: string;
  token_program: string;
  decimals: number;
  supply: string;
  mint_authority: string | null;
  freeze_authority: string | null;
  extensions: string[];
  transfer_fee: { basis_points: number; maximum_fee: string } | null;
  verdict: "SAFE" | "WARN" | "DANGER";
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
  | "mint_paused";

export type TransferWarning = "destination_off_curve" | "memo_required";

export type TransferReadinessResponse = {
  source: string;
  destination: string;
  mint: string;
  amount: string;
  amount_raw: string;
  decimals: number;
  token_program: string | null;
  ready: boolean;
  blockers: TransferBlocker[];
  warnings: TransferWarning[];
  requires_ata_creation: boolean;
  ata_creation_lamports: string | null;
  transfer_fee: string | null;
  net_amount: string;
  meta: SolanaMeta;
};
