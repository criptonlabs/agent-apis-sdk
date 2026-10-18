import { describe, expect, it } from "vite-plus/test";
import {
  CriptonNetworkError,
  CriptonPaymentError,
  CriptonProblemError,
  CriptonRefusalError,
  CriptonResponseError,
  CriptonValidationError,
} from "../../../src/domain/errors.js";
import { exitCodeFor } from "../../../src/interfaces/cli/exit-codes.js";
import { toElizaResult } from "../../../src/interfaces/eliza/result.js";

class TestRefusal extends CriptonRefusalError {
  readonly code = "payment-not-ready";
}

describe("toElizaResult", () => {
  it("success carries data and text", () => {
    const result = toElizaResult({ ok: true, value: { a: 1 } });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ a: 1 });
    expect(typeof result.text).toBe("string");
  });

  it("kit error becomes the KitErrorJson text", () => {
    const error = new CriptonProblemError("upstream-unavailable", 503, "Service Unavailable");
    const result = toElizaResult({ ok: false, error });
    expect(result.success).toBe(false);
    expect(result.text).toBe(JSON.stringify(error.toJSON()));
  });

  it("plain error becomes internal-error", () => {
    const result = toElizaResult({ ok: false, error: new Error("boom") });
    expect(result.success).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({ code: "internal-error" });
    expect(result.text).not.toContain("stack");
    expect(result.text).not.toContain("boom");
    expect(result.text).not.toContain("Error: boom");
    expect(result.text).not.toMatch(/\\n\s+at /);
    expect(result.text).not.toMatch(/\bat\s+\S+\s+\(/);
  });
});

describe("exitCodeFor", () => {
  it("invalid-input -> 2", () => {
    expect(exitCodeFor(new CriptonValidationError("f", "bad"))).toBe(2);
  });
  it("payment error -> 3", () => {
    expect(exitCodeFor(new CriptonPaymentError("payment-disabled", []))).toBe(3);
  });
  it("refusal error -> 3", () => {
    expect(exitCodeFor(new TestRefusal("no"))).toBe(3);
  });
  it("problem error -> 4", () => {
    expect(exitCodeFor(new CriptonProblemError("not-found", 404))).toBe(4);
  });
  it("response error -> 4", () => {
    expect(exitCodeFor(new CriptonResponseError("bad body"))).toBe(4);
  });
  it("network error -> 5", () => {
    expect(exitCodeFor(new CriptonNetworkError("timeout", "slow"))).toBe(5);
  });
  it("anything else -> 1", () => {
    expect(exitCodeFor(new Error("x"))).toBe(1);
  });
});
