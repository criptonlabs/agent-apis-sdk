import type { ScriptedResponse } from "./fake-transport.js";
import type { PaymentOption } from "../../src/domain/payment-option.js";

export const RLUSD_HEX = "524C555344000000000000000000000000000000";
export const PAY_TO = "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH";
export const PAYER = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
export const FEE_URL = "https://api.criptonlabs.com/v1/pro/xrpl/fee";
export const TX_HASH = "A".repeat(64);

export const feeBody = {
  fee: { economy: "10", standard: "10", priority: "11" },
  meta: {
    ledger_index: 100,
    as_of: "2026-10-18T10:00:00Z",
    age_seconds: 1,
    cache: "miss",
    stale: false,
  },
};

export function xrplOption(amount = "0.012"): PaymentOption {
  return {
    scheme: "exact",
    network: "xrpl:0",
    asset: RLUSD_HEX,
    amount,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: {
      issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
      areFeesSponsored: false,
      sourceTag: 1,
      invoiceId: "B".repeat(64),
    },
  };
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

export function problem(
  slug: string,
  status: number,
  headers: Record<string, string> = {},
): ScriptedResponse {
  return {
    status,
    headers: { "content-type": "application/problem+json", ...headers },
    body: {
      type: `https://api.criptonlabs.com/errors/${slug}.md`,
      title: slug,
      status,
      detail: `${slug} detail`,
      instance: "/v1/pro/xrpl/fee",
    },
  };
}

export function challenge(option: PaymentOption): ScriptedResponse {
  const required = {
    x402Version: 2,
    resource: {
      url: FEE_URL,
      description: "Current XRPL fee tiers.",
      mimeType: "application/json",
    },
    accepts: [option],
  };
  return { ...problem("payment-required", 402, { "PAYMENT-REQUIRED": b64(required) }) };
}

export function paid(): ScriptedResponse {
  return {
    status: 200,
    headers: {
      "PAYMENT-RESPONSE": b64({
        success: true,
        transaction: TX_HASH,
        network: "xrpl:0",
        payer: PAYER,
      }),
    },
    body: feeBody,
  };
}
