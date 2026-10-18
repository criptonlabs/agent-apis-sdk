import { CriptonValidationError } from "@criptonlabs/agent-apis-core";

const CLASSIC_ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const MAX_DESTINATION_TAG = 4294967295;
const DEPTHS = [10, 50, 100, 200] as const;
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

export function assertDepth(field: string, value: unknown): 10 | 50 | 100 | 200 {
  const found = DEPTHS.find((depth) => depth === value);
  if (found === undefined) {
    throw new CriptonValidationError(field, `${field} must be one of 10, 50, 100, 200`);
  }
  return found;
}

export function assertHistoryWindow(field: string, value: unknown): "1h" | "24h" | "7d" {
  const found = WINDOWS.find((window) => window === value);
  if (found === undefined) {
    throw new CriptonValidationError(field, `${field} must be one of 1h, 24h, 7d`);
  }
  return found;
}
