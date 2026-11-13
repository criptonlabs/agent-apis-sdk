import type { PaymentOption } from "../../domain/payment-option.js";
import type { PrepaidOffer } from "../../domain/prepaid-offer.js";
import { readPrepaidOffer } from "./prepaid-offer.js";

export interface PriceLookupResult {
  paymentsMode: string | null;
  options: PaymentOption[];
  prepaidOffer: PrepaidOffer | null;
}

/** Maps the body of `GET /v1/pro/requirements?resource=` to a lookup result. */
export function toPriceLookup(body: unknown): PriceLookupResult {
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const mode = record.payments_mode;
  const accepts = record.accepts;
  return {
    paymentsMode: typeof mode === "string" ? mode : null,
    options: Array.isArray(accepts) ? (accepts as PaymentOption[]) : [],
    prepaidOffer: readPrepaidOffer(record.extensions) ?? null,
  };
}
