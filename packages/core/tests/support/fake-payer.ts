import type { X402Payer } from "../../src/application/ports.js";
import type { PaymentOption } from "../../src/domain/payment-option.js";

export interface FakePayerOptions {
  selectOption?: (accepts: readonly PaymentOption[]) => PaymentOption | null;
  delayMs?: number;
  secret?: string;
}

/** Fixed-signature payer; records what it signed and never exposes its secret. */
export class FakePayer implements X402Payer {
  readonly signed: PaymentOption[] = [];
  readonly requirements: unknown[] = [];
  readonly #secret: string | undefined;
  readonly #select: (accepts: readonly PaymentOption[]) => PaymentOption | null;
  readonly #delayMs: number;

  constructor(options: FakePayerOptions = {}) {
    this.#secret = options.secret;
    this.#select = options.selectOption ?? ((accepts) => accepts[0] ?? null);
    this.#delayMs = options.delayMs ?? 0;
  }

  selectOption(accepts: readonly PaymentOption[]): PaymentOption | null {
    return this.#select(accepts);
  }

  async createPaymentHeaders(
    paymentRequired: unknown,
    option: PaymentOption,
  ): Promise<Record<string, string>> {
    if (this.#delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.#delayMs));
    this.requirements.push(paymentRequired);
    this.signed.push(option);
    void this.#secret;
    return { "PAYMENT-SIGNATURE": "fake-signature" };
  }
}
