import {
  type CommonEnv,
  CriptonValidationError,
  readCommonEnv,
} from "@criptonlabs/agent-apis-core";
import { z } from "zod";
import type { SolanaKitConfig } from "../../index.js";
import type { SolanaNetworkName, SolanaPayAsset } from "../../domain/solana-assets.js";
import { parsePayerKey } from "../x402/payer-key.js";

const networkSchema = z.enum(["mainnet", "devnet"]);
const assetSchema = z.enum(["USDC", "EURC"]);
const urlSchema = z.url();
const siwxSchema = z.enum(["on", "off"]);

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

/** SIWX spending: `on` enables it; `off`, empty or absent leaves it off. */
function parseSiwx(raw: string | undefined): boolean {
  if (!present(raw)) return false;
  const parsed = siwxSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CriptonValidationError(
      "CRIPTON_SOLANA_SIWX",
      "CRIPTON_SOLANA_SIWX must be either 'on' or 'off'",
    );
  }
  return parsed.data === "on";
}

/** SIWX spending signs with the payer key, so `on` needs it. */
function assertSiwxKey(siwx: boolean, key: string | undefined): void {
  if (!siwx || present(key)) return;
  throw new CriptonValidationError(
    "CRIPTON_SOLANA_PAYER_KEY",
    "CRIPTON_SOLANA_PAYER_KEY must be set when CRIPTON_SOLANA_SIWX is 'on'",
  );
}

/**
 * The credit token, the top-up budget and SIWX spending, with or without a wallet; nothing when
 * none is set.
 */
function creditsFrom(common: CommonEnv, siwx: boolean): Pick<SolanaKitConfig, "credits"> {
  const { creditsToken, topupBudget } = common;
  if (creditsToken === undefined && topupBudget === undefined && !siwx) return {};
  return {
    credits: {
      ...(creditsToken !== undefined ? { token: creditsToken } : {}),
      ...(topupBudget !== undefined ? { topupBudget } : {}),
      ...(siwx ? { siwx } : {}),
    },
  };
}

export function readSolanaEnv(env: NodeJS.ProcessEnv): SolanaKitConfig {
  const common = readCommonEnv(env);
  const network = parseNetwork(env.CRIPTON_SOLANA_NETWORK);
  const asset = parseAsset(env.CRIPTON_SOLANA_PAY_ASSET);
  const rpcUrl = parseRpcUrl(env.CRIPTON_SOLANA_RPC_URL);
  const siwx = parseSiwx(env.CRIPTON_SOLANA_SIWX);
  const config: SolanaKitConfig = { tier: common.tier, ...creditsFrom(common, siwx) };
  if (common.baseUrl !== undefined) config.baseUrl = common.baseUrl;

  const key = env.CRIPTON_SOLANA_PAYER_KEY;
  assertSiwxKey(siwx, key);
  if (!present(key)) return config;
  // Validates the key shape without ever echoing it.
  parsePayerKey(key, "CRIPTON_SOLANA_PAYER_KEY");
  config.wallet = {
    key,
    ...(network !== undefined ? { network } : {}),
    ...(asset !== undefined ? { asset } : {}),
    ...(rpcUrl !== undefined ? { rpcUrl } : {}),
  };
  // Per-call payment is configured only when the key and the cap are both set.
  if (common.maxPerCall === undefined) return config;
  config.payment = {
    maxPerCall: common.maxPerCall,
    ...(common.sessionBudget !== undefined ? { sessionBudget: common.sessionBudget } : {}),
  };
  return config;
}
