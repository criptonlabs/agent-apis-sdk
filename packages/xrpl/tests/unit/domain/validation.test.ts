import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import {
  assertClassicAddress,
  assertDepth,
  assertDestinationTag,
  assertHistoryWindow,
} from "../../../src/domain/validation.js";

function catchError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

function expectInvalid(run: () => unknown, field: string): void {
  const error = catchError(run);
  expect(error).toBeInstanceOf(CriptonValidationError);
  expect((error as CriptonValidationError).code).toBe("invalid-input");
  expect((error as CriptonValidationError).field).toBe(field);
}

describe("classic address validation", () => {
  it("Invalid address rejected locally", () => {
    expectInvalid(() => assertClassicAddress("address", "not-an-address"), "address");
  });

  it("returns a valid classic address unchanged", () => {
    expect(assertClassicAddress("address", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh")).toBe(
      "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
    );
  });

  it("rejects a non-string address", () => {
    expectInvalid(() => assertClassicAddress("address", 42), "address");
  });
});

describe("destination tag validation", () => {
  it("Destination tag out of range", () => {
    expectInvalid(() => assertDestinationTag("destinationTag", 4294967296), "destinationTag");
  });

  it("accepts the bounds 0 and 4294967295", () => {
    expect(assertDestinationTag("destinationTag", 0)).toBe(0);
    expect(assertDestinationTag("destinationTag", 4294967295)).toBe(4294967295);
  });

  it.each([-1, 1.5, "12"])("rejects %j", (value) => {
    expectInvalid(() => assertDestinationTag("destinationTag", value), "destinationTag");
  });
});

describe("depth validation", () => {
  it.each([10, 50, 100, 200] as const)("accepts depth %i", (depth) => {
    expect(assertDepth("depth", depth)).toBe(depth);
  });

  it.each([0, 25, 201, "10", 10.5])("rejects depth %j", (value) => {
    expectInvalid(() => assertDepth("depth", value), "depth");
  });
});

describe("history window validation", () => {
  it.each(["1h", "24h", "7d"] as const)("accepts window %s", (window) => {
    expect(assertHistoryWindow("window", window)).toBe(window);
  });

  it.each(["30d", "1d", "", 24])("rejects window %j", (value) => {
    expectInvalid(() => assertHistoryWindow("window", value), "window");
  });
});
