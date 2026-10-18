import { CriptonValidationError } from "./errors.js";
import { isDecimal } from "./money.js";

export function assertDecimal(field: string, value: unknown): string {
  if (!isDecimal(value)) {
    throw new CriptonValidationError(field, `${field} must be a positive decimal string`);
  }
  return value;
}
