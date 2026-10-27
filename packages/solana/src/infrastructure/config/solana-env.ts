import { CriptonValidationError, readCommonEnv } from "@criptonlabs/agent-apis-core";
import { z } from "zod";
import type { SolanaKitConfig } from "../../index.js";
import type { SolanaNetworkName, SolanaPayAsset } from "../../domain/solana-assets.js";
import { parsePayerKey } from "../x402/payer-key.js";

const networkSchema = z.enum(["mainnet", "devnet"]);
const assetSchema = z.enum(["USDC", "EURC"]);
const urlSchema = z.url();

function present(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

function parseNetwork(raw: string | undefined): SolanaNetworkName | undefined {
  if (!present(raw)) return undefined;
  const parsed = networkSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CriptonValidationError(
      "CRIPTON_SOLANA_NETWORK",
      "CRIPTON_SOLANA_NETWORK must be either 'mainnet' or 'devnet'",
    );
  }
  return parsed.data;
}

function parseAsset(raw: string | undefined): SolanaPayAsset | undefined {
  if (!present(raw)) return undefined;
  const parsed = assetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CriptonValidationError(
      "CRIPTON_SOLANA_PAY_ASSET",
      "CRIPTON_SOLANA_PAY_ASSET must be either 'USDC' or 'EURC'",
    );
  }
  return parsed.data;
}

function parseRpcUrl(raw: string | undefined): string | undefined {
  if (!present(raw)) return undefined;
  if (!urlSchema.safeParse(raw).success) {
    throw new CriptonValidationError(
      "CRIPTON_SOLANA_RPC_URL",
      "CRIPTON_SOLANA_RPC_URL must be a valid URL",
    );
  }
  return raw;
}

export function readSolanaEnv(env: NodeJS.ProcessEnv): SolanaKitConfig {
  const common = readCommonEnv(env);
  const config: SolanaKitConfig = { tier: common.tier };
  if (common.baseUrl !== undefined) config.baseUrl = common.baseUrl;
  const network = parseNetwork(env.CRIPTON_SOLANA_NETWORK);
  const asset = parseAsset(env.CRIPTON_SOLANA_PAY_ASSET);
  const rpcUrl = parseRpcUrl(env.CRIPTON_SOLANA_RPC_URL);

  const key = env.CRIPTON_SOLANA_PAYER_KEY;
  if (!present(key) || common.maxPerCall === undefined) return config;
  // Validates the key shape without ever echoing it.
  parsePayerKey(key, "CRIPTON_SOLANA_PAYER_KEY");
  config.payment = {
    key,
    maxPerCall: common.maxPerCall,
    ...(network !== undefined ? { network } : {}),
    ...(asset !== undefined ? { asset } : {}),
    ...(rpcUrl !== undefined ? { rpcUrl } : {}),
    ...(common.sessionBudget !== undefined ? { sessionBudget: common.sessionBudget } : {}),
  };
  return config;
}
