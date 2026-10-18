import { describe, expect, it } from "vite-plus/test";
import {
  CriptonPaymentError,
  CriptonProblemError,
  CriptonRefusalError,
} from "../../../src/domain/errors.js";
import { addPercentFloor } from "../../../src/domain/money.js";
import { SpendLedger } from "../../../src/domain/spend-ledger.js";

const roundTrip = (e: unknown) => JSON.parse(JSON.stringify(e));

class TestRefusal extends CriptonRefusalError {
  readonly code = "test-refusal";
  constructor(readonly extra: Record<string, unknown> = {}) {
    super("refused");
    Object.assign(this, extra);
  }
}

describe("error serialization: refusals and absent fields", () => {
  it("a refusal carries its data fields under details", () => {
    const json = roundTrip(
      new TestRefusal({
        reasons: ["source_line_missing"],
        warnings: ["w"],
        checksFailed: ["trust_line"],
        quote: { filled: "1" },
      }),
    );
    expect(json).toEqual({
      code: "test-refusal",
      message: "refused",
      details: {
        reasons: ["source_line_missing"],
        warnings: ["w"],
        checksFailed: ["trust_line"],
        quote: { filled: "1" },
      },
    });
  });

  it("a refusal without data fields has no details", () => {
    expect(roundTrip(new TestRefusal())).toEqual({ code: "test-refusal", message: "refused" });
  });

  it("a problem error omits status-less optional fields (no retryAfterSeconds, instance or details)", () => {
    expect(roundTrip(new CriptonProblemError("not-found", 404))).toEqual({
      code: "not-found",
      message: "not-found",
      status: 404,
    });
  });

  it("a payment error keeps an empty options list in details", () => {
    expect(roundTrip(new CriptonPaymentError("payment-disabled", []))).toEqual({
      code: "payment-disabled",
      message: "payment-disabled",
      details: { options: [] },
    });
  });
});

describe("SpendLedger reservation lifecycle", () => {
  it("committing an unknown id changes nothing", () => {
    const ledger = new SpendLedger({ maxPerCall: "0.05" });
    ledger.commit("reservation-999");
    expect(ledger.spent).toBe("0");
  });

  it("committing the same reservation twice counts it once", () => {
    const ledger = new SpendLedger({ maxPerCall: "0.05" });
    const id = ledger.reserve("0.012");
    ledger.commit(id);
    ledger.commit(id);
    expect(ledger.spent).toBe("0.012");
  });

  it("releasing returns the budget and does not count as spent", () => {
    const ledger = new SpendLedger({ maxPerCall: "0.05", sessionBudget: "0.05" });
    const id = ledger.reserve("0.05");
    expect(() => ledger.reserve("0.01")).toThrow(CriptonPaymentError);
    ledger.release(id);
    expect(ledger.spent).toBe("0");
    expect(() => ledger.reserve("0.05")).not.toThrow();
  });

  it("releasing an unknown or already settled id is a no-op", () => {
    const ledger = new SpendLedger({ maxPerCall: "0.05", sessionBudget: "0.05" });
    const id = ledger.reserve("0.03");
    ledger.commit(id);
    ledger.release(id);
    ledger.release("reservation-999");
    expect(ledger.spent).toBe("0.03");
    expect(() => ledger.reserve("0.05")).toThrow(CriptonPaymentError);
    expect(() => ledger.reserve("0.02")).not.toThrow();
  });
});

describe("money", () => {
  it("addPercentFloor of zero is zero", () => {
    expect(addPercentFloor("0", "10", 4)).toBe("0");
  });
});
