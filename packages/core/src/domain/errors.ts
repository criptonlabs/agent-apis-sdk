import type { PaymentOptionSummary } from "./payment-option.js";
import type { PrepaidOffer } from "./prepaid-offer.js";

/** Prepaid signals of an API answer: the problem's `error` member and the prepaid offer. */
export interface PrepaidSignals {
  reason?: string;
  prepaidOffer?: PrepaidOffer;
}

export type KitErrorJson = {
  code: string;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
  details?: Record<string, unknown>;
};

export abstract class CriptonKitError extends Error {
  abstract readonly code: string;

  toJSON(): KitErrorJson {
    const json: KitErrorJson = { code: this.code, message: this.message };
    const details: Record<string, unknown> = {};
    if (this instanceof CriptonValidationError) details.field = this.field;
    if (this instanceof CriptonPaymentError) details.options = this.options;
    if (this instanceof MissingPeerDependencyError) details.packageName = this.packageName;
    if (this instanceof CriptonProblemError) {
      if (this.status !== undefined) json.status = this.status;
      if (this.retryAfterSeconds !== undefined) json.retryAfterSeconds = this.retryAfterSeconds;
      if (this.instance !== undefined) details.instance = this.instance;
    }
    if (this instanceof CriptonProblemError || this instanceof CriptonPaymentError) {
      if (this.reason !== undefined) details.reason = this.reason;
      if (this.prepaidOffer !== undefined) details.prepaidOffer = this.prepaidOffer;
    }
    if (this instanceof CriptonRefusalError) {
      const data = this as unknown as Record<string, unknown>;
      for (const key of ["reasons", "warnings", "checksFailed", "quote"]) {
        if (data[key] !== undefined) details[key] = data[key];
      }
    }
    if (Object.keys(details).length > 0) json.details = details;
    return json;
  }
}

export class CriptonValidationError extends CriptonKitError {
  readonly code = "invalid-input";
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

export class CriptonResponseError extends CriptonKitError {
  readonly code = "invalid-response";
}

export class CriptonProblemError extends CriptonKitError {
  readonly reason?: string;
  readonly prepaidOffer?: PrepaidOffer;

  constructor(
    readonly code: string,
    readonly status: number,
    readonly title?: string,
    readonly detail?: string,
    readonly instance?: string,
    readonly retryAfterSeconds?: number,
    signals: PrepaidSignals = {},
  ) {
    super(detail ?? title ?? code);
    if (signals.reason !== undefined) this.reason = signals.reason;
    if (signals.prepaidOffer !== undefined) this.prepaidOffer = signals.prepaidOffer;
  }
}

export class CriptonNetworkError extends CriptonKitError {
  constructor(
    readonly code: "timeout" | "network-error",
    message: string,
  ) {
    super(message);
  }
}

export class CriptonPaymentError extends CriptonKitError {
  readonly reason?: string;
  readonly prepaidOffer?: PrepaidOffer;

  constructor(
    readonly code:
      | "credits-required"
      | "payment-outcome-unknown"
      | "payment-disabled"
      | "no-supported-payment-option"
      | "payment-over-cap"
      | "payment-budget-exhausted",
    readonly options: readonly PaymentOptionSummary[],
    signals: PrepaidSignals = {},
  ) {
    super(code);
    if (signals.reason !== undefined) this.reason = signals.reason;
    if (signals.prepaidOffer !== undefined) this.prepaidOffer = signals.prepaidOffer;
  }
}

export abstract class CriptonRefusalError extends CriptonKitError {}

export class MissingPeerDependencyError extends CriptonKitError {
  readonly code = "missing-peer-dependency";
  constructor(readonly packageName: string) {
    super(`Missing optional peer dependency: ${packageName}`);
  }
}
