import type { PriceIndex, PriceIndexEntry } from "../../application/ports.js";
import { assertDecimal } from "../../domain/decimal.js";

type IndexPrice = PriceIndexEntry["prices"][number];
type IndexDenomination = PriceIndexEntry["denominations"][number];

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** A positive decimal string checked by `decimal.ts`, or `undefined` when unreadable. */
function decimalOf(value: unknown): string | undefined {
  try {
    return assertDecimal("amount", value);
  } catch {
    return undefined;
  }
}

/** The optional string members of a price; any other value is left out. */
function optionalStrings(price: Record<string, unknown>): Omit<IndexPrice, "amount" | "asset"> {
  return {
    ...(typeof price.network === "string" ? { network: price.network } : {}),
    ...(typeof price.mint === "string" ? { mint: price.mint } : {}),
    ...(typeof price.issuer === "string" ? { issuer: price.issuer } : {}),
    ...(typeof price.currency === "string" ? { currency: price.currency } : {}),
  };
}

function priceOf(value: unknown): IndexPrice | undefined {
  const price = record(value);
  const amount = decimalOf(price?.amount);
  if (price === undefined || amount === undefined || typeof price.asset !== "string") {
    return undefined;
  }
  return { amount, asset: price.asset, ...optionalStrings(price) };
}

/** The readable per-call prices; a credits-only route has none. */
function pricesOf(value: unknown): IndexPrice[] {
  if (!Array.isArray(value)) return [];
  return value.map(priceOf).filter((p): p is IndexPrice => p !== undefined);
}

function denominationOf(value: unknown): IndexDenomination | undefined {
  const entry = record(value);
  const debit = decimalOf(entry?.debit);
  if (entry === undefined || debit === undefined || typeof entry.denomination !== "string") {
    return undefined;
  }
  const calls = entry.approx_calls;
  return {
    denomination: entry.denomination,
    debit,
    ...(Number.isInteger(calls) ? { approxCalls: calls as number } : {}),
  };
}

/** The readable denominations in the API's order; none at all gives `[]`. */
function denominationsOf(value: unknown): IndexDenomination[] {
  if (!Array.isArray(value)) return [];
  return value.map(denominationOf).filter((d): d is IndexDenomination => d !== undefined);
}

function entryOf(value: unknown): PriceIndexEntry | undefined {
  const route = record(value);
  if (route === undefined || typeof route.resource !== "string") return undefined;
  if (typeof route.mode !== "string") return undefined;
  return {
    resource: route.resource,
    mode: route.mode,
    denominations: denominationsOf(route.denominations),
    prices: pricesOf(route.prices),
  };
}

/**
 * Maps the body of `GET /v1/pro/requirements` (no `resource`) to the price index (design D12).
 * An unreadable route or price is left out, so one bad entry never fails the whole read.
 */
export function toPriceIndex(body: unknown): PriceIndex {
  const index = record(body) ?? {};
  const mode = index.payments_mode;
  const routes = Array.isArray(index.routes) ? index.routes : [];
  return {
    paymentsMode: typeof mode === "string" ? mode : null,
    routes: routes.map(entryOf).filter((e): e is PriceIndexEntry => e !== undefined),
  };
}
