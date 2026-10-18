import { cmp, type PaymentOption } from "@criptonlabs/agent-apis-core";
import { RLUSD_CURRENCY_HEX, RLUSD_ISSUER, XRPL_CAIP2 } from "./rlusd.js";

export type XrplNetworkName = "mainnet" | "testnet";

export function selectRlusdOption(
  accepts: readonly PaymentOption[],
  network: XrplNetworkName,
): PaymentOption | null {
  let best: PaymentOption | null = null;
  for (const option of accepts) {
    if (
      option.scheme !== "exact" ||
      option.network !== XRPL_CAIP2[network] ||
      option.asset !== RLUSD_CURRENCY_HEX ||
      option.extra?.issuer !== RLUSD_ISSUER[network]
    ) {
      continue;
    }
    if (best === null || cmp(option.amount, best.amount) < 0) best = option;
  }
  return best;
}
