import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import { describe, expect, it } from "vite-plus/test";
import { type TransferIntent, validateIntent } from "../../../src/domain/prepared-transfer.js";
import {
  assertHistoryWindow,
  assertMint,
  assertSolanaAddress,
} from "../../../src/domain/validation.js";

const SOURCE = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const DESTINATION = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

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

function intent(overrides: Partial<Record<keyof TransferIntent, unknown>> = {}): TransferIntent {
  return {
    source: SOURCE,
    destination: DESTINATION,
    mint: USDC_MINT,
    amount: "1",
    ...overrides,
  } as TransferIntent;
}

describe("Solana address validation", () => {
  it("Invalid Solana address", () => {
    expectInvalid(() => assertSolanaAddress("source", "not-an-address"), "source");
  });

  it("returns valid base58 addresses of 32 to 44 characters unchanged", () => {
    expect(assertSolanaAddress("source", SOURCE)).toBe(SOURCE);
    expect(assertSolanaAddress("source", SYSTEM_PROGRAM)).toBe(SYSTEM_PROGRAM);
  });

  it("rejects a non-string address", () => {
    expectInvalid(() => assertSolanaAddress("destination", 42), "destination");
  });

  it("rejects an address with non-base58 characters", () => {
    expectInvalid(() => assertSolanaAddress("source", `0OIl${SOURCE.slice(4)}`), "source");
  });

  it("rejects an address longer than 44 characters", () => {
    expectInvalid(() => assertSolanaAddress("source", `${SOURCE}abc`), "source");
  });
});

describe("32-byte address rule", () => {
  it("Address not decoding to 32 bytes", () => {
    expectInvalid(() => assertSolanaAddress("destination", "z".repeat(44)), "destination");
  });

  it("accepts a 32-byte key made of leading zero bytes", () => {
    expect(assertSolanaAddress("source", SYSTEM_PROGRAM)).toBe(SYSTEM_PROGRAM);
  });

  it("rejects 31 leading zero bytes", () => {
    expectInvalid(() => assertSolanaAddress("source", "1".repeat(31)), "source");
  });

  it("rejects 32 base58 characters decoding to fewer than 32 bytes", () => {
    expectInvalid(() => assertSolanaAddress("source", "2".repeat(32)), "source");
  });

  it("rejects SOL as an address", () => {
    expectInvalid(() => assertSolanaAddress("mint", "SOL"), "mint");
  });

  it("applies the 32-byte rule to mints other than SOL", () => {
    expectInvalid(() => assertMint("mint", "z".repeat(44)), "mint");
    expectInvalid(() => assertMint("mint", "1".repeat(31)), "mint");
    expect(assertMint("mint", SYSTEM_PROGRAM)).toBe(SYSTEM_PROGRAM);
  });
});

describe("mint validation", () => {
  it("accepts SOL and a base58 mint", () => {
    expect(assertMint("mint", "SOL")).toBe("SOL");
    expect(assertMint("mint", USDC_MINT)).toBe(USDC_MINT);
  });

  it("rejects anything else with the given field", () => {
    expectInvalid(() => assertMint("mint", "sol"), "mint");
    expectInvalid(() => assertMint("token", "USDC"), "token");
    expectInvalid(() => assertMint("mint", undefined), "mint");
  });
});

describe("history window validation", () => {
  it("Invalid history window", () => {
    expectInvalid(() => assertHistoryWindow("window", "30d"), "window");
  });

  it("accepts 1h, 24h and 7d", () => {
    expect(assertHistoryWindow("window", "1h")).toBe("1h");
    expect(assertHistoryWindow("window", "24h")).toBe("24h");
    expect(assertHistoryWindow("window", "7d")).toBe("7d");
  });
});

describe("transfer intent validation", () => {
  it("Float amount rejected", () => {
    expectInvalid(() => validateIntent(intent({ amount: 0.5 })), "amount");
  });

  it("rejects a non-decimal amount string", () => {
    expectInvalid(() => validateIntent(intent({ amount: "abc" })), "amount");
  });

  it("names the invalid source, destination or mint field", () => {
    expectInvalid(() => validateIntent(intent({ source: "not-an-address" })), "source");
    expectInvalid(() => validateIntent(intent({ destination: "not-an-address" })), "destination");
    expectInvalid(() => validateIntent(intent({ mint: "USDC" })), "mint");
  });

  it("accepts a valid SOL intent", () => {
    expect(() => validateIntent(intent({ mint: "SOL", amount: "0.01" }))).not.toThrow();
  });
});
