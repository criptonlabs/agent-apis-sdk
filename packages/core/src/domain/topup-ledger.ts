import { CriptonPaymentError } from "./errors.js";
import { add, cmp, sub } from "./money.js";

/**
 * The process's top-up spend (design D7), apart from the session's per-call `SpendLedger`: each
 * purchase is capped by its own maximum and all purchases share the optional top-up budget.
 */
export class TopupLedger {
  #spent = "0";
  #reserved = "0";
  readonly #reservations = new Map<string, string>();
  #counter = 0;

  constructor(private readonly budget?: string) {}

  /** Reserves a purchase within its maximum and the remaining budget; refused, nothing is reserved. */
  reserve(amount: string, maxAmount: string): string {
    if (cmp(amount, maxAmount) > 0) {
      throw new CriptonPaymentError("payment-over-cap", []);
    }
    const { budget } = this;
    if (budget !== undefined && cmp(add(add(this.#spent, this.#reserved), amount), budget) > 0) {
      throw new CriptonPaymentError("payment-budget-exhausted", []);
    }
    this.#counter += 1;
    const id = `topup-${this.#counter}`;
    this.#reservations.set(id, amount);
    this.#reserved = add(this.#reserved, amount);
    return id;
  }

  /** Counts a reserved purchase as spent; an unknown or settled reservation changes nothing. */
  commit(id: string): void {
    const amount = this.take(id);
    if (amount === undefined) return;
    this.#spent = add(this.#spent, amount);
  }

  /** Frees a reserved purchase; an unknown or settled reservation changes nothing. */
  release(id: string): void {
    this.take(id);
  }

  get spent(): string {
    return this.#spent;
  }

  private take(id: string): string | undefined {
    const amount = this.#reservations.get(id);
    if (amount === undefined) return undefined;
    this.#reservations.delete(id);
    this.#reserved = sub(this.#reserved, amount);
    return amount;
  }
}
