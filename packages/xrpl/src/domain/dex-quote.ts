import { cmp, CriptonRefusalError, type Meta } from "@criptonlabs/agent-apis-core";
import type { SlippageResponse } from "./api-types.js";

export interface DexQuoteInput {
  base: string;
  quote: string;
  amount: string;
  depth?: 10 | 50 | 100 | 200;
  maxSlippagePct?: string;
}

export interface DexQuote {
  base: string;
  quote: string;
  amount: string;
  filled: string;
  partial: boolean;
  insufficientLiquidity: boolean;
  bestVenue: "clob" | "amm" | (string & {}) | null;
  ammStatus: "ok" | "stale" | "no_pool" | "unavailable" | (string & {});
  avgPrice: string | null;
  slippagePct: string | null;
  venues: { clob: SlippageResponse["venues"]["clob"]; amm: SlippageResponse["venues"]["amm"] };
  meta: Meta;
}

export class SlippageLimitError extends CriptonRefusalError {
  readonly code = "slippage-over-limit";
  constructor(readonly quote: DexQuote) {
    super("slippage-over-limit");
  }
}

export function buildDexQuote(input: DexQuoteInput, response: SlippageResponse): DexQuote {
  const quote: DexQuote = {
    base: response.base,
    quote: response.quote,
    amount: response.amount,
    filled: response.filled,
    partial: response.partial,
    insufficientLiquidity: response.insufficient_liquidity,
    bestVenue: response.venues.best,
    ammStatus: response.venues.amm_status,
    avgPrice: response.avg_price,
    slippagePct: response.slippage_pct,
    venues: { clob: response.venues.clob, amm: response.venues.amm },
    meta: response.meta,
  };
  if (
    input.maxSlippagePct !== undefined &&
    (quote.slippagePct === null || cmp(quote.slippagePct, input.maxSlippagePct) > 0)
  ) {
    throw new SlippageLimitError(quote);
  }
  return quote;
}
