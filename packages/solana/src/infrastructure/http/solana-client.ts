import type { ApiClient, CallOptions } from "@criptonlabs/agent-apis-core";
import type { SolanaDataPort } from "../../application/ports.js";
import { validateIntent } from "../../domain/prepared-transfer.js";
import { assertHistoryWindow, assertSolanaAddress } from "../../domain/validation.js";
import { RESPONSE_SCHEMAS } from "./schemas.js";

/** The call options forwarded to the core, which validates and sends them (design D11). */
function call(options: CallOptions | undefined): { idempotencyKey?: string } {
  return options?.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey };
}

export function createSolanaDataClient(api: ApiClient): SolanaDataPort {
  return {
    latestSlot: async (options) =>
      api.request({
        route: "slot/latest",
        schema: RESPONSE_SCHEMAS["/v1/solana/slot/latest"],
        ...call(options),
      }),
    health: async (options) =>
      api.request({
        route: "health",
        schema: RESPONSE_SCHEMAS["/v1/solana/health"],
        ...call(options),
      }),
    healthHistory: async (q, options) => {
      const window = q?.window === undefined ? undefined : assertHistoryWindow("window", q.window);
      return api.request({
        route: "health/history",
        query: { window },
        schema: RESPONSE_SCHEMAS["/v1/solana/health/history"],
        ...call(options),
      });
    },
    token: async (mint, options) =>
      api.request({
        route: `token/${encodeURIComponent(assertSolanaAddress("mint", mint))}`,
        schema: RESPONSE_SCHEMAS["/v1/solana/token/{mint}"],
        ...call(options),
      }),
    transferReadiness: async (q, options) => {
      validateIntent(q);
      const { source, destination, mint, amount } = q;
      return api.request({
        route: "transfer-readiness",
        query: { source, destination, mint, amount },
        schema: RESPONSE_SCHEMAS["/v1/solana/transfer-readiness"],
        ...call(options),
      });
    },
  };
}
