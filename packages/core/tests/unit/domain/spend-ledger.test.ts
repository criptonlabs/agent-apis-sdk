import { describe, expect, it } from "vite-plus/test";
import { CriptonPaymentError } from "../../../src/domain/errors.js";
import { SpendLedger } from "../../../src/domain/spend-ledger.js";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof CriptonPaymentError) return e.code;
    throw e;
  }
  return undefined;
}

describe("SpendLedger", () => {
  it("Price above the per-call cap", () => {
    const ledger = new SpendLedger({ maxPerCall: "0.01" });
    expect(codeOf(() => ledger.reserve("0.012"))).toBe("payment-over-cap");
  });

  it("Session budget exhausted", () => {
    const ledger = new SpendLedger({ maxPerCall: "0.012", sessionBudget: "0.03" });
    ledger.commit(ledger.reserve("0.012"));
    ledger.commit(ledger.reserve("0.012"));
    expect(ledger.spent).toBe("0.024");
    expect(codeOf(() => ledger.reserve("0.012"))).toBe("payment-budget-exhausted");
  });

  it("Concurrent calls cannot overspend the budget", () => {
    const ledger = new SpendLedger({ maxPerCall: "0.012", sessionBudget: "0.02" });
    const first = ledger.reserve("0.012");
    expect(typeof first).toBe("string");
    expect(codeOf(() => ledger.reserve("0.012"))).toBe("payment-budget-exhausted");
  });

  it("Price exactly at the cap", () => {
    const ledger = new SpendLedger({ maxPerCall: "0.012" });
    expect(typeof ledger.reserve("0.012")).toBe("string");
  });

  it("spent starts at 0", () => {
    expect(new SpendLedger({ maxPerCall: "1" }).spent).toBe("0");
  });

  it("commit moves the reserved amount to spent", () => {
    const ledger = new SpendLedger({ maxPerCall: "1" });
    ledger.commit(ledger.reserve("0.012"));
    expect(ledger.spent).toBe("0.012");
  });

  it("release frees the reservation so a new reserve passes", () => {
    const ledger = new SpendLedger({ maxPerCall: "0.012", sessionBudget: "0.012" });
    const id = ledger.reserve("0.012");
    expect(codeOf(() => ledger.reserve("0.012"))).toBe("payment-budget-exhausted");
    ledger.release(id);
    expect(ledger.spent).toBe("0");
    expect(typeof ledger.reserve("0.012")).toBe("string");
  });
});
