import { describe, expect, it } from "vite-plus/test";
import type { SlippageResponse } from "../../../src/domain/api-types.js";
import {
  buildDexQuote,
  SlippageLimitError,
  type DexQuoteInput,
} from "../../../src/domain/dex-quote.js";

const RLUSD = "RLUSD.rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";

const input: DexQuoteInput = { base: "XRP", quote: RLUSD, amount: "500" };

function slippage(overrides: Partial<SlippageResponse> = {}): SlippageResponse {
  return {
    base: "XRP",
    quote: RLUSD,
    side: "buy",
    depth: 50,
    amount: "500",
    filled: "500",
    partial: false,
    insufficient_liquidity: false,
    best_price: "2.1034",
    avg_price: "2.1122",
    slippage_pct: "0.42",
    transfer_fee_applied: false,
    transfer_fee: null,
    avg_price_after_fees: null,
    venues: {
      best: "amm",
      amm_status: "ok",
      clob: {
        avg_price: "2.1205",
        cost: "1060.25",
        slippage_pct: "0.81",
        insufficient_liquidity: false,
        avg_price_after_fees: null,
      },
      amm: {
        avg_price: "2.1122",
        cost: "1056.1",
        slippage_pct: "0.42",
        insufficient_liquidity: false,
        avg_price_after_fees: null,
        spot_price: "2.1034",
        trading_fee: "0.003",
      },
    },
    meta: {
      ledger_index: 104_200_060,
      as_of: "2026-10-18T10:00:00.000Z",
      age_seconds: 1,
      cache: "miss",
      stale: false,
    },
    ...overrides,
  } satisfies SlippageResponse;
}

function catchError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("buildDexQuote", () => {
  it("AMM is the better venue", () => {
    const quote = buildDexQuote(input, slippage());
    expect(quote.bestVenue).toBe("amm");
    expect(quote.slippagePct).toBe("0.42");
    expect(quote.avgPrice).toBe("2.1122");
    expect(quote.filled).toBe("500");
    expect(quote.ammStatus).toBe("ok");
  });

  it("Not enough liquidity", () => {
    const quote = buildDexQuote(
      input,
      slippage({
        filled: "180",
        partial: true,
        insufficient_liquidity: true,
        avg_price: null,
        slippage_pct: null,
        venues: {
          best: null,
          amm_status: "no_pool",
          clob: {
            avg_price: null,
            cost: null,
            slippage_pct: null,
            insufficient_liquidity: true,
            avg_price_after_fees: null,
          },
          amm: null,
        },
      }),
    );
    expect(quote.bestVenue).toBeNull();
    expect(quote.partial).toBe(true);
    expect(quote.insufficientLiquidity).toBe(true);
  });

  it("AMM data unavailable", () => {
    const base = slippage();
    const quote = buildDexQuote(
      input,
      slippage({
        venues: { best: "clob", amm_status: "unavailable", clob: base.venues.clob, amm: null },
      }),
    );
    expect(quote.ammStatus).toBe("unavailable");
    expect(quote.venues.amm).toBeNull();
    expect(quote.venues.clob).not.toBeNull();
  });

  it("Slippage above the limit", () => {
    const error = catchError(() =>
      buildDexQuote({ ...input, maxSlippagePct: "1" }, slippage({ slippage_pct: "2.5" })),
    );
    expect(error).toBeInstanceOf(SlippageLimitError);
    expect((error as SlippageLimitError).code).toBe("slippage-over-limit");
    expect((error as SlippageLimitError).quote.slippagePct).toBe("2.5");
  });

  it("No slippage figure", () => {
    const error = catchError(() =>
      buildDexQuote({ ...input, maxSlippagePct: "1" }, slippage({ slippage_pct: null })),
    );
    expect(error).toBeInstanceOf(SlippageLimitError);
    expect((error as SlippageLimitError).code).toBe("slippage-over-limit");
  });

  it("returns the quote when slippage is within the limit", () => {
    const quote = buildDexQuote({ ...input, maxSlippagePct: "1" }, slippage());
    expect(quote.slippagePct).toBe("0.42");
  });
});
