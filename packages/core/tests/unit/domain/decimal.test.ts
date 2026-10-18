import { describe, expect, it } from "vite-plus/test";
import { assertDecimal } from "../../../src/domain/decimal.js";
import { CriptonValidationError } from "../../../src/domain/errors.js";

describe("assertDecimal", () => {
  it("Float amount rejected locally", () => {
    let caught: unknown;
    try {
      assertDecimal("amount", 0.5);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CriptonValidationError);
    expect((caught as CriptonValidationError).code).toBe("invalid-input");
    expect((caught as CriptonValidationError).field).toBe("amount");
  });

  it.each(["10", "0.012"])("returns valid string %s unchanged", (v) => {
    expect(assertDecimal("amount", v)).toBe(v);
  });

  it.each(["0", "0.0", "-1", "1e3", "", " 1"])("rejects invalid string %j", (v) => {
    expect(() => assertDecimal("amount", v)).toThrow(CriptonValidationError);
  });
});
