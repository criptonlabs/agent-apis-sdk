import { CriptonPaymentError } from "./errors.js";
import { add, cmp, sub } from "./money.js";

export interface SpendLimits {
  maxPerCall: string;
  sessionBudget?: string;
}

export class SpendLedger {
  private spentTotal = "0";
  private reservedTotal = "0";
  private readonly reservations = new Map<string, string>();
  private counter = 0;

  constructor(readonly limits: SpendLimits) {}

  reserve(amount: string): string {
    if (cmp(amount, this.limits.maxPerCall) > 0) {
      throw new CriptonPaymentError("payment-over-cap", []);
    }
    const { sessionBudget } = this.limits;
    if (
      sessionBudget !== undefined &&
      cmp(add(add(this.spentTotal, this.reservedTotal), amount), sessionBudget) > 0
    ) {
      throw new CriptonPaymentError("payment-budget-exhausted", []);
    }
    this.counter += 1;
    const id = `reservation-${this.counter}`;
    this.reservations.set(id, amount);
    this.reservedTotal = add(this.reservedTotal, amount);
    return id;
  }

  commit(id: string): void {
    const amount = this.take(id);
    if (amount === undefined) return;
    this.spentTotal = add(this.spentTotal, amount);
  }

  release(id: string): void {
    this.take(id);
  }

  get spent(): string {
    return this.spentTotal;
  }

  private take(id: string): string | undefined {
    const amount = this.reservations.get(id);
    if (amount === undefined) return undefined;
    this.reservations.delete(id);
    this.reservedTotal = sub(this.reservedTotal, amount);
    return amount;
  }
}
