import { z } from "zod";
import type {
  PaymentReceipt,
  TopupRequest,
  TopupResult,
  X402Payer,
} from "../../application/ports.js";
import { isUnits } from "../../domain/credit-balance.js";
import { REDACTED_TOKEN } from "../../domain/credit-token.js";
import { assertDecimal } from "../../domain/decimal.js";
import { CriptonResponseError, CriptonValidationError } from "../../domain/errors.js";
import type { TopupLedger } from "../../domain/topup-ledger.js";
import { parseProblem, readJson } from "../http/problem.js";
import { handlePaymentRequired, type PaidRetry, type PaymentLedger } from "../x402/x402-flow.js";

/** Bundle id grammar `^[a-z0-9]+(-[a-z0-9]+)*$`: these characters, and no empty dash-separated part. */
const BUNDLE_CHARS = /^[a-z0-9-]+$/;
const SETTLEMENT_FAILED = "payment-settlement-failed";
/** Node's `util.inspect.custom` key, from the global symbol registry (no `node:` import). */
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/**
 * The definitive refusals of a signed top-up, by problem code and status (design D7): the payment
 * did not settle, so its amount is released. `payment-settlement-failed` refuses only without
 * `pending_token`. Any other answer, or none, counts the amount.
 */
const DEFINITIVE_REFUSALS: ReadonlyMap<string, number> = new Map([
  [SETTLEMENT_FAILED, 402],
  ["payment-already-used", 402],
  ["payment-required", 402],
  ["payer-blocked", 403],
  ["payer-limit-reached", 429],
]);

/**
 * The top-up 201 body (API `prepaid-credits`). Only the token is required: a bought token is never
 * lost, so any other member that is missing or malformed reads as `null` (design D7).
 */
const createdBody = z.object({
  token: z.string(),
  wallet: z.string().nullable().catch(null),
  denomination: z.string().nullable().catch(null),
  balance: z.string().refine(isUnits).nullable().catch(null),
  lot_expires_at: z.string().nullable().catch(null),
  pending: z.boolean().nullable().catch(null),
});

type CreatedBody = z.infer<typeof createdBody>;

/** How a top-up reaches the API: the unsigned POST and the signed retry, never with credentials. */
export interface TopupPort {
  wallet: X402Payer | undefined;
  ledger: TopupLedger;
  send(headers: Record<string, string>): Promise<Response>;
  sendSigned(headers: Record<string, string>): Promise<Response>;
}

/** One purchase's view of the top-up ledger; `countSigned` keeps a signed amount as spent. */
interface PurchaseLedger extends PaymentLedger {
  countSigned(): void;
}

function isBundleId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    BUNDLE_CHARS.test(value) &&
    value.split("-").every((part) => part !== "")
  );
}

/** The request when its bundle id and maximum are valid; checked before any request (design D7). */
export function validTopup(request: TopupRequest): TopupRequest {
  if (!isBundleId(request.bundle)) {
    throw new CriptonValidationError(
      "bundle",
      "bundle must be lowercase letters and digits in dash-separated parts",
    );
  }
  return { bundle: request.bundle, maxAmount: assertDecimal("maxAmount", request.maxAmount) };
}

function purchaseLedger(ledger: TopupLedger, maxAmount: string): PurchaseLedger {
  let reservation: string | undefined;
  return {
    reserve(amount) {
      reservation = ledger.reserve(amount, maxAmount);
      return reservation;
    },
    commit: (id) => ledger.commit(id),
    release: (id) => ledger.release(id),
    countSigned() {
      if (reservation !== undefined) ledger.commit(reservation);
    },
  };
}

/** An answer that proves the signed payment did not settle (design D7); a 2xx never does. */
async function isDefinitiveRefusal(paid: Response): Promise<boolean> {
  if (paid.ok) return false;
  const problem = await parseProblem(paid.clone());
  if (DEFINITIVE_REFUSALS.get(problem.code) !== problem.status) return false;
  return problem.code !== SETTLEMENT_FAILED || problem.pendingToken === undefined;
}

/**
 * The signed retry, sent once. Every answer but a definitive refusal counts the amount before the
 * shared flow handles it (a 5xx or an ambiguous settlement may hide a settled payment); a
 * definitive refusal is released there, and no answer counts there (design D7).
 */
function countingRetry(port: TopupPort, purchase: PurchaseLedger): PaidRetry {
  return async (headers) => {
    const paid = await port.sendSigned(headers);
    if (!(await isDefinitiveRefusal(paid))) purchase.countSigned();
    return paid;
  };
}

async function parseCreated(response: Response): Promise<CreatedBody> {
  const parsed = createdBody.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new CriptonResponseError("Top-up response does not match the expected schema");
  }
  return parsed.data;
}

/** A result's members with `[redacted]` in place of its credit token. */
type Redacted<V> = V & { token: typeof REDACTED_TOKEN };

/** A result that carries a credit token, whose serialized and inspected forms hide it. */
type TokenCarrier<V> = V & {
  token: string;
  toJSON(): Redacted<V>;
  [INSPECT](): Redacted<V>;
};

/**
 * A result carrying a credit token (a top-up's or a rotation's): only its `token` property holds
 * the token; `JSON.stringify` and Node's `util.inspect` (as `console.log` uses it) show the
 * redacted view instead (design D7, D8).
 */
export function withHiddenToken<V extends object>(view: V, token: string): TokenCarrier<V> {
  const redacted = (): Redacted<V> => ({ ...view, token: REDACTED_TOKEN });
  return { ...view, token, toJSON: redacted, [INSPECT]: redacted };
}

/** The purchase with its token; the JSON and inspected forms show `[redacted]` in its place. */
function topupResult(
  bundle: string,
  body: CreatedBody,
  receipt: PaymentReceipt | null,
): TopupResult {
  const view = {
    bundle,
    wallet: body.wallet,
    denomination: body.denomination,
    balance: body.balance,
    lotExpiresAt: body.lot_expires_at,
    pending: body.pending,
    receipt,
  };
  return withHiddenToken(view, body.token);
}

/**
 * Buys a bundle (design D7): the unsigned POST, then the shared x402 flow with this purchase's
 * maximum and the top-up budget as limits. A signed top-up is never retried; an answer with a
 * token returns it, with `receipt` `null` when no settled `PAYMENT-RESPONSE` came with it.
 */
export async function buyBundle(request: TopupRequest, port: TopupPort): Promise<TopupResult> {
  const challenge = await port.send({});
  if (challenge.status !== 402) throw await parseProblem(challenge);
  const purchase = purchaseLedger(port.ledger, request.maxAmount);
  const { data, receipt } = await handlePaymentRequired(
    challenge,
    { payer: port.wallet, ledger: purchase },
    countingRetry(port, purchase),
    parseCreated,
  );
  return topupResult(request.bundle, data, receipt);
}
