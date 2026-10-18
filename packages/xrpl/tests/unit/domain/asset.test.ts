import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { parseAsset } from "../../../src/domain/asset.js";

const ISSUER = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const RLUSD_HEX = "524C555344000000000000000000000000000000";

function catchError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

function expectInvalid(value: unknown): void {
  const error = catchError(() => parseAsset("asset", value));
  expect(error).toBeInstanceOf(CriptonValidationError);
  expect((error as CriptonValidationError).code).toBe("invalid-input");
  expect((error as CriptonValidationError).field).toBe("asset");
}

describe("asset parsing", () => {
  it("Invalid asset rejected locally", () => {
    expectInvalid("USD");
  });

  it("parses XRP", () => {
    expect(parseAsset("asset", "XRP")).toEqual({ kind: "xrp" });
  });

  it("parses a three-character issued currency", () => {
    expect(parseAsset("asset", `USD.${ISSUER}`)).toEqual({
      kind: "issued",
      code: "USD",
      currency: "USD",
      issuer: ISSUER,
    });
  });

  it("converts a longer ASCII code to the 40-hex transaction currency", () => {
    expect(parseAsset("asset", `RLUSD.${RLUSD_ISSUER}`)).toEqual({
      kind: "issued",
      code: "RLUSD",
      currency: RLUSD_HEX,
      issuer: RLUSD_ISSUER,
    });
  });

  it("keeps a 40-hex code unchanged", () => {
    expect(parseAsset("asset", `${RLUSD_HEX}.${RLUSD_ISSUER}`)).toEqual({
      kind: "issued",
      code: RLUSD_HEX,
      currency: RLUSD_HEX,
      issuer: RLUSD_ISSUER,
    });
  });

  it("rejects an invalid issuer", () => {
    expectInvalid("USD.not-an-issuer");
  });

  it("rejects a non-string asset", () => {
    expectInvalid(undefined);
  });
});
