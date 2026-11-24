import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { parseAsset } from "../../../src/domain/asset.js";

const ISSUER = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const RLUSD_HEX = "524C555344000000000000000000000000000000";
const BITSTAMP = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const USD_STANDARD_HEX = "0000000000000000000000005553440000000000";
const ALL_ZERO_HEX = "0000000000000000000000000000000000000000";
const MPT_ISSUANCE_ID = "0000012FFD9EE5DA93AC614B4DB94D7E0FCE415CA51BED47";

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

  it("refuses a text code longer than three characters", () => {
    expectInvalid(`RLUSD.${RLUSD_ISSUER}`);
  });

  it("keeps a 40-hex code unchanged", () => {
    expect(parseAsset("asset", `${RLUSD_HEX}.${RLUSD_ISSUER}`)).toEqual({
      kind: "issued",
      code: RLUSD_HEX,
      currency: RLUSD_HEX,
      issuer: RLUSD_ISSUER,
    });
  });

  it("keeps the case of a 3-character standard code", () => {
    expect(parseAsset("asset", `usd.${BITSTAMP}`)).toEqual({
      kind: "issued",
      code: "usd",
      currency: "usd",
      issuer: BITSTAMP,
    });
    expect(parseAsset("asset", `USD.${BITSTAMP}`)).toEqual({
      kind: "issued",
      code: "USD",
      currency: "USD",
      issuer: BITSTAMP,
    });
  });

  it("upper-cases a lower-case 40-hex code", () => {
    const lower = RLUSD_HEX.toLowerCase();
    expect(parseAsset("asset", `${lower}.${RLUSD_ISSUER}`)).toEqual({
      kind: "issued",
      code: lower,
      currency: RLUSD_HEX,
      issuer: RLUSD_ISSUER,
    });
  });

  it("canonicalizes a standard-layout 40-hex code to its 3-character code", () => {
    expect(parseAsset("asset", `${USD_STANDARD_HEX}.${BITSTAMP}`)).toEqual({
      kind: "issued",
      code: USD_STANDARD_HEX,
      currency: "USD",
      issuer: BITSTAMP,
    });
  });

  it("keeps an all-zero 40-hex code", () => {
    expect(parseAsset("asset", `${ALL_ZERO_HEX}.${BITSTAMP}`)).toEqual({
      kind: "issued",
      code: ALL_ZERO_HEX,
      currency: ALL_ZERO_HEX,
      issuer: BITSTAMP,
    });
  });

  it("accepts an MPT issuance id with allowMpt", () => {
    expect(parseAsset("asset", MPT_ISSUANCE_ID, { allowMpt: true })).toEqual({
      kind: "mpt",
      issuanceId: MPT_ISSUANCE_ID,
    });
  });

  it("upper-cases a lower-case MPT issuance id with allowMpt", () => {
    expect(parseAsset("asset", MPT_ISSUANCE_ID.toLowerCase(), { allowMpt: true })).toEqual({
      kind: "mpt",
      issuanceId: MPT_ISSUANCE_ID,
    });
  });

  it("refuses an MPT issuance id without allowMpt", () => {
    expectInvalid(MPT_ISSUANCE_ID);
  });

  it("rejects an invalid issuer", () => {
    expectInvalid("USD.not-an-issuer");
  });

  it("rejects a non-string asset", () => {
    expectInvalid(undefined);
  });
});
