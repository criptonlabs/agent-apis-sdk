import { CriptonPaymentError, cmp } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { createXrplAgentKit } from "../../src/index.js";
import { decimalOf, guardedBaseUrl, payerSeed, rejectionOf } from "./e2e-env.js";

// API facts from the released revision `8bbad8ca` (API 0.27.0):
// - Since the API change `per-call-tiers-and-catalog`, every `/v1/pro/*` route takes both per-call
//   payment and credits, so `/v1/pro/xrpl/fee` is per-call; without a payer the kit raises
//   `payment-disabled`, which still carries the `prepaidOffer`. It debits tier 1, 0.0005 EUR or
//   0.0006 USD (`src/config/credits.ts`).
// - `usd-starter` costs 1.00 USD, paid with RLUSD on the XRP Ledger (bundle table `2026-10-26`,
//   `openspec/specs/prepaid-credits/spec.md` "Top-up bundles").
// - A replayed `Idempotency-Key` is served without a new debit and answers the same balance
//   (`openspec/specs/prepaid-credits/spec.md` "Debit idempotency", `docs/e2e-scenarios.md` F5).
// The bought token stays in this module's memory: it is never printed, written or put in a message.

const STARTER_MAX = "1.00";

interface Bought {
  token: string;
  denomination: string;
  balance: string;
}

let bought: Bought | undefined;
let spendBalance: string | undefined;
const idempotencyKey = `e2e-fee-${globalThis.crypto.randomUUID()}`;

function boughtCredits(): Bought {
  if (bought === undefined) throw new Error("the usd-starter top-up did not complete");
  return bought;
}

describe("XRPL prepaid credits testnet end to end (opt-in)", () => {
  it("answers payment-disabled with a prepaid offer on a per-call route without credentials", async () => {
    const kit = createXrplAgentKit({ baseUrl: guardedBaseUrl(), tier: "pro" });

    const error = await rejectionOf(kit.data.fee());

    expect(error).toBeInstanceOf(CriptonPaymentError);
    const refusal = error as CriptonPaymentError;
    expect(refusal.code).toBe("payment-disabled");
    expect(refusal.prepaidOffer?.bundles.length ?? 0).toBeGreaterThan(0);
  }, 60_000);

  it("tops up usd-starter with RLUSD within maxAmount 1.00 and returns a token and a settled receipt", async () => {
    const kit = createXrplAgentKit({
      baseUrl: guardedBaseUrl(),
      wallet: { seed: payerSeed(), network: "testnet" },
    });

    const result = await kit.credits.topup({ bundle: "usd-starter", maxAmount: STARTER_MAX });

    expect(result.token.startsWith("clc_")).toBe(true);
    expect(result.receipt).not.toBeNull();
    expect(result.receipt?.network).toBe("xrpl:1");
    bought = {
      token: result.token,
      denomination: decimalOf(result.denomination, "the top-up denomination"),
      balance: decimalOf(result.balance, "the top-up balance"),
    };
    // Live ledger: autofill, signing, settlement on a validated ledger and the credit delivery.
  }, 120_000);

  it("spends the token on fee and reports a lower balance than right after the top-up", async () => {
    const { token, denomination, balance } = boughtCredits();
    const kit = createXrplAgentKit({ baseUrl: guardedBaseUrl(), tier: "pro", credits: { token } });

    const response = await kit.data.fee({ idempotencyKey });

    const remaining = decimalOf(response.credits?.[denomination], "the balance after the spend");
    expect(cmp(remaining, balance)).toBe(-1);
    expect(response.replayed).toBe(false);
    spendBalance = remaining;
  }, 60_000);

  it("replays the same Idempotency-Key without a second debit", async () => {
    const { token, denomination } = boughtCredits();
    const before = decimalOf(spendBalance, "the balance of the first keyed spend");
    const kit = createXrplAgentKit({ baseUrl: guardedBaseUrl(), tier: "pro", credits: { token } });

    const response = await kit.data.fee({ idempotencyKey });

    expect(response.replayed).toBe(true);
    const remaining = decimalOf(response.credits?.[denomination], "the balance of the replay");
    expect(cmp(remaining, before)).toBe(0);
  }, 60_000);
});
