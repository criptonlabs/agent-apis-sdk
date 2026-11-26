import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import type { KitResponse, PaymentReceipt, X402Payer } from "../../application/ports.js";
import {
  CriptonPaymentError,
  CriptonResponseError,
  type PrepaidSignals,
} from "../../domain/errors.js";
import type { PaymentOption, PaymentOptionSummary } from "../../domain/payment-option.js";
import { parseProblem, readJson, signalsOf } from "../http/problem.js";
import { readPrepaidOffer } from "./prepaid-offer.js";

export interface PaidRetry {
  (extraHeaders: Record<string, string>): Promise<Response>;
}

/**
 * The limits a payment is reserved against before signing: the session's `SpendLedger` for data
 * calls, one purchase's view of the `TopupLedger` for top-ups (design D7).
 */
export interface PaymentLedger {
  reserve(amount: string): string;
  commit(reservation: string): void;
  release(reservation: string): void;
}

/** Who signs and which limits apply; one signing path for data calls and top-ups (design D7). */
export interface PaymentContext {
  payer: X402Payer | undefined;
  ledger: PaymentLedger | undefined;
}

type PaymentRequired = ReturnType<typeof decodePaymentRequiredHeader>;

interface Chosen {
  option: PaymentOption;
  /** Decimal amount in asset units: the payer's conversion, or the offered amount as is. */
  amount: string;
  payer: X402Payer;
  ledger: PaymentLedger;
  signals: PrepaidSignals;
}

function summaries(accepts: readonly PaymentOption[]): PaymentOptionSummary[] {
  return accepts.map(({ network, asset, amount, payTo }) => ({ network, asset, amount, payTo }));
}

function decodeRequired(header: string): PaymentRequired {
  try {
    return decodePaymentRequiredHeader(header);
  } catch {
    throw new CriptonResponseError("Invalid PAYMENT-REQUIRED header");
  }
}

/** The option's amount in decimal asset units; without a payer conversion the offer already is decimal. */
function decimalAmountOf(payer: X402Payer, option: PaymentOption): string {
  return payer.decimalAmount?.(option) ?? option.amount;
}

/**
 * The challenge's prepaid offer and the problem's `error` member as `reason`: a credit refusal
 * reaches every payment error raised for this challenge (design D5).
 */
async function challengeSignals(
  response: Response,
  required: PaymentRequired,
): Promise<PrepaidSignals> {
  const prepaidOffer = readPrepaidOffer(required.extensions);
  const { reason } = signalsOf(await readJson(response));
  return {
    ...(prepaidOffer !== undefined ? { prepaidOffer } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
}

/** Picks the option to pay, or raises the payment error that explains why nothing is paid. */
async function chooseOption(
  response: Response,
  required: PaymentRequired,
  { payer, ledger }: PaymentContext,
): Promise<Chosen> {
  const accepts = required.accepts as unknown as PaymentOption[];
  const signals = await challengeSignals(response, required);
  // A credits-only route offers no per-call option, only prepaid credits (API prepaid-credits D0b).
  if (accepts.length === 0 && signals.prepaidOffer !== undefined) {
    throw new CriptonPaymentError("credits-required", [], signals);
  }
  // Paying needs both the wallet (payer) and limits (ledger): per-call opt-in or the top-up's own.
  if (payer === undefined || ledger === undefined) {
    throw new CriptonPaymentError("payment-disabled", summaries(accepts), signals);
  }
  const option = payer.selectOption(accepts);
  if (option === null) {
    throw new CriptonPaymentError("no-supported-payment-option", summaries(accepts), signals);
  }
  return { option, amount: decimalAmountOf(payer, option), payer, ledger, signals };
}

/** Reserves the amount; a limit refusal also carries the challenge's `reason`, nothing else changes. */
function reserve(chosen: Chosen): string {
  try {
    return chosen.ledger.reserve(chosen.amount);
  } catch (error) {
    const { reason } = chosen.signals;
    if (reason === undefined || !(error instanceof CriptonPaymentError)) throw error;
    throw new CriptonPaymentError(error.code, error.options, { reason });
  }
}

/** Sends the signed retry; without an answer the payment may have settled, so it counts as spent. */
async function sendSigned(
  retry: PaidRetry,
  headers: Record<string, string>,
  chosen: Chosen,
  reservation: string,
): Promise<Response> {
  try {
    return await retry(headers);
  } catch {
    // Never retried: a second request would sign a second payment.
    chosen.ledger.commit(reservation);
    throw new CriptonPaymentError(
      "payment-outcome-unknown",
      summaries([chosen.option]),
      chosen.signals,
    );
  }
}

/**
 * Signs and sends the paid retry inside the payer's exclusive section when it has one, directly
 * otherwise; the section ends when the paid retry returns or throws, or when signing throws (design D1).
 */
function signAndSend(
  required: PaymentRequired,
  chosen: Chosen,
  retry: PaidRetry,
  reservation: string,
): Promise<Response> {
  const task = async (): Promise<Response> => {
    const headers = await chosen.payer.createPaymentHeaders(required, chosen.option);
    return sendSigned(retry, headers, chosen, reservation);
  };
  return chosen.payer.exclusive ? chosen.payer.exclusive(task) : task();
}

/** The receipt of a successful settlement; asset comes from the paid option, amount is the decimal paid. */
function readReceipt(paid: Response, chosen: Chosen): PaymentReceipt | null {
  const settleHeader = paid.headers.get("payment-response");
  if (settleHeader === null) return null;
  try {
    const settle = decodePaymentResponseHeader(settleHeader);
    if (!settle.success) return null;
    return {
      transaction: settle.transaction,
      network: settle.network,
      asset: chosen.option.asset,
      amount: chosen.amount,
      ...(settle.payer !== undefined ? { payer: settle.payer } : {}),
    };
  } catch {
    return null;
  }
}

/** Runs the x402 v2 flow after a 402 (design D6): one paid retry, reservation released on any failure. */
export async function handlePaymentRequired<T>(
  response: Response,
  context: PaymentContext,
  retry: PaidRetry,
  parse: (response: Response) => Promise<T>,
): Promise<KitResponse<T>> {
  const header = response.headers.get("payment-required");
  if (header === null) throw await parseProblem(response);
  const required = decodeRequired(header);
  const chosen = await chooseOption(response, required, context);
  const reservation = reserve(chosen);
  try {
    const paid = await signAndSend(required, chosen, retry, reservation);
    if (!paid.ok) throw await parseProblem(paid);
    const receipt = readReceipt(paid, chosen);
    if (receipt !== null) chosen.ledger.commit(reservation);
    const data = await parse(paid);
    if (receipt === null) chosen.ledger.release(reservation);
    return { data, receipt, credits: null, replayed: false };
  } catch (error) {
    chosen.ledger.release(reservation);
    throw error;
  }
}
