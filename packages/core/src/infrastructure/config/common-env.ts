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

function present(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

function parseUrl(url: string): string {
  if (!urlSchema.safeParse(url).success) {
    throw new CriptonValidationError("CRIPTON_API_URL", "CRIPTON_API_URL must be a valid URL");
  }
  return url;
}

function parseTier(tier: string | undefined): CommonEnv["tier"] {
  if (!present(tier)) return "free";
  const parsed = tierSchema.safeParse(tier);
  if (!parsed.success) {
    throw new CriptonValidationError("CRIPTON_TIER", "CRIPTON_TIER must be either 'free' or 'pro'");
  }
  return parsed.data;
}

export function readCommonEnv(env: NodeJS.ProcessEnv): CommonEnv {
  // Validation order (URL, tier, cap, budget) decides which field an error names.
  const url = env.CRIPTON_API_URL;
  const baseUrl = present(url) ? parseUrl(url) : undefined;
  const common: CommonEnv = { tier: parseTier(env.CRIPTON_TIER) };
  if (baseUrl !== undefined) common.baseUrl = baseUrl;
  const { CRIPTON_MAX_PER_CALL: maxPerCall, CRIPTON_SESSION_BUDGET: budget } = env;
  if (present(maxPerCall)) common.maxPerCall = assertDecimal("CRIPTON_MAX_PER_CALL", maxPerCall);
  if (present(budget)) common.sessionBudget = assertDecimal("CRIPTON_SESSION_BUDGET", budget);
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
