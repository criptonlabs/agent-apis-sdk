import { CriptonValidationError } from "@criptonlabs/agent-apis-core";

const CLASSIC_ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const MAX_DESTINATION_TAG = 4294967295;
const MAX_DEPTH = 9007199254740991;
const HEX_64 = /^[0-9A-Fa-f]{64}$/;
const MAX_CREDENTIALS = 8;
const WINDOWS = ["1h", "24h", "7d"] as const;

export function assertClassicAddress(field: string, value: unknown): string {
  if (typeof value !== "string" || !CLASSIC_ADDRESS.test(value)) {
    throw new CriptonValidationError(field, `${field} must be a classic XRPL address`);
  }
  return value;
}

export function assertDestinationTag(field: string, value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_DESTINATION_TAG
  ) {
    throw new CriptonValidationError(field, `${field} must be an integer from 0 to 4294967295`);
  }
  return value;
}

export function assertDepth(field: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new CriptonValidationError(
      field,
      `${field} must be a positive integer no larger than ${MAX_DEPTH}`,
    );
  }
  return value;
}

export function assertDomainId(field: string, value: unknown): string {
  if (typeof value !== "string" || !HEX_64.test(value)) {
    throw new CriptonValidationError(field, `${field} must be 64 hexadecimal characters`);
  }
  return value;
}

export function assertSide(field: string, value: unknown): "buy" | "sell" {
  if (value !== "buy" && value !== "sell") {
    throw new CriptonValidationError(field, `${field} must be buy or sell`);
  }
  return value;
}

export function assertCredentials(field: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CREDENTIALS) {
    throw new CriptonValidationError(
      field,
      `${field} must be 1 to ${MAX_CREDENTIALS} credential ids`,
    );
  }
  const ids = value.map((id) => assertDomainId(field, id));
  if (new Set(ids.map((id) => id.toUpperCase())).size !== ids.length) {
    throw new CriptonValidationError(field, `${field} must not repeat a credential id`);
  }
  return ids;
}

export function assertHistoryWindow(field: string, value: unknown): "1h" | "24h" | "7d" {
  const found = WINDOWS.find((window) => window === value);
  if (found === undefined) {
    throw new CriptonValidationError(field, `${field} must be one of 1h, 24h, 7d`);
  }
  return found;
}

export function assertLimit(field: string, value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new CriptonValidationError(field, `${field} must be an integer from ${min} to ${max}`);
  }
  return value;
}
