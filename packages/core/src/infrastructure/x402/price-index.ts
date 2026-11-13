import type { CreditBalance, PriceIndex, PriceIndexEntry } from "../../application/ports.js";
import { assertDecimal } from "../../domain/decimal.js";

type IndexPrice = PriceIndexEntry["prices"][number];

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

/** The credit debit per denomination; unreadable pairs are left out, none at all is `null`. */
function debitOf(value: unknown): CreditBalance | null {
  const debit = record(value);
  if (debit === undefined) return null;
  const pairs = Object.entries(debit)
    .map(([denomination, units]) => [denomination, decimalOf(units)] as const)
    .filter((pair): pair is readonly [string, string] => pair[1] !== undefined);
  return pairs.length > 0 ? Object.freeze(Object.fromEntries(pairs)) : null;
}

function entryOf(value: unknown): PriceIndexEntry | undefined {
  const route = record(value);
  if (route === undefined || typeof route.resource !== "string") return undefined;
  if (typeof route.mode !== "string") return undefined;
  return {
    resource: route.resource,
    mode: route.mode,
    debit: debitOf(route.debit),
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
