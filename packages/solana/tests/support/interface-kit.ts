import {
  FakeTransport,
  type RecordedRequest,
  type ScriptedResponse,
} from "../../../core/tests/support/fake-transport.js";
import { createSolanaAgentKit, type SolanaAgentKit } from "../../src/index.js";
import healthHistoryFixture from "../fixtures/responses/health-history.json" with { type: "json" };
import healthFixture from "../fixtures/responses/health.json" with { type: "json" };
import slotFixture from "../fixtures/responses/slot-latest.json" with { type: "json" };
import tokenFixture from "../fixtures/responses/token.json" with { type: "json" };
import readinessFixture from "../fixtures/responses/transfer-readiness-sol.json" with { type: "json" };

export const SOURCE = readinessFixture.source;
export const DESTINATION = readinessFixture.destination;

export const TOOL_NAMES = [
  "solana_latest_slot",
  "solana_network_health",
  "solana_health_history",
  "solana_token",
  "solana_transfer_readiness",
  "solana_prepare_transfer",
  "solana_credits_status",
].sort();

export { slotFixture, healthFixture };

export function readiness(overrides: Record<string, unknown> = {}): object {
  return { ...readinessFixture, ...overrides };
}

/** Route fragment -> body; `health/history` precedes `health` so the longer route wins. */
function routes(ready: object): Array<[string, object]> {
  return [
    ["/transfer-readiness", ready],
    ["/slot/latest", slotFixture],
    ["/health/history", healthHistoryFixture],
    ["/health", healthFixture],
    ["/token/", tokenFixture],
  ];
}

/** Answers every Solana route by URL with the real fixtures, so call order does not matter. */
export function solanaFake(ready: object = readiness()): FakeTransport {
  const table = routes(ready);
  return new FakeTransport().respondWith((request: RecordedRequest): ScriptedResponse => {
    const hit = table.find(([fragment]) => request.url.includes(fragment));
    return hit ? { body: hit[1] } : { status: 404, body: {} };
  });
}

export function kitOver(fake: FakeTransport): SolanaAgentKit {
  return createSolanaAgentKit({ transport: fake.transport });
}
