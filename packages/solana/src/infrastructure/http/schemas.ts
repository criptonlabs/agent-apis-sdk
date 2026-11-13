// Zod response schemas per OpenAPI path (snapshot 0.21.0), typed against api-types.
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

const meta = z.object({
  slot: int,
  commitment: z.enum(["finalized"]),
  as_of: str,
  age_seconds: z.number(),
  cache: codeList(["hit", "miss", "stale"]),
  stale: z.boolean(),
});

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
  meta,
}) satisfies z.ZodType<SolanaHealthResponse>;

const healthHistorySchema = z.object({
  window: z.enum(["1h", "24h", "7d"]),
  bucket_seconds: int,
  buckets: z.array(
    z.object({
      start: str,
      samples: int,
      up: int,
      uptime_pct: z.number(),
      avg_latency_ms: z.number().nullable(),
    }),
  ),
  meta,
}) satisfies z.ZodType<SolanaHealthHistoryResponse>;

const tokenSchema = z.object({
  mint: str,
  token_program: str,
  decimals: int,
  supply: str,
  mint_authority: strNull,
  freeze_authority: strNull,
  extensions: z.array(str),
  transfer_fee: z.object({ basis_points: int, maximum_fee: str }).nullable(),
  verdict: codeList(["SAFE", "WARN", "DANGER"]),
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
    ]),
  ),
  meta,
}) satisfies z.ZodType<SolanaTokenResponse>;

const transferReadinessSchema = z.object({
  source: str,
  destination: str,
  mint: str,
  amount: str,
  amount_raw: str,
  decimals: int,
  token_program: strNull,
  ready: z.boolean(),
  blockers: z.array(
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
    ]),
  ),
  warnings: z.array(codeList(["destination_off_curve", "memo_required"])),
  requires_ata_creation: z.boolean(),
  ata_creation_lamports: strNull,
  transfer_fee: strNull,
  net_amount: str,
  meta,
}) satisfies z.ZodType<TransferReadinessResponse>;

/** Response schema of each Solana route, keyed by its OpenAPI path. */
export const RESPONSE_SCHEMAS = {
  "/v1/solana/slot/latest": slotLatestSchema,
  "/v1/solana/health": healthSchema,
  "/v1/solana/health/history": healthHistorySchema,
  "/v1/solana/token/{mint}": tokenSchema,
  "/v1/solana/transfer-readiness": transferReadinessSchema,
} satisfies Record<SolanaRoutePath, z.ZodType>;
