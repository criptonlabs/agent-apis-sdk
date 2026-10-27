import { CriptonValidationError, readCommonEnv } from "@criptonlabs/agent-apis-core";
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

export function readXrplEnv(env: NodeJS.ProcessEnv): XrplKitConfig {
  const common = readCommonEnv(env);
  const config: XrplKitConfig = { tier: common.tier };
  if (common.baseUrl !== undefined) config.baseUrl = common.baseUrl;
  const network = parseNetwork(env.CRIPTON_XRPL_NETWORK);
  const wsUrl = parseWsUrl(env.CRIPTON_XRPL_WS_URL);

  const seed = env.CRIPTON_XRPL_PAYER_SEED;
  if (!present(seed) || common.maxPerCall === undefined) return config;
  assertSeed(seed);
  config.payment = {
    seed,
    maxPerCall: common.maxPerCall,
    ...(network !== undefined ? { network } : {}),
    ...(wsUrl !== undefined ? { wsUrl } : {}),
    ...(common.sessionBudget !== undefined ? { sessionBudget: common.sessionBudget } : {}),
  };
  return config;
}
