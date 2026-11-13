import { CriptonPaymentError, cmp } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { createSolanaAgentKit, SOLANA_CAIP2 } from "../../src/index.js";
import {
  decimalOf,
  guardedBaseUrl,
  payerKey,
  recordingTransport,
  rejectionOf,
  type SentRequest,
} from "./e2e-env.js";

// API facts from the released revision `ce704b9`:
// - `eur-1` costs 1.21 EUR, paid with EURC on Solana (bundle table `2026-10-26` in
//   `src/config/credits.ts`; `openspec/specs/prepaid-credits/spec.md` "Top-up bundles").
// - `/v1/pro/solana/slot/latest` is credits-only (`src/config/prices.ts`, route table `2026-10-18`)
//   and debits tier 1, 0.0005 EUR (`src/config/credits.ts`).
// - A SIWX-debited answer carries `X-SIWX-Next-Challenge`; rotation revokes every earlier token of
//   the wallet, which then answers `credits_invalid` (`openspec/specs/prepaid-credits/spec.md`
//   "Sign-In-With-X spending", "Token rotation", "Credit refusal").
// - A `PAYMENT-SIGNATURE` whose encoded size exceeds 8192 bytes is refused
//   (`openspec/specs/x402-payments/spec.md`, `MAX_PAYMENT_BYTES`).
// Bought and rotated tokens stay in this module's memory: never printed, written or put in a message.

const EUR_1_MAX = "1.21";
const PAYMENT_SIGNATURE_LIMIT = 8192;

interface Bought {
  token: string;
  denomination: string;
  balance: string;
}

const sent: SentRequest[] = [];
let bought: Bought | undefined;

function boughtCredits(): Bought {
  if (bought === undefined) throw new Error("the eur-1 top-up did not complete");
  return bought;
}

describe("Solana prepaid credits devnet end to end (opt-in)", () => {
  it("offers eur-1 at the EURC maximum on a credits-only route without credentials", async () => {
    const kit = createSolanaAgentKit({
      baseUrl: guardedBaseUrl(),
      tier: "pro",
      transport: recordingTransport(sent),
    });

    const error = await rejectionOf(kit.data.latestSlot());

    expect(error).toBeInstanceOf(CriptonPaymentError);
    const refusal = error as CriptonPaymentError;
    expect(refusal.code).toBe("credits-required");
    const eur1 = refusal.prepaidOffer?.bundles.find((bundle) => bundle.id === "eur-1");
    expect(cmp(decimalOf(eur1?.amount, "the eur-1 offer amount"), EUR_1_MAX)).toBe(0);
  }, 60_000);

  it("tops up eur-1 with EURC and returns a token and a settled receipt", async () => {
    const kit = createSolanaAgentKit({
      baseUrl: guardedBaseUrl(),
      wallet: { key: payerKey(), network: "devnet", asset: "EURC" },
      transport: recordingTransport(sent),
    });

    const result = await kit.credits.topup({ bundle: "eur-1", maxAmount: EUR_1_MAX });

    expect(result.token.startsWith("clc_")).toBe(true);
    expect(result.receipt).not.toBeNull();
    expect(result.receipt?.network).toBe(SOLANA_CAIP2.devnet);
    bought = {
      token: result.token,
      denomination: decimalOf(result.denomination, "the top-up denomination"),
      balance: decimalOf(result.balance, "the top-up balance"),
    };
    // Settlement plus the API's activation poll (up to 8 lookups, 1 s apart) and the credit delivery.
  }, 120_000);

  it("spends the token with Bearer on slot/latest and reports a lower balance", async () => {
    const { token, denomination, balance } = boughtCredits();
    const kit = createSolanaAgentKit({
      baseUrl: guardedBaseUrl(),
      tier: "pro",
      credits: { token },
      transport: recordingTransport(sent),
    });

    const response = await kit.data.latestSlot();

    const remaining = decimalOf(response.credits?.[denomination], "the balance after the spend");
    expect(cmp(remaining, balance)).toBe(-1);
  }, 60_000);

  it("spends with SIWX, answering a challenge and then reusing the next challenge", async () => {
    boughtCredits();
    const kit = createSolanaAgentKit({
      baseUrl: guardedBaseUrl(),
      tier: "pro",
      wallet: { key: payerKey(), network: "devnet", asset: "EURC" },
      credits: { siwx: true },
      transport: recordingTransport(sent),
    });

    const firstStart = sent.length;
    await kit.data.latestSlot();
    const firstCall = sent.slice(firstStart);
    expect(firstCall).toHaveLength(2);
    expect(firstCall[0]?.siwx).toBe(false);
    expect(firstCall[1]?.siwx).toBe(true);

    const secondStart = sent.length;
    await kit.data.latestSlot();
    const secondCall = sent.slice(secondStart);
    expect(secondCall).toHaveLength(1);
    expect(secondCall[0]?.siwx).toBe(true);
  }, 60_000);

  it("rotates the token and the old token is then refused with credits_invalid", async () => {
    const { token } = boughtCredits();
    const walletKit = createSolanaAgentKit({
      baseUrl: guardedBaseUrl(),
      tier: "pro",
      wallet: { key: payerKey(), network: "devnet", asset: "EURC" },
      transport: recordingTransport(sent),
    });

    const rotated = await walletKit.credits.rotateToken();

    expect(rotated.token.startsWith("clc_")).toBe(true);
    expect(rotated.token === token).toBe(false);
    const oldTokenKit = createSolanaAgentKit({
      baseUrl: guardedBaseUrl(),
      tier: "pro",
      credits: { token },
      transport: recordingTransport(sent),
    });
    const error = await rejectionOf(oldTokenKit.data.latestSlot());
    expect(error).toBeInstanceOf(CriptonPaymentError);
    const refusal = error as CriptonPaymentError;
    expect(refusal.code).toBe("credits-required");
    expect(refusal.reason).toBe("credits_invalid");
  }, 60_000);

  it("keeps every PAYMENT-SIGNATURE the kit sent under 8192 bytes", () => {
    const sizes = sent.flatMap((request) =>
      request.paymentSignatureBytes === null ? [] : [request.paymentSignatureBytes],
    );

    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeLessThan(PAYMENT_SIGNATURE_LIMIT);
  });
});
