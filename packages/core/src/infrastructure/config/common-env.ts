import { z } from "zod";
import type { PaymentConfig, X402Payer } from "../../application/ports.js";
import { assertDecimal } from "../../domain/decimal.js";
import { CriptonValidationError } from "../../domain/errors.js";

export interface CommonEnv {
  baseUrl?: string;
  tier: "free" | "pro";
  maxPerCall?: string;
  sessionBudget?: string;
}

const urlSchema = z.url();
const tierSchema = z.enum(["free", "pro"]);

export function readCommonEnv(env: NodeJS.ProcessEnv): CommonEnv {
  const common: CommonEnv = { tier: "free" };

  const url = env.CRIPTON_API_URL;
  if (url !== undefined && url !== "") {
    if (!urlSchema.safeParse(url).success) {
      throw new CriptonValidationError("CRIPTON_API_URL", "CRIPTON_API_URL must be a valid URL");
    }
    common.baseUrl = url;
  }

  const tier = env.CRIPTON_TIER;
  if (tier !== undefined && tier !== "") {
    const parsed = tierSchema.safeParse(tier);
    if (!parsed.success) {
      throw new CriptonValidationError(
        "CRIPTON_TIER",
        "CRIPTON_TIER must be either 'free' or 'pro'",
      );
    }
    common.tier = parsed.data;
  }

  const maxPerCall = env.CRIPTON_MAX_PER_CALL;
  if (maxPerCall !== undefined && maxPerCall !== "") {
    common.maxPerCall = assertDecimal("CRIPTON_MAX_PER_CALL", maxPerCall);
  }
  const budget = env.CRIPTON_SESSION_BUDGET;
  if (budget !== undefined && budget !== "") {
    common.sessionBudget = assertDecimal("CRIPTON_SESSION_BUDGET", budget);
  }
  return common;
}

export function buildPaymentConfig(
  common: CommonEnv,
  payer: X402Payer | undefined,
): PaymentConfig | undefined {
  if (payer === undefined || common.maxPerCall === undefined) return undefined;
  return {
    payer,
    maxPerCall: common.maxPerCall,
    ...(common.sessionBudget === undefined ? {} : { sessionBudget: common.sessionBudget }),
  };
}
