import { CriptonValidationError } from "./errors.js";

/** Shown in place of a credit token in every serialized form (design D8). */
export const REDACTED_TOKEN = "[redacted]";

// API grammar `clc_<kid>.<rid>.<rnd>.<mac>`: four base64url segments. The segments exclude the
// dot that separates them, so the pattern cannot backtrack (ReDoS-safe).
const CREDIT_TOKEN_FORMAT = /^clc_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
// API `Idempotency-Key`: 1 to 128 characters of [A-Za-z0-9._:-].
const IDEMPOTENCY_KEY_FORMAT = /^[A-Za-z0-9._:-]{1,128}$/;

/** The credit token when it has the API grammar; the error names the field, never the value. */
export function assertCreditToken(field: string, value: unknown): string {
  if (typeof value !== "string" || !CREDIT_TOKEN_FORMAT.test(value)) {
    throw new CriptonValidationError(field, `${field} must be a clc_ credit token`);
  }
  return value;
}

/** The idempotency key when the API accepts it (design D11). */
export function assertIdempotencyKey(field: string, value: unknown): string {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY_FORMAT.test(value)) {
    throw new CriptonValidationError(
      field,
      `${field} must be 1 to 128 characters of letters, digits, '.', '_', ':' or '-'`,
    );
  }
  return value;
}
