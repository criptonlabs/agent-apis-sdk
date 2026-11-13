import { z } from "zod";
import type { PaymentConfig, X402Payer } from "../../application/ports.js";
import { assertCreditToken } from "../../domain/credit-token.js";
import { assertDecimal } from "../../domain/decimal.js";
import { CriptonValidationError } from "../../domain/errors.js";

export interface CommonEnv {
  baseUrl?: string;
  tier: "free" | "pro";
  maxPerCall?: string;
  sessionBudget?: string;
  creditsToken?: string;
  topupMax?: string;
  topupBudget?: string;
}

type CreditEnv = Pick<CommonEnv, "creditsToken" | "topupMax" | "topupBudget">;

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

/** The credit token when it has the API grammar and the tier is `pro`; errors never carry the value. */
function parseCreditsToken(token: string, tier: CommonEnv["tier"]): string {
  const valid = assertCreditToken("CRIPTON_CREDITS_TOKEN", token);
  if (tier !== "pro") {
    throw new CriptonValidationError(
      "CRIPTON_TIER",
      "CRIPTON_TIER must be 'pro' when CRIPTON_CREDITS_TOKEN is set",
    );
  }
  return valid;
}

/** Names the purchase limit that is missing when only one of the pair is set. */
function assertTopupPair(max: string | undefined, budget: string | undefined): void {
  if (present(max) === present(budget)) return;
  const [missing, other] = present(max)
    ? ["CRIPTON_TOPUP_BUDGET", "CRIPTON_TOPUP_MAX"]
    : ["CRIPTON_TOPUP_MAX", "CRIPTON_TOPUP_BUDGET"];
  throw new CriptonValidationError(missing, `${missing} must be set together with ${other}`);
}

/** The credit token and the purchase limits (token, then max, then budget, then the pair). */
function readCreditEnv(env: NodeJS.ProcessEnv, tier: CommonEnv["tier"]): CreditEnv {
  const credit: CreditEnv = {};
  const {
    CRIPTON_CREDITS_TOKEN: token,
    CRIPTON_TOPUP_MAX: max,
    CRIPTON_TOPUP_BUDGET: budget,
  } = env;
  if (present(token)) credit.creditsToken = parseCreditsToken(token, tier);
  if (present(max)) credit.topupMax = assertDecimal("CRIPTON_TOPUP_MAX", max);
  if (present(budget)) credit.topupBudget = assertDecimal("CRIPTON_TOPUP_BUDGET", budget);
  assertTopupPair(max, budget);
  return credit;
}

export function readCommonEnv(env: NodeJS.ProcessEnv): CommonEnv {
  // Validation order (URL, tier, cap, budget, credits) decides which field an error names.
  const url = env.CRIPTON_API_URL;
  const baseUrl = present(url) ? parseUrl(url) : undefined;
  const common: CommonEnv = { tier: parseTier(env.CRIPTON_TIER) };
  if (baseUrl !== undefined) common.baseUrl = baseUrl;
  const { CRIPTON_MAX_PER_CALL: maxPerCall, CRIPTON_SESSION_BUDGET: budget } = env;
  if (present(maxPerCall)) common.maxPerCall = assertDecimal("CRIPTON_MAX_PER_CALL", maxPerCall);
  if (present(budget)) common.sessionBudget = assertDecimal("CRIPTON_SESSION_BUDGET", budget);
  return { ...common, ...readCreditEnv(env, common.tier) };
}

export function buildPaymentConfig(
  common: CommonEnv,
  payer: X402Payer | undefined,
): PaymentConfig | undefined {
  if (payer === undefined || common.maxPerCall === undefined) return undefined;
  return {
    maxPerCall: common.maxPerCall,
    ...(common.sessionBudget === undefined ? {} : { sessionBudget: common.sessionBudget }),
  };
}
