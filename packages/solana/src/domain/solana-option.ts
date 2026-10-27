import { cmp, type PaymentOption } from "@criptonlabs/agent-apis-core";
import {
  PAY_ASSET_MINTS,
  SOLANA_CAIP2,
  type SolanaNetworkName,
  type SolanaPayAsset,
} from "./solana-assets.js";

export function selectSolanaOption(
  accepts: readonly PaymentOption[],
  network: SolanaNetworkName,
  asset: SolanaPayAsset,
): PaymentOption | null {
  const caip2 = SOLANA_CAIP2[network];
  const mint = PAY_ASSET_MINTS[asset][network];
  const matching = accepts.filter(
    (option) => option.scheme === "exact" && option.network === caip2 && option.asset === mint,
  );
  return matching.reduce<PaymentOption | null>(
    (best, option) => (best === null || cmp(option.amount, best.amount) < 0 ? option : best),
    null,
  );
}
