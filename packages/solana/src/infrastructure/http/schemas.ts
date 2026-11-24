// Zod response schemas per OpenAPI path (snapshot 0.27.0), typed against the generated api-types
// (kit-api-sync-0-27 design D1, D2).
import { codeList } from "@criptonlabs/agent-apis-core";
import { z } from "zod";
import type {
  SlotLatestResponse,
  SolanaHealthHistoryResponse,
  SolanaHealthResponse,
  SolanaTokenResponse,
  TransferReadinessResponse,
} from "../../domain/api-types.js";

export const SOLANA_ROUTE_PATHS = [
  "/v1/solana/slot/latest",
  "/v1/solana/health",
  "/v1/solana/health/history",
  "/v1/solana/token/{mint}",
  "/v1/solana/transfer-readiness",
] as const;

export type SolanaRoutePath = (typeof SOLANA_ROUTE_PATHS)[number];

const str = z.string();
const strNull = z.string().nullable();
const int = z.number().int();

const metaFields = {
  commitment: z.enum(["finalized"]),
  as_of: str,
  age_seconds: int,
  cache: codeList(["hit", "miss", "stale"]),
  stale: z.boolean(),
};
const meta = z.object({ slot: int, ...metaFields });
const metaNullableSlot = z.object({ slot: int.nullable(), ...metaFields });

const transferFeeNext = z
  .object({ transfer_fee_pct: str, transfer_fee_max: str, epoch: int })
  .nullable();

const slotLatestSchema = z.object({
  slot: int,
  block_time: strNull,
  meta,
}) satisfies z.ZodType<SlotLatestResponse>;

const healthSchema = z.object({
  status: codeList(["up", "down", "unknown", "unavailable"]),
  slot: int.nullable(),
  latency_ms: z.number().nullable(),
  last_probe_at: strNull,
  meta: metaNullableSlot,
}) satisfies z.ZodType<SolanaHealthResponse>;

const healthHistorySchema = z.object({
  window: z.enum(["1h", "24h", "7d"]),
  bucket_seconds: int,
  buckets: z.array(
    z.object({
      start: str,
      samples: int,
      up: int,
      uptime_pct: str,
      avg_latency_ms: z.number().nullable(),
    }),
  ),
  meta: metaNullableSlot,
}) satisfies z.ZodType<SolanaHealthHistoryResponse>;

const tokenSchema = z.object({
  mint: str,
  token_program: str,
  decimals: int,
  supply_atomic: str,
  supply: str,
  mint_authority: strNull,
  freeze_authority: strNull,
  extensions: z.array(str),
  transfer_fee_pct: strNull,
  transfer_fee_max: strNull,
  transfer_fee_next: transferFeeNext,
  transfer_fee_authority: strNull,
  paused: z.boolean().nullable(),
  default_account_state: codeList(["initialized", "frozen"]).nullable(),
  interest_rate_pct: strNull,
  ui_multiplier: strNull,
  ui_multiplier_next: strNull,
  ui_multiplier_next_at: strNull,
  permanent_delegate: strNull,
  transfer_hook_program_id: strNull,
  mint_close_authority: strNull,
  metadata_address: strNull,
  verdict: codeList(["safe", "warn", "danger"]),
  reasons: z.array(
    codeList([
      "permanent_delegate",
      "transfer_hook",
      "pausable",
      "default_account_frozen",
      "mint_authority_set",
      "freeze_authority_set",
      "transfer_fee",
      "mint_close_authority",
      "unknown_extension",
      "scaled_ui_amount",
      "interest_bearing",
      "confidential_transfer",
      "transfer_hook_authority",
      "permissioned_burn",
      "non_transferable",
    ]),
  ),
  meta: metaNullableSlot,
}) satisfies z.ZodType<SolanaTokenResponse>;

const transferReadinessSchema = z.object({
  source: str,
  destination: str,
  mint: str,
  amount: str,
  amount_atomic: str,
  source_balance: z.object({ asset: str, value: str, value_atomic: str }).nullable(),
  decimals: int,
  token_program: strNull,
  source_token_account: strNull,
  destination_token_account: strNull,
  verdict: codeList(["ready", "not_ready", "unknown"]),
  reasons: z.array(
    codeList([
      "insufficient_balance",
      "insufficient_sol_for_fees",
      "source_below_rent_exempt",
      "destination_below_rent_exempt",
      "source_frozen",
      "destination_frozen",
      "non_transferable",
      "mint_paused",
      "destination_ata_occupied",
      "destination_frozen_on_creation",
      "destination_not_wallet",
      "destination_ata_owner_mismatch",
      "source_not_system_account",
      "destination_confidential_only",
    ]),
  ),
  warnings: z.array(
    codeList([
      "destination_off_curve",
      "memo_required",
      "destination_program_owned",
      "ui_amount_scaled",
      "transfer_fee_changing",
    ]),
  ),
  checks_failed: z.array(codeList(["source_token_account", "destination_token_account"])),
  requires_ata_creation: z.boolean(),
  ata_creation_lamports: strNull,
  transfer_fee_atomic: strNull,
  net_amount_atomic: str,
  destination_kind: codeList([
    "not_found",
    "wallet",
    "nonce",
    "token_account",
    "mint",
    "token_multisig",
    "program",
    "stake",
    "vote",
    "other",
  ]),
  ui_multiplier: strNull,
  interest_rate_pct: strNull,
  transfer_fee_next: transferFeeNext,
  meta: metaNullableSlot,
}) satisfies z.ZodType<TransferReadinessResponse>;

/** Response schema of each Solana route, keyed by its OpenAPI path. */
export const RESPONSE_SCHEMAS = {
  "/v1/solana/slot/latest": slotLatestSchema,
  "/v1/solana/health": healthSchema,
  "/v1/solana/health/history": healthHistorySchema,
  "/v1/solana/token/{mint}": tokenSchema,
  "/v1/solana/transfer-readiness": transferReadinessSchema,
} satisfies Record<SolanaRoutePath, z.ZodType>;
