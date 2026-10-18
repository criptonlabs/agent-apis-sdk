import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { assertClassicAddress } from "./validation.js";

export type ParsedAsset =
  | { kind: "xrp" }
  | { kind: "issued"; code: string; currency: string; issuer: string };

const HEX_CURRENCY = /^[0-9A-Fa-f]{40}$/;
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

function invalid(field: string): CriptonValidationError {
  return new CriptonValidationError(field, `${field} must be XRP or <currency>.<issuer>`);
}

function toCurrency(field: string, code: string): string {
  if (HEX_CURRENCY.test(code)) return code.toUpperCase();
  if (!PRINTABLE_ASCII.test(code)) throw invalid(field);
  if (code.length === 3) {
    if (code === "XRP") throw invalid(field);
    return code;
  }
  if (code.length >= 4 && code.length <= 20) {
    let hex = "";
    for (let i = 0; i < code.length; i++) {
      hex += code.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return hex.toUpperCase().padEnd(40, "0");
  }
  throw invalid(field);
}

/** Parses `XRP` or `<currency>.<issuer>`; `currency` is the transaction form (3 chars or 40-hex). */
export function parseAsset(field: string, value: unknown): ParsedAsset {
  if (typeof value !== "string") throw invalid(field);
  if (value === "XRP") return { kind: "xrp" };
  const dot = value.lastIndexOf(".");
  if (dot <= 0) throw invalid(field);
  const code = value.slice(0, dot);
  const issuer = value.slice(dot + 1);
  try {
    assertClassicAddress(field, issuer);
  } catch {
    throw invalid(field);
  }
  return { kind: "issued", code, currency: toCurrency(field, code), issuer };
}
