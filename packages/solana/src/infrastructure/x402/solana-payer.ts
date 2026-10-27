import {
  CriptonValidationError,
  divPow10,
  type PaymentOption,
  type X402Payer,
} from "@criptonlabs/agent-apis-core";
import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { Network, PaymentRequired } from "@x402/core/types";
import { toClientSvmSigner } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import {
  PAY_ASSET_DECIMALS,
  SOLANA_CAIP2,
  type SolanaNetworkName,
  type SolanaPayAsset,
} from "../../domain/solana-assets.js";
import { selectSolanaOption } from "../../domain/solana-option.js";
import { parsePayerKey } from "./payer-key.js";

export interface SolanaPayerConfig {
  key: string;
  network?: SolanaNetworkName;
  asset?: SolanaPayAsset;
  rpcUrl?: string;
}

interface PaymentClients {
  client: x402Client;
  http: x402HTTPClient;
}

async function signerFrom(bytes: Uint8Array): Promise<KeyPairSigner> {
  try {
    return await createKeyPairSignerFromBytes(bytes);
  } catch {
    throw new CriptonValidationError("key", "key is not a valid Solana secret key");
  }
}

async function createClients(
  bytes: Uint8Array,
  caip2: Network,
  rpcUrl: string | undefined,
): Promise<PaymentClients> {
  const signer = await signerFrom(bytes);
  const scheme = new ExactSvmScheme(
    toClientSvmSigner(signer),
    rpcUrl !== undefined ? { rpcUrl } : undefined,
  );
  // Spend limits belong to the kit core (maxPerCall, sessionBudget): x402Client's own
  // default cap and asset allow-list are disabled so they cannot alter the selected option.
  const client = new x402Client().register(caip2, scheme).setSpendControls(false);
  return { client, http: new x402HTTPClient(client) };
}

/** Signs x402 Solana payments locally; the facilitator submits them, this never sends. */
export function createSolanaPayer(cfg: SolanaPayerConfig): X402Payer {
  const bytes = parsePayerKey(cfg.key, "key");
  const network = cfg.network ?? "mainnet";
  const asset = cfg.asset ?? "USDC";
  let clients: Promise<PaymentClients> | undefined;
  const getClients = () => {
    clients ??= createClients(bytes, SOLANA_CAIP2[network] as Network, cfg.rpcUrl);
    return clients;
  };
  return {
    selectOption: (accepts) => selectSolanaOption(accepts, network, asset),
    decimalAmount: (option) => divPow10(option.amount, PAY_ASSET_DECIMALS[asset]),
    async createPaymentHeaders(paymentRequired: unknown, option: PaymentOption) {
      const { client, http } = await getClients();
      const required = paymentRequired as PaymentRequired;
      const payload = await client.createPaymentPayload({
        ...required,
        accepts: [option as unknown as PaymentRequired["accepts"][number]],
      });
      return http.encodePaymentSignatureHeader(payload);
    },
  };
}
