import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import type { KitResponse, PaymentConfig, PaymentReceipt } from "../../application/ports.js";
import { CriptonPaymentError, CriptonResponseError } from "../../domain/errors.js";
import type { PaymentOption, PaymentOptionSummary } from "../../domain/payment-option.js";
import type { SpendLedger } from "../../domain/spend-ledger.js";
import { parseProblem } from "../http/problem.js";

export interface PaidRetry {
  (extraHeaders: Record<string, string>): Promise<Response>;
}

function summaries(accepts: readonly PaymentOption[]): PaymentOptionSummary[] {
  return accepts.map(({ network, asset, amount, payTo }) => ({ network, asset, amount, payTo }));
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
  let required: ReturnType<typeof decodePaymentRequiredHeader>;
  try {
    required = decodePaymentRequiredHeader(header);
  } catch {
    throw new CriptonResponseError("Invalid PAYMENT-REQUIRED header");
  }
  const accepts = required.accepts as unknown as PaymentOption[];
  if (payment === undefined || ledger === undefined) {
    throw new CriptonPaymentError("payment-disabled", summaries(accepts));
  }
  const option = payment.payer.selectOption(accepts);
  if (option === null) {
    throw new CriptonPaymentError("no-supported-payment-option", summaries(accepts));
  }
  const reservation = ledger.reserve(option.amount);
  try {
    const headers = await payment.payer.createPaymentHeaders(required, option);
    const paid = await retry(headers);
    if (!paid.ok) throw await parseProblem(paid);
    const settleHeader = paid.headers.get("payment-response");
    let receipt: PaymentReceipt | null = null;
    if (settleHeader !== null) {
      try {
        const settle = decodePaymentResponseHeader(settleHeader);
        if (settle.success) {
          receipt = {
            transaction: settle.transaction,
            network: settle.network,
            asset: option.asset,
            amount: option.amount,
            ...(settle.payer !== undefined ? { payer: settle.payer } : {}),
          };
        }
      } catch {
        receipt = null;
      }
    }
    if (receipt !== null) ledger.commit(reservation);
    const data = await parse(paid);
    if (receipt === null) ledger.release(reservation);
    return { data, receipt };
  } catch (error) {
    ledger.release(reservation);
    throw error;
  }
}
