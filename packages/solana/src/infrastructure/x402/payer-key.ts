import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { getBase58Encoder } from "@solana/kit";

const SECRET_KEY_LENGTH = 64;

function isByte(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 255;
}

function fromJsonArray(text: string): Uint8Array | null {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || !parsed.every(isByte)) return null;
  return Uint8Array.from(parsed);
}

function decode(text: string): Uint8Array | null {
  if (text.startsWith("[")) return fromJsonArray(text);
  return Uint8Array.from(getBase58Encoder().encode(text));
}

function tryDecode(text: string): Uint8Array | null {
  try {
    return decode(text);
  } catch {
    return null;
  }
}

/** Parses a 64-byte Solana secret key from base58 text or a JSON array; never echoes the value. */
export function parsePayerKey(raw: string, field: string): Uint8Array {
  const bytes = tryDecode(raw.trim());
  if (bytes === null || bytes.length !== SECRET_KEY_LENGTH) {
    throw new CriptonValidationError(field, `${field} is not a valid Solana secret key`);
  }
  return bytes;
}
