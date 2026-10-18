import {
  CriptonNetworkError,
  CriptonPaymentError,
  CriptonProblemError,
  CriptonRefusalError,
  CriptonResponseError,
  CriptonValidationError,
} from "../../domain/errors.js";

export function exitCodeFor(error: unknown): 1 | 2 | 3 | 4 | 5 {
  if (error instanceof CriptonValidationError) return 2;
  if (error instanceof CriptonPaymentError || error instanceof CriptonRefusalError) return 3;
  if (error instanceof CriptonProblemError || error instanceof CriptonResponseError) return 4;
  if (error instanceof CriptonNetworkError) return 5;
  return 1;
}
