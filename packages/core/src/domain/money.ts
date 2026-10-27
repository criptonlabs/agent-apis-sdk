import Big from "big.js";

Big.DP = 40;
Big.RM = 1;

// Unsigned decimal, no nested quantifiers (ReDoS-safe); a non-zero digit makes it positive.
const DECIMAL_FORMAT = /^(?:[0-9]+|[0-9]+\.[0-9]+)$/;
const NON_ZERO_DIGIT = /[1-9]/;

function out(value: Big): string {
  const text = value.toFixed();
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

export function isDecimal(v: unknown): v is string {
  return typeof v === "string" && DECIMAL_FORMAT.test(v) && NON_ZERO_DIGIT.test(v);
}

export function cmp(a: string, b: string): -1 | 0 | 1 {
  return new Big(a).cmp(new Big(b)) as -1 | 0 | 1;
}

export function add(a: string, b: string): string {
  return out(new Big(a).plus(new Big(b)));
}

export function sub(a: string, b: string): string {
  return out(new Big(a).minus(new Big(b)));
}

export function mulPow10(value: string, exp: number): string {
  const result = new Big(value).times(new Big(10).pow(exp));
  if (!result.round(0, 0).eq(result)) {
    throw new RangeError(`Result of ${value} * 10^${exp} is not an integer`);
  }
  return out(result);
}

export function addPercentFloor(value: string, pct: string, significantDigits: number): string {
  const raw = new Big(value).times(new Big(1).plus(new Big(pct).div(100)));
  if (raw.eq(0)) return "0";
  const magnitude = raw.abs().e; // exponent of the most significant digit
  const decimals = significantDigits - 1 - magnitude;
  return out(raw.round(decimals, 0));
}

export function maxDecimals(value: string): number {
  return Math.max(0, new Big(value).c.length - 1 - new Big(value).e);
}
