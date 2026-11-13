import { assertDecimal } from "./decimal.js";

/** Denomination to decimal units, as reported by `X-Credits-Remaining`. */
export type CreditUnits = Readonly<Record<string, string>>;

// One `<denomination>=<units>` pair; the denomination is a currency code such as EUR or USD.
const PAIR = /^([A-Z]+)=([^=;]+)$/;
// An exhausted pocket, which the positive-decimal check refuses (no nested quantifiers).
const ZERO_UNITS = /^(?:0+|0+\.0+)$/;

/** A decimal amount of credit units, zero included (an exhausted pocket). */
export function isUnits(value: string): boolean {
  if (ZERO_UNITS.test(value)) return true;
  try {
    assertDecimal("units", value);
    return true;
  } catch {
    return false;
  }
}

function pairOf(part: string): readonly [string, string] | null {
  const match = PAIR.exec(part);
  const denomination = match?.[1];
  const units = match?.[2];
  if (denomination === undefined || units === undefined || !isUnits(units)) return null;
  return [denomination, units];
}

/**
 * Parses `X-Credits-Remaining` (`EUR=1.9995;USD=0`, pairs separated by `;`) into decimal units per
 * denomination (design D6). A missing header or any malformed pair yields `null`, never an error.
 */
export function parseCreditBalance(header: string | null): CreditUnits | null {
  if (header === null) return null;
  const pairs = header.split(";").map(pairOf);
  const valid = pairs.filter((pair): pair is readonly [string, string] => pair !== null);
  if (valid.length !== pairs.length) return null;
  return Object.freeze(Object.fromEntries(valid));
}
