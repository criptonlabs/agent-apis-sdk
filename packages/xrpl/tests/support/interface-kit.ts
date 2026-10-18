import { FakeTransport } from "../../../core/tests/support/fake-transport.js";
import { createXrplAgentKit, type XrplAgentKit } from "../../src/index.js";
import feeFixture from "../fixtures/responses/fee.json" with { type: "json" };
import readinessFixture from "../fixtures/responses/payment-readiness.json" with { type: "json" };

export const SOURCE = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
export const DESTINATION = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";

export const TOOL_NAMES = [
  "xrpl_fee",
  "xrpl_network_health",
  "xrpl_latest_ledger",
  "xrpl_orderbook",
  "xrpl_slippage",
  "xrpl_amm",
  "xrpl_account_summary",
  "xrpl_account_lines",
  "xrpl_account_transactions",
  "xrpl_token",
  "xrpl_payment_readiness",
  "xrpl_paths",
  "xrpl_prepare_payment",
  "xrpl_dex_quote",
].sort();

export function readiness(overrides: Record<string, unknown> = {}): object {
  return { ...readinessFixture, source: SOURCE, destination: DESTINATION, ...overrides };
}

/** Answers readiness and fee routes by URL so call order does not matter. */
export function readinessFake(ready: object): FakeTransport {
  return new FakeTransport().respondWith((request) => {
    if (request.url.includes("/payment-readiness")) return { body: ready };
    if (request.url.includes("/fee")) return { body: feeFixture };
    return { status: 404, body: {} };
  });
}

export function kitOver(fake: FakeTransport): XrplAgentKit {
  return createXrplAgentKit({ transport: fake.transport });
}
