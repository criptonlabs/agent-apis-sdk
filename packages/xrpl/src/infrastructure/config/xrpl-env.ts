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

export function readXrplEnv(env: NodeJS.ProcessEnv): XrplKitConfig {
  const common = readCommonEnv(env);
  const config: XrplKitConfig = { tier: common.tier };
  if (common.baseUrl !== undefined) config.baseUrl = common.baseUrl;

  let network: XrplNetworkName | undefined;
  const rawNetwork = env.CRIPTON_XRPL_NETWORK;
  if (present(rawNetwork)) {
    const parsed = networkSchema.safeParse(rawNetwork);
    if (!parsed.success) {
      throw new CriptonValidationError(
        "CRIPTON_XRPL_NETWORK",
        "CRIPTON_XRPL_NETWORK must be either 'mainnet' or 'testnet'",
      );
    }
    network = parsed.data;
  }

  let wsUrl: string | undefined;
  const rawWs = env.CRIPTON_XRPL_WS_URL;
  if (present(rawWs)) {
    if (!urlSchema.safeParse(rawWs).success) {
      throw new CriptonValidationError(
        "CRIPTON_XRPL_WS_URL",
        "CRIPTON_XRPL_WS_URL must be a valid URL",
      );
    }
    wsUrl = rawWs;
  }

  const seed = env.CRIPTON_XRPL_PAYER_SEED;
  if (present(seed) && common.maxPerCall !== undefined) {
    try {
      Wallet.fromSeed(seed);
    } catch {
      throw new CriptonValidationError(
        "CRIPTON_XRPL_PAYER_SEED",
        "CRIPTON_XRPL_PAYER_SEED is not a valid XRPL seed",
      );
    }
    config.payment = {
      seed,
      maxPerCall: common.maxPerCall,
      ...(network !== undefined ? { network } : {}),
      ...(wsUrl !== undefined ? { wsUrl } : {}),
      ...(common.sessionBudget !== undefined ? { sessionBudget: common.sessionBudget } : {}),
    };
  }
  return config;
}
