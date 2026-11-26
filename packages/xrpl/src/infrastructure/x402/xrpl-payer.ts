import {
  CriptonValidationError,
  type PaymentOption,
  type X402Payer,
} from "@criptonlabs/agent-apis-core";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentRequired } from "@x402/core/types";
import { createXrplWalletSigner, type XrplClientFactory } from "@x402/xrpl";
import { ExactXrplScheme } from "@x402/xrpl/exact/client";
import { Wallet } from "xrpl";
import { selectRlusdOption, type XrplNetworkName } from "../../domain/rlusd-option.js";
import { XRPL_CAIP2 } from "../../domain/rlusd.js";
import { accountQueue } from "./account-queue.js";

export interface XrplPayerConfig {
  seed: string;
  network?: XrplNetworkName;
  wsUrl?: string;
  clientFactory?: XrplClientFactory;
}

export function createXrplPayer(cfg: XrplPayerConfig): X402Payer {
  let wallet: Wallet;
  try {
    wallet = Wallet.fromSeed(cfg.seed);
  } catch {
    throw new CriptonValidationError("seed", "Invalid XRPL seed");
  }
  const network = cfg.network ?? "mainnet";
  const caip2 = XRPL_CAIP2[network];
  const scheme = new ExactXrplScheme(createXrplWalletSigner(wallet), {
    ticketCreateCount: 0,
    ...(cfg.wsUrl !== undefined ? { wsUrlByNetwork: { [caip2]: cfg.wsUrl } } : {}),
    ...(cfg.clientFactory !== undefined ? { clientFactory: cfg.clientFactory } : {}),
  });
  // Spend limits belong to the kit core (maxPerCall, sessionBudget): x402Client's own
  // default cap ($1) and asset allow-list are disabled so they cannot alter the selected option.
  const client = new x402Client().register(caip2, scheme).setSpendControls(false);
  const http = new x402HTTPClient(client);
  return {
    selectOption: (accepts) => selectRlusdOption(accepts, network),
    exclusive: accountQueue(caip2, wallet.classicAddress),
    async createPaymentHeaders(paymentRequired: unknown, option: PaymentOption) {
      const required = paymentRequired as PaymentRequired;
      const payload = await client.createPaymentPayload({
        ...required,
        accepts: [option as unknown as PaymentRequired["accepts"][number]],
      });
      return http.encodePaymentSignatureHeader(payload);
    },
  };
}
