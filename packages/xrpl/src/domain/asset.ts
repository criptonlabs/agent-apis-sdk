import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { assertClassicAddress } from "./validation.js";

export type ParsedAsset =
  | { kind: "xrp" }
  | { kind: "issued"; code: string; currency: string; issuer: string }
  | { kind: "mpt"; issuanceId: string };

/** A 3-character standard code: letters, digits and `?!@#$%^&*<>(){}[]|`, case-sensitive. */
const STANDARD_CODE = /^[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}$/;
/** A 40-hex currency code, read in any case. */
const HEX_CODE = /^[0-9A-Fa-f]{40}$/;
/** The standard layout of a 40-hex code: zero bytes except bytes 12-14, which hold the code. */
const STANDARD_LAYOUT = /^0{24}([0-9A-F]{6})0{10}$/;
/** A 48-hex MPT issuance id, read in any case. */
const MPT_ID = /^[0-9A-Fa-f]{48}$/;

function invalid(field: string): CriptonValidationError {
  return new CriptonValidationError(
    field,
    `${field} must be XRP, CODE.issuer (a case-sensitive 3-character code or 40 hex characters) or, where allowed, a 48-hex MPT issuance id`,
  );
}

/** The 3-character code a standard-layout 40-hex code (upper case) holds; `undefined` otherwise. */
function standardCodeOf(hex: string): string | undefined {
  const bytes = STANDARD_LAYOUT.exec(hex)?.[1];
  if (bytes === undefined) return undefined;
  const code = String.fromCharCode(
    ...[0, 2, 4].map((i) => Number.parseInt(bytes.slice(i, i + 2), 16)),
  );
  return STANDARD_CODE.test(code) ? code : undefined;
}

/** The transaction form of a code: the 3-character code as given, or the canonical 40-hex form. */
function toCurrency(field: string, code: string): string {
  if (code !== "XRP" && STANDARD_CODE.test(code)) return code;
  if (!HEX_CODE.test(code)) throw invalid(field);
  const hex = code.toUpperCase();
  const standard = standardCodeOf(hex);
  if (standard === "XRP") throw invalid(field);
  return standard ?? hex;
}

/** `CODE.issuer`, split on the first dot. */
function parseIssued(field: string, value: string): ParsedAsset {
  const dot = value.indexOf(".");
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

/**
 * Parses `XRP`, `CODE.issuer` or, with `allowMpt`, a 48-hex MPT issuance id. `code` is kept as
 * given; `currency` is the transaction form (3 characters or upper-case 40-hex).
 */
export function parseAsset(
  field: string,
  value: unknown,
  options?: { allowMpt?: boolean },
): ParsedAsset {
  if (typeof value !== "string") throw invalid(field);
  if (value === "XRP") return { kind: "xrp" };
  if (!MPT_ID.test(value)) return parseIssued(field, value);
  if (options?.allowMpt !== true) throw invalid(field);
  return { kind: "mpt", issuanceId: value.toUpperCase() };
}
