import {
  type CommonEnv,
  CriptonValidationError,
  readCommonEnv,
} from "@criptonlabs/agent-apis-core";
import { Wallet } from "xrpl";
import { z } from "zod";
import type { XrplKitConfig } from "../../index.js";
import type { XrplNetworkName } from "../../domain/rlusd-option.js";

const networkSchema = z.enum(["mainnet", "testnet"]);
const urlSchema = z.url();

function present(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

function parseNetwork(raw: string | undefined): XrplNetworkName | undefined {
  if (!present(raw)) return undefined;
  const parsed = networkSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CriptonValidationError(
      "CRIPTON_XRPL_NETWORK",
      "CRIPTON_XRPL_NETWORK must be either 'mainnet' or 'testnet'",
    );
  }
  return parsed.data;
}

function parseWsUrl(raw: string | undefined): string | undefined {
  if (!present(raw)) return undefined;
  if (!urlSchema.safeParse(raw).success) {
    throw new CriptonValidationError(
      "CRIPTON_XRPL_WS_URL",
      "CRIPTON_XRPL_WS_URL must be a valid URL",
    );
  }
  return raw;
}

/** Validates the seed without ever echoing it. */
function assertSeed(seed: string): void {
  try {
    Wallet.fromSeed(seed);
  } catch {
    throw new CriptonValidationError(
      "CRIPTON_XRPL_PAYER_SEED",
      "CRIPTON_XRPL_PAYER_SEED is not a valid XRPL seed",
    );
  }
}

/**
 * The credit token, with or without a wallet; nothing when it is not set. CRIPTON_TOPUP_MAX and
 * CRIPTON_TOPUP_BUDGET are Solana settings (the per-purchase maximum of solana_credits_topup and
 * the cap on a process's Solana top-ups): the XRPL kit ignores them.
 */
function creditsFrom(common: CommonEnv): Pick<XrplKitConfig, "credits"> {
  const { creditsToken } = common;
  if (creditsToken === undefined) return {};
  return { credits: { token: creditsToken } };
}

export function readXrplEnv(env: NodeJS.ProcessEnv): XrplKitConfig {
  const common = readCommonEnv(env);
  const config: XrplKitConfig = { tier: common.tier, ...creditsFrom(common) };
  if (common.baseUrl !== undefined) config.baseUrl = common.baseUrl;
  const network = parseNetwork(env.CRIPTON_XRPL_NETWORK);
  const wsUrl = parseWsUrl(env.CRIPTON_XRPL_WS_URL);

  const seed = env.CRIPTON_XRPL_PAYER_SEED;
  if (!present(seed)) return config;
  assertSeed(seed);
  config.wallet = {
    seed,
    ...(network !== undefined ? { network } : {}),
    ...(wsUrl !== undefined ? { wsUrl } : {}),
  };
  // Per-call payment is configured only when the seed and the cap are both set.
  if (common.maxPerCall === undefined) return config;
  config.payment = {
    maxPerCall: common.maxPerCall,
    ...(common.sessionBudget !== undefined ? { sessionBudget: common.sessionBudget } : {}),
  };
  return config;
}
