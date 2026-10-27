import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import type { KitResponse, PaymentConfig, PaymentReceipt } from "../../application/ports.js";
import {
  CriptonPaymentError,
  CriptonResponseError,
  type PrepaidSignals,
} from "../../domain/errors.js";
import type { PaymentOption, PaymentOptionSummary } from "../../domain/payment-option.js";
import type { SpendLedger } from "../../domain/spend-ledger.js";
import { parseProblem, readJson, signalsOf } from "../http/problem.js";
import { readPrepaidOffer } from "./prepaid-offer.js";

export interface PaidRetry {
  (extraHeaders: Record<string, string>): Promise<Response>;
}

type PaymentRequired = ReturnType<typeof decodePaymentRequiredHeader>;

interface Chosen {
  option: PaymentOption;
  payment: PaymentConfig;
  ledger: SpendLedger;
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

/** Picks the option to pay, or raises the payment error that explains why nothing is paid. */
async function chooseOption(
  response: Response,
  required: PaymentRequired,
  payment: PaymentConfig | undefined,
  ledger: SpendLedger | undefined,
): Promise<Chosen> {
  const accepts = required.accepts as unknown as PaymentOption[];
  const prepaidOffer = readPrepaidOffer(required.extensions);
  const signals: PrepaidSignals = prepaidOffer !== undefined ? { prepaidOffer } : {};
  // A credits-only route offers no per-call option, only prepaid credits (API prepaid-credits D0b).
  if (accepts.length === 0 && prepaidOffer !== undefined) {
    const { reason } = signalsOf(await readJson(response));
    throw new CriptonPaymentError("credits-required", [], {
      ...signals,
      ...(reason !== undefined ? { reason } : {}),
    });
  }
  if (payment === undefined || ledger === undefined) {
    throw new CriptonPaymentError("payment-disabled", summaries(accepts), signals);
  }
  const option = payment.payer.selectOption(accepts);
  if (option === null) {
    throw new CriptonPaymentError("no-supported-payment-option", summaries(accepts), signals);
  }
  return { option, payment, ledger, signals };
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

/** The receipt of a successful settlement; asset and amount come from the paid option. */
function readReceipt(paid: Response, option: PaymentOption): PaymentReceipt | null {
  const settleHeader = paid.headers.get("payment-response");
  if (settleHeader === null) return null;
  try {
    const settle = decodePaymentResponseHeader(settleHeader);
    if (!settle.success) return null;
    return {
      transaction: settle.transaction,
      network: settle.network,
      asset: option.asset,
      amount: option.amount,
      ...(settle.payer !== undefined ? { payer: settle.payer } : {}),
    };
  } catch {
    return null;
  }
}

/** Runs the x402 v2 flow after a 402 (design D6): one paid retry, reservation released on any failure. */
export async function handlePaymentRequired<T>(
  response: Response,
  payment: PaymentConfig | undefined,
  ledger: SpendLedger | undefined,
  retry: PaidRetry,
  parse: (response: Response) => Promise<T>,
): Promise<KitResponse<T>> {
  const header = response.headers.get("payment-required");
  if (header === null) throw await parseProblem(response);
  const required = decodeRequired(header);
  const chosen = await chooseOption(response, required, payment, ledger);
  const reservation = chosen.ledger.reserve(chosen.option.amount);
  try {
    const headers = await chosen.payment.payer.createPaymentHeaders(required, chosen.option);
    const paid = await sendSigned(retry, headers, chosen, reservation);
    if (!paid.ok) throw await parseProblem(paid);
    const receipt = readReceipt(paid, chosen.option);
    if (receipt !== null) chosen.ledger.commit(reservation);
    const data = await parse(paid);
    if (receipt === null) chosen.ledger.release(reservation);
    return { data, receipt };
  } catch (error) {
    chosen.ledger.release(reservation);
    throw error;
  }
}
