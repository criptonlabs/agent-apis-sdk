import type { PaymentOption } from "../../domain/payment-option.js";

export interface PriceLookupResult {
  paymentsMode: string | null;
  options: PaymentOption[];
}

/** Maps the body of `GET /v1/pro/requirements?resource=` to a lookup result. */
export function toPriceLookup(body: unknown): PriceLookupResult {
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const mode = record.payments_mode;
  const accepts = record.accepts;
  return {
    paymentsMode: typeof mode === "string" ? mode : null,
    options: Array.isArray(accepts) ? (accepts as PaymentOption[]) : [],
  };
}
