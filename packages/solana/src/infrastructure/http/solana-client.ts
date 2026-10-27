import type { ApiClient } from "@criptonlabs/agent-apis-core";
import type { SolanaDataPort } from "../../application/ports.js";
import { validateIntent } from "../../domain/prepared-transfer.js";
import { assertHistoryWindow, assertSolanaAddress } from "../../domain/validation.js";
import { RESPONSE_SCHEMAS } from "./schemas.js";

export function createSolanaDataClient(api: ApiClient): SolanaDataPort {
  return {
    latestSlot: async () =>
      api.request({ route: "slot/latest", schema: RESPONSE_SCHEMAS["/v1/solana/slot/latest"] }),
    health: async () =>
      api.request({ route: "health", schema: RESPONSE_SCHEMAS["/v1/solana/health"] }),
    healthHistory: async (q) => {
      const window = q?.window === undefined ? undefined : assertHistoryWindow("window", q.window);
      return api.request({
        route: "health/history",
        query: { window },
        schema: RESPONSE_SCHEMAS["/v1/solana/health/history"],
      });
    },
    token: async (mint) =>
      api.request({
        route: `token/${encodeURIComponent(assertSolanaAddress("mint", mint))}`,
        schema: RESPONSE_SCHEMAS["/v1/solana/token/{mint}"],
      }),
    transferReadiness: async (q) => {
      validateIntent(q);
      const { source, destination, mint, amount } = q;
      return api.request({
        route: "transfer-readiness",
        query: { source, destination, mint, amount },
        schema: RESPONSE_SCHEMAS["/v1/solana/transfer-readiness"],
      });
    },
  };
}
