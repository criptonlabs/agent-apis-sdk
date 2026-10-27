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

/** Drops members whose value is undefined, so the JSON never carries empty keys. */
function defined(members: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(members).filter(([, value]) => value !== undefined));
}

export abstract class CriptonKitError extends Error {
  abstract readonly code: string;

  /** Members serialized under `details`; each subclass exposes its own. */
  protected detailMembers(): Record<string, unknown> {
    return {};
  }

  /** Top-level JSON members besides `code` and `message`. */
  protected topMembers(): Record<string, unknown> {
    return {};
  }

  toJSON(): KitErrorJson {
    const json: KitErrorJson = {
      code: this.code,
      message: this.message,
      ...(defined(this.topMembers()) as Pick<KitErrorJson, "status" | "retryAfterSeconds">),
    };
    const details = defined(this.detailMembers());
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

  protected override detailMembers(): Record<string, unknown> {
    return { field: this.field };
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

  protected override topMembers(): Record<string, unknown> {
    return { status: this.status, retryAfterSeconds: this.retryAfterSeconds };
  }

  protected override detailMembers(): Record<string, unknown> {
    return { instance: this.instance, reason: this.reason, prepaidOffer: this.prepaidOffer };
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

  protected override detailMembers(): Record<string, unknown> {
    return { options: this.options, reason: this.reason, prepaidOffer: this.prepaidOffer };
  }
}

export abstract class CriptonRefusalError extends CriptonKitError {
  protected override detailMembers(): Record<string, unknown> {
    const data = this as unknown as Record<string, unknown>;
    return {
      reasons: data.reasons,
      warnings: data.warnings,
      checksFailed: data.checksFailed,
      quote: data.quote,
    };
  }
}

export class MissingPeerDependencyError extends CriptonKitError {
  readonly code = "missing-peer-dependency";
  constructor(readonly packageName: string) {
    super(`Missing optional peer dependency: ${packageName}`);
  }

  protected override detailMembers(): Record<string, unknown> {
    return { packageName: this.packageName };
  }
}
