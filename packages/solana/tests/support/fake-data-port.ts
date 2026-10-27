import type { KitResponse } from "@criptonlabs/agent-apis-core";
import type { SolanaDataPort } from "../../src/application/ports.js";
import type { TransferReadinessResponse } from "../../src/domain/api-types.js";

export type ReadinessQuery = Parameters<SolanaDataPort["transferReadiness"]>[0];

function unexpected(operation: string): () => never {
  return () => {
    throw new Error(`fake-data-port: unexpected call to ${operation}`);
  };
}

/** In-memory SolanaDataPort: scripted transfer readiness, queries recorded; other operations throw. */
export class FakeDataPort {
  readonly readinessQueries: ReadinessQuery[] = [];

  constructor(private readonly readiness: TransferReadinessResponse) {}

  readonly port: SolanaDataPort = {
    latestSlot: unexpected("latestSlot"),
    health: unexpected("health"),
    healthHistory: unexpected("healthHistory"),
    token: unexpected("token"),
    transferReadiness: (q): Promise<KitResponse<TransferReadinessResponse>> => {
      this.readinessQueries.push(q);
      return Promise.resolve({ data: this.readiness, receipt: null });
    },
  };
}
