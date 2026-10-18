import { buildDexQuote, type DexQuote, type DexQuoteInput } from "../domain/dex-quote.js";
import type { XrplDataPort } from "./ports.js";

export async function dexQuote(data: XrplDataPort, input: DexQuoteInput): Promise<DexQuote> {
  const response = await data.slippage({
    base: input.base,
    quote: input.quote,
    amount: input.amount,
    ...(input.depth !== undefined ? { depth: input.depth } : {}),
  });
  return buildDexQuote(input, response.data);
}
