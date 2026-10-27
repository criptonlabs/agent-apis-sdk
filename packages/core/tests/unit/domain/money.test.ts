import { describe, expect, it } from "vite-plus/test";
import {
  add,
  addPercentFloor,
  cmp,
  divPow10,
  isDecimal,
  maxDecimals,
  mulPow10,
  sub,
} from "../../../src/domain/money.js";

describe("money", () => {
  it("add is exact where floats are not", () => {
    expect(add("0.1", "0.2")).toBe("0.3");
  });
  it("add strips trailing zeros", () => {
    expect(add("0.10", "0.20")).toBe("0.3");
  });
  it("add returns plain notation, never exponent form", () => {
    expect(add("0.0000001", "0.0000001")).toBe("0.0000002");
  });
  it("sub is exact", () => {
    expect(sub("0.03", "0.024")).toBe("0.006");
  });
  it("cmp orders and treats trailing zeros as equal", () => {
    expect(cmp("0.1", "0.2")).toBe(-1);
    expect(cmp("0.2", "0.1")).toBe(1);
    expect(cmp("0.2", "0.2")).toBe(0);
    expect(cmp("0.012", "0.0120")).toBe(0);
  });
  it("mulPow10 shifts exactly", () => {
    expect(mulPow10("10", 6)).toBe("10000000");
    expect(mulPow10("0.000001", 6)).toBe("1");
  });
  it("mulPow10 throws RangeError on a fractional result", () => {
    expect(() => mulPow10("0.0000001", 6)).toThrow(RangeError);
  });
  it("divPow10 shifts down exactly and trims trailing zeros", () => {
    expect(divPow10("14520", 6)).toBe("0.01452");
    expect(divPow10("1000000", 6)).toBe("1");
    expect(divPow10("0", 6)).toBe("0");
    expect(divPow10("5", 0)).toBe("5");
  });
  it("addPercentFloor adds the percentage at the given significant digits", () => {
    expect(addPercentFloor("1.394", "1", 15)).toBe("1.40794");
  });
  it("maxDecimals counts fractional digits", () => {
    expect(maxDecimals("0.000001")).toBe(6);
  });
  it("isDecimal accepts decimal strings only", () => {
    expect(isDecimal("10")).toBe(true);
    expect(isDecimal("0.012")).toBe(true);
    expect(isDecimal("0")).toBe(false);
    expect(isDecimal("-1")).toBe(false);
    expect(isDecimal("1e3")).toBe(false);
    expect(isDecimal(0.5)).toBe(false);
  });
});
