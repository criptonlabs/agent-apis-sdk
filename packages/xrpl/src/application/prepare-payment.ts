import { CriptonValidationError } from "@criptonlabs/agent-apis-core";
import type { PathsResponse } from "../domain/api-types.js";
import {
  buildPreparedPayment,
  PaymentNotReadyError,
  type PaymentIntent,
  type PreparedPayment,
} from "../domain/prepared-payment.js";
import type { XrplDataPort } from "./ports.js";

export async function preparePayment(
  data: XrplDataPort,
  intent: PaymentIntent,
): Promise<PreparedPayment> {
  const crossCurrency = intent.sourceAsset !== undefined && intent.sourceAsset !== intent.asset;
  if (crossCurrency && intent.sendMaxTolerancePct === undefined) {
    throw new CriptonValidationError(
      "sendMaxTolerancePct",
      "sendMaxTolerancePct is required for a cross-currency payment",
    );
  }

  const readiness = (
    await data.paymentReadiness({
      source: intent.source,
      destination: intent.destination,
      asset: intent.asset,
      amount: intent.amount,
      ...(intent.destinationTag !== undefined ? { destinationTag: intent.destinationTag } : {}),
    })
  ).data;
  if (readiness.verdict !== "ready") {
    throw new PaymentNotReadyError(
      readiness.verdict === "not_ready" ? "payment-not-ready" : "payment-readiness-unknown",
      readiness.reasons,
      readiness.warnings,
      readiness.checks_failed,
    );
  }

  let paths: PathsResponse | null = null;
  if (crossCurrency && intent.sourceAsset !== undefined) {
    paths = (
      await data.paths({
        source: intent.source,
        destination: intent.destination,
        asset: intent.asset,
        amount: intent.amount,
        sourceAssets: [intent.sourceAsset],
      })
    ).data;
  }

  const fee = (await data.fee()).data;
  return buildPreparedPayment(intent, readiness, paths, fee);
}
