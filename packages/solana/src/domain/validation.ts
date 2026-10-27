import { CriptonValidationError } from "@criptonlabs/agent-apis-core";

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const PUBLIC_KEY_BYTES = 32;
const HISTORY_WINDOWS: readonly string[] = ["1h", "24h", "7d"];

function leadingOnes(value: string): number {
  let count = 0;
  while (count < value.length && value[count] === "1") count += 1;
  return count;
}

function base58ToBigInt(value: string): bigint {
  let total = 0n;
  for (const char of value) {
    total = total * 58n + BigInt(BASE58_ALPHABET.indexOf(char));
  }
  return total;
}

function byteLength(value: bigint): number {
  let bytes = 0;
  for (let rest = value; rest > 0n; rest >>= 8n) bytes += 1;
  return bytes;
}

/** Decoded length of an already alphabet-checked base58 string. */
function decodedLength(value: string): number {
  return leadingOnes(value) + byteLength(base58ToBigInt(value));
}

function isSolanaAddress(value: unknown): value is string {
  return (
    typeof value === "string" &&
    BASE58_ADDRESS.test(value) &&
    decodedLength(value) === PUBLIC_KEY_BYTES
  );
}

export function assertSolanaAddress(field: string, value: unknown): string {
  if (!isSolanaAddress(value)) {
    throw new CriptonValidationError(field, `${field} must be a Solana address`);
  }
  return value;
}

/** A mint is a Solana address or the literal `SOL` (native transfers). */
export function assertMint(field: string, value: unknown): string {
  if (value === "SOL" || isSolanaAddress(value)) return value;
  throw new CriptonValidationError(field, `${field} must be SOL or a Solana mint address`);
}

export function assertHistoryWindow(field: string, value: unknown): "1h" | "24h" | "7d" {
  if (typeof value !== "string" || !HISTORY_WINDOWS.includes(value)) {
    throw new CriptonValidationError(field, `${field} must be one of 1h, 24h, 7d`);
  }
  return value as "1h" | "24h" | "7d";
}
