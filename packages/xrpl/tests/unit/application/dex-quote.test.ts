import { describe, expect, it } from "vite-plus/test";
import { dexQuote } from "../../../src/application/dex-quote.js";
import type { SlippageResponse } from "../../../src/domain/api-types.js";
import { SlippageLimitError } from "../../../src/domain/dex-quote.js";
import { FakeDataPort } from "../../support/fake-data-port.js";
import slippageFixture from "../../fixtures/responses/slippage.json" with { type: "json" };

const QUOTE_ASSET = "524C555344000000000000000000000000000000.rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";

function slippage(overrides: Partial<SlippageResponse>, best: "clob" | "amm" | null = "amm") {
  return {
    ...slippageFixture,
    base: "XRP",
    quote: QUOTE_ASSET,
    amount: "500",
    venues: { ...slippageFixture.venues, best },
    ...overrides,
  } as SlippageResponse;
}

describe("dexQuote", () => {
  it("AMM is the better venue", async () => {
    const fake = new FakeDataPort().script("slippage", slippage({ slippage_pct: "0.42" }));

    const quote = await dexQuote(fake.port, {
      base: "XRP",
      quote: QUOTE_ASSET,
      amount: "500",
      depth: 50,
    });

    expect(fake.argsOf("slippage")).toEqual([
      { base: "XRP", quote: QUOTE_ASSET, amount: "500", depth: 50 },
    ]);
    expect(quote.bestVenue).toBe("amm");
    expect(quote.slippagePct).toBe("0.42");
  });

  it("Slippage above the limit", async () => {
    const fake = new FakeDataPort().script("slippage", slippage({ slippage_pct: "2.5" }));

    const error = await dexQuote(fake.port, {
      base: "XRP",
      quote: QUOTE_ASSET,
      amount: "500",
      maxSlippagePct: "1",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SlippageLimitError);
    expect((error as SlippageLimitError).code).toBe("slippage-over-limit");
    expect((error as SlippageLimitError).quote.slippagePct).toBe("2.5");
  });
});
